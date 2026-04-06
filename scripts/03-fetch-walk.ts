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
  sumWithin,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  round,
  text,
  CAPITAL_SIDO_NAMES,
} from "./district-score-lib";

interface Park {
  lat: number;
  lng: number;
  area: number;
  facilityScore: number;
  address: string | null;
}

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

function inCapitalArea(address: string | null): boolean {
  return address != null && CAPITAL_SIDO_NAMES.some((name) => address.includes(name));
}

async function fetchParks(): Promise<Park[]> {
  const parks: Park[] = [];
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
      const url = paramsToUrl("https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api", {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const payload = await fetch(url, { signal: AbortSignal.timeout(10000) }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.latitude);
        const lng = numeric(item.longitude);
        if (lat == null || lng == null) {
          warn("03-fetch-walk: skipped park with missing coordinates");
          continue;
        }
        const address = text(item.rdnmadr) ?? text(item.lnmadr);
        if (!inCapitalArea(address)) continue;
        const facilityScore = ((numeric(item.amuseFcltysCo) ?? 0) > 0 ? 1 : 0) + ((numeric(item.exercFcltysCo) ?? 0) > 0 ? 1 : 0) + ((numeric(item.cnvnFcltysCo) ?? 0) > 0 ? 1 : 0);
        parks.push({ lat, lng, area: numeric(item.parkAr) ?? 0, facilityScore, address });
      }
      if (items.length < 1000) break;
    }
  } catch (error) {
    warn(`03-fetch-walk: park API failed (${error instanceof Error ? error.message : String(error)}), using 0 parks`);
  }
  return parks;
}

function applyWalkScores(districts: DistrictState[], parks: Park[]) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const parkArea1km = sumWithin(point, parks, 1000, (park) => park.area);
    const parkCount1km = countWithin(point, parks, 1000);
    const parkDistanceM = parks.length ? nearestDistance(point, parks) : null;
    const parkFacilityCount = countWithin(point, parks.filter((park) => park.facilityScore > 0), 1000);
    district.raw_walk = { parkCount1km, parkArea1km, parkDistanceM, parkFacilityCount };
  }

  const households = (row: DistrictState): number => Math.max(row.households ?? 0, 1);
  const areaPerHouseholdNorm = normalizeWithinSgg(
    districts,
    (row) => row.sigungu,
    (row) => row.raw_walk != null ? round((row.raw_walk.parkArea1km ?? 0) / households(row), 4) : null
  );
  const countNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_walk?.parkCount1km ?? null, false);
  const distanceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_walk?.parkDistanceM ?? null, true);
  const facilityNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_walk?.parkFacilityCount ?? null, false);

  for (const district of districts) {
    district.s_walk = round(
      (areaPerHouseholdNorm.get(district) ?? 0) * 0.45 +
        (countNorm.get(district) ?? 0) * 0.20 +
        (distanceNorm.get(district) ?? 0) * 0.20 +
        (facilityNorm.get(district) ?? 0) * 0.15,
      2
    );
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const parks = await fetchParks();
  applyWalkScores(districts, parks);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("03-walk.sql", buildUpdateSql(districts, ["s_walk", "raw_walk"]));
  info(`03-fetch-walk: parks=${parks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
