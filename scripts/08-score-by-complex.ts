import fs from "node:fs/promises";
import path from "node:path";
import {
  info,
  linearScore,
  loadCrimeStats,
  loadNationalPriceRef,
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
interface SubwayStation extends PointRecord { transfer: boolean; }
interface Park extends PointRecord { area: number; facilityScore: number; }
interface ChildcareCenter extends PointRecord { spare: number; sigungu: string; }
interface ElementarySchool extends PointRecord {}
interface Academy extends PointRecord { realm: string; source?: "exact" | "dong" | "sigungu"; }
interface CctvPoint extends PointRecord { cameras: number; }
interface ChildZonePoint extends PointRecord {}

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

  const transportRaw = await loadJson<{ buses: BusStop[]; subways: SubwayStation[] }>("transport-raw.json");
  const walkRaw = await loadJson<{ parks: Park[] }>("walk-raw.json");
  const childcareRaw = await loadJson<{ centers: ChildcareCenter[]; schools: ElementarySchool[]; academies: Academy[] }>("childcare-raw.json");
  const safetyRaw = await loadJson<{ cctvs: CctvPoint[]; childZones: ChildZonePoint[]; safetyIndex: Record<string, number> }>("safety-raw.json");

  const buses = transportRaw?.buses ?? [];
  const subways = transportRaw?.subways ?? [];
  const parks = walkRaw?.parks ?? [];
  const centers = childcareRaw?.centers ?? [];
  const schools = childcareRaw?.schools ?? [];
  const academies = childcareRaw?.academies ?? [];
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
    sigungu: string;
    totalUnits: number;
    avgPricePerM2: number | null;
    busStopCount500m: number;
    busStopDistanceM: number | null;
    subwayDistanceM: number | null;
    transferCount1km: number;
    parkCount1km: number;
    parkArea1km: number;
    parkDistanceM: number | null;
    parkFacilityCount: number;
    childcareCount1km: number;
    vehicleRatio: number;
    elementaryDistanceM: number | null;
    academyCount1km: number;
    academyDiversityScore: number;
    cctvCount500m: number;
    cctvDistanceM: number | null;
    childZoneCount1km: number;
    safetyIndexScore: number;
    crimeRate: number | null;
  }

  const crimeStats = await loadCrimeStats();
  const nationalMedianPrice = await loadNationalPriceRef();
  const hasCrimeStats = crimeStats.size > 0;

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
      const vehicleCount = sggCenters.filter((c) => (c as ChildcareCenter).vehicle).length;

      return {
        id: apt.id,
        sigungu: apt.sigungu,
        totalUnits: apt.totalUnits ?? 1,
        avgPricePerM2: apt.avgPricePerM2 ?? null,
        busStopCount500m: hasBus ? countWithin(point, buses, 500) : 0,
        busStopDistanceM: hasBus ? nearestDistance(point, buses) : null,
        subwayDistanceM: hasSubway ? nearestDistance(point, subways) : null,
        transferCount1km: hasSubway ? countWithin(point, subways.filter((s) => s.transfer), 1000) : 0,
        parkCount1km: parks.length ? countWithin(point, parks, 1000) : 0,
        parkArea1km: parks.length ? sumWithin(point, parks, 1000, (p) => (p as Park).area) : 0,
        parkDistanceM: parks.length ? nearestDistance(point, parks) : null,
        parkFacilityCount: parks.length ? countWithin(point, parks.filter((p) => (p as Park).facilityScore > 0), 1000) : 0,
        childcareCount1km: sggCenters.length ? countWithin(point, sggCenters, 1000) : 0,
        vehicleRatio: sggCenters.length ? round(vehicleCount / sggCenters.length, 4) : 0,
        elementaryDistanceM: schools.length ? nearestDistance(point, schools) : null,
        academyCount1km: academiesReliable.length ? countWithin(point, academiesReliable, 1000) : 0,
        academyDiversityScore: academyRealms.size,
        cctvCount500m: hasCctv ? countWithin(point, cctvs, 500, (c) => (c as CctvPoint).cameras) : 0,
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
      const busDistScore    = linearScore(row.busStopDistanceM,  200, 1500);
      const subwayDistScore = linearScore(row.subwayDistanceM,   500, 3000);
      const busCountScore   = linearScore(row.busStopCount500m,    5,    0);
      const transferScore   = linearScore(row.transferCount1km,    1,    0);
      if (!hasBus) {
        sTransport = round(subwayDistScore * 0.75 + transferScore * 0.25, 2);
      } else if (!hasSubway) {
        sTransport = round(busDistScore * 0.75 + busCountScore * 0.25, 2);
      } else {
        sTransport = round(busDistScore * 0.45 + subwayDistScore * 0.30 + busCountScore * 0.15 + transferScore * 0.10, 2);
      }
    }

    // ── 산책 ───────────────────────────────────────────────────────────────────
    let sWalk: number | null = null;
    if (hasWalkRaw) {
      const households = Math.max(row.totalUnits, 1);
      sWalk = round(
        linearScore(row.parkArea1km / households, 10,   0) * 0.45 +
        linearScore(row.parkCount1km,              3,   0) * 0.20 +
        linearScore(row.parkDistanceM,           300, 1500) * 0.20 +
        linearScore(row.parkFacilityCount,         2,   0) * 0.15, 2,
      );
    }

    // ── 육아 ───────────────────────────────────────────────────────────────────
    let sChildcare: number | null = null;
    if (hasChildcareRaw) {
      const households = Math.max(row.totalUnits, 1);
      const centerPerUnit = round(row.childcareCount1km / households, 6);
      const schoolScore   = linearScore(row.elementaryDistanceM,  300, 1500);
      const acaCountScore = linearScore(row.academyCount1km,        20,    0);
      const acaDivScore   = linearScore(row.academyDiversityScore,   5,    0);
      const vehicleScore  = linearScore(row.vehicleRatio,           0.8,   0);
      sChildcare = row.childcareCount1km > 0 || centers.length > 0
        ? round(linearScore(centerPerUnit, 0.01, 0) * 0.25 + schoolScore * 0.25 + acaCountScore * 0.20 + acaDivScore * 0.15 + vehicleScore * 0.15, 2)
        : round(schoolScore * 0.45 + acaCountScore * 0.35 + acaDivScore * 0.20, 2);
    }

    // ── 안심 ───────────────────────────────────────────────────────────────────
    let sSafety: number | null = null;
    if (hasSafetyRaw) {
      const cctvCountScore = linearScore(row.cctvCount500m,   10,    0);
      const cctvDistScore  = linearScore(row.cctvDistanceM,  100, 1000);
      const childZoneScore = linearScore(row.childZoneCount1km, 2,   0);
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
        priceScore = linearScore(row.avgPricePerM2 / nationalMedianPrice, 0.7, 2.0);
      }
      const otherAvg = ((sTransport ?? 0) + (sWalk ?? 0) + (sChildcare ?? 0) + (sSafety ?? 0)) / 4;
      sValue = round(priceScore * 0.50 + otherAvg * 0.50, 2);
    }

    const setClauses: string[] = [];
    if (sTransport !== null) setClauses.push(`s_transport=${sqlValue(sTransport)}`);
    if (sWalk !== null) setClauses.push(`s_walk=${sqlValue(sWalk)}`);
    if (sChildcare !== null) setClauses.push(`s_childcare=${sqlValue(sChildcare)}`);
    if (sSafety !== null) setClauses.push(`s_safety=${sqlValue(sSafety)}`);
    if (sValue !== null) setClauses.push(`s_value=${sqlValue(sValue)}`);
    if (setClauses.length === 0) continue;
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
