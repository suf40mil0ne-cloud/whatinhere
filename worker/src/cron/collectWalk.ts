import {
  CAPITAL_SIDO_NAMES,
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
  sumWithin,
  text,
} from "./utils";

interface Park extends PointRecord {
  area: number;
  facilityScore: number;
}

function inCapitalArea(address: string | null): boolean {
  return address != null && CAPITAL_SIDO_NAMES.some((name) => address.includes(name));
}

async function fetchParks(serviceKey: string): Promise<Park[]> {
  const parks: Park[] = [];
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo++) {
      const url = paramsToUrl("https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api", {
        serviceKey,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const payload = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const items = parseJsonItems(payload);
      console.log(`[collectWalk] park page=${pageNo} items=${items.length}`);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.latitude);
        const lng = numeric(item.longitude);
        if (lat == null || lng == null) continue;
        const address = text(item.rdnmadr) ?? text(item.lnmadr);
        if (!inCapitalArea(address)) continue;
        const facilityScore =
          ((numeric(item.amuseFcltysCo) ?? 0) > 0 ? 1 : 0) +
          ((numeric(item.exercFcltysCo) ?? 0) > 0 ? 1 : 0) +
          ((numeric(item.cnvnFcltysCo) ?? 0) > 0 ? 1 : 0);
        parks.push({ lat, lng, area: numeric(item.parkAr) ?? 0, facilityScore });
      }
      if (items.length < 1000) break;
    }
  } catch (e) {
    console.warn(`[collectWalk] park fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectWalk] park total=${parks.length}`);
  return parks;
}

export async function collectWalk(db: D1Database, serviceKey: string): Promise<number> {
  const { results } = await db
    .prepare("SELECT code, sido, sigungu, dong, center_lat, center_lng, households FROM district_scores")
    .all<DistrictRow>();
  const districts = results;

  const parks = await fetchParks(serviceKey);

  if (parks.length === 0) {
    console.warn("[collectWalk] no park data from API — skipping UPDATE");
    return 0;
  }

  type RawW = {
    parkCount1km: number;
    parkArea1km: number;
    parkDistanceM: number | null;
    parkFacilityCount: number;
  };
  const rawMap = new Map<DistrictRow, RawW>();
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const p = { lat: d.center_lat, lng: d.center_lng };
    rawMap.set(d, {
      parkCount1km: countWithin(p, parks, 1000),
      parkArea1km: sumWithin(p, parks, 1000, (pk) => (pk as Park).area),
      parkDistanceM: nearestDistance(p, parks),
      parkFacilityCount: countWithin(p, parks.filter((pk) => (pk as Park).facilityScore > 0), 1000),
    });
  }

  const households = (d: DistrictRow): number => Math.max(d.households ?? 0, 1);
  const areaPerHouseholdNorm = normalizeWithinSgg(
    districts,
    (d) => d.sigungu,
    (d) => {
      const r = rawMap.get(d);
      return r != null ? round((r.parkArea1km ?? 0) / households(d), 4) : null;
    }
  );
  const countNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.parkCount1km ?? null, false);
  const distanceNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.parkDistanceM ?? null, true);
  const facilityNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.parkFacilityCount ?? null, false);

  const entries: Array<{ code: string; score: number; raw: unknown }> = [];
  for (const d of districts) {
    const score = round(
      (areaPerHouseholdNorm.get(d) ?? 0) * 0.45 +
        (countNorm.get(d) ?? 0) * 0.20 +
        (distanceNorm.get(d) ?? 0) * 0.20 +
        (facilityNorm.get(d) ?? 0) * 0.15,
      2
    );
    entries.push({ code: d.code, score, raw: rawMap.get(d) ?? null });
  }

  console.log(`[collectWalk] updating ${entries.length} districts (parks=${parks.length})`);
  await batchD1Update(db, entries, "s_walk", "raw_walk");
  await refreshOverall(db);
  return entries.length;
}
