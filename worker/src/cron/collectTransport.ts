import {
  DistrictRow,
  PointRecord,
  batchD1Update,
  countWithin,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  parseJsonItems,
  refreshOverall,
  round,
} from "./utils";

interface SubwayStation extends PointRecord {
  transfer: boolean;
}

async function geocodeStation(name: string, kakaoKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = paramsToUrl("https://dapi.kakao.com/v2/local/search/keyword.json", {
      query: `${name} 역`,
      category_group_code: "SW8",
    });
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
    if (!res.ok) return null;
    const data = await res.json() as { documents?: Array<{ x: string; y: string }> };
    const doc = data.documents?.[0];
    if (!doc) return null;
    const lat = numeric(doc.y);
    const lng = numeric(doc.x);
    if (lat == null || lng == null) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function fetchSubwayStations(serviceKey: string, kakaoKey: string): Promise<SubwayStation[]> {
  // Step 1: collect all raw items from the JSON API
  type RawItem = { subwayStationId?: string; subwayStationName?: string; subwayRouteName?: string };
  const rawItems: RawItem[] = [];
  try {
    for (let pageNo = 1; pageNo <= 50; pageNo++) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList", {
        serviceKey,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const data = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const items = parseJsonItems(data) as RawItem[];
      console.log(`[collectTransport] subway page=${pageNo} items=${items.length}`);
      if (!items.length) break;
      rawItems.push(...items);
      if (items.length < 1000) break;
    }
  } catch (e) {
    console.warn(`[collectTransport] subway fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectTransport] subway raw items=${rawItems.length}`);

  // Step 2: determine transfer stations (same name, multiple routes)
  const nameToRoutes = new Map<string, Set<string>>();
  for (const item of rawItems) {
    const name = item.subwayStationName?.trim();
    if (!name) continue;
    if (!nameToRoutes.has(name)) nameToRoutes.set(name, new Set());
    if (item.subwayRouteName) nameToRoutes.get(name)!.add(item.subwayRouteName);
  }

  // Step 3: geocode each unique station name via Kakao keyword search
  const uniqueNames = [...nameToRoutes.keys()];
  console.log(`[collectTransport] unique station names=${uniqueNames.length}, geocoding with Kakao...`);

  const coordCache = new Map<string, { lat: number; lng: number } | null>();
  for (let i = 0; i < uniqueNames.length; i++) {
    const name = uniqueNames[i];
    const coord = await geocodeStation(name, kakaoKey);
    coordCache.set(name, coord);
    if (i < uniqueNames.length - 1) await new Promise((r) => setTimeout(r, 100));
  }

  const geocoded = [...coordCache.values()].filter((c) => c != null).length;
  console.log(`[collectTransport] geocoded=${geocoded}/${uniqueNames.length} stations`);

  // Step 4: build station list (one entry per unique name with coordinates)
  const stations: SubwayStation[] = [];
  for (const [name, routes] of nameToRoutes) {
    const coord = coordCache.get(name);
    if (!coord) continue;
    stations.push({ lat: coord.lat, lng: coord.lng, transfer: routes.size > 1 });
  }
  console.log(`[collectTransport] subway total=${stations.length}`);
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
      console.log(`[collectTransport] bus page=${pageNo} items=${items.length}`);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(xmlTag(item, "gpslati"));
        const lng = numeric(xmlTag(item, "gpslong"));
        if (lat == null || lng == null) continue;
        stops.push({ lat, lng });
      }
      if (items.length < 1000) break;
    }
  } catch (e) {
    console.warn(`[collectTransport] bus fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectTransport] bus total=${stops.length}`);
  return stops;
}

export async function collectTransport(db: D1Database, serviceKey: string, tagoKey?: string, kakaoKey?: string): Promise<number> {
  const { results } = await db
    .prepare("SELECT code, sido, sigungu, dong, center_lat, center_lng, households FROM district_scores")
    .all<DistrictRow>();
  const districts = results;

  const [subways, buses] = await Promise.all([
    kakaoKey ? fetchSubwayStations(serviceKey, kakaoKey) : Promise.resolve<SubwayStation[]>([]),
    tagoKey ? fetchBusStops(tagoKey) : Promise.resolve<PointRecord[]>([]),
  ]);

  if (subways.length === 0 && buses.length === 0) {
    console.warn("[collectTransport] no data from any API — skipping UPDATE");
    return 0;
  }

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

  console.log(`[collectTransport] updating ${entries.length} districts (subway=${subways.length}, bus=${buses.length})`);
  await batchD1Update(db, entries, "s_transport", "raw_transport");
  await refreshOverall(db);
  return entries.length;
}
