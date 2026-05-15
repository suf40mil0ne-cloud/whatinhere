import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import {
  buildUpdateSql,
  CAPITAL_SIDO_NAMES,
  DATA_DIR,
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
  toMeters,
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

// ── 추가 공원 파일 로더 ──────────────────────────────────────────────────────────
// 파일 준비: cp /mnt/user-data/uploads/<filename> ./data/<filename>
//   - 전국도시공원정보표준데이터.csv
//   - 서울시_주요_공원현황_2026_상반기_.xlsx
//   - 경기도_도시공원.csv

const CAPITAL_LAT_MIN = 36.0;
const CAPITAL_LAT_MAX = 38.5;
const CAPITAL_LNG_MIN = 126.0;
const CAPITAL_LNG_MAX = 128.0;

function inCapitalBounds(lat: number, lng: number): boolean {
  return lat >= CAPITAL_LAT_MIN && lat <= CAPITAL_LAT_MAX && lng >= CAPITAL_LNG_MIN && lng <= CAPITAL_LNG_MAX;
}

function readParkFile(filePath: string, codepage?: number): Record<string, string>[] {
  const opts: XLSX.ParsingOptions = { type: "file", raw: false };
  if (codepage != null) opts.codepage = codepage;
  const wb = XLSX.readFile(filePath, opts);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "" });
}

function loadNationalParksCsv(): Park[] {
  const filePath = path.join(DATA_DIR, "전국도시공원정보표준데이터.csv");
  let rows: Record<string, string>[];
  try {
    rows = readParkFile(filePath, 949);
  } catch {
    warn("03-fetch-walk: 전국도시공원정보표준데이터.csv 파일 없음, 건너뜀");
    return [];
  }
  const parks: Park[] = [];
  for (const row of rows) {
    const lat = numeric(row["위도"]);
    const lng = numeric(row["경도"]);
    if (lat == null || lng == null) continue;
    if (!inCapitalBounds(lat, lng)) continue;
    const area = numeric(row["공원면적"]) ?? 0;
    if (area <= 0) continue;
    const hasExerc = (row["공원보유시설(운동시설)"] ?? "").trim().length > 0;
    const hasCnvn = (row["공원보유시설(편익시설)"] ?? "").trim().length > 0;
    const facilityScore = hasExerc || hasCnvn ? 1 : 0;
    parks.push({ lat, lng, area, facilityScore, address: null });
  }
  return parks;
}

function loadSeoulParksXlsx(): Park[] {
  const filePath = path.join(DATA_DIR, "서울시_주요_공원현황_2026_상반기_.xlsx");
  let rows: Record<string, string>[];
  try {
    rows = readParkFile(filePath);
  } catch {
    warn("03-fetch-walk: 서울시_주요_공원현황_2026_상반기_.xlsx 파일 없음, 건너뜀");
    return [];
  }
  const parks: Park[] = [];
  for (const row of rows) {
    const lng = numeric(row["X좌표(WGS84)"]);
    const lat = numeric(row["Y좌표(WGS84)"]);
    if (lat == null || lng == null) continue;
    if (!inCapitalBounds(lat, lng)) continue;
    const areaStr = (row["면적"] ?? "").replace(/,/g, "").match(/\d+\.?\d*/)?.[0] ?? "";
    const area = Math.min(areaStr ? Number(areaStr) : 0, 10_000_000); // 10km² 상한 (데이터 오류 방지)
    if (!(area > 0)) continue;
    parks.push({ lat, lng, area, facilityScore: 0, address: null });
  }
  return parks;
}

function loadGyeonggiParksCsv(): Park[] {
  const filePath = path.join(DATA_DIR, "경기도_도시공원.csv");
  let rows: Record<string, string>[];
  try {
    rows = readParkFile(filePath, 949);
  } catch {
    warn("03-fetch-walk: 경기도_도시공원.csv 파일 없음, 건너뜀");
    return [];
  }
  const parks: Park[] = [];
  for (const row of rows) {
    const lat = numeric(row["위도"]);
    const lng = numeric(row["경도"]);
    if (lat == null || lng == null) continue;
    const area = numeric(row["공원면적"]) ?? 0;
    if (area <= 0) continue;
    const hasExerc = (row["공원보유시설(운동시설)"] ?? "").trim().length > 0;
    const facilityScore = hasExerc ? 1 : 0;
    parks.push({ lat, lng, area, facilityScore, address: null });
  }
  return parks;
}

// 좌표 기준 50m 이내 중복 제거. 중복 시 면적이 큰 것 유지.
function mergeExtraParks(base: Park[], extra: Park[]): { dupCount: number } {
  let dupCount = 0;
  for (const newPark of extra) {
    let dupIdx = -1;
    for (let i = 0; i < base.length; i++) {
      if (toMeters(newPark.lat, newPark.lng, base[i].lat, base[i].lng) <= 50) {
        dupIdx = i;
        break;
      }
    }
    if (dupIdx >= 0) {
      dupCount += 1;
      if (newPark.area > base[dupIdx].area) base[dupIdx] = newPark;
    } else {
      base.push(newPark);
    }
  }
  return { dupCount };
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

  // ── 추가 공원 파일 수집 및 병합 ───────────────────────────────────────────────
  const extraParks = [
    ...loadNationalParksCsv(),
    ...loadSeoulParksXlsx(),
    ...loadGyeonggiParksCsv(),
  ];
  info(`03-fetch-walk: 추가 공원 파일에서 ${extraParks.length}개 로드`);
  const baseCount = parks.length;
  const { dupCount } = mergeExtraParks(parks, extraParks);
  const addedCount = parks.length - baseCount;
  info(`03-fetch-walk: 중복 제거 후 ${addedCount}개 추가`);
  info(`03-fetch-walk: 전체 공원 ${parks.length}개 (기존 ${baseCount} + 추가 ${addedCount})`);
  void dupCount;

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
