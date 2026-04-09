import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildUpdateSql,
  DistrictState,
  fetchJsonWithRetry,
  flushWarningSummary,
  info,
  loadState,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  saveState,
  toMeters,
  updateOverallScores,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
  countWithin,
  round,
  text,
  OUTPUT_DIR,
  ensureOutputDir,
} from "./district-score-lib";

const execFile = promisify(execFileCallback);

interface ChildcareCenter {
  lat: number;
  lng: number;
  spare: number;
  vehicle: boolean;
  sigungu: string;
}

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

interface CurlProbeResult {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  body: string;
  stderr: string;
  errorCode: string | null;
  errorMessage: string | null;
}

const CHILDCARE_API_KEY = process.env.CHILDCARE_API_KEY;
const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";
const NEIS_ACADEMY_API_KEY = process.env.NEIS_ACADEMY_API_KEY;
const CHILDCARE_ENDPOINT = "http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request";

const CHILDCARE_ARCODE_MAP: Record<string, string> = {
  "11010": "종로구", "11020": "중구",    "11030": "용산구",  "11040": "성동구",  "11050": "광진구",
  "11060": "동대문구","11070": "중랑구", "11080": "성북구",  "11090": "강북구",  "11100": "도봉구",
  "11110": "노원구", "11120": "은평구",  "11130": "서대문구","11140": "마포구",  "11150": "양천구",
  "11160": "강서구", "11170": "구로구",  "11180": "금천구",  "11190": "영등포구","11200": "동작구",
  "11210": "관악구", "11220": "서초구",  "11230": "강남구",  "11240": "송파구",  "11250": "강동구",
  "28010": "중구",   "28020": "동구",    "28030": "미추홀구","28040": "연수구",  "28050": "남동구",
  "28060": "부평구", "28070": "계양구",  "28080": "서구",    "28090": "강화군",  "28100": "옹진군",
  "31010": "수원시", "31020": "성남시",  "31030": "의정부시","31040": "안양시",  "31050": "부천시",
  "31060": "광명시", "31070": "평택시",  "31080": "동두천시","31090": "안산시",  "31100": "고양시",
  "31110": "과천시", "31120": "구리시",  "31130": "남양주시","31140": "오산시",  "31150": "시흥시",
  "31160": "군포시", "31170": "의왕시",  "31180": "하남시",  "31190": "용인시",  "31200": "파주시",
};

function preview(textValue: string): string {
  return textValue.replace(/\s+/g, " ").trim().slice(0, 300);
}

function normalizeRegionName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function looksLikeChildcareSchema(xml: string): boolean {
  return xml.includes("<sidoname>01</sidoname>") && xml.includes("<crname>04</crname>") && xml.includes("<la>19</la>");
}

type ChildcareResponseClass =
  | "transport_issue"
  | "request_issue"
  | "auth_issue"
  | "empty_body"
  | "test/schema_response"
  | "arcode_issue"
  | "rows";

function classifyChildcareResponse(result: CurlProbeResult): ChildcareResponseClass {
  if (!result.ok) {
    if (result.errorCode != null || /curl:\s*\((35|52|56)\)/.test(result.stderr)) return "transport_issue";
    return "request_issue";
  }
  if (result.status === 401 || result.status === 403) return "auth_issue";
  if (result.body.length === 0) return "empty_body";
  if (looksLikeChildcareSchema(result.body)) return "test/schema_response";
  if (xmlItems(result.body).length === 0) return "arcode_issue";
  return "rows";
}

async function runCurlProbe(url: string, args: string[]): Promise<CurlProbeResult> {
  const marker = "__CURL_META__";
  try {
    const { stdout, stderr } = await execFile(
      "curl",
      ["-s", ...args, "-o", "-", "-w", `\n${marker}%{http_code}|%{content_type}`, url],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const output = stdout.toString();
    const markerIndex = output.lastIndexOf(`\n${marker}`);
    const body = markerIndex === -1 ? output : output.slice(0, markerIndex);
    const meta = markerIndex === -1 ? "" : output.slice(markerIndex + marker.length + 1).trim();
    const [statusRaw, contentTypeRaw] = meta.split("|");
    return {
      ok: true,
      status: Number(statusRaw) || null,
      contentType: contentTypeRaw || null,
      body,
      stderr: stderr.toString(),
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      ok: false,
      status: null,
      contentType: null,
      body: typeof err.stdout === "string" ? err.stdout : (err.stdout?.toString() ?? ""),
      stderr: typeof err.stderr === "string" ? err.stderr : (err.stderr?.toString() ?? ""),
      errorCode: err.code ?? null,
      errorMessage: err.message ?? String(error),
    };
  }
}

async function logChildcareDiagnostics(sampleArcodes: string[]): Promise<void> {
  if (!CHILDCARE_API_KEY) return;
  for (const arcode of sampleArcodes) {
    const url = paramsToUrl(CHILDCARE_ENDPOINT, {
      key: CHILDCARE_API_KEY,
      arcode,
      pageNo: 1,
      numOfRows: 3,
    });
    const probe = await runCurlProbe(url, ["--http1.0", "--max-time", "20", "-A", "Mozilla/5.0"]);
    const classification = classifyChildcareResponse(probe);
    warn(
      `05-fetch-childcare: diagnostic arcode=${arcode} class=${classification} status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} body=${preview(probe.body)}`
    );
  }
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

async function fetchChildcareCenters(_districts: DistrictState[]): Promise<ChildcareCenter[]> {
  if (!CHILDCARE_API_KEY) {
    warn("05-fetch-childcare: CHILDCARE_API_KEY missing, childcare-center metrics will be zeroed");
    return [];
  }

  const rows: ChildcareCenter[] = [];
  let skippedMissingCoords = 0;
  let sawSchemaResponse = false;
  let sawArcodeIssue = false;
  let sawAuthIssue = false;
  let sawTransportIssue = false;

  try {
    for (const [arcode, sigungu] of Object.entries(CHILDCARE_ARCODE_MAP)) {
      for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
        const url = paramsToUrl(CHILDCARE_ENDPOINT, {
          key: CHILDCARE_API_KEY,
          arcode,
          pageNo,
          numOfRows: 100,
        });
        const probe = await runCurlProbe(url, ["--http1.0", "--max-time", "20", "-A", "Mozilla/5.0"]);
        const classification = classifyChildcareResponse(probe);
        if (pageNo === 1) {
          info(
            `05-fetch-childcare: childcare page=${pageNo} arcode=${arcode} class=${classification} status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} errorCode=${probe.errorCode ?? "n/a"} body=${preview(probe.body)}`
          );
        }
        if (!probe.ok) {
          sawTransportIssue = true;
          warn(
            `05-fetch-childcare: childcare request failed page=${pageNo} arcode=${arcode} class=${classification} errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} message=${probe.errorMessage ?? "unknown"}`
          );
          break;
        }
        if (probe.status != null && probe.status >= 400) {
          if (classification === "auth_issue") sawAuthIssue = true;
          warn(
            `05-fetch-childcare: childcare HTTP error page=${pageNo} arcode=${arcode} status=${probe.status} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`
          );
          break;
        }
        if (looksLikeChildcareSchema(probe.body)) {
          sawSchemaResponse = true;
          warn(`05-fetch-childcare: childcare API returned test/schema_response instead of real center rows for arcode=${arcode} page=${pageNo}; endpoint=${CHILDCARE_ENDPOINT} body=${preview(probe.body)}`);
          break;
        }
        const items = xmlItems(probe.body);
        if (!items.length) {
          sawArcodeIssue = true;
          warn(`05-fetch-childcare: childcare API returned no <item> rows for arcode=${arcode} page=${pageNo}; class=${classification} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`);
          break;
        }
        for (const item of items) {
          const statusName = xmlTag(item, "crstatusname") ?? "";
          if (statusName && !statusName.includes("정상") && !statusName.includes("운영")) continue;
          const lat = numeric(xmlTag(item, "la"));
          const lng = numeric(xmlTag(item, "lo"));
          if (lat == null || lng == null) {
            skippedMissingCoords += 1;
            continue;
          }
          const capa = numeric(xmlTag(item, "crcapat")) ?? 0;
          const current = numeric(xmlTag(item, "crchcnt")) ?? 0;
          const vehicle = (xmlTag(item, "crcargbname") ?? "").includes("통학");
          rows.push({ lat, lng, spare: Math.max(capa - current, 0), vehicle, sigungu });
        }
        if (items.length < 100) break;
      }
    }
  } catch (error) {
    warn(`05-fetch-childcare: childcare API failed (${error instanceof Error ? error.message : String(error)}), using ${rows.length} partial results`);
  }
  if (rows.length === 0) {
    if (sawSchemaResponse) {
      warn("05-fetch-childcare: childcare centers remain empty because the current CHILDCARE_API_KEY/arcode requests return test/schema_response XML, not real center rows. This indicates an operating-key/permission issue, not a parsing bug in this script.");
    }
    if (sawArcodeIssue) {
      warn("05-fetch-childcare: childcare centers remain empty because some requests completed without item rows, which indicates an arcode/request-shape issue rather than a parsing bug.");
    }
    if (sawAuthIssue) {
      warn("05-fetch-childcare: childcare centers remain empty because the API returned an authentication/authorization failure for at least one request.");
    }
    if (sawTransportIssue) {
      warn("05-fetch-childcare: childcare centers remain empty because at least one request failed at transport level in this environment.");
    }
    await logChildcareDiagnostics(["11010", "11030", "11230", "28010", "31190"]);
  }
  flushWarningSummary("05-fetch-childcare", "childcare centers with missing coordinates", skippedMissingCoords);
  return rows;
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
          const lat = numeric(item.LA ?? item.latitude ?? item.lat);
          const lng = numeric(item.LO ?? item.longitude ?? item.lng);
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
    const capacityLeft1km = sigunguCenters.length ? countWithin(point, sigunguCenters, 1000, (row) => row.spare) : 0;
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
      capacityLeft1km,
      elementaryDistanceM,
      academyCount1km,
      academyDiversityScore,
      vehicleRatio,
    };
  }

  const households = (row: DistrictState): number => Math.max(row.households ?? 0, 1);

  const centerPerHouseholdNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.childcareCount ?? 0) / households(row), 4) : null
  );
  const sparePerHouseholdNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.capacityLeft1km ?? 0) / households(row), 4) : null
  );
  const schoolDistanceNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.elementaryDistanceM ?? null, true
  );
  const academyCountNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare != null ? round((row.raw_childcare.academyCount1km ?? 0) / households(row), 4) : null
  );
  const academyDiversityNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.academyDiversityScore ?? null
  );
  const vehicleRatioNorm = normalizeWithinSgg(
    districts, (row) => row.sigungu,
    (row) => row.raw_childcare?.vehicleRatio ?? null
  );

  for (const district of districts) {
    if (!CHILDCARE_API_KEY || centers.length === 0) {
      district.s_childcare = round(
        (schoolDistanceNorm.get(district) ?? 0) * 0.45 +
          (academyCountNorm.get(district) ?? 0) * 0.35 +
          (academyDiversityNorm.get(district) ?? 0) * 0.20,
        2
      );
      continue;
    }
    district.s_childcare = round(
      (centerPerHouseholdNorm.get(district) ?? 0) * 0.25 +
        (sparePerHouseholdNorm.get(district) ?? 0) * 0.20 +
        (schoolDistanceNorm.get(district) ?? 0) * 0.20 +
        (academyCountNorm.get(district) ?? 0) * 0.15 +
        (academyDiversityNorm.get(district) ?? 0) * 0.10 +
        (vehicleRatioNorm.get(district) ?? 0) * 0.10,
      2
    );
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
  if (centers.length === 0) warn("05-fetch-childcare: childcare centers dataset is empty after fetch");
  if (academies.length === 0) warn("05-fetch-childcare: academy dataset is empty after fetch");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
