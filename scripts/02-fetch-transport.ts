import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchTextWithRetry,
  info,
  loadState,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  PointRecord,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
  countWithin,
  round,
} from "./district-score-lib";

interface BusStop extends PointRecord {}
interface SubwayStation extends PointRecord { transfer: boolean; }

const TAGO_API_KEY = process.env.TAGO_API_KEY;
const SUBWAY_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

async function fetchBusStops(): Promise<BusStop[]> {
  if (!TAGO_API_KEY) {
    warn("02-fetch-transport: TAGO_API_KEY missing, bus metrics will be zeroed");
    return [];
  }

  const stops: BusStop[] = [];
  for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
    const url = paramsToUrl("http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList", {
      serviceKey: TAGO_API_KEY,
      pageNo,
      numOfRows: 1000,
    });
    const xml = await fetchTextWithRetry(url);
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
  return stops;
}

async function fetchSubwayStations(): Promise<SubwayStation[]> {
  const stations: SubwayStation[] = [];
  try {
    for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList", {
        serviceKey: SUBWAY_SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
      });
      const xml = await fetchTextWithRetry(url);
      const items = xmlItems(xml);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(xmlTag(item, "sttnLa"));
        const lng = numeric(xmlTag(item, "sttnLo"));
        if (lat == null || lng == null) continue;
        stations.push({ lat, lng, transfer: (xmlTag(item, "trnsfYn") ?? "N") === "Y" });
      }
      if (items.length < 1000) break;
    }
  } catch (error) {
    warn(`02-fetch-transport: subway API failed (${error instanceof Error ? error.message : String(error)}), using 0 stations`);
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

  const busDistanceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_transport?.busStopDistanceM ?? null, true);
  const subwayDistanceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_transport?.subwayStationDistanceM ?? null, true);
  const busCountNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_transport?.busStopCount500m ?? null, false);
  const transferNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_transport?.subwayTransferCount1km ?? null, false);

  for (const district of districts) {
    const hasBus = Boolean(TAGO_API_KEY);
    const hasSubwayInSigungu = (subwayBySigungu.get(district.sigungu)?.length ?? 0) > 0;
    if (!hasBus) {
      district.s_transport = round((subwayDistanceNorm.get(district) ?? 0) * 0.75 + (transferNorm.get(district) ?? 0) * 0.25, 2);
      continue;
    }
    if (!hasSubwayInSigungu) {
      district.s_transport = round((busDistanceNorm.get(district) ?? 0) * 0.75 + (busCountNorm.get(district) ?? 0) * 0.25, 2);
      continue;
    }
    district.s_transport = round(
      (busDistanceNorm.get(district) ?? 0) * 0.45 +
        (subwayDistanceNorm.get(district) ?? 0) * 0.30 +
        (busCountNorm.get(district) ?? 0) * 0.15 +
        (transferNorm.get(district) ?? 0) * 0.10,
      2
    );
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");

  const [buses, subways] = await Promise.all([fetchBusStops(), fetchSubwayStations()]);
  assignMetrics(districts, buses, subways);
  updateOverallScores(districts);

  await saveState(districts);
  await writeSqlFile("02-transport.sql", buildUpdateSql(districts, ["s_transport", "raw_transport"]));
  info(`02-fetch-transport: buses=${buses.length}, subways=${subways.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
