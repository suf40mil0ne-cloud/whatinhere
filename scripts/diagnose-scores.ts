// 임시 진단 스크립트 — 육아/안심 세부 항목 점수 분포 확인용. 실행: tsx scripts/diagnose-scores.ts
// 08-score-by-complex.ts의 데이터 로딩·점수 산식을 그대로 재현한다 (SQL 출력 없음, 읽기 전용).
import fs from "node:fs/promises";
import path from "node:path";
import {
  countWithin,
  linearScore,
  loadCrimeStats,
  nearestDistance,
  OUTPUT_DIR,
  PointRecord,
  round,
} from "./district-score-lib";
import type { AptComplexState } from "./07-fetch-apt-complexes";

interface ChildcareCenter extends PointRecord { sigungu: string; }
interface Academy extends PointRecord { realm: string; source?: "exact" | "dong" | "sigungu"; }
interface CctvPoint extends PointRecord { cameras: number; }

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8")) as T;
  } catch {
    return null;
  }
}

function mean(values: number[]): number {
  return values.length ? round(values.reduce((s, v) => s + v, 0) / values.length, 1) : 0;
}
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, 1);
}
function pct100(values: number[]): number {
  return values.length ? round((values.filter((v) => v >= 100).length / values.length) * 100, 1) : 0;
}
function report(label: string, values: number[]) {
  console.log(`${label.padEnd(16)} 평균=${String(mean(values)).padStart(6)}  중위=${String(median(values)).padStart(6)}  100점비율=${String(pct100(values)).padStart(5)}%  (n=${values.length})`);
}

async function main() {
  const aptState = await loadJson<AptComplexState[]>("apt-complexes.state.json");
  if (!aptState?.length) {
    console.log("apt-complexes.state.json 없음/비어있음. 07-fetch-apt-complexes.ts 먼저 실행 필요.");
    return;
  }

  const childcareRaw = await loadJson<{ centers: ChildcareCenter[]; schools: PointRecord[]; academies: Academy[]; malls: PointRecord[]; pediatrics: PointRecord[]; libraries: PointRecord[] }>("childcare-raw.json");
  const safetyRaw = await loadJson<{ cctvs: CctvPoint[]; childZones: PointRecord[]; safetyIndex: Record<string, number> }>("safety-raw.json");

  const centers = childcareRaw?.centers ?? [];
  const schools = childcareRaw?.schools ?? [];
  const academies = childcareRaw?.academies ?? [];
  const malls = childcareRaw?.malls ?? [];
  const pediatrics = childcareRaw?.pediatrics ?? [];
  const libraries = childcareRaw?.libraries ?? [];
  const cctvs = safetyRaw?.cctvs ?? [];
  const childZones = safetyRaw?.childZones ?? [];
  const safetyIndex = safetyRaw?.safetyIndex ?? {};
  const hasCctv = cctvs.length > 0;

  const academiesReliable = academies.filter((a) => a.source !== "sigungu");
  const crimeStats = await loadCrimeStats();
  const hasCrimeStats = crimeStats.size > 0;
  const hasSafetyIdx = Object.keys(safetyIndex).length > 0;

  // ── 항목별 점수 버킷 ──────────────────────────────────────────────────────
  const childcareScores: number[] = [];
  const elementaryScores: number[] = [];
  const academyScores: number[] = [];
  const diversityScores: number[] = [];
  const mallScores: number[] = [];
  const pediatricScores: number[] = [];
  const libraryScores: number[] = [];

  const cctvCountScores: number[] = [];
  const cctvDistScores: number[] = [];
  const childZoneScores: number[] = [];
  const safetyIndexScores: number[] = [];
  const crimeRateScores: number[] = [];

  const cap = (value: number, max: number) => Math.min(value, max);
  const decay = (distance: number, scale: number) => Math.exp(-distance / scale);

  for (const apt of aptState) {
    if (apt.lat == null || apt.lng == null) continue;
    const point = { lat: apt.lat, lng: apt.lng };
    const households = Math.max(apt.totalUnits ?? 1, 1);

    if (childcareRaw) {
      const sggCenters = centers.filter((c) => c.sigungu === apt.sigungu);
      const childcareCount1km = sggCenters.length ? (
        countWithin(point, sggCenters, 500) * 1.2 +
        (countWithin(point, sggCenters, 1000) - countWithin(point, sggCenters, 500)) * 0.9
      ) : 0;
      const elementaryDistanceM = schools.length ? nearestDistance(point, schools) : null;
      const academyCount1km = academiesReliable.length ? (
        countWithin(point, academiesReliable, 500) * 1.2 +
        (countWithin(point, academiesReliable, 1000) - countWithin(point, academiesReliable, 500)) * 0.9
      ) : 0;
      const nearbyAcademies = academiesReliable.filter((a) => Math.abs(a.lat - point.lat) + Math.abs(a.lng - point.lng) < 0.02);
      const academyDiversityScore = new Set(
        nearbyAcademies.filter((a) => countWithin(point, [a], 1000) > 0).map((a) => a.realm)
      ).size;
      const mallCount2km = malls.length ? countWithin(point, malls, 2000) : 0;
      const pediatricCount1km = pediatrics.length ? countWithin(point, pediatrics, 1000) : 0;
      const libraryExists2km = libraries.length ? (countWithin(point, libraries, 2000) > 0 ? 1 : 0) : 0;

      const centerPerUnit = childcareCount1km / households;
      childcareScores.push(cap(centerPerUnit / 0.025, 1) * 100);
      elementaryScores.push((elementaryDistanceM != null ? decay(elementaryDistanceM, 400) : 0) * 100);
      academyScores.push((cap(academyCount1km, 20) / 20) * 100);
      diversityScores.push((cap(academyDiversityScore, 5) / 5) * 100);
      mallScores.push((cap(mallCount2km, 8) / 8) * 100);
      pediatricScores.push((cap(pediatricCount1km, 8) / 8) * 100);
      libraryScores.push(libraryExists2km ? 100 : 0);
    }

    if (safetyRaw) {
      const cctvCount500m = hasCctv ? (
        countWithin(point, cctvs, 300, (c) => (c as CctvPoint).cameras) * 1.2 +
        (countWithin(point, cctvs, 500, (c) => (c as CctvPoint).cameras) - countWithin(point, cctvs, 300, (c) => (c as CctvPoint).cameras)) * 1.0
      ) : 0;
      const cctvDistanceM = (() => { if (!hasCctv) return null; const d = nearestDistance(point, cctvs); return d != null && d <= 2000 ? d : null; })();
      const childZoneCount1km = childZones.length ? countWithin(point, childZones, 1000) : 0;
      const safetyIndexScore = safetyIndex[apt.sigungu] ?? 0;
      const crimeRate = crimeStats.get(apt.sigungu) ?? null;

      if (hasCctv) {
        cctvCountScores.push(linearScore(cctvCount500m, 60, 0));
        cctvDistScores.push(linearScore(cctvDistanceM, 100, 1000));
      }
      childZoneScores.push(linearScore(childZoneCount1km, 15, 0));
      if (hasSafetyIdx) safetyIndexScores.push(safetyIndexScore);
      if (hasCrimeStats) crimeRateScores.push(linearScore(crimeRate, 500, 3000));
    }
  }

  console.log("\n=== 육아 세부 항목 ===");
  report("어린이집·유치원", childcareScores);
  report("초등학교 거리", elementaryScores);
  report("학원 수", academyScores);
  report("학원 다양성", diversityScores);
  report("마트/백화점", mallScores);
  report("소아과", pediatricScores);
  report("도서관", libraryScores);

  console.log("\n=== 안심 세부 항목 ===");
  report("CCTV 수", cctvCountScores);
  report("CCTV 거리", cctvDistScores);
  report("어린이보호구역", childZoneScores);
  report("안전지수", safetyIndexScores);
  report("범죄발생률", crimeRateScores);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
