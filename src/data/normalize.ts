import { geocodeAddress } from "./connectors/geocoder";
import { deriveProjectStatus, buildFactSummary, getDisplayStatus } from "../lib/project-status";
import { scoreConfidence } from "./score";
import type { ProjectRecord, SourceReference, SourceLinkType } from "../types/content";

export interface RawSourceSeed {
  id: string;
  slug: string;
  source: string;
  sourceRecordId: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourceType?: SourceLinkType;
  title: string;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  eupmyeondong: string | null;
  permitDate?: string | null;
  startDate?: string | null;
  approvalDate?: string | null;
  buildingUse?: string | null;
  mainPurpose?: string | null;
  category?: string | null;
  summary?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  verifiedAt?: string | null;
  lat?: number | null;
  lng?: number | null;
  raw: Record<string, unknown>;
}

export function normalizeDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function normalizeSourceSeed(seed: RawSourceSeed): ProjectRecord {
  const address = normalizeAddress(seed.address);
  const coordinates = seed.lat != null && seed.lng != null ? { lat: seed.lat, lng: seed.lng } : geocodeAddress(address);
  const permitDate = normalizeDate(seed.permitDate);
  const startDate = normalizeDate(seed.startDate);
  const approvalDate = normalizeDate(seed.approvalDate);
  const status = deriveProjectStatus({ permitDate, startDate, approvalDate });
  const statusText = getDisplayStatus({
    status: status.status,
    startDate,
    approvalDate,
  }).label;
  const summary = seed.summary || buildFactSummary({
    status: status.status,
    permitDate,
    startDate,
    approvalDate,
    buildingUse: seed.buildingUse ?? null,
    mainPurpose: seed.mainPurpose ?? null,
    sourceName: seed.sourceName,
  });
  const description =
    seed.description ||
    `${seed.sourceName} 원문 기준 사업명, 주소, 일정 정보 중 확인 가능한 항목만 정리했습니다. 원문 공고와 시차가 있을 수 있어 최종 판단 전 추가 확인이 필요합니다.`;

  const confidence = scoreConfidence({
    source: seed.source,
    hasAddress: Boolean(address),
    hasCoordinates: Boolean(coordinates),
    scheduleFieldCount: [permitDate, startDate, approvalDate].filter(Boolean).length,
  });

  const primarySource: SourceReference = {
    label: seed.sourceName,
    url: seed.sourceUrl || "#",
    type: seed.sourceType || "공공데이터",
  };

  return {
    id: seed.id,
    slug: seed.slug,
    source: seed.source,
    sourceRecordId: seed.sourceRecordId,
    title: seed.title.trim(),
    address,
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null,
    sido: seed.sido,
    sigungu: seed.sigungu,
    eupmyeondong: seed.eupmyeondong,
    permitDate,
    startDate,
    approvalDate,
    status: status.status,
    statusText,
    statusReason: status.reason,
    buildingUse: seed.buildingUse ?? null,
    mainPurpose: seed.mainPurpose ?? null,
    category: seed.category ?? null,
    summary,
    description,
    sourceUrl: seed.sourceUrl,
    sourceName: seed.sourceName,
    updatedAt: normalizeDate(seed.updatedAt) ?? seed.updatedAt ?? null,
    verifiedAt: normalizeDate(seed.verifiedAt) ?? seed.verifiedAt ?? null,
    confidenceScore: confidence.score,
    confidenceLabel: confidence.label,
    raw: seed.raw,
    supportingSources: seed.sourceUrl ? [primarySource] : [],
  };
}
