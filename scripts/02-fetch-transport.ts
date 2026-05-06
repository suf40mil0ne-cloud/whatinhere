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
interface SubwayStation extends PointRecord { transfer: boolean; routes: string[]; }

// ─── Scoring helpers ─────────────────────────────────────────────────────────

type ScoreSegment = [number, number, number, number]; // [d0, d1, s0, s1]

// 구간별 비선형 — 100점 구간을 좁혀 거리 차별화 극대화
const SUBWAY_SEGMENTS: ScoreSegment[] = [
  [0,    150,  100, 100],  // ~150m: 100점
  [150,  300,  100,  80],  // 150~300m
  [300,  500,   80,  60],  // 300~500m
  [500,  700,   60,  40],  // 500~700m
  [700,  1000,  40,  20],  // 700~1000m
  [1000, 1500,  20,   5],  // 1000~1500m
  [1500, 2500,   5,   0],  // 1500~2500m
];

const BUS_SEGMENTS: ScoreSegment[] = [
  [0,    50,  100, 100],   // ~50m: 100점
  [50,  150,  100,  80],   // 50~150m
  [150, 250,   80,  60],   // 150~250m
  [250, 400,   60,  40],   // 250~400m
  [400, 600,   40,  20],   // 400~600m
  [600, 900,   20,   5],   // 600~900m
  [900, 1400,   5,   0],   // 900~1400m
];

function segmentedScore(distance: number | null, segments: ScoreSegment[]): number {
  if (distance == null) return 0;
  for (const [d0, d1, s0, s1] of segments) {
    if (distance <= d1) {
      if (d0 === d1) return s0;
      const t = (distance - d0) / (d1 - d0);
      return s0 + (s1 - s0) * t;
    }
  }
  return 0;
}

// C급 특정 패턴을 먼저 체크해 "인천1호선"→A급, "인천2호선"→S급 오분류 방지
function lineGradeForRoute(r: string): number {
  if (["인천1호선", "인천2호선", "경의중앙", "공항", "수인분당"].some((n) => r.includes(n))) return 0.9;
  if (["2호선", "9호선", "신분당"].some((n) => r.includes(n))) return 1.5;
  if (["1호선", "3호선", "4호선", "7호선"].some((n) => r.includes(n))) return 1.3;
  if (["5호선", "6호선", "8호선"].some((n) => r.includes(n))) return 1.1;
  return 0.7;
}

function subwayLineGrade(routes: string[]): number {
  if (!routes.length) return 1.1;
  return routes.reduce((best, r) => Math.max(best, lineGradeForRoute(r)), 0.7);
}

// flat-earth approximation — only used to identify which station is nearest
function nearestSubwayInfo(
  point: { lat: number; lng: number },
  subways: SubwayStation[],
): { distanceM: number; grade: number } | null {
  if (!subways.length) return null;
  let nearest: SubwayStation | null = null;
  let minDist = Number.POSITIVE_INFINITY;
  const cosLat = Math.cos((point.lat * Math.PI) / 180);
  for (const s of subways) {
    const dlat = (s.lat - point.lat) * 111320;
    const dlng = (s.lng - point.lng) * 111320 * cosLat;
    const d = Math.sqrt(dlat * dlat + dlng * dlng);
    if (d < minDist) { minDist = d; nearest = s; }
  }
  return nearest ? { distanceM: minDist, grade: subwayLineGrade(nearest.routes) } : null;
}

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
    stations.push({ ...coord, transfer: routes.size > 1, routes: [...routes] });
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
    if (district.center_lat == null || district.center_lng == null) { district.s_transport = 0; continue; }

    const point = { lat: district.center_lat, lng: district.center_lng };
    const hasBus = buses.length > 0;
    const hasSubwayInSigungu = (subwayBySigungu.get(district.sigungu)?.length ?? 0) > 0;

    // subway: 등급을 점수에 곱하지 않고 유효 거리를 줄여 전체 구간 차별화 유지
    // S급(1.5) 역 400m → 유효 267m처럼 처리, D급(0.7) 역 400m → 유효 571m
    const subwayInfo  = hasSubwayInSigungu ? nearestSubwayInfo(point, subways) : null;
    const subwayGrade = subwayInfo?.grade ?? 1.0;
    const effectiveSubwayDist = raw.subwayStationDistanceM != null
      ? raw.subwayStationDistanceM / subwayGrade
      : null;
    const subwayDistScore = segmentedScore(effectiveSubwayDist, SUBWAY_SEGMENTS);

    // bus: routeType 정보 없음 → 유효 거리 그대로(등급 1.0)
    const busDistScore = segmentedScore(raw.busStopDistanceM, BUS_SEGMENTS);

    // count-based scores (unchanged)
    const busCountScore = linearScore(raw.busStopCount500m,       10, 0); // 10개=100, 0개=0
    const transferScore = linearScore(raw.subwayTransferCount1km,  2, 0); // 2개=100, 0개=0

    if (!hasBus) {
      // 지하철만
      district.s_transport = round(subwayDistScore * 0.75 + transferScore * 0.25, 2);
    } else if (!hasSubwayInSigungu) {
      // 버스만
      district.s_transport = round((busDistScore * 0.75 + busCountScore * 0.25) * 0.75, 2);
    } else {
      // 버스 + 지하철
      district.s_transport = round(
        subwayDistScore * 0.60 + transferScore * 0.20 + busDistScore * 0.13 + busCountScore * 0.07, 2
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
