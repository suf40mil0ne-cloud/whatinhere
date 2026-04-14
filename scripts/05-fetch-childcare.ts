import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUpdateSql,
  DATA_DIR,
  DistrictState,
  fetchJsonWithRetry,
  fetchTextWithRetry,
  flushWarningSummary,
  info,
  linearScore,
  loadState,
  nearestDistance,
  numeric,
  paramsToUrl,
  round,
  saveState,
  toMeters,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  text,
  OUTPUT_DIR,
  ensureOutputDir,
} from "./district-score-lib";

interface ChildcareCenter {
  lat: number;
  lng: number;
  spare: number;
  vehicle: boolean;
  sigungu: string;
  name?: string;
}

// api.childcare.go.kr: HTTP-only, XML 응답
// 스크립트에서는 직접 호출, Worker에서는 CHILDCARE_PROXY_URL 경유
const CHILDCARE_API_HOST = "api.childcare.go.kr";
const CHILDCARE_API_PATH = "/mediate/rest/cpmsAPI.do";
const CHILDCARE_API_KEY = process.env.CHILDCARE_API_KEY ?? "";

interface ElementarySchool {
  lat: number;
  lng: number;
  sido: string;
}

interface Academy {
  lat: number;
  lng: number;
  realm: string;
}

const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";
const NEIS_ACADEMY_API_KEY = process.env.NEIS_ACADEMY_API_KEY;

function preview(textValue: string): string {
  return textValue.replace(/\s+/g, " ").trim().slice(0, 300);
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { current += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { fields.push(current); current = ""; }
      else { current += char; }
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? "";
    result.push(row);
  }
  return result;
}

function normalizeRegionName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}


function extractDongFromAcademyAddress(...parts: Array<string | null | undefined>): string | null {
  const full = parts.filter(Boolean).join(" ");
  const match = full.match(/([가-힣0-9]+동)/);
  return match?.[1] ?? null;
}

function buildDistrictLookups(districts: DistrictState[]) {
  const dongLookup = new Map<string, { lat: number; lng: number }>();
  const sigunguCenters = new Map<string, { lat: number; lng: number; count: number }>();
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    dongLookup.set(`${district.sido}:${normalizeRegionName(district.sigungu)}:${normalizeRegionName(district.dong)}`, {
      lat: district.center_lat,
      lng: district.center_lng,
    });
    const sigunguKey = `${district.sido}:${normalizeRegionName(district.sigungu)}`;
    const current = sigunguCenters.get(sigunguKey) ?? { lat: 0, lng: 0, count: 0 };
    current.lat += district.center_lat;
    current.lng += district.center_lng;
    current.count += 1;
    sigunguCenters.set(sigunguKey, current);
  }
  return {
    dongLookup,
    sigunguCenters: new Map(
      [...sigunguCenters.entries()].map(([key, value]) => [key, { lat: value.lat / value.count, lng: value.lng / value.count }])
    ),
  };
}

/** XML 태그 한 개의 내용 추출 (CDATA 포함) */
function xmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([^<\\]]*?)(?:\\]\\]>)?<\\/${tag}>`, "s");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

/** XML <item>…</item> 블록 전체 목록 추출 */
function xmlItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

async function fetchChildcareCentersFromApi(): Promise<ChildcareCenter[] | null> {
  if (!CHILDCARE_API_KEY) {
    warn("05-fetch-childcare: CHILDCARE_API_KEY not set, skipping API");
    return null;
  }

  const pageSize = 1000;
  const centers: ChildcareCenter[] = [];
  let pageNo = 1;
  let totalCount = 0;
  let skippedStatus = 0;
  let skippedCoords = 0;

  try {
    while (true) {
      const url = paramsToUrl(`http://${CHILDCARE_API_HOST}${CHILDCARE_API_PATH}`, {
        q_api_name: "childCareLocaInfo",
        q_auth_key: CHILDCARE_API_KEY,
        q_page_no: pageNo,
        q_record_count: pageSize,
      });

      const raw = await fetchTextWithRetry(url, { timeoutMs: 20000 });

      // 첫 페이지에서 totalCount 파악
      if (pageNo === 1) {
        totalCount = numeric(xmlTag(raw, "totalCount")) ?? 0;
        const returnCode = xmlTag(raw, "returnCode") ?? "";
        info(`05-fetch-childcare API: page=1 returnCode=${returnCode} totalCount=${totalCount}`);
        if (returnCode !== "0" && returnCode !== "" && !raw.includes("<item>")) {
          warn(`05-fetch-childcare: API returned returnCode=${returnCode}, falling back to CSV`);
          return null;
        }
        if (totalCount === 0 && !raw.includes("<item>")) {
          warn("05-fetch-childcare: API returned totalCount=0 with no items, falling back to CSV");
          return null;
        }
      }

      const items = xmlItems(raw);
      if (!items.length) break;

      for (const block of items) {
        // 운영현황: "1" = 정상, "2" = 휴지, "3" = 폐지 등 (코드값)
        // 혹은 "정상" 텍스트일 수도 있음 — 둘 다 처리
        const status = xmlTag(block, "crpstatus") ?? "";
        if (status !== "1" && !status.includes("정상")) { skippedStatus++; continue; }

        const lat = numeric(xmlTag(block, "la"));
        const lng = numeric(xmlTag(block, "lo"));
        if (lat == null || lng == null) { skippedCoords++; continue; }

        const capa = numeric(xmlTag(block, "capa")) ?? 0;
        const ccur = numeric(xmlTag(block, "ccur")) ?? 0;
        const sigungu = xmlTag(block, "sigungunm") ?? "";
        const name = xmlTag(block, "crpnm") ?? "";
        const vehicle = (xmlTag(block, "buse") ?? "").toUpperCase() === "Y";

        centers.push({ lat, lng, spare: Math.max(capa - ccur, 0), vehicle, sigungu, name });
      }

      // 마지막 페이지면 종료
      if (items.length < pageSize) break;
      pageNo++;

      // API 과부하 방지: 5페이지마다 100ms 대기
      if (pageNo % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    flushWarningSummary("05-fetch-childcare", "API centers with missing coordinates", skippedCoords);
    info(`05-fetch-childcare API: loaded ${centers.length} centers from ${pageNo} pages (skippedStatus=${skippedStatus} skippedCoords=${skippedCoords})`);
    return centers.length > 0 ? centers : null;
  } catch (error) {
    warn(`05-fetch-childcare: API failed (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

async function fetchChildcareCentersFromCsv(): Promise<ChildcareCenter[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const csvPath = path.join(DATA_DIR, "childcare.csv");

  let csvText: string;
  try {
    csvText = await fs.readFile(csvPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      warn("05-fetch-childcare: data/childcare.csv not found, childcare-center metrics will be zeroed");
      return [];
    }
    throw error;
  }

  const rows = parseCSV(csvText);
  const centers: ChildcareCenter[] = [];
  let skippedStatus = 0;
  let skippedMissingCoords = 0;

  for (const row of rows) {
    const status = row["운영현황"] ?? "";
    if (!status.includes("정상")) { skippedStatus++; continue; }
    const lat = numeric(row["위도"]);
    const lng = numeric(row["경도"]);
    if (lat == null || lng == null) { skippedMissingCoords++; continue; }
    const capa = numeric(row["정원수"] ?? row["정원"]) ?? 0;
    const current = numeric(row["현원수"] ?? row["현원"]) ?? 0;
    const sigungu = row["시군구명"] ?? "";
    const name = row["시설명"] ?? "";
    centers.push({ lat, lng, spare: Math.max(capa - current, 0), vehicle: false, sigungu, name });
  }

  flushWarningSummary("05-fetch-childcare", "childcare centers with missing coordinates", skippedMissingCoords);
  info(`05-fetch-childcare: loaded ${centers.length} childcare centers from CSV (skipped ${skippedStatus} non-정상)`);
  return centers;
}

async function fetchChildcareCenters(_districts: DistrictState[]): Promise<ChildcareCenter[]> {
  info("05-fetch-childcare: trying data.go.kr API first...");
  const apiCenters = await fetchChildcareCentersFromApi();
  if (apiCenters !== null) {
    return apiCenters;
  }
  warn("05-fetch-childcare: API unavailable or empty, falling back to CSV");
  return fetchChildcareCentersFromCsv();
}

async function fetchElementarySchools(districts: DistrictState[]): Promise<ElementarySchool[]> {
  const dongLookup = new Map<string, { lat: number; lng: number; sido: string }>();
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    dongLookup.set(`${normalizeRegionName(d.sigungu)}:${normalizeRegionName(d.dong)}`, { lat: d.center_lat, lng: d.center_lng, sido: d.sido });
  }

  const officeConfigs = [
    { code: "B10", sido: "서울특별시" },
    { code: "J10", sido: "경기도" },
    { code: "E10", sido: "인천광역시" },
  ] as const;

  const schools: ElementarySchool[] = [];
  let skippedMissingCoords = 0;
  try {
    for (const office of officeConfigs) {
      for (let pIndex = 1; pIndex <= 20; pIndex += 1) {
        const url = paramsToUrl("https://open.neis.go.kr/hub/schoolInfo", {
          KEY: NEIS_API_KEY,
          Type: "json",
          ATPT_OFCDC_SC_CODE: office.code,
          pIndex,
          pSize: 1000,
        });
        const payload = await fetchJsonWithRetry(url, { timeoutMs: 10000 });
        const items: any[] = (payload as any)?.schoolInfo?.[1]?.row ?? [];
        if (!items.length) break;
        for (const item of items) {
          if ((item.SCHUL_KND_SC_NM ?? "") !== "초등학교") continue;
          const detail: string = item.ORG_RDNDA ?? "";
          const dongMatch = detail.match(/[（(]([가-힣0-9]+동)/);
          const dong = dongMatch?.[1];
          const rdnma: string = item.ORG_RDNMA ?? "";
          const sigungu = normalizeRegionName(rdnma.trim().split(/\s+/)[1] ?? "");
          if (dong && sigungu) {
            const coord = dongLookup.get(`${sigungu}:${normalizeRegionName(dong)}`);
            if (coord) {
              schools.push({ lat: coord.lat, lng: coord.lng, sido: coord.sido });
              continue;
            }
          }
          skippedMissingCoords += 1;
        }
        if (items.length < 1000) break;
      }
    }
  } catch (error) {
    warn(`05-fetch-childcare: school API failed (${error instanceof Error ? error.message : String(error)}), using ${schools.length} partial results`);
  }
  if (schools.length === 0) {
    warn("05-fetch-childcare: school API returned no elementary school rows for capital-area office codes");
  }
  flushWarningSummary("05-fetch-childcare", "elementary schools with unresolved coordinates", skippedMissingCoords);
  return schools;
}

async function fetchAcademies(districts: DistrictState[]): Promise<Academy[]> {
  if (!NEIS_ACADEMY_API_KEY) {
    warn("05-fetch-childcare: NEIS_ACADEMY_API_KEY missing, academy metrics will be zeroed");
    return [];
  }

  const { dongLookup, sigunguCenters } = buildDistrictLookups(districts);
  const academies: Academy[] = [];
  let skippedMissingCoords = 0;
  const officeConfigs = [
    { code: "B10", sido: "서울특별시" },
    { code: "J10", sido: "경기도" },
    { code: "E10", sido: "인천광역시" },
  ] as const;

  try {
    for (const office of officeConfigs) {
      for (let pageIndex = 1; pageIndex <= 200; pageIndex += 1) {
        const url = paramsToUrl("https://open.neis.go.kr/hub/acaInsTiInfo", {
          KEY: NEIS_ACADEMY_API_KEY,
          Type: "json",
          ATPT_OFCDC_SC_CODE: office.code,
          pIndex: pageIndex,
          pSize: 1000,
        });
        const safeUrl = url.replace(NEIS_ACADEMY_API_KEY, "***");
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const raw = await response.text();
        const status = response.status;
        let payload: any = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch (error) {
          warn(`05-fetch-childcare: academy JSON parse failed url=${safeUrl} status=${status} preview=${preview(raw)} error=${error instanceof Error ? error.message : String(error)}`);
          break;
        }
        const topKeys = payload && typeof payload === "object" ? Object.keys(payload) : [];
        const root = payload?.acaInsTiInfo;
        const headResult = root?.[0]?.head?.[1]?.RESULT;
        const items: any[] = root?.[1]?.row ?? [];
        if (pageIndex === 1) {
          console.log("[debug] academy status:", status);
          console.log("[debug] academy top keys:", topKeys);
          console.log("[debug] academy first item:", JSON.stringify(items[0] ?? null));
          info(`05-fetch-childcare: academy url=${safeUrl} status=${status} topKeys=${topKeys.join(",")} rowCount=${items.length} errorMessage=${headResult?.MESSAGE ?? ""}`);
        }
        if (!response.ok) {
          warn(`05-fetch-childcare: academy request failed url=${safeUrl} status=${status} preview=${preview(raw)}`);
          break;
        }
        if (headResult?.CODE && headResult.CODE !== "INFO-000") {
          warn(`05-fetch-childcare: academy API returned code=${headResult.CODE} message=${headResult.MESSAGE ?? ""} url=${safeUrl}`);
          break;
        }
        if (!items.length) break;
        for (const item of items) {
          const statusName = text(item.REG_STTUS_NM) ?? "";
          if (statusName.includes("폐") || statusName.includes("말소")) continue;
          const lat = numeric(item.LA ?? item.la ?? item.latitude ?? item.lat);
          const lng = numeric(item.LO ?? item.lo ?? item.longitude ?? item.lng);
          if (lat != null && lng != null) {
            academies.push({ lat, lng, realm: text(item.REALM_SC_NM) ?? "기타" });
            continue;
          }
          const sigungu = normalizeRegionName(text(item.ADMST_ZONE_NM) ?? "");
          const dong = extractDongFromAcademyAddress(text(item.FA_RDNDA), text(item.FA_RDNMA));
          const exact = dong ? dongLookup.get(`${office.sido}:${sigungu}:${normalizeRegionName(dong)}`) : null;
          if (exact) {
            academies.push({ lat: exact.lat, lng: exact.lng, realm: text(item.REALM_SC_NM) ?? "기타" });
            continue;
          }
          const sigunguCenter = sigunguCenters.get(`${office.sido}:${sigungu}`);
          if (sigunguCenter) {
            academies.push({ lat: sigunguCenter.lat, lng: sigunguCenter.lng, realm: text(item.REALM_SC_NM) ?? "기타" });
            continue;
          }
          skippedMissingCoords += 1;
        }
        if (items.length < 1000) break;
      }
    }
  } catch (error) {
    warn(`05-fetch-childcare: academy API failed (${error instanceof Error ? error.message : String(error)}), using ${academies.length} partial results`);
  }
  flushWarningSummary("05-fetch-childcare", "academies with missing coordinates", skippedMissingCoords);
  return academies;
}

function applyChildcareScores(
  districts: DistrictState[],
  centers: ChildcareCenter[],
  schools: ElementarySchool[],
  academies: Academy[]
) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const sigunguCenters = centers.filter((row) => row.sigungu === district.sigungu);

    const childcareCount = sigunguCenters.length ? countWithin(point, sigunguCenters, 1000) : 0;
    const elementaryDistanceM = schools.length ? nearestDistance(point, schools.filter((row) => row.sido === district.sido)) : null;
    const vehicleCount = sigunguCenters.filter((row) => row.vehicle).length;
    const vehicleRatio = sigunguCenters.length ? round(vehicleCount / sigunguCenters.length, 4) : 0;

    const nearbyAcademies = academies.filter((a) => {
      const d = Math.abs(a.lat - (district.center_lat ?? 0)) + Math.abs(a.lng - (district.center_lng ?? 0));
      return d < 0.02;
    });
    const academyCount1km = academies.length ? countWithin(point, academies, 1000) : 0;
    const uniqueRealms = new Set(
      nearbyAcademies
        .filter((a) => toMeters(point.lat, point.lng, a.lat, a.lng) <= 1000)
        .map((a) => a.realm)
    );
    const academyDiversityScore = uniqueRealms.size;

    district.raw_childcare = {
      childcareCount,
      elementaryDistanceM,
      academyCount1km,
      academyDiversityScore,
      vehicleRatio,
    };

    const households = Math.max(district.households ?? 0, 1);
    const centerPerHousehold = round(childcareCount / households, 6);

    // absolute scoring (centers available)
    const centerScore   = linearScore(centerPerHousehold,    0.01,    0);  // 100세대당1개=100
    const schoolScore   = linearScore(elementaryDistanceM,   300,  1500);  // 300m=100, 1500m=0
    const acaCountScore = linearScore(academyCount1km,        20,     0);  // 20개=100
    const acaDivScore   = linearScore(academyDiversityScore,   5,     0);  // 5분야=100
    const vehicleScore  = linearScore(vehicleRatio,          0.8,     0);  // 80%=100

    if (centers.length === 0) {
      district.s_childcare = round(
        schoolScore * 0.45 + acaCountScore * 0.35 + acaDivScore * 0.20, 2
      );
    } else {
      district.s_childcare = round(
        centerScore * 0.25 + schoolScore * 0.25 + acaCountScore * 0.20 +
        acaDivScore * 0.15 + vehicleScore * 0.15, 2
      );
    }
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const [centers, schools, academies] = await Promise.all([
    fetchChildcareCenters(districts),
    fetchElementarySchools(districts),
    fetchAcademies(districts),
  ]);
  applyChildcareScores(districts, centers, schools, academies);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("05-childcare.sql", buildUpdateSql(districts, ["s_childcare", "raw_childcare"]));
  await ensureOutputDir();
  await fs.writeFile(path.join(OUTPUT_DIR, "childcare-raw.json"), JSON.stringify({ centers, schools, academies }, null, 2));
  info(`05-fetch-childcare: centers=${centers.length}, schools=${schools.length}, academies=${academies.length}`);
  if (centers.length === 0) warn("05-fetch-childcare: childcare centers dataset is empty — place data/childcare.csv in the project root");
  if (academies.length === 0) warn("05-fetch-childcare: academy dataset is empty after fetch");

  // 샘플 좌표 테스트: (37.5007, 127.0369) 기준 1km 내 어린이집
  const testLat = 37.5007;
  const testLng = 127.0369;
  const testRadius = 1000;
  const nearby = centers.filter((c) => toMeters(testLat, testLng, c.lat, c.lng) <= testRadius);
  info(`[test] (${testLat}, ${testLng}) 기준 ${testRadius}m 내 어린이집: ${nearby.length}개`);
  for (const c of nearby.slice(0, 10)) {
    const dist = Math.round(toMeters(testLat, testLng, c.lat, c.lng));
    info(`  - ${c.name || "(이름없음)"} [${c.sigungu}] 거리=${dist}m 정원여유=${c.spare}`);
  }
  if (nearby.length > 10) info(`  ... 외 ${nearby.length - 10}개`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
