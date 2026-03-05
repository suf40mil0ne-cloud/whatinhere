export type SourceType = "DEV_PERMIT" | "BUILD_PERMIT" | "URBAN_PLAN" | "NEWS";
export type ProjectStatus = "RECEIVED" | "APPROVED" | "STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface NormalizedRecord {
  source: SourceType;
  sourceRecordId: string;
  title: string;
  address_raw?: string;
  pnu?: string;
  issued_at?: string;
  applied_at?: string;
  use?: string;
  area_m2?: number;
  floors?: number;
  units?: number;
  evidence_urls?: string[];
  lat?: number;
  lng?: number;
  geocode_accuracy?: number;
  dedup_key?: string;
}

export function normalizeAddress(addr?: string) {
  if (!addr) return "";
  return addr.replace(/\s+/g, " ").replace(/(특별시|광역시|특별자치시|특별자치도)/g, "").trim();
}

export function buildDedupKey(r: NormalizedRecord) {
  const a = normalizeAddress(r.address_raw);
  const p = r.pnu ?? "";
  const use = (r.use ?? "").slice(0, 20);
  const areaBucket = r.area_m2 ? Math.round(r.area_m2 / 100) : 0;
  return `${p || a}|${use}|${areaBucket}`;
}
