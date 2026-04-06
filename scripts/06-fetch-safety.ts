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
// const SAFETY_INDEX_API_KEY = process.env.SAFETY_INDEX_API_KEY; // API hang — disabled
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
  try {
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
  } catch (error) {
    warn(`06-fetch-safety: child zone API failed (${error instanceof Error ? error.message : String(error)}), using ${rows.length} partial results`);
  }
  return rows;
}

// fetchSafetyIndex disabled — API hangs, no reliable endpoint
function fetchSafetyIndex(): Map<string, number> {
  warn("06-fetch-safety: safety index disabled, skipping");
  return new Map<string, number>();
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
  // safetyIndexNorm removed — safety index API disabled

  for (const district of districts) {
    if (!CCTV_API_KEY) {
      // safetyIndex weight(0.33) redistributed equally to childZone and cctvDistance
      district.s_safety = round(
        (childZoneNorm.get(district) ?? 0) * 0.50 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.50,
        2
      );
    } else {
      // safetyIndex weight(0.20) redistributed equally to remaining three
      district.s_safety = round(
        (cctvCountNorm.get(district) ?? 0) * 0.47 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.27 +
          (childZoneNorm.get(district) ?? 0) * 0.26,
        2
      );
    }
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const safetyIndex = fetchSafetyIndex();
  const [cctvs, childZones] = await Promise.all([fetchCctv(), fetchChildZones()]);
  applySafetyScores(districts, cctvs, childZones, safetyIndex);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("06-safety.sql", buildUpdateSql(districts, ["s_safety", "raw_safety"]));
  info(`06-fetch-safety: cctv=${cctvs.length}, childZones=${childZones.length}, safetyIndex=0 (disabled)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
