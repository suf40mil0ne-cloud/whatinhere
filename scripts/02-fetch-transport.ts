import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchJsonWithRetry,
  fetchTextWithRetry,
  info,
  linearScore,
  loadState,
  nearestDistance,
  numeric,
  paramsToUrl,
  PointRecord,
  round,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  parseJsonItems,
  text,
  xmlItems,
  xmlTag,
  countWithin,
  OUTPUT_DIR,
  ensureOutputDir,
} from "./district-score-lib";

interface BusStop extends PointRecord {}
interface SubwayStation extends PointRecord { transfer: boolean; }

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const SUBWAY_SERVICE_KEY = SERVICE_KEY;

// City codes for capital region (수도권) from TAGO bus API
// Seoul (서울) is NOT available via this API — only Gyeonggi + Incheon
const CAPITAL_BUS_CITY_CODES = [
  23,                                                             // 인천광역시
  31010, 31020, 31030, 31040, 31050, 31060, 31070, 31080, 31090, // 경기 수원~안산
  31100, 31110, 31120, 31130, 31140, 31150, 31160, 31170, 31180, // 경기 고양~하남
  31190, 31200, 31210, 31220, 31230, 31240, 31250, 31260, 31270, // 경기 용인~포천
  31320, 31350, 31370, 31380,                                     // 경기 여주·연천·가평·양평
];

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^HTTP (401|403)\b/.test(message);
}

async function geocodeStation(name: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_REST_API_KEY) return null;
  try {
    const url = paramsToUrl("https://dapi.kakao.com/v2/local/search/keyword.json", {
      query: `${name} 역`,
      category_group_code: "SW8",
    });
    const payload = await fetchJsonWithRetry<{ documents?: Array<{ x?: string; y?: string }> }>(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        KA: "sdk/1.0 os/web origin/https://whatsinhere.pages.dev",
      },
      timeoutMs: 10000,
    });
    const doc = payload.documents?.[0];
    const lat = numeric(doc?.y);
    const lng = numeric(doc?.x);
    if (lat == null || lng == null) return null;
    return { lat, lng };
  } catch (error) {
    if (isAuthFailure(error)) {
      throw new Error(`02-fetch-transport: KAKAO_REST_API_KEY rejected by Kakao local API (${error instanceof Error ? error.message : String(error)})`);
    }
    warn(`02-fetch-transport: Kakao geocode failed for ${name} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

async function fetchBusStops(): Promise<BusStop[]> {
  const stops: BusStop[] = [];
  for (const cityCode of CAPITAL_BUS_CITY_CODES) {
    for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList", {
        serviceKey: SERVICE_KEY,
        cityCode,
        pageNo,
        numOfRows: 1000,
      });
      let xml: string;
      try {
        xml = await fetchTextWithRetry(url);
      } catch (error) {
        warn(`02-fetch-transport: bus API failed for cityCode=${cityCode} (${error instanceof Error ? error.message : String(error)})`);
        break;
      }
      const items = xmlItems(xml);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(xmlTag(item, "gpslati"));
        const lng = numeric(xmlTag(item, "gpslong"));
        if (lat == null || lng == null) continue;
        stops.push({ lat, lng, name: xmlTag(item, "nodenm") ?? xmlTag(item, "nodeNm") });
      }
      if (items.length < 1000) break;
    }
  }
  return stops;
}

async function fetchSubwayStations(): Promise<SubwayStation[]> {
  const rawItems: Array<{ name: string; route: string | null }> = [];
  try {
    for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList", {
        serviceKey: SUBWAY_SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
      });
      const raw = await fetchTextWithRetry(url);
      const trimmed = raw.trimStart();
      if (trimmed.startsWith("{")) {
        const payload = JSON.parse(raw) as unknown;
        const items = parseJsonItems(payload);
        if (!items.length) break;
        for (const item of items) {
          const name = text(item.subwayStationName) ?? text(item.subwaySttnNm) ?? text(item.sttnNm);
          const route = text(item.subwayRouteName) ?? text(item.subwayRouteNm) ?? text(item.routeNm);
          if (!name) continue;
          rawItems.push({ name, route });
        }
        if (items.length < 1000) break;
        continue;
      }

      const items = xmlItems(raw);
      if (!items.length) break;
      for (const item of items) {
        const name = xmlTag(item, "subwayStationName") ?? xmlTag(item, "subwaySttnNm") ?? xmlTag(item, "sttnNm");
        const route = xmlTag(item, "subwayRouteName") ?? xmlTag(item, "subwayRouteNm") ?? xmlTag(item, "routeNm");
        if (!name) continue;
        rawItems.push({ name, route });
      }
      if (items.length < 1000) break;
    }
  } catch (error) {
    warn(`02-fetch-transport: subway API failed (${error instanceof Error ? error.message : String(error)}), using 0 stations`);
    return [];
  }

  if (!rawItems.length) return [];
  if (!KAKAO_REST_API_KEY) {
    warn("02-fetch-transport: KAKAO_REST_API_KEY missing, subway metrics will be zeroed");
    return [];
  }

  const routeByName = new Map<string, Set<string>>();
  for (const item of rawItems) {
    if (!routeByName.has(item.name)) routeByName.set(item.name, new Set());
    if (item.route) routeByName.get(item.name)?.add(item.route);
  }

  const stations: SubwayStation[] = [];
  for (const [name, routes] of routeByName.entries()) {
    const coord = await geocodeStation(name);
    if (!coord) continue;
    stations.push({ ...coord, transfer: routes.size > 1 });
  }
  return stations;
}

function assignMetrics(districts: DistrictState[], buses: BusStop[], subways: SubwayStation[]) {
  const subwayBySigungu = new Map<string, SubwayStation[]>();
  for (const district of districts) {
    if (!subwayBySigungu.has(district.sigungu)) subwayBySigungu.set(district.sigungu, []);
  }
  for (const station of subways) {
    let nearest: DistrictState | null = null;
    let min = Number.POSITIVE_INFINITY;
    for (const district of districts) {
      if (district.center_lat == null || district.center_lng == null) continue;
      const distance = Math.abs(district.center_lat - station.lat) + Math.abs(district.center_lng - station.lng);
      if (distance < min) {
        min = distance;
        nearest = district;
      }
    }
    if (nearest) subwayBySigungu.get(nearest.sigungu)?.push(station);
  }

  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const busStopCount500m = buses.length ? countWithin(point, buses, 500) : 0;
    const busStopDistanceM = buses.length ? nearestDistance(point, buses) : null;
    const subwayStationDistanceM = subways.length ? nearestDistance(point, subways) : null;
    const subwayTransferCount1km = subways.length ? countWithin(point, subways.filter((row) => row.transfer), 1000) : 0;
    district.raw_transport = {
      busStopCount500m,
      busStopDistanceM,
      subwayStationDistanceM,
      subwayTransferCount1km,
    };
  }

  for (const district of districts) {
    const raw = district.raw_transport;
    if (!raw) { district.s_transport = 0; continue; }

    const hasBus = buses.length > 0;
    const hasSubwayInSigungu = (subwayBySigungu.get(district.sigungu)?.length ?? 0) > 0;

    // absolute scoring: best → worst thresholds
    const busDistScore    = linearScore(raw.busStopDistanceM,        100,  800);  // 100m=100, 800m=0
    const subwayDistScore = linearScore(raw.subwayStationDistanceM,  250, 2000);  // 250m=100, 2000m=0
    const busCountScore   = linearScore(raw.busStopCount500m,         10,    0);  // 10개=100, 0개=0
    const transferScore   = linearScore(raw.subwayTransferCount1km,    2,    0);  // 2개=100, 0개=0

    if (!hasBus) {
      district.s_transport = round(subwayDistScore * 0.75 + transferScore * 0.25, 2);
    } else if (!hasSubwayInSigungu) {
      district.s_transport = round(busDistScore * 0.75 + busCountScore * 0.25, 2);
    } else {
      district.s_transport = round(
        busDistScore * 0.45 + subwayDistScore * 0.30 + busCountScore * 0.15 + transferScore * 0.10, 2
      );
    }
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");

  const [buses, subways] = await Promise.all([fetchBusStops(), fetchSubwayStations()]);
  if (!buses.length && !subways.length) {
    throw new Error("02-fetch-transport: no transport source data fetched; refusing to overwrite existing scores");
  }
  assignMetrics(districts, buses, subways);
  updateOverallScores(districts);

  await saveState(districts);
  await writeSqlFile("02-transport.sql", buildUpdateSql(districts, ["s_transport", "raw_transport"]));
  await ensureOutputDir();
  await fs.writeFile(path.join(OUTPUT_DIR, "transport-raw.json"), JSON.stringify({ buses, subways }, null, 2));
  info(`02-fetch-transport: buses=${buses.length}, subways=${subways.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
