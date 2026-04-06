import {
  DistrictRow,
  PointRecord,
  batchD1Update,
  countWithin,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  refreshOverall,
  round,
  xmlItems,
  xmlTag,
} from "./utils";

interface SubwayStation extends PointRecord {
  transfer: boolean;
}

async function fetchSubwayStations(serviceKey: string): Promise<SubwayStation[]> {
  const stations: SubwayStation[] = [];
  try {
    for (let pageNo = 1; pageNo <= 50; pageNo++) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/SubwayInfo/getKwrdFndSubwaySttnList", {
        serviceKey,
        pageNo,
        numOfRows: 1000,
      });
      const xml = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
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
  } catch {
    // degrade gracefully — subway metrics zeroed
  }
  return stations;
}

async function fetchBusStops(tagoKey: string): Promise<PointRecord[]> {
  const stops: PointRecord[] = [];
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo++) {
      const url = paramsToUrl("http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList", {
        serviceKey: tagoKey,
        pageNo,
        numOfRows: 1000,
      });
      const xml = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
      const items = xmlItems(xml);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(xmlTag(item, "gpslati"));
        const lng = numeric(xmlTag(item, "gpslong"));
        if (lat == null || lng == null) continue;
        stops.push({ lat, lng });
      }
      if (items.length < 1000) break;
    }
  } catch {
    // degrade gracefully — bus metrics zeroed
  }
  return stops;
}

export async function collectTransport(db: D1Database, serviceKey: string, tagoKey?: string): Promise<number> {
  const { results } = await db
    .prepare("SELECT code, sido, sigungu, dong, center_lat, center_lng, households FROM district_scores")
    .all<DistrictRow>();
  const districts = results;

  const [subways, buses] = await Promise.all([
    fetchSubwayStations(serviceKey),
    tagoKey ? fetchBusStops(tagoKey) : Promise.resolve<PointRecord[]>([]),
  ]);

  // Map each subway station to the nearest district's sigungu
  const subwayBySigungu = new Map<string, SubwayStation[]>();
  for (const d of districts) {
    if (!subwayBySigungu.has(d.sigungu)) subwayBySigungu.set(d.sigungu, []);
  }
  for (const station of subways) {
    let nearest: DistrictRow | null = null;
    let min = Infinity;
    for (const d of districts) {
      if (d.center_lat == null || d.center_lng == null) continue;
      const dist = Math.abs(d.center_lat - station.lat) + Math.abs(d.center_lng - station.lng);
      if (dist < min) { min = dist; nearest = d; }
    }
    if (nearest) subwayBySigungu.get(nearest.sigungu)?.push(station as SubwayStation);
  }

  type RawT = {
    busStopCount500m: number;
    busStopDistanceM: number | null;
    subwayStationDistanceM: number | null;
    subwayTransferCount1km: number;
  };
  const rawMap = new Map<DistrictRow, RawT>();
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const p = { lat: d.center_lat, lng: d.center_lng };
    rawMap.set(d, {
      busStopCount500m: buses.length ? countWithin(p, buses, 500) : 0,
      busStopDistanceM: buses.length ? nearestDistance(p, buses) : null,
      subwayStationDistanceM: subways.length ? nearestDistance(p, subways) : null,
      subwayTransferCount1km: subways.length
        ? countWithin(p, subways.filter((s) => (s as SubwayStation).transfer), 1000)
        : 0,
    });
  }

  const hasBus = buses.length > 0;
  const busDistanceNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.busStopDistanceM ?? null, true);
  const subwayDistanceNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.subwayStationDistanceM ?? null, true);
  const busCountNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.busStopCount500m ?? null, false);
  const transferNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.subwayTransferCount1km ?? null, false);

  const entries: Array<{ code: string; score: number; raw: unknown }> = [];
  for (const d of districts) {
    const raw = rawMap.get(d) ?? null;
    const hasSubway = (subwayBySigungu.get(d.sigungu)?.length ?? 0) > 0;
    let score: number;
    if (!hasBus) {
      score = round((subwayDistanceNorm.get(d) ?? 0) * 0.75 + (transferNorm.get(d) ?? 0) * 0.25, 2);
    } else if (!hasSubway) {
      score = round((busDistanceNorm.get(d) ?? 0) * 0.75 + (busCountNorm.get(d) ?? 0) * 0.25, 2);
    } else {
      score = round(
        (busDistanceNorm.get(d) ?? 0) * 0.45 +
          (subwayDistanceNorm.get(d) ?? 0) * 0.30 +
          (busCountNorm.get(d) ?? 0) * 0.15 +
          (transferNorm.get(d) ?? 0) * 0.10,
        2
      );
    }
    entries.push({ code: d.code, score, raw });
  }

  await batchD1Update(db, entries, "s_transport", "raw_transport");
  await refreshOverall(db);
  return entries.length;
}
