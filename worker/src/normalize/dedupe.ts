import type { NormalizedProject } from "../types";
import { roadJibunSimilarity } from "./address";

function parseDate(value?: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function dateSimilarity(a?: string | null, b?: string | null): number {
  const ta = parseDate(a);
  const tb = parseDate(b);
  if (!ta || !tb) return 0;
  const diffDays = Math.abs(ta - tb) / (1000 * 60 * 60 * 24);
  if (diffDays <= 7) return 1;
  if (diffDays <= 30) return 0.7;
  if (diffDays <= 90) return 0.4;
  return 0;
}

function textSimilarity(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  return 0;
}

function numericSimilarity(a?: number | null, b?: number | null): number {
  if (a == null || b == null) return 0;
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  const ratio = Math.abs(a - b) / max;
  return Math.max(0, 1 - ratio);
}

function distanceSimilarity(latA?: number | null, lngA?: number | null, latB?: number | null, lngB?: number | null): number {
  if (latA == null || lngA == null || latB == null || lngB == null) return 0;
  const dx = latA - latB;
  const dy = lngA - lngB;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0.0005) return 1;
  if (distance <= 0.001) return 0.7;
  if (distance <= 0.003) return 0.4;
  return 0;
}

export function dedupeScore(a: NormalizedProject, b: NormalizedProject): number {
  // 가중치 기반 점수: 주소 정확도를 가장 높게 반영하고, 날짜/용도/규모/좌표를 보조로 사용한다.
  const address = roadJibunSimilarity(a.address_road ?? undefined, b.address_road ?? undefined, a.address_jibun ?? undefined, b.address_jibun ?? undefined);
  const permitDate = dateSimilarity(a.permit_date, b.permit_date);
  const useMatch = textSimilarity(a.main_use, b.main_use);
  const area = numericSimilarity(a.gross_floor_area, b.gross_floor_area);
  const floors = numericSimilarity(a.floors_above, b.floors_above);
  const geo = distanceSimilarity(a.lat, a.lng, b.lat, b.lng);

  return address * 0.35 + permitDate * 0.15 + useMatch * 0.15 + area * 0.1 + floors * 0.1 + geo * 0.15;
}

export function shouldMerge(a: NormalizedProject, b: NormalizedProject): boolean {
  // MVP 임계치: 완전 일치가 아니더라도 행정 데이터의 흔한 표기 차이를 허용한다.
  return dedupeScore(a, b) >= 0.62;
}

export function mergeProjects(primary: NormalizedProject, secondary: NormalizedProject): NormalizedProject {
  return {
    ...primary,
    title: primary.title || secondary.title,
    address_road: primary.address_road || secondary.address_road,
    address_jibun: primary.address_jibun || secondary.address_jibun,
    lat: primary.lat ?? secondary.lat,
    lng: primary.lng ?? secondary.lng,
    permit_type: primary.permit_type || secondary.permit_type,
    main_use: primary.main_use || secondary.main_use,
    sub_use: primary.sub_use || secondary.sub_use,
    permit_date: primary.permit_date || secondary.permit_date,
    start_date: primary.start_date || secondary.start_date,
    approval_date: primary.approval_date || secondary.approval_date,
    status_normalized: primary.status_normalized !== "정보부족" ? primary.status_normalized : secondary.status_normalized,
    building_area: primary.building_area ?? secondary.building_area,
    gross_floor_area: primary.gross_floor_area ?? secondary.gross_floor_area,
    floors_above: primary.floors_above ?? secondary.floors_above,
    floors_below: primary.floors_below ?? secondary.floors_below,
    households: primary.households ?? secondary.households,
    contractor: primary.contractor || secondary.contractor,
    designer: primary.designer || secondary.designer,
    supervisor: primary.supervisor || secondary.supervisor,
    local_government: primary.local_government || secondary.local_government,
    source_count: primary.source_count + secondary.source_count,
    confidence_score: Math.min(0.99, Math.max(primary.confidence_score, secondary.confidence_score + 0.05)),
  };
}
