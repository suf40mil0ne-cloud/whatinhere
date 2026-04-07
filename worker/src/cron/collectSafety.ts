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
  text,
} from "./utils";

interface CctvPoint extends PointRecord {
  cameras: number;
}

async function fetchCctv(cctvKey: string): Promise<CctvPoint[]> {
  const rows: CctvPoint[] = [];
  try {
    for (let pageIndex = 1; pageIndex <= 100; pageIndex++) {
      const url = paramsToUrl("https://www.safetydata.go.kr/V2/api/DSSP-IF-20011", {
        serviceKey: cctvKey,
        pageIndex,
        pageSize: 1000,
      });
      const payload = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const items = parseJsonItems(payload);
      console.log(`[collectSafety] cctv page=${pageIndex} items=${items.length}`);
      if (!items.length) break;
      for (const item of items) {
        const cameraType = text(item.cameraType) ?? "";
        const instlPurpose = text(item.instlPurpose) ?? "";
        if (cameraType !== "방범용" && instlPurpose !== "범죄예방") continue;
        const lat = numeric(item.latitude);
        const lng = numeric(item.longitude);
        if (lat == null || lng == null) continue;
        rows.push({ lat, lng, cameras: numeric(item.cameraCount) ?? 1 });
      }
      if (items.length < 1000) break;
    }
  } catch (e) {
    console.warn(`[collectSafety] cctv fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectSafety] cctv total=${rows.length}`);
  return rows;
}

async function fetchChildZones(serviceKey: string): Promise<PointRecord[]> {
  const rows: PointRecord[] = [];
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo++) {
      const url = paramsToUrl("http://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api", {
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
      console.log(`[collectSafety] childZone page=${pageNo} items=${items.length}`);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.la);
        const lng = numeric(item.lo);
        if (lat == null || lng == null) continue;
        const address = text(item.rdnmadr) ?? text(item.lnmadr);
        if (address && !CAPITAL_SIDO_NAMES.some((name) => address.includes(name))) continue;
        rows.push({ lat, lng });
      }
      if (items.length < 1000) break;
    }
  } catch (e) {
    console.warn(`[collectSafety] childZone fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectSafety] childZone total=${rows.length}`);
  return rows;
}

// Grade mapping: 1(최우수)=100, 2=80, 3=60, 4=40, 5(최하)=20
const GRADE_SCORE: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 };

async function fetchSafetyIndex(safetyIndexKey: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const url = paramsToUrl("https://www.safetydata.go.kr/V2/api/DSSP-IF-00421", {
      serviceKey: safetyIndexKey,
    });
    const payload = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    const items = parseJsonItems(payload);
    console.log(`[collectSafety] safetyIndex items=${items.length}`);
    for (const item of items) {
      const sggNm =
        text(item.sggNm) ?? text(item.sigunguNm) ?? text(item.locgovNm) ?? text(item.areaNm);
      const gradeRaw =
        numeric(item.safetyGrade) ?? numeric(item.grade) ?? numeric(item.indexGrade) ?? numeric(item.crimeGrade);
      if (!sggNm || gradeRaw == null) continue;
      const score = GRADE_SCORE[Math.round(gradeRaw)] ?? 0;
      // Keep best (lowest grade = highest score) if duplicate sigungu
      if (!result.has(sggNm) || score > (result.get(sggNm) ?? 0)) result.set(sggNm, score);
    }
  } catch (e) {
    console.warn(`[collectSafety] safetyIndex fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[collectSafety] safetyIndex mapped=${result.size} districts`);
  return result;
}

export async function collectSafety(
  db: D1Database,
  serviceKey: string,
  cctvKey?: string,
  safetyIndexKey?: string
): Promise<number> {
  const { results } = await db
    .prepare("SELECT code, sido, sigungu, dong, center_lat, center_lng, households FROM district_scores")
    .all<DistrictRow>();
  const districts = results;

  const [cctvs, childZones, safetyIndex] = await Promise.all([
    cctvKey ? fetchCctv(cctvKey) : Promise.resolve<CctvPoint[]>([]),
    fetchChildZones(serviceKey),
    safetyIndexKey ? fetchSafetyIndex(safetyIndexKey) : Promise.resolve(new Map<string, number>()),
  ]);

  if (cctvs.length === 0 && childZones.length === 0) {
    console.warn("[collectSafety] no data from any API — skipping UPDATE");
    return 0;
  }

  type RawS = {
    cctvCount500m: number;
    cctvDistanceM: number | null;
    childZoneCount1km: number;
    safetyIndexScore: number;
  };
  const rawMap = new Map<DistrictRow, RawS>();
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const p = { lat: d.center_lat, lng: d.center_lng };
    rawMap.set(d, {
      cctvCount500m: cctvs.length ? countWithin(p, cctvs, 500, (c) => (c as CctvPoint).cameras) : 0,
      cctvDistanceM: cctvs.length ? nearestDistance(p, cctvs) : null,
      childZoneCount1km: childZones.length ? countWithin(p, childZones, 1000) : 0,
      safetyIndexScore: safetyIndex.get(d.sigungu) ?? 0,
    });
  }

  const cctvCountNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.cctvCount500m ?? null, false);
  const cctvDistanceNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.cctvDistanceM ?? null, true);
  const childZoneNorm = normalizeWithinSgg(districts, (d) => d.sigungu, (d) => rawMap.get(d)?.childZoneCount1km ?? null, false);

  const hasCctv = cctvs.length > 0;
  const hasSafetyIndex = safetyIndex.size > 0;

  const entries: Array<{ code: string; score: number; raw: unknown }> = [];
  for (const d of districts) {
    const raw = rawMap.get(d);
    const si = (raw?.safetyIndexScore ?? 0); // already 0-100

    let score: number;
    if (hasCctv && hasSafetyIndex) {
      score = round(
        (cctvCountNorm.get(d) ?? 0) * 0.35 +
          (cctvDistanceNorm.get(d) ?? 0) * 0.20 +
          (childZoneNorm.get(d) ?? 0) * 0.20 +
          si * 0.25,
        2
      );
    } else if (hasCctv) {
      score = round(
        (cctvCountNorm.get(d) ?? 0) * 0.47 +
          (cctvDistanceNorm.get(d) ?? 0) * 0.27 +
          (childZoneNorm.get(d) ?? 0) * 0.26,
        2
      );
    } else if (hasSafetyIndex) {
      score = round((childZoneNorm.get(d) ?? 0) * 0.30 + si * 0.70, 2);
    } else {
      score = round((childZoneNorm.get(d) ?? 0), 2);
    }
    entries.push({ code: d.code, score, raw: raw ?? null });
  }

  console.log(`[collectSafety] updating ${entries.length} districts (cctv=${cctvs.length}, childZones=${childZones.length}, safetyIndex=${safetyIndex.size})`);
  await batchD1Update(db, entries, "s_safety", "raw_safety");
  await refreshOverall(db);
  return entries.length;
}
