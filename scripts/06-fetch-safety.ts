import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  info,
  loadState,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  parseJsonItems,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
  countWithin,
  round,
  text,
  CAPITAL_SIDO_NAMES,
} from "./district-score-lib";

interface CctvPoint { lat: number; lng: number; cameras: number; }
interface ChildZonePoint { lat: number; lng: number; }

const CCTV_API_KEY = process.env.CCTV_API_KEY;
const SAFETY_INDEX_API_KEY = process.env.SAFETY_INDEX_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

async function fetchCctv(): Promise<CctvPoint[]> {
  if (!CCTV_API_KEY) {
    warn("06-fetch-safety: CCTV_API_KEY missing, CCTV metrics will be zeroed");
    return [];
  }
  const rows: CctvPoint[] = [];
  for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
    const url = paramsToUrl("https://apis.data.go.kr/1741000/cctv_info", {
      serviceKey: CCTV_API_KEY,
      pageNo,
      numOfRows: 1000,
    });
    const xml = await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    const items = xmlItems(xml);
    if (!items.length) break;
    for (const item of items) {
      if ((xmlTag(item, "instlPurpose") ?? "") !== "범죄예방") continue;
      const lat = numeric(xmlTag(item, "latitude"));
      const lng = numeric(xmlTag(item, "longitude"));
      if (lat == null || lng == null) {
        warn("06-fetch-safety: skipped CCTV row with missing coordinates");
        continue;
      }
      rows.push({ lat, lng, cameras: numeric(xmlTag(item, "cameraCo")) ?? 1 });
    }
    if (items.length < 1000) break;
  }
  return rows;
}

async function fetchChildZones(): Promise<ChildZonePoint[]> {
  const rows: ChildZonePoint[] = [];
  for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
    const url = paramsToUrl("http://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api", {
      serviceKey: SERVICE_KEY,
      pageNo,
      numOfRows: 1000,
      type: "json",
    });
    const payload = await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    const items = parseJsonItems(payload);
    if (!items.length) break;
    for (const item of items) {
      const lat = numeric(item.la);
      const lng = numeric(item.lo);
      if (lat == null || lng == null) {
        warn("06-fetch-safety: skipped child zone with missing coordinates");
        continue;
      }
      const address = text(item.rdnmadr) ?? text(item.lnmadr);
      if (address && !CAPITAL_SIDO_NAMES.some((name) => address.includes(name))) continue;
      rows.push({ lat, lng });
    }
    if (items.length < 1000) break;
  }
  return rows;
}

async function fetchSafetyIndex(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!SAFETY_INDEX_API_KEY) {
    warn("06-fetch-safety: SAFETY_INDEX_API_KEY missing, safety-index metric will be zeroed");
    return result;
  }
  const url = paramsToUrl("https://www.safetydata.go.kr/V2/api/DSSP-IF-00421", { serviceKey: SAFETY_INDEX_API_KEY });
  const payload = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  const items = parseJsonItems(payload);
  const gradeMap = new Map([[1, 100], [2, 80], [3, 60], [4, 40], [5, 20]]);
  for (const item of items) {
    const sigungu = text(item.sigunguNm) ?? text(item.sggNm) ?? text(item.SIGUNGU_NM);
    if (!sigungu) continue;
    const crime = gradeMap.get(numeric(item.crimeGrade) ?? 0) ?? 0;
    const life = gradeMap.get(numeric(item.lifeSafetyGrade) ?? 0) ?? 0;
    result.set(sigungu, (crime + life) / 2);
  }
  return result;
}

function applySafetyScores(districts: DistrictState[], cctvs: CctvPoint[], childZones: ChildZonePoint[], safetyIndex: Map<string, number>) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const cctvCount500m = cctvs.length ? countWithin(point, cctvs, 500, (row) => row.cameras) : 0;
    const cctvDistanceM = cctvs.length ? nearestDistance(point, cctvs) : null;
    const childZoneCount1km = childZones.length ? countWithin(point, childZones, 1000) : 0;
    const safetyIndexScore = safetyIndex.get(district.sigungu) ?? 0;
    district.raw_safety = { cctvCount500m, cctvDistanceM, childZoneCount1km, safetyIndexScore };
  }

  const cctvCountNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.cctvCount500m ?? null, false);
  const cctvDistanceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.cctvDistanceM ?? null, true);
  const childZoneNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.childZoneCount1km ?? null, false);
  const safetyIndexNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.safetyIndexScore ?? null, false);

  for (const district of districts) {
    if (!CCTV_API_KEY) {
      district.s_safety = round(
        (childZoneNorm.get(district) ?? 0) * 0.33 +
          (safetyIndexNorm.get(district) ?? 0) * 0.33 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.34,
        2
      );
    } else {
      district.s_safety = round(
        (cctvCountNorm.get(district) ?? 0) * 0.40 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.20 +
          (childZoneNorm.get(district) ?? 0) * 0.20 +
          (safetyIndexNorm.get(district) ?? 0) * 0.20,
        2
      );
    }
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const [cctvs, childZones, safetyIndex] = await Promise.all([fetchCctv(), fetchChildZones(), fetchSafetyIndex()]);
  applySafetyScores(districts, cctvs, childZones, safetyIndex);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("06-safety.sql", buildUpdateSql(districts, ["s_safety", "raw_safety"]));
  info(`06-fetch-safety: cctv=${cctvs.length}, childZones=${childZones.length}, safetyIndex=${safetyIndex.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
