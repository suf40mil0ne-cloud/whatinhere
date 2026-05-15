export type SourceType = "openapi" | "file" | "csv" | "xlsx";

export interface Env {
  DB: D1Database;
  DATA_GO_KR_SERVICE_KEY: string;
  CHILDCARE_API_KEY?: string;
  CHILDCARE_API_BASE?: string;
  CHILDCARE_PROXY_URL?: string;
  KAKAO_REST_API_KEY?: string;
  KAKAO_CLIENT_SECRET?: string;
  VITE_KAKAO_JS_KEY?: string;
  VITE_KAKAO_MAP_JS_KEY?: string;
  ADMIN_TOKEN?: string;
  ADMIN_USER_ID?: string;
  JWT_SECRET?: string;
  TAGO_API_KEY?: string;
  CCTV_API_KEY?: string;
  SAFETY_INDEX_API_KEY?: string;
  ARCH_PMS_HUB_API_KEY?: string;
}

// kept for project pipeline compatibility


/** @deprecated use DistrictScoreRow */
export type DistrictScoreRecord = DistrictScoreRow;

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
  platArea?: number | null;
  vlRat?: number | null;
  bcRat?: number | null;
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


// ── District ──────────────────────────────────────────────────────────────────

export interface DistrictScoreRow {
  code: string;
  sido: string;
  sigungu: string;
  dong: string;
  center_lat: number | null;
  center_lng: number | null;
  households: number | null;
  population: number | null;
  s_transport: number | null;
  s_walk: number | null;
  s_value: number | null;
  s_childcare: number | null;
  s_safety: number | null;
  s_overall: number | null;
  raw_transport: string | null;
  raw_walk: string | null;
  raw_value: string | null;
  raw_childcare: string | null;
  raw_safety: string | null;
  updated_at?: string | null;
}

export interface ApiDistrictRecord {
  code: string;
  sido: string;
  sigungu: string;
  dong: string;
  center: { lat: number | null; lng: number | null };
  households: number | null;
  population: number | null;
  scores: { transport: number; walk: number; value: number; childcare: number; safety: number; overall: number };
  rawTransport: Record<string, unknown> | null;
  rawWalk: Record<string, unknown> | null;
  rawValue: Record<string, unknown> | null;
  rawChildcare: Record<string, unknown> | null;
  rawSafety: Record<string, unknown> | null;
}

export interface ApiDistrictListResponse {
  total: number;
  districts: ApiDistrictRecord[];
}

// ── Apartment ─────────────────────────────────────────────────────────────────

export interface AptComplexRow {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  district_code: string | null;
  built_year: number | null;
  total_units: number | null;
  avg_price_per_m2: number | null;
  price_source: string | null;
  s_transport: number | null;
  s_walk: number | null;
  s_value: number | null;
  s_childcare: number | null;
  s_safety: number | null;
  s_scale: number | null;
  overall_score_adjusted: number | null;
  updated_at?: string | null;
}

export interface AptCommentRow {
  id: string;
  apt_id: string;
  category: string | null;
  comment: string;
  user_score: number | null;
  likes: number;
  created_at: string;
}

export interface ApiAptRecord {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  districtCode: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  avgPricePerM2: number | null;
  priceSource: string | null;
  sScale: number | null;
  overallScoreAdjusted: number | null;
  scores: { transport: number; walk: number; value: number; childcare: number; safety: number };
  rawTransport: Record<string, unknown> | null;
  rawWalk: Record<string, unknown> | null;
  rawValue: Record<string, unknown> | null;
  rawChildcare: Record<string, unknown> | null;
  rawSafety: Record<string, unknown> | null;
  comments?: ApiAptComment[];
}

export interface ApiAptComment {
  id: string;
  aptId: string;
  category: string | null;
  comment: string;
  userScore: number | null;
  likes: number;
  createdAt: string;
}

export interface ApiAptListResponse {
  total: number;
  apts: ApiAptRecord[];
}

// ── Auth / User ───────────────────────────────────────────────────────────────
export interface UserRow {
  id: string;
  nickname: string;
  profile_img: string | null;
  created_at: string;
}

export interface SessionRow {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface ApiUser {
  id: string;
  nickname: string;
  profileImg: string | null;
}

// ── Battle ────────────────────────────────────────────────────────────────────
export interface BattleScores {
  transport: number;
  walk: number;
  value: number;
  childcare: number;
  safety: number;
}

export interface BattleRow {
  id: string;
  apt_a_id: string;
  apt_b_id: string;
  apt_a_name: string;
  apt_b_name: string;
  winner: string | null;
  score_a: string;
  score_b: string;
  view_count: number;
  created_at: string;
}

export interface BattleCommentRow {
  id: string;
  battle_id: string;
  user_id: string;
  comment: string;
  likes: number;
  created_at: string;
}

export interface BattleDisputeRow {
  id: string;
  battle_id: string;
  user_id: string | null;
  category: string;
  reason: string;
  created_at: string;
}

export interface ApiBattleComment {
  id: string;
  battleId: string;
  userId: string;
  nickname: string;
  profileImg: string | null;
  comment: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface ApiBattleDispute {
  id: string;
  category: string;
  reason: string;
  createdAt: string;
}

export interface ApiBattle {
  id: string;
  aptAId: string;
  aptBId: string;
  aptAName: string;
  aptBName: string;
  winner: string | null;
  scoreA: BattleScores;
  scoreB: BattleScores;
  viewCount: number;
  createdAt: string;
  comments?: ApiBattleComment[];
  disputes?: ApiBattleDispute[];
}

// ── Comments Feed ─────────────────────────────────────────────────────────────
export interface CommentFeedRow {
  id: string;
  battle_id: string;
  comment: string;
  likes: number;
  created_at: string;
  nickname: string;
  profile_img: string | null;
  apt_a_name: string;
  apt_b_name: string;
  winner: string | null;
}

export interface CommentFeedItem {
  id: string;
  battleId: string;
  comment: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
  nickname: string;
  profileImg: string | null;
  aptAName: string;
  aptBName: string;
  winner: string | null;
}

export interface AptRanking {
  id: string;
  name: string;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number;
}

// ── Apt User Comments ─────────────────────────────────────────────────────────
export interface AptUserCommentRow {
  id: string;
  apt_id: string;
  user_id: string;
  user_name: string;
  user_photo: string | null;
  content: string;
  report_count: number;
  is_hidden: number;
  created_at: string;
}

export interface ApiAptUserComment {
  id: string;
  aptId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  content: string;
  createdAt: string;
}
