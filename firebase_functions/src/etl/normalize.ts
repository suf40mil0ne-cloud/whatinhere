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

export function normalizeAddress(addr?: string): string {
  if (!addr || typeof addr !== "string") return "";
  return addr
    .replace(/\s+/g, " ")
    .replace(/(특별시|광역시|특별자치시|특별자치도)/g, "")
    .trim();
}

export function buildDedupKey(record: NormalizedRecord): string {
  const pnu = typeof record.pnu === "string" ? record.pnu.trim() : "";
  const address = normalizeAddress(record.address_raw);
  const use = typeof record.use === "string" ? record.use.trim().slice(0, 24) : "";
  const areaBucket = Number.isFinite(record.area_m2) ? Math.round((record.area_m2 as number) / 100) : 0;
  const seed = pnu || address || record.title || "unknown";
  return `${seed}|${use}|${areaBucket}`;
}

export function inferStatusFromSource(record: NormalizedRecord): ProjectStatus {
  if (record.source === "BUILD_PERMIT") return "APPROVED";

  const text = `${record.title || ""} ${record.use || ""}`.toLowerCase();
  if (text.includes("공사중") || text.includes("착공") || text.includes("in progress")) return "IN_PROGRESS";
  if (text.includes("준공") || text.includes("완료") || text.includes("completed")) return "COMPLETED";

  return "RECEIVED";
}
