import { NormalizedRecord, buildDedupKey } from "./normalize";

export function ensureDedupKey(r: NormalizedRecord) {
  if (!r.dedup_key) r.dedup_key = buildDedupKey(r);
  return r;
}

export function hashStringToId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h >>> 0).toString(16)}`;
}
