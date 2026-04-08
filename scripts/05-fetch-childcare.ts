import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUpdateSql,
  CAPITAL_SIDO_NAMES,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchJsonWithRetry,
  fetchTextWithRetry,
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

const CHILDCARE_API_KEY = process.env.CHILDCARE_API_KEY;
const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";
const NEIS_ACADEMY_API_KEY = process.env.NEIS_ACADEMY_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

async function fetchChildcareCenters(districts: DistrictState[]): Promise<ChildcareCenter[]> {
  if (!CHILDCARE_API_KEY) {
    warn("05-fetch-childcare: CHILDCARE_API_KEY missing, childcare-center metrics will be zeroed");
    return [];
  }

  const rows: ChildcareCenter[] = [];
  let skippedMissingCoords = 0;

  // district code 형식: 11010530 → arcode=11(시도), stcode=010(시군구)
  const byRegion = new Map<string, { arcode: string; stcode: string; sigungu: string }>();
  for (const district of districts) {
    const arcode = district.code.slice(0, 2);
    const stcode = district.code.slice(2, 5);
    const regionKey = `${arcode}:${stcode}`;
    if (!byRegion.has(regionKey)) {
      byRegion.set(regionKey, { arcode, stcode, sigungu: district.sigungu });
    }
  }

  try {
    for (const { arcode, stcode, sigungu } of byRegion.values()) {
      for (let pageNo = 1; pageNo <= 30; pageNo += 1) {
        const url = paramsToUrl("https://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request", {
          key: CHILDCARE_API_KEY,
          arcode,
          stcode,
          pageNo,
          numOfRows: 1000,
        });
        const xml = await fetchTextWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible)" } });
        const items = xmlItems(xml);
        if (!items.length) break;
        for (const item of items) {
          if ((xmlTag(item, "crstatusname") ?? "") !== "정상") continue;
          const lat = numeric(xmlTag(item, "la"));
          const lng = numeric(xmlTag(item, "lo"));
          if (lat == null || lng == null) {
            skippedMissingCoords += 1;
            continue;
          }
          const capa = numeric(xmlTag(item, "crcapat")) ?? 0;
          const current = numeric(xmlTag(item, "crchcnt")) ?? 0;
          rows.push({ lat, lng, spare: Math.max(capa - current, 0), vehicle: false, sigungu });
        }
        if (items.length < 1000) break;
      }
    }
  } catch (error) {
    warn(`05-fetch-childcare: childcare API failed (${error instanceof Error ? error.message : String(error)}), using ${rows.length} partial results`);
  }
  flushWarningSummary("05-fetch-childcare", "childcare centers with missing coordinates", skippedMissingCoords);
  return rows;
}

async function fetchElementarySchools(districts: DistrictState[]): Promise<ElementarySchool[]> {
  const dongLookup = new Map<string, { lat: number; lng: number; sido: string }>();
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    dongLookup.set(`${d.sigungu}:${d.dong}`, { lat: d.center_lat, lng: d.center_lng, sido: d.sido });
  }

  const schools: ElementarySchool[] = [];
  let skippedMissingCoords = 0;
  try {
    for (const sido of CAPITAL_SIDO_NAMES) {
      for (let pIndex = 1; pIndex <= 20; pIndex += 1) {
        const url = paramsToUrl("https://open.neis.go.kr/hub/schoolInfo", {
          KEY: NEIS_API_KEY,
          Type: "json",
          SCHUL_KND_SC_NM: "초등학교",
          LCTN_SC_NM: sido,
          pIndex,
          pSize: 1000,
        });
        const payload = await fetchJsonWithRetry(url, { timeoutMs: 10000 });
        const items: any[] = (payload as any)?.schoolInfo?.[1]?.row ?? [];
        if (!items.length) break;
        for (const item of items) {
          const detail: string = item.ORG_RDNDA ?? "";
          const dongMatch = detail.match(/[（(]([가-힣]+동)/);
          const dong = dongMatch?.[1];
          const rdnma: string = item.ORG_RDNMA ?? "";
          const sigungu = rdnma.trim().split(/\s+/)[1];
          if (dong && sigungu) {
            const coord = dongLookup.get(`${sigungu}:${dong}`);
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
  flushWarningSummary("05-fetch-childcare", "elementary schools with unresolved coordinates", skippedMissingCoords);
  return schools;
}

async function fetchAcademies(): Promise<Academy[]> {
  if (!NEIS_ACADEMY_API_KEY) {
    warn("05-fetch-childcare: NEIS_ACADEMY_API_KEY missing, academy metrics will be zeroed");
    return [];
  }

  const academies: Academy[] = [];
  let skippedMissingCoords = 0;
  const atptCodes = ["B10", "J10", "E10"];

  try {
    for (const atptCode of atptCodes) {
      for (let pageIndex = 1; pageIndex <= 200; pageIndex += 1) {
        const url = paramsToUrl("https://open.neis.go.kr/hub/acaInsTiInfo", {
          KEY: NEIS_ACADEMY_API_KEY,
          Type: "json",
          ATPT_OFCDC_SC_CODE: atptCode,
          pIndex: pageIndex,
          pSize: 1000,
        });
        const payload = await fetchJsonWithRetry(url, { timeoutMs: 10000 });
        const items: any[] = (payload as any)?.acaInsTiInfo?.[1]?.row ?? [];
        if (!items.length) break;
        for (const item of items) {
          const lat = numeric(item.LA);
          const lng = numeric(item.LO);
          if (lat == null || lng == null) {
            skippedMissingCoords += 1;
            continue;
          }
          const realm = text(item.REALM_SC_NM) ?? "기타";
          academies.push({ lat, lng, realm });
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
    if (!CHILDCARE_API_KEY) {
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
    fetchAcademies(),
  ]);
  applyChildcareScores(districts, centers, schools, academies);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("05-childcare.sql", buildUpdateSql(districts, ["s_childcare", "raw_childcare"]));
  await ensureOutputDir();
  await fs.writeFile(path.join(OUTPUT_DIR, "childcare-raw.json"), JSON.stringify({ centers, schools }, null, 2));
  info(`05-fetch-childcare: centers=${centers.length}, schools=${schools.length}, academies=${academies.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
