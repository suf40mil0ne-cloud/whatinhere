import fs from "node:fs/promises";
import path from "node:path";
import {
  info,
  warn,
  writeSqlFile,
  nearestDistance,
  countWithin,
  sumWithin,
  normalizeWithinSgg,
  round,
  quote,
  sqlValue,
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
  const childcareRaw = await loadJson<{ centers: ChildcareCenter[]; schools: ElementarySchool[] }>("childcare-raw.json");
  const safetyRaw = await loadJson<{ cctvs: CctvPoint[]; childZones: ChildZonePoint[]; safetyIndex: Record<string, number> }>("safety-raw.json");

  const buses = transportRaw?.buses ?? [];
  const subways = transportRaw?.subways ?? [];
  const parks = walkRaw?.parks ?? [];
  const centers = childcareRaw?.centers ?? [];
  const schools = childcareRaw?.schools ?? [];
  const cctvs = safetyRaw?.cctvs ?? [];
  const childZones = safetyRaw?.childZones ?? [];
  const safetyIndex = safetyRaw?.safetyIndex ?? {};

  const hasBus = buses.length > 0;
  const hasSubway = subways.length > 0;
  const hasCctv = cctvs.length > 0;
  const hasSafetyIdx = Object.keys(safetyIndex).length > 0;

  interface AptRow {
    id: string;
    sigungu: string;
    busStopCount500m: number;
    busStopDistanceM: number | null;
    subwayDistanceM: number | null;
    transferCount1km: number;
    parkCount1km: number;
    parkArea1km: number;
    parkDistanceM: number | null;
    parkFacilityCount: number;
    childcareCount1km: number;
    capacityLeft1km: number;
    elementaryDistanceM: number | null;
    cctvCount500m: number;
    cctvDistanceM: number | null;
    childZoneCount1km: number;
    safetyIndexScore: number;
  }

  const rows: AptRow[] = aptState
    .filter((apt) => apt.lat != null && apt.lng != null)
    .map((apt) => {
      const point = { lat: apt.lat, lng: apt.lng };
      const sggCenters = centers.filter((c) => c.sigungu === apt.sigungu);
      return {
        id: apt.id,
        sigungu: apt.sigungu,
        busStopCount500m: hasBus ? countWithin(point, buses, 500) : 0,
        busStopDistanceM: hasBus ? nearestDistance(point, buses) : null,
        subwayDistanceM: hasSubway ? nearestDistance(point, subways) : null,
        transferCount1km: hasSubway ? countWithin(point, subways.filter((s) => s.transfer), 1000) : 0,
        parkCount1km: parks.length ? countWithin(point, parks, 1000) : 0,
        parkArea1km: parks.length ? sumWithin(point, parks, 1000, (p) => (p as Park).area) : 0,
        parkDistanceM: parks.length ? nearestDistance(point, parks) : null,
        parkFacilityCount: parks.length ? countWithin(point, parks.filter((p) => (p as Park).facilityScore > 0), 1000) : 0,
        childcareCount1km: sggCenters.length ? countWithin(point, sggCenters, 1000) : 0,
        capacityLeft1km: sggCenters.length ? countWithin(point, sggCenters, 1000, (c) => (c as ChildcareCenter).spare) : 0,
        elementaryDistanceM: schools.length ? nearestDistance(point, schools) : null,
        cctvCount500m: hasCctv ? countWithin(point, cctvs, 500, (c) => (c as CctvPoint).cameras) : 0,
        cctvDistanceM: hasCctv ? nearestDistance(point, cctvs) : null,
        childZoneCount1km: childZones.length ? countWithin(point, childZones, 1000) : 0,
        safetyIndexScore: safetyIndex[apt.sigungu] ?? 0,
      };
    });

  // Normalize within sigungu
  const busDistNorm = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.busStopDistanceM, true);
  const subDistNorm = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.subwayDistanceM, true);
  const busCntNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.busStopCount500m, false);
  const transfNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.transferCount1km, false);

  const parkAreaNorm = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.parkArea1km, false);
  const parkCntNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.parkCount1km, false);
  const parkDistNorm = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.parkDistanceM, true);
  const parkFacNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.parkFacilityCount, false);

  const ccareCntNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.childcareCount1km, false);
  const capacityNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.capacityLeft1km, false);
  const schoolDistNorm = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.elementaryDistanceM, true);

  const cctvCntNorm   = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.cctvCount500m, false);
  const cctvDistNorm  = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.cctvDistanceM, true);
  const czoneNorm     = normalizeWithinSgg(rows, (r) => r.sigungu, (r) => r.childZoneCount1km, false);

  const lines = ["BEGIN TRANSACTION;"];

  for (const row of rows) {
    // Transport
    let sTransport: number;
    if (!hasBus) {
      sTransport = round((subDistNorm.get(row) ?? 0) * 0.75 + (transfNorm.get(row) ?? 0) * 0.25, 2);
    } else if (!hasSubway) {
      sTransport = round((busDistNorm.get(row) ?? 0) * 0.75 + (busCntNorm.get(row) ?? 0) * 0.25, 2);
    } else {
      sTransport = round(
        (busDistNorm.get(row) ?? 0) * 0.45 + (subDistNorm.get(row) ?? 0) * 0.30 +
        (busCntNorm.get(row) ?? 0) * 0.15 + (transfNorm.get(row) ?? 0) * 0.10, 2,
      );
    }

    // Walk
    const sWalk = round(
      (parkAreaNorm.get(row) ?? 0) * 0.45 + (parkCntNorm.get(row) ?? 0) * 0.20 +
      (parkDistNorm.get(row) ?? 0) * 0.20 + (parkFacNorm.get(row) ?? 0) * 0.15, 2,
    );

    // Childcare (no academy data in complex scoring)
    const sChildcare = round(
      (ccareCntNorm.get(row) ?? 0) * 0.40 + (capacityNorm.get(row) ?? 0) * 0.30 +
      (schoolDistNorm.get(row) ?? 0) * 0.30, 2,
    );

    // Safety
    let sSafety: number;
    if (hasCctv && hasSafetyIdx) {
      sSafety = round(
        (cctvCntNorm.get(row) ?? 0) * 0.35 + (cctvDistNorm.get(row) ?? 0) * 0.20 +
        (czoneNorm.get(row) ?? 0) * 0.20 + row.safetyIndexScore * 0.25, 2,
      );
    } else if (hasCctv) {
      sSafety = round(
        (cctvCntNorm.get(row) ?? 0) * 0.47 + (cctvDistNorm.get(row) ?? 0) * 0.27 +
        (czoneNorm.get(row) ?? 0) * 0.26, 2,
      );
    } else if (hasSafetyIdx) {
      sSafety = round((czoneNorm.get(row) ?? 0) * 0.30 + row.safetyIndexScore * 0.70, 2);
    } else {
      sSafety = round(czoneNorm.get(row) ?? 0, 2);
    }

    lines.push(
      `UPDATE apt_complexes SET s_transport=${sqlValue(sTransport)}, s_walk=${sqlValue(sWalk)}, s_childcare=${sqlValue(sChildcare)}, s_safety=${sqlValue(sSafety)}, updated_at=CURRENT_TIMESTAMP WHERE id=${quote(row.id)};`,
    );
  }

  lines.push("COMMIT;");
  await writeSqlFile("08-apt-scores.sql", `${lines.join("\n")}\n`);
  info(`08-score-by-complex: scored ${rows.length} complexes`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
