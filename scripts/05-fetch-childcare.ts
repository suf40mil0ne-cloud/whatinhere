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
import type { AptComplexState } from "./07-fetch-apt-complexes";

interface ChildcareCenter {
  lat: number;
  lng: number;
  spare: number;
  vehicle: boolean;
  sigungu: string;
  name?: string;
}

// api.childcare.go.kr: HTTP-only, XML 응답
// 외부 IP 차단으로 직접 호출 불가 → CHILDCARE_PROXY_URL(한국 리전 Vercel) 경유
const CHILDCARE_PROXY_URL = process.env.CHILDCARE_PROXY_URL ?? "https://childcare-proxy.vercel.app/api/childcare";
const CHILDCARE_API_PATH = "/mediate/rest/cpmsapi030/cpmsapi030/request";
const CHILDCARE_API_KEY = process.env.CHILDCARE_API_KEY ?? "";

// 수도권 시군구 arcode (법정코드 기준, API 실측 확인)
// 구 있는 도시는 구 단위로 분리, 구 없는 도시는 시 단위 코드 사용
const CHILDCARE_ARCODE_MAP: Record<string, string> = {
  // 서울 25개구
  "11110": "종로구",   "11140": "중구",     "11170": "용산구",   "11200": "성동구",   "11215": "광진구",
  "11230": "동대문구", "11260": "중랑구",   "11290": "성북구",   "11305": "강북구",   "11320": "도봉구",
  "11350": "노원구",   "11380": "은평구",   "11410": "서대문구", "11440": "마포구",   "11470": "양천구",
  "11500": "강서구",   "11530": "구로구",   "11545": "금천구",   "11560": "영등포구", "11590": "동작구",
  "11620": "관악구",   "11650": "서초구",   "11680": "강남구",   "11710": "송파구",   "11740": "강동구",
  // 인천 10개구군
  "28110": "중구",     "28140": "동구",     "28177": "미추홀구", "28185": "연수구",   "28200": "남동구",
  "28237": "부평구",   "28245": "계양구",   "28260": "서구",     "28710": "강화군",   "28720": "옹진군",
  // 경기 – 구 있는 도시는 구 단위
  "41111": "수원시장안구", "41113": "수원시권선구", "41115": "수원시팔달구", "41117": "수원시영통구",
  "41131": "성남시수정구", "41133": "성남시중원구", "41135": "성남시분당구",
  "41171": "안양시만안구", "41173": "안양시동안구",
  "41271": "안산시상록구", "41273": "안산시단원구",
  "41281": "고양시덕양구", "41285": "고양시일산동구", "41287": "고양시일산서구",
  "41461": "용인시처인구", "41463": "용인시기흥구", "41465": "용인시수지구",
  // 경기 – 단일 코드 도시
  "41190": "부천시",   "41210": "광명시",   "41220": "평택시",   "41250": "동두천시",
  "41290": "과천시",   "41310": "구리시",   "41360": "남양주시", "41370": "오산시",
  "41390": "시흥시",   "41410": "군포시",   "41430": "의왕시",   "41450": "하남시",
  "41460": "용인시",   "41480": "파주시",   "41500": "이천시",   "41550": "안성시",
  "41570": "김포시",   "41590": "화성시",   "41610": "광주시",   "41630": "양주시",
  "41650": "포천시",   "41800": "연천군",   "41820": "가평군",   "41830": "양평군",
};

interface ElementarySchool {
  lat: number;
  lng: number;
  sido: string;
}

interface Academy {
  lat: number;
  lng: number;
  realm: string;
  source: "exact" | "dong" | "sigungu";
}

const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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

function looksLikeChildcareSchema(xml: string): boolean {
  // API 키 오류 시 컬럼 번호(1~62)로만 채워진 스키마 응답 반환
  // la 필드가 정수 한 두 자리면 실제 좌표가 아님
  const la = xmlTag(xml, "la");
  return la != null && /^\d{1,2}$/.test(la.trim());
}

async function fetchChildcareCentersFromProxy(): Promise<ChildcareCenter[] | null> {
  if (!CHILDCARE_API_KEY) {
    warn("05-fetch-childcare: CHILDCARE_API_KEY not set, skipping API");
    return null;
  }

  const centers: ChildcareCenter[] = [];
  let totalRequests = 0;
  let schemaArcodes = 0;
  let skippedCoords = 0;
  let skippedStatus = 0;
  let quotaExceeded = false;

  for (const [arcode, sigungu] of Object.entries(CHILDCARE_ARCODE_MAP)) {
    if (quotaExceeded) break;

    for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
      const url = paramsToUrl(CHILDCARE_PROXY_URL, {
        path: CHILDCARE_API_PATH,
        key: CHILDCARE_API_KEY,
        arcode,
        pageNo,
        numOfRows: 100,
      });

      let xml: string;
      try {
        xml = await fetchTextWithRetry(url, { timeoutMs: 20000 });
        totalRequests++;
      } catch (error) {
        warn(`05-fetch-childcare: proxy request failed arcode=${arcode} page=${pageNo} (${error instanceof Error ? error.message : String(error)})`);
        break;
      }

      // 일일 한도 초과 (INFO-300)
      if (xml.includes("INFO-300")) {
        warn(`05-fetch-childcare: API 일일 요청 한도 초과 (arcode=${arcode} page=${pageNo} requests=${totalRequests}) — 내일 재실행 필요`);
        quotaExceeded = true;
        break;
      }

      // 스키마 응답 감지 (API 키 오류 시 컬럼 번호만 반환)
      if (pageNo === 1 && looksLikeChildcareSchema(xml)) {
        schemaArcodes++;
        break;
      }

      const items = xmlItems(xml);
      if (!items.length) break;

      for (const item of items) {
        const status = xmlTag(item, "crstatusname") ?? "";
        if (status && !status.includes("정상") && !status.includes("운영")) { skippedStatus++; continue; }
        const lat = numeric(xmlTag(item, "la"));
        const lng = numeric(xmlTag(item, "lo"));
        if (lat == null || lng == null) { skippedCoords++; continue; }
        const capa = numeric(xmlTag(item, "crcapat")) ?? 0;
        const current = numeric(xmlTag(item, "crchcnt")) ?? 0;
        const vehicle = (xmlTag(item, "crcargbname") ?? "").includes("통학");
        const name = xmlTag(item, "crname") ?? "";
        // API 응답의 sigunname을 우선 사용 (정확한 매칭을 위해)
        const centerSigungu = xmlTag(item, "sigunname") ?? sigungu;
        centers.push({ lat, lng, spare: Math.max(capa - current, 0), vehicle, sigungu: centerSigungu, name });
      }

      if (items.length < 100) break;
    }
  }

  if (schemaArcodes > 0) {
    warn(`05-fetch-childcare: API returned schema responses for ${schemaArcodes}/${Object.keys(CHILDCARE_ARCODE_MAP).length} arcodes — CHILDCARE_API_KEY가 만료되었거나 유효하지 않음`);
  }

  flushWarningSummary("05-fetch-childcare", "API centers with missing coordinates", skippedCoords);
  info(`05-fetch-childcare proxy: requests=${totalRequests} centers=${centers.length} schemaArcodes=${schemaArcodes} skippedStatus=${skippedStatus}`);
  return centers.length > 0 ? centers : null;
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
  info(`05-fetch-childcare: 어린이집 데이터 수집 (proxy=${CHILDCARE_PROXY_URL})`);
  const proxyCenters = await fetchChildcareCentersFromProxy();
  if (proxyCenters !== null) {
    return proxyCenters;
  }
  warn("05-fetch-childcare: 프록시 API 실패, CSV fallback 시도 (data/childcare.csv)");
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

/**
 * 카카오 로컬 API (카테고리 검색 AC5=학원)를 이용해 각 아파트 단지 중심 1km 내
 * 학원을 수집한다. apt-complexes.state.json을 읽어 단지별로 검색하며,
 * place_id 기준 중복을 제거하여 전체 학원 목록을 반환한다.
 *
 * - 단지마다 최대 3페이지(=45건) 조회, 단지 간 50ms 딜레이
 * - Kakao free-tier 기준 일 300,000 req 이내 (단지 수 ≈ 14,000 × 3 = 42,000 req)
 */
async function fetchAcademies(): Promise<Academy[]> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";
  if (!KAKAO_KEY) {
    warn("05-fetch-childcare: KAKAO_REST_API_KEY not set, academy metrics will be zeroed");
    return [];
  }

  const aptState = await loadJson<AptComplexState[]>("apt-complexes.state.json");
  if (!aptState || aptState.length === 0) {
    warn("05-fetch-childcare: apt-complexes.state.json not found or empty, academy metrics will be zeroed");
    return [];
  }

  const KA_HEADER = "sdk/1.0 os/web origin/https://whatsinhere.pages.dev";
  const seen = new Map<string, Academy>(); // place_id → Academy (중복 제거)
  let reqCount = 0;
  let errCount = 0;

  for (const complex of aptState) {
    if (complex.lat == null || complex.lng == null) continue;

    // 단지 중심 기준 최대 3페이지(=45건) × 반경 1000m
    for (let page = 1; page <= 3; page++) {
      try {
        const url =
          `https://dapi.kakao.com/v2/local/search/category.json` +
          `?category_group_code=AC5` +
          `&x=${complex.lng}&y=${complex.lat}` +
          `&radius=1000&size=15&page=${page}&sort=distance`;

        const res = await fetch(url, {
          headers: { "Authorization": `KakaoAK ${KAKAO_KEY}`, "KA": KA_HEADER },
          signal: AbortSignal.timeout(10000),
        });
        reqCount++;

        if (!res.ok) {
          if (page === 1) errCount++;
          break;
        }

        const data = await res.json() as {
          documents: Array<{ id: string; y: string; x: string; category_name: string }>;
          meta: { is_end: boolean; total_count: number };
        };

        for (const doc of data.documents) {
          if (seen.has(doc.id)) continue;
          const lat = parseFloat(doc.y);
          const lng = parseFloat(doc.x);
          if (isNaN(lat) || isNaN(lng)) continue;
          // category_name 예: "교육,학문 > 학원 > 수학학원" → realm = "수학학원"
          const parts = (doc.category_name ?? "").split(" > ");
          const realm = parts.length >= 3 ? parts[2] : (parts[parts.length - 1] ?? "기타");
          seen.set(doc.id, { lat, lng, realm, source: "exact" });
        }

        if (data.meta.is_end) break;
      } catch (e) {
        errCount++;
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 50)); // 단지 간 딜레이

    if (reqCount % 500 === 0 && reqCount > 0) {
      info(`05-fetch-childcare: Kakao academy progress — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
    }
  }

  info(`05-fetch-childcare: Kakao academy done — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
  if (errCount > 0) warn(`05-fetch-childcare: ${errCount} Kakao requests failed`);
  return [...seen.values()];
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
    fetchAcademies(),
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

  // 샘플 좌표 테스트
  const testPoints = [
    { lat: 37.5007, lng: 127.0369, label: "송파구 단지" },
    { lat: 37.54487, lng: 126.83967, label: "부천시 단지" },
  ];
  for (const tp of testPoints) {
    const testRadius = 1000;
    const nearbycenters = centers.filter((c) => toMeters(tp.lat, tp.lng, c.lat, c.lng) <= testRadius);
    const nearbyAcademies = academies.filter((a) => toMeters(tp.lat, tp.lng, a.lat, a.lng) <= testRadius);
    info(`[test] ${tp.label} (${tp.lat}, ${tp.lng}) 기준 ${testRadius}m 내 어린이집: ${nearbycenters.length}개, 학원: ${nearbyAcademies.length}개`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
