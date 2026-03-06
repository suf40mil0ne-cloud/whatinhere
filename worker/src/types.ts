export type SourceType = "openapi" | "file" | "csv" | "xlsx";

export interface Env {
  DB: D1Database;
  DATA_GO_KR_SERVICE_KEY: string;
  KAKAO_REST_API_KEY?: string;
  ADMIN_TOKEN?: string;
}

export interface SourceRecord {
  sourceId: string;
  sourceRecordId: string;
  title?: string;
  addressRoad?: string;
  addressJibun?: string;
  permitType?: string;
  mainUse?: string;
  subUse?: string;
  permitDate?: string;
  startDate?: string;
  approvalDate?: string;
  rawStatus?: string;
  buildingArea?: number | null;
  grossFloorArea?: number | null;
  floorsAbove?: number | null;
  floorsBelow?: number | null;
  households?: number | null;
  contractor?: string;
  designer?: string;
  supervisor?: string;
  localGovernment?: string;
  lat?: number | null;
  lng?: number | null;
  sourceUrl?: string;
  note?: string;
  raw: Record<string, unknown>;
}

export interface NormalizedProject {
  project_id: string;
  title: string;
  source_priority: number;
  address_road: string | null;
  address_jibun: string | null;
  lat: number | null;
  lng: number | null;
  permit_type: string | null;
  main_use: string | null;
  sub_use: string | null;
  permit_date: string | null;
  start_date: string | null;
  approval_date: string | null;
  status_normalized: string;
  building_area: number | null;
  gross_floor_area: number | null;
  floors_above: number | null;
  floors_below: number | null;
  households: number | null;
  contractor: string | null;
  designer: string | null;
  supervisor: string | null;
  local_government: string | null;
  source_count: number;
  confidence_score: number;
  updated_at?: string | null;
}

export interface SourceAdapter {
  id: string;
  name: string;
  type: SourceType;
  fetch: (env: Env) => Promise<SourceRecord[]>;
}

export type ApiProjectStatus = "permit" | "start" | "construction" | "approval" | "unknown";

export type ApiConfidenceLabel = "high" | "medium" | "low";

export interface ApiProjectRecord {
  id: string;
  source: string;
  sourceRecordId: string | null;
  slug: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  region1: string | null;
  region2: string | null;
  region3: string | null;
  permitDate: string | null;
  startDate: string | null;
  approvalDate: string | null;
  status: ApiProjectStatus;
  statusReason: string | null;
  buildingUse: string | null;
  mainPurpose: string | null;
  category: string | null;
  summary: string | null;
  description: string | null;
  sourceUrl: string | null;
  sourceName: string;
  updatedAt: string | null;
  verifiedAt: string | null;
  confidenceScore: number;
  confidenceLabel: ApiConfidenceLabel;
  raw: Record<string, unknown>;
}

export interface ApiProjectListResponse {
  mode: "projects" | "summary";
  total: number;
  projects: ApiProjectRecord[];
  summary?: {
    by_status: Record<string, number>;
  };
}
