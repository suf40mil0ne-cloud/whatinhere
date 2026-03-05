import { type NormalizedRecord, buildDedupKey } from "./normalize";

export function ensureDedupKey(record: NormalizedRecord): NormalizedRecord {
  if (!record.dedup_key || !record.dedup_key.trim()) {
    record.dedup_key = buildDedupKey(record);
  }
  return record;
}

export function hashStringToId(input: string): string {
  const safe = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < safe.length; i += 1) {
    h ^= safe.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h >>> 0).toString(16)}`;
}
