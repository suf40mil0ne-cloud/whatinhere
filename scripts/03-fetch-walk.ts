import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUpdateSql,
  CAPITAL_SIDO_NAMES,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchJsonWithRetry,
  flushWarningSummary,
  info,
  linearScore,
  loadState,
  nearestDistance,
  numeric,
  paramsToUrl,
  parseJsonItems,
  round,
  saveState,
  sumWithin,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  text,
  OUTPUT_DIR,
  ensureOutputDir,
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
  let skippedMissingCoords = 0;
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
      const url = paramsToUrl("https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api", {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 30000, legacyTls: true });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.latitude);
        const lng = numeric(item.longitude);
        if (lat == null || lng == null) {
          skippedMissingCoords += 1;
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
  flushWarningSummary("03-fetch-walk", "parks with missing coordinates", skippedMissingCoords);
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

    const households = Math.max(district.households ?? 0, 1);
    const areaPerHousehold = round(parkArea1km / households, 4);

    // absolute scoring: best → worst thresholds (㎡/세대, 개수, 거리m)
    district.s_walk = round(
      linearScore(areaPerHousehold, 30,   0) * 0.45 +  // 30㎡/세대=100, 0=0
      linearScore(parkCount1km,      5,   0) * 0.20 +  // 5개=100, 0=0
      linearScore(parkDistanceM,   100, 1000) * 0.20 + // 100m=100, 1000m=0
      linearScore(parkFacilityCount, 3,   0) * 0.15,   // 3개=100, 0=0
      2
    );
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const parks = await fetchParks();
  if (!parks.length) {
    warn("03-fetch-walk: park API returned no usable rows; keeping existing scores");
    await writeSqlFile("03-walk.sql", "");
    return;
  }
  applyWalkScores(districts, parks);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("03-walk.sql", buildUpdateSql(districts, ["s_walk", "raw_walk"]));
  await ensureOutputDir();
  await fs.writeFile(path.join(OUTPUT_DIR, "walk-raw.json"), JSON.stringify({ parks }, null, 2));
  info(`03-fetch-walk: parks=${parks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
