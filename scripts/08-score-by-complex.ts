import fs from "node:fs/promises";
import path from "node:path";
import {
  info,
  linearScore,
  loadCrimeStats,
  loadState,
  nearestDistance,
  countWithin,
  sumWithin,
  round,
  quote,
  sqlValue,
  warn,
  writeSqlFile,
  OUTPUT_DIR,
  ensureOutputDir,
  PointRecord,
} from "./district-score-lib";
import type { AptComplexState } from "./07-fetch-apt-complexes";

interface BusStop extends PointRecord {}
interface SubwayStation extends PointRecord { transfer: boolean; routes?: string[]; }

// ─── 교통 점수 헬퍼 ──────────────────────────────────────────────────────────

type TScoreSeg = [number, number, number, number]; // [d0, d1, s0, s1]

const SUBWAY_SEGS: TScoreSeg[] = [
  [0,    200,  100, 100],
  [200,  400,  100,  85],
  [400,  700,   85,  65],
  [700,  1000,  65,  40],
  [1000, 1500,  40,  15],
  [1500, 3000,  15,   0],
];

const BUS_SEGS: TScoreSeg[] = [
  [0,   100, 100, 100],
  [100, 200, 100,  85],
  [200, 400,  85,  65],
  [400, 600,  65,  40],
  [600, 800,  40,  15],
  [800, 1500, 15,   0],
];

function tSegScore(distance: number | null, segs: TScoreSeg[]): number {
  if (distance == null) return 0;
  for (const [d0, d1, s0, s1] of segs) {
    if (distance <= d1) {
      if (d0 === d1) return s0;
      return s0 + (s1 - s0) * (distance - d0) / (d1 - d0);
    }
  }
  return 0;
}

// C급 특정 패턴을 먼저 체크해 "인천1호선"→"1호선"(A급), "인천2호선"→"2호선"(S급),
// "수인분당"→"신분당"(B급) 오분류 방지. 실제 노선명 기준(API 응답값).
function routeGrade(r: string): number {
  // C급 (0.9): 실제 노선명 — 경의중앙, 공항, 수인분당, 인천1호선, 인천2호선
  if (["인천1호선", "인천2호선", "경의중앙", "공항", "수인분당"].some((n) => r.includes(n))) return 0.9;
  // S급 (1.5)
  if (["2호선", "9호선", "신분당"].some((n) => r.includes(n))) return 1.5;
  // A급 (1.3)
  if (["1호선", "3호선", "4호선", "7호선"].some((n) => r.includes(n))) return 1.3;
  // B급 (1.1)
  if (["5호선", "6호선", "8호선"].some((n) => r.includes(n))) return 1.1;
  // D급 (0.7): GTX, 경전철, 마을열차 등
  return 0.7;
}

function gradeFromRoutes(routes: string[]): number {
  if (!routes.length) return 1.1;
  return routes.reduce((best, r) => Math.max(best, routeGrade(r)), 0.7);
}

// 가장 가까운 지하철역의 노선 등급 반환 (routes 없으면 B급 1.1)
function nearestSubwayGrade(point: { lat: number; lng: number }, subways: SubwayStation[]): number {
  if (!subways.length) return 1.1;
  let nearest: SubwayStation | null = null;
  let minDist = Number.POSITIVE_INFINITY;
  const cosLat = Math.cos((point.lat * Math.PI) / 180);
  for (const s of subways) {
    const d = Math.sqrt(
      ((s.lat - point.lat) * 111320) ** 2 +
      ((s.lng - point.lng) * 111320 * cosLat) ** 2,
    );
    if (d < minDist) { minDist = d; nearest = s; }
  }
  return nearest?.routes?.length ? gradeFromRoutes(nearest.routes) : 1.1;
}
interface Park extends PointRecord { area: number; facilityScore: number; }
interface ChildcareCenter extends PointRecord { spare: number; sigungu: string; }
interface ElementarySchool extends PointRecord {}
interface Academy extends PointRecord { realm: string; source?: "exact" | "dong" | "sigungu"; }
interface CctvPoint extends PointRecord { cameras: number; }
interface ChildZonePoint extends PointRecord {}
interface Mall extends PointRecord {}
interface Pediatric extends PointRecord {}
interface Library extends PointRecord {}

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    warn(`08-score-by-complex: ${filename} not found, skipping`);
    return null;
  }
}

async function main() {
  const aptState = await loadJson<AptComplexState[]>("apt-complexes.state.json");
  if (!aptState?.length) {
    warn("08-score-by-complex: apt-complexes.state.json empty or missing; run 07-fetch-apt-complexes.ts first");
    await ensureOutputDir();
    await writeSqlFile("08-apt-scores.sql", "");
    return;
  }

  const aptPricesRaw = await loadJson<Array<{ id: string; avgPricePerM2: number }>>("04-apt-prices.state.json");
  const aptPriceMap = new Map<string, number>(aptPricesRaw?.map((p) => [p.id, p.avgPricePerM2]) ?? []);

  const sggPricesRaw = await loadJson<Record<string, number>>("04-sgg-prices.state.json");
  const sggPriceMap = new Map<string, number>(Object.entries(sggPricesRaw ?? {}));

  const transportRaw = await loadJson<{ buses: BusStop[]; subways: SubwayStation[] }>("transport-raw.json");
  const walkRaw = await loadJson<{ parks: Park[] }>("walk-raw.json");
  const childcareRaw = await loadJson<{ centers: ChildcareCenter[]; schools: ElementarySchool[]; academies: Academy[]; malls: Mall[]; pediatrics: Pediatric[]; libraries: Library[] }>("childcare-raw.json");
  const safetyRaw = await loadJson<{ cctvs: CctvPoint[]; childZones: ChildZonePoint[]; safetyIndex: Record<string, number> }>("safety-raw.json");

  const buses = transportRaw?.buses ?? [];
  const subways = transportRaw?.subways ?? [];
  const parks = walkRaw?.parks ?? [];
  const centers = childcareRaw?.centers ?? [];
  const schools = childcareRaw?.schools ?? [];
  const academies = childcareRaw?.academies ?? [];
  const malls = childcareRaw?.malls ?? [];
  const pediatrics = childcareRaw?.pediatrics ?? [];
  const libraries = childcareRaw?.libraries ?? [];
  const cctvs = safetyRaw?.cctvs ?? [];
  const childZones = safetyRaw?.childZones ?? [];
  const safetyIndex = safetyRaw?.safetyIndex ?? {};

  const hasTransportRaw = transportRaw !== null;
  const hasWalkRaw = walkRaw !== null;
  const hasChildcareRaw = childcareRaw !== null;
  const hasSafetyRaw = safetyRaw !== null;
  const hasBus = buses.length > 0;
  const hasSubway = subways.length > 0;
  const hasCctv = cctvs.length > 0;
  const hasSafetyIdx = Object.keys(safetyIndex).length > 0;

  interface AptRow {
    id: string;
    districtCode: string | null;
    sigungu: string;
    totalUnits: number;
    avgPricePerM2: number | null;
    busStopCount500m: number;
    busStopDistanceM: number | null;
    subwayDistanceM: number | null;
    subwayGrade: number;
    transferCount1km: number;
    parkCount1km: number;
    parkArea1km: number;
    parkDistanceM: number | null;
    parkFacilityCount: number;
    childcareCount1km: number;
    elementaryDistanceM: number | null;
    academyCount1km: number;
    academyDiversityScore: number;
    mallCount2km: number;
    pediatricCount1km: number;
    libraryExists2km: number;
    cctvCount500m: number;
    cctvDistanceM: number | null;
    childZoneCount1km: number;
    safetyIndexScore: number;
    crimeRate: number | null;
    priceSource: 'apt' | 'sgg' | null;
  }

  const crimeStats = await loadCrimeStats();
  const aptPricesPathForRef = path.join(OUTPUT_DIR, "04-apt-prices.state.json");
  let nationalMedianPrice: number | null = null;
  try {
    const aptPricesRawRef = await fs.readFile(aptPricesPathForRef, "utf8");
    const aptPricesRef = JSON.parse(aptPricesRawRef) as Array<{ id: string; avgPricePerM2: number }>;
    const sortedPrices = aptPricesRef.map((p) => p.avgPricePerM2).filter((v) => v != null && v > 0).sort((a, b) => a - b);
    if (sortedPrices.length) {
      nationalMedianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
      info(`08-score-by-complex: 수도권 실거래 중위가격=${round(nationalMedianPrice, 0)}만원/m²`);
    }
  } catch {
    // 04-apt-prices.state.json 없으면 null 유지
  }
  const hasCrimeStats = crimeStats.size > 0;

  const districtState = await loadState();
  const districtValueMap = new Map<string, number>(
    districtState
      .filter((d) => d.s_value > 0)
      .map((d) => [d.code, d.s_value]),
  );

  // sigungu center로 fallback된 학원은 좌표 신뢰도가 낮아 per-apt 스코어링에서 제외
  const academiesReliable = academies.filter((a) => (a as Academy).source !== "sigungu");

  const rows: AptRow[] = aptState
    .filter((apt) => apt.lat != null && apt.lng != null)
    .map((apt) => {
      const point = { lat: apt.lat, lng: apt.lng };
      const sggCenters = centers.filter((c) => c.sigungu === apt.sigungu);
      const nearbyAcademies = academiesReliable.filter((a) => Math.abs(a.lat - point.lat) + Math.abs(a.lng - point.lng) < 0.02);
      const academyRealms = new Set(
        nearbyAcademies
          .filter((academy) => countWithin(point, [academy], 1000) > 0)
          .map((academy) => academy.realm)
      );
      const aptPrice = aptPriceMap.get(apt.id) ?? null;
      const sggPrice = sggPriceMap.get(apt.sigungu) ?? null;
      return {
        id: apt.id,
        districtCode: apt.districtCode ?? null,
        sigungu: apt.sigungu,
        totalUnits: apt.totalUnits ?? 1,
        avgPricePerM2: aptPrice ?? sggPrice ?? null,
        priceSource: aptPrice != null ? 'apt' : sggPrice != null ? 'sgg' : null,
        busStopCount500m: hasBus ? countWithin(point, buses, 500) : 0,
        busStopDistanceM: hasBus ? nearestDistance(point, buses) : null,
        subwayDistanceM: hasSubway ? nearestDistance(point, subways) : null,
        subwayGrade: hasSubway ? nearestSubwayGrade(point, subways) : 1.1,
        transferCount1km: hasSubway ? countWithin(point, subways.filter((s) => s.transfer), 1000) : 0,
        parkCount1km: parks.length ? (
          countWithin(point, parks, 500) * 1.2 +
          (countWithin(point, parks, 1000) - countWithin(point, parks, 500)) * 0.9
        ) : 0,
        parkArea1km: parks.length ? (
          sumWithin(point, parks, 500, (p) => (p as Park).area) * 1.2 +
          (sumWithin(point, parks, 1000, (p) => (p as Park).area) - sumWithin(point, parks, 500, (p) => (p as Park).area)) * 0.9
        ) : 0,
        parkDistanceM: parks.length ? nearestDistance(point, parks) : null,
        parkFacilityCount: parks.length ? (() => {
          const facParks = parks.filter((p) => (p as Park).facilityScore > 0);
          return countWithin(point, facParks, 500) * 1.2 +
                 (countWithin(point, facParks, 1000) - countWithin(point, facParks, 500)) * 0.9;
        })() : 0,
        childcareCount1km: sggCenters.length ? (
          countWithin(point, sggCenters, 500) * 1.2 +
          (countWithin(point, sggCenters, 1000) - countWithin(point, sggCenters, 500)) * 0.9
        ) : 0,
        elementaryDistanceM: schools.length ? nearestDistance(point, schools) : null,
        academyCount1km: academiesReliable.length ? (
          countWithin(point, academiesReliable, 500) * 1.2 +
          (countWithin(point, academiesReliable, 1000) - countWithin(point, academiesReliable, 500)) * 0.9
        ) : 0,
        academyDiversityScore: academyRealms.size,
        mallCount2km: malls.length ? countWithin(point, malls, 2000) : 0,
        pediatricCount1km: pediatrics.length ? countWithin(point, pediatrics, 1000) : 0,
        libraryExists2km: libraries.length ? (countWithin(point, libraries, 2000) > 0 ? 1 : 0) : 0,
        cctvCount500m: hasCctv ? (
          countWithin(point, cctvs, 300, (c) => (c as CctvPoint).cameras) * 1.2 +
          (countWithin(point, cctvs, 500, (c) => (c as CctvPoint).cameras) - countWithin(point, cctvs, 300, (c) => (c as CctvPoint).cameras)) * 1.0
        ) : 0,
        cctvDistanceM: (() => { if (!hasCctv) return null; const d = nearestDistance(point, cctvs); return d != null && d <= 2000 ? d : null; })(),
        childZoneCount1km: childZones.length ? countWithin(point, childZones, 1000) : 0,
        safetyIndexScore: safetyIndex[apt.sigungu] ?? 0,
        crimeRate: crimeStats.get(apt.sigungu) ?? null,
      };
    });

  const lines = ["BEGIN TRANSACTION;"];

  for (const row of rows) {
    // ── 교통 ───────────────────────────────────────────────────────────────────
    let sTransport: number | null = null;
    if (hasTransportRaw) {
      // 지하철: 노선 등급을 유효 거리 축소로 적용 → 전 구간 점수 차별화
      // S급(1.5) 역 600m → 유효 400m, D급(0.7) 역 600m → 유효 857m
      const effectiveSubwayDist = row.subwayDistanceM != null
        ? row.subwayDistanceM / row.subwayGrade
        : null;
      const subwayDistScore = tSegScore(effectiveSubwayDist, SUBWAY_SEGS);

      // 버스: routeType 없음 → B급(1.0) 기본
      const busDistScore  = tSegScore(row.busStopDistanceM, BUS_SEGS);
      const busCountScore = linearScore(row.busStopCount500m, 10, 0);
      const transferScore = linearScore(row.transferCount1km,  2, 0);

      if (!hasBus) {
        sTransport = round(Math.min(100, subwayDistScore * 0.75 + transferScore * 0.25), 2);
      } else if (!hasSubway) {
        sTransport = round(Math.min(100, (busDistScore * 0.75 + busCountScore * 0.25) * 0.75), 2);
      } else {
        sTransport = round(Math.min(100,
          subwayDistScore * 0.60 + transferScore * 0.20 + busDistScore * 0.13 + busCountScore * 0.07
        ), 2);
      }
    }

    // ── 산책 ───────────────────────────────────────────────────────────────────
    let sWalk: number | null = null;
    if (hasWalkRaw) {
      sWalk = round(
        linearScore(row.parkArea1km,   500000, 0) * 0.45 +  // 50만㎡=100, 0=0
        linearScore(row.parkCount1km,      10, 0) * 0.20 +
        linearScore(row.parkDistanceM,    300, 1500) * 0.20 +
        linearScore(row.parkFacilityCount,  5, 0) * 0.15, 2,
      );
    }

    // ── 육아 ───────────────────────────────────────────────────────────────────
    let sChildcare: number | null = null;
    if (hasChildcareRaw) {
      function cap(value: number, max: number): number {
        return Math.min(value, max);
      }
      function decay(distance: number, scale: number): number {
        return Math.exp(-distance / scale);
      }

      const households = Math.max(row.totalUnits, 1);
      const centerPerUnit = row.childcareCount1km / households;
      
      const childcareScore = cap(centerPerUnit / 0.03, 1);
      const elementaryScore = row.elementaryDistanceM != null ? decay(row.elementaryDistanceM, 400) : 0;
      const academyScore = cap(row.academyCount1km, 10) / 10;
      const diversityScore = cap(row.academyDiversityScore, 5) / 5;
      const mallScore = cap(row.mallCount2km, 2) / 2;
      const pediatricScore = cap(row.pediatricCount1km, 3) / 3;
      const libraryScore = row.libraryExists2km ? 1 : 0;

      const weights = {
        childcare: 0.18,
        elementary: 0.18,
        academy: 0.14,
        diversity: 0.10,
        mall: 0.08,
        pediatric: 0.12,
        library: 0.08
      };

      const rawScore =
        childcareScore * weights.childcare +
        elementaryScore * weights.elementary +
        academyScore * weights.academy +
        diversityScore * weights.diversity +
        mallScore * weights.mall +
        pediatricScore * weights.pediatric +
        libraryScore * weights.library;

      let finalScore = Math.max(0, Math.min(100, (rawScore / 0.88) * 100));

      const hasChildcareOrKindergarten = row.childcareCount1km > 0;
      if (!hasChildcareOrKindergarten) {
        finalScore *= 0.90;
      }
      sChildcare = round(finalScore, 2);
    }

    // ── 안심 ───────────────────────────────────────────────────────────────────
    let sSafety: number | null = null;
    if (hasSafetyRaw) {
      const cctvCountScore = linearScore(row.cctvCount500m,   20,    0);
      const cctvDistScore  = linearScore(row.cctvDistanceM,  100, 1000);
      const childZoneScore = linearScore(row.childZoneCount1km, 4,   0);
      const crimeRateScore = linearScore(row.crimeRate,      500, 3000);
      const components: Array<[number, number]> = [
        [childZoneScore, 0.15],
        ...(hasCctv      ? [[cctvCountScore, 0.25], [cctvDistScore, 0.10]] as [number, number][] : []),
        ...(hasSafetyIdx ? [[row.safetyIndexScore, 0.25]] as [number, number][] : []),
        ...(hasCrimeStats ? [[crimeRateScore, 0.25]] as [number, number][] : []),
      ];
      const tw = components.reduce((s, [, w]) => s + w, 0);
      sSafety = tw > 0 ? round(components.reduce((s, [sc, w]) => s + sc * w, 0) / tw, 2) : 0;
    }

    // ── 가성비 ─────────────────────────────────────────────────────────────────
    let sValue: number | null = null;
    if (row.avgPricePerM2 != null) {
      let priceScore: number;
      if (nationalMedianPrice == null || nationalMedianPrice <= 0) {
        priceScore = 50;
      } else {
        priceScore = linearScore(row.avgPricePerM2 / nationalMedianPrice, 0.3, 3.0);
      }
      const parts = [sTransport, sWalk, sChildcare, sSafety].filter((v) => v != null) as number[];
      const otherAvg = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
      sValue = round(priceScore * 0.70 + otherAvg * 0.30, 2);
    }

    const setClauses: string[] = [];
    if (sTransport !== null) setClauses.push(`s_transport=${sqlValue(sTransport)}`);
    if (sWalk !== null) setClauses.push(`s_walk=${sqlValue(sWalk)}`);
    if (sChildcare !== null) setClauses.push(`s_childcare=${sqlValue(sChildcare)}`);
    if (sSafety !== null) setClauses.push(`s_safety=${sqlValue(sSafety)}`);
    setClauses.push(`s_value=${sqlValue(sValue)}`);
    if (row.avgPricePerM2 != null) setClauses.push(`avg_price_per_m2=${sqlValue(row.avgPricePerM2)}`);
    setClauses.push(`price_source=${row.priceSource != null ? quote(row.priceSource) : 'NULL'}`);
    setClauses.push("updated_at=CURRENT_TIMESTAMP");
    lines.push(`UPDATE apt_complexes SET ${setClauses.join(", ")} WHERE id=${quote(row.id)};`);
  }

  lines.push("COMMIT;");
  await writeSqlFile("08-apt-scores.sql", `${lines.join("\n")}\n`);
  info(`08-score-by-complex: scored ${rows.length} complexes`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
