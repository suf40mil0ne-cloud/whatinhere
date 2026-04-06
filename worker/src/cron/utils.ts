export interface DistrictRow {
  code: string;
  sido: string;
  sigungu: string;
  dong: string;
  center_lat: number | null;
  center_lng: number | null;
  households: number | null;
}

export interface PointRecord {
  lat: number;
  lng: number;
  [key: string]: unknown;
}

export const CAPITAL_SIDO_NAMES = ["서울특별시", "경기도", "인천광역시"];

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = (value as string).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = (value as string).trim();
  return trimmed || null;
}

export function paramsToUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function xmlItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

export function parseJsonItems(payload: unknown): Record<string, unknown>[] {
  const root = payload as Record<string, unknown>;
  const response = (root?.response ?? root) as Record<string, unknown>;
  const body = (response?.body ?? response) as Record<string, unknown>;
  const items = body?.items ?? body?.item ?? response?.items ?? root?.items;
  if (Array.isArray(items)) return items as Record<string, unknown>[];
  if (Array.isArray((items as Record<string, unknown>)?.item)) return (items as Record<string, unknown[]>).item as Record<string, unknown>[];
  if (Array.isArray(body?.item)) return body.item as Record<string, unknown>[];
  if (Array.isArray(response?.item)) return response.item as Record<string, unknown>[];
  if (Array.isArray(root?.data)) return root.data as Record<string, unknown>[];
  if (Array.isArray(root)) return root as Record<string, unknown>[];
  return [];
}

export function toMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestDistance(point: { lat: number; lng: number }, targets: PointRecord[]): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const d = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? round(min, 2) : null;
}

export function countWithin(
  point: { lat: number; lng: number },
  targets: PointRecord[],
  radiusM: number,
  getWeight?: (t: PointRecord) => number
): number {
  let count = 0;
  for (const target of targets) {
    const d = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (d <= radiusM) count += getWeight ? getWeight(target) : 1;
  }
  return count;
}

export function sumWithin(
  point: { lat: number; lng: number },
  targets: PointRecord[],
  radiusM: number,
  getValue: (t: PointRecord) => number
): number {
  let total = 0;
  for (const target of targets) {
    const d = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (d <= radiusM) total += getValue(target);
  }
  return round(total, 2);
}

function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function normalizeWithinSgg<T>(
  rows: T[],
  getGroup: (row: T) => string,
  getValue: (row: T) => number | null,
  inverse = false
): Map<T, number> {
  const result = new Map<T, number>();
  const groups = groupBy(rows, getGroup);
  for (const bucket of groups.values()) {
    const values = bucket.map(getValue).filter((v): v is number => v != null && Number.isFinite(v));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    for (const row of bucket) {
      const value = getValue(row);
      if (value == null || !Number.isFinite(value)) {
        result.set(row, 0);
        continue;
      }
      if (max === min) {
        result.set(row, value > 0 ? 100 : 0);
        continue;
      }
      const ratio = inverse ? (max - value) / (max - min) : (value - min) / (max - min);
      result.set(row, round(ratio * 100, 2));
    }
  }
  return result;
}

export async function batchD1Update(
  db: D1Database,
  entries: Array<{ code: string; score: number; raw: unknown }>,
  scoreCol: string,
  rawCol: string
): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    await db.batch(
      chunk.map(({ code, score, raw }) =>
        db
          .prepare(`UPDATE district_scores SET ${scoreCol} = ?, ${rawCol} = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?`)
          .bind(score, JSON.stringify(raw), code)
      )
    );
  }
}

export async function refreshOverall(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE district_scores SET s_overall = ROUND((COALESCE(s_transport,0) + COALESCE(s_walk,0) + COALESCE(s_value,0) + COALESCE(s_childcare,0) + COALESCE(s_safety,0)) / 5.0, 2)`
    )
    .run();
}
