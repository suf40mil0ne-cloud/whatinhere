import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const _rootForEnv = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function loadEnvFiles(): void {
  for (const filename of [".dev.vars", ".env", ".env.local"]) {
    const filePath = path.join(_rootForEnv, filename);
    if (!fsSync.existsSync(filePath)) continue;
    const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) process.env[key] = value;
    }
  }
}

loadEnvFiles();

export const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const OUTPUT_DIR = path.join(ROOT_DIR, "output");
export const STATE_PATH = path.join(OUTPUT_DIR, "district-scores.state.json");
export const CAPITAL_SIDO_NAMES = ["서울특별시", "경기도", "인천광역시"] as const;
export const CAPITAL_SIDO_CODES = new Set(["11", "41", "28"]);
export const DEFAULT_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "93ab10ebd79f48772e33be1df27532bbfba053564aa834082eacb75da688c46b";

export interface RawTransport {
  busStopCount500m: number | null;
  busStopDistanceM: number | null;
  subwayStationDistanceM: number | null;
  subwayTransferCount1km: number | null;
}

export interface RawWalk {
  parkCount1km: number | null;
  parkArea1km: number | null;
  parkDistanceM: number | null;
  parkFacilityCount: number | null;
}

export interface RawValue {
  pricePerSqmMedian: number | null;
}

export interface RawChildcare {
  childcareCount: number | null;
  capacityLeft1km: number | null;
  elementaryDistanceM: number | null;
  academyCount1km: number | null;
  academyDiversityScore: number | null;
  vehicleRatio: number | null;
}

export interface RawSafety {
  cctvCount500m: number | null;
  cctvDistanceM: number | null;
  childZoneCount1km: number | null;
  safetyIndexScore: number | null;
}

export interface DistrictState {
  code: string;
  sido: string;
  sigungu: string;
  dong: string;
  center_lat: number | null;
  center_lng: number | null;
  households: number | null;
  population: number | null;
  s_transport: number;
  s_walk: number;
  s_value: number;
  s_childcare: number;
  s_safety: number;
  s_overall: number;
  raw_transport: RawTransport | null;
  raw_walk: RawWalk | null;
  raw_value: RawValue | null;
  raw_childcare: RawChildcare | null;
  raw_safety: RawSafety | null;
}

export interface PointRecord {
  lat: number;
  lng: number;
  [key: string]: unknown;
}

export function createEmptyDistrict(partial: Pick<DistrictState, "code" | "sido" | "sigungu" | "dong" | "center_lat" | "center_lng">): DistrictState {
  return {
    ...partial,
    households: null,
    population: null,
    s_transport: 0,
    s_walk: 0,
    s_value: 0,
    s_childcare: 0,
    s_safety: 0,
    s_overall: 0,
    raw_transport: null,
    raw_walk: null,
    raw_value: null,
    raw_childcare: null,
    raw_safety: null,
  };
}

export async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

export async function loadState(): Promise<DistrictState[]> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as DistrictState[];
  } catch {
    return [];
  }
}

export async function saveState(rows: DistrictState[]): Promise<void> {
  await ensureOutputDir();
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));
  await fs.writeFile(STATE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export async function writeSqlFile(name: string, sql: string): Promise<void> {
  await ensureOutputDir();
  await fs.writeFile(path.join(OUTPUT_DIR, name), sql.endsWith("\n") ? sql : `${sql}\n`, "utf8");
}

export function warn(message: string): void {
  console.warn(`[warn] ${message}`);
}

export function info(message: string): void {
  console.log(`[info] ${message}`);
}

export function flushWarningSummary(prefix: string, label: string, count: number): void {
  if (count > 0) warn(`${prefix}: skipped ${count} ${label}`);
}

export function quote(value: string | null | undefined): string {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlValue(value: string | number | null | undefined): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(round(value)) : "NULL";
  return quote(value);
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function updateOverallScores(rows: DistrictState[]): void {
  for (const row of rows) {
    row.s_overall = round((row.s_transport + row.s_walk + row.s_value + row.s_childcare + row.s_safety) / 5, 2);
  }
}

export function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function normalizeWithinSgg<T>(rows: T[], getGroup: (row: T) => string, getValue: (row: T) => number | null, inverse = false): Map<T, number> {
  const result = new Map<T, number>();
  const groups = groupBy(rows, getGroup);
  for (const bucket of groups.values()) {
    const values = bucket.map(getValue).filter((value): value is number => value != null && Number.isFinite(value));
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

export function average(values: Array<number | null | undefined>): number {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
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
    const distance = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (distance < min) min = distance;
  }
  return Number.isFinite(min) ? round(min, 2) : null;
}

export function countWithin(point: { lat: number; lng: number }, targets: PointRecord[], radiusM: number, getWeight?: (target: PointRecord) => number): number {
  let count = 0;
  for (const target of targets) {
    const distance = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (distance <= radiusM) count += getWeight ? getWeight(target) : 1;
  }
  return count;
}

export function sumWithin(point: { lat: number; lng: number }, targets: PointRecord[], radiusM: number, getValue: (target: PointRecord) => number): number {
  let total = 0;
  for (const target of targets) {
    const distance = toMeters(point.lat, point.lng, target.lat, target.lng);
    if (distance <= radiusM) total += getValue(target);
  }
  return round(total, 2);
}

export function buildUpdateSql(rows: DistrictState[], columns: string[]): string {
  const lines = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    const assignments = columns.map((column) => {
      const rawValue = (row as Record<string, unknown>)[column];
      // Serialize raw_* JSON blobs
      if (column.startsWith("raw_") && rawValue != null && typeof rawValue === "object") {
        return `${column} = ${quote(JSON.stringify(rawValue))}`;
      }
      return `${column} = ${sqlValue(rawValue as string | number | null | undefined)}`;
    });
    assignments.push(`updated_at = CURRENT_TIMESTAMP`);
    lines.push(`UPDATE district_scores SET ${assignments.join(", ")} WHERE code = ${quote(row.code)};`);
  }
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

export function buildInsertIgnoreSql(rows: DistrictState[]): string {
  const lines = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    lines.push(`INSERT OR IGNORE INTO district_scores (code, sido, sigungu, dong, center_lat, center_lng) VALUES (${quote(row.code)}, ${quote(row.sido)}, ${quote(row.sigungu)}, ${quote(row.dong)}, ${sqlValue(row.center_lat)}, ${sqlValue(row.center_lng)});`);
  }
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

export function buildReplaceSql(rows: DistrictState[]): string {
  const columns = [
    "code", "sido", "sigungu", "dong", "center_lat", "center_lng", "households", "population",
    "s_transport", "s_walk", "s_value", "s_childcare", "s_safety", "s_overall",
    "raw_transport", "raw_walk", "raw_value", "raw_childcare", "raw_safety",
  ] as const;
  const lines = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    const values = columns.map((column) => {
      const rawValue = (row as Record<string, unknown>)[column];
      if (column.startsWith("raw_")) {
        if (rawValue == null) return "NULL";
        return quote(JSON.stringify(rawValue));
      }
      return sqlValue(rawValue as string | number | null | undefined);
    });
    lines.push(`INSERT OR REPLACE INTO district_scores (${columns.join(", ")}) VALUES (${values.join(", ")});`);
  }
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

export function buildUpsertSql(rows: DistrictState[]): string {
  const scoreKeys = ["s_transport", "s_walk", "s_value", "s_childcare", "s_safety"] as const;
  const rawKeys = ["raw_transport", "raw_walk", "raw_value", "raw_childcare", "raw_safety"] as const;
  const scoreToRaw: Record<string, string> = {
    s_transport: "raw_transport", s_walk: "raw_walk", s_value: "raw_value",
    s_childcare: "raw_childcare", s_safety: "raw_safety",
  };
  const columns = [
    "code", "sido", "sigungu", "dong", "center_lat", "center_lng", "households", "population",
    ...scoreKeys, "s_overall", ...rawKeys,
  ] as const;
  const lines = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    const values = columns.map((column) => {
      const rawValue = (row as Record<string, unknown>)[column];
      if (column.startsWith("raw_")) {
        if (rawValue == null) return "NULL";
        return quote(JSON.stringify(rawValue));
      }
      return sqlValue(rawValue as string | number | null | undefined);
    });
    const scoreUpdates = scoreKeys.map((s) =>
      `${s} = CASE WHEN excluded.${s} > 0 THEN excluded.${s} ELSE ${s} END`
    );
    const rawUpdates = rawKeys.map((r) => {
      const s = Object.keys(scoreToRaw).find((k) => scoreToRaw[k] === r)!;
      return `${r} = CASE WHEN excluded.${s} > 0 THEN excluded.${r} ELSE ${r} END`;
    });
    const overallUpdate = `s_overall = CASE WHEN (excluded.s_transport > 0 OR excluded.s_walk > 0 OR excluded.s_value > 0 OR excluded.s_childcare > 0 OR excluded.s_safety > 0) THEN excluded.s_overall ELSE s_overall END`;
    const metaUpdates = [
      "sido = excluded.sido", "sigungu = excluded.sigungu", "dong = excluded.dong",
      "center_lat = excluded.center_lat", "center_lng = excluded.center_lng",
      "households = excluded.households", "population = excluded.population",
    ];
    const allUpdates = [...metaUpdates, ...scoreUpdates, overallUpdate, ...rawUpdates, "updated_at = datetime('now')"];
    lines.push(
      `INSERT INTO district_scores (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT(code) DO UPDATE SET ${allUpdates.join(", ")};`
    );
  }
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

export function paramsToUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SENSITIVE_QUERY_KEYS = new Set(["serviceKey", "KEY", "apiKey", "key", "token"]);

interface FetchRetryOptions {
  headers?: HeadersInit;
  parseAs?: "json" | "text";
  retries?: number;
  timeoutMs?: number;
  /** Force TLS 1.2 and skip cert validation — required for safetydata.go.kr which rejects TLS 1.3 */
  legacyTls?: boolean;
}

function redactUrlForLogs(rawUrl: string): string {
  const url = new URL(rawUrl);
  for (const key of SENSITIVE_QUERY_KEYS) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "***");
  }
  return url.toString();
}

function previewBody(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

async function fetchWithRetry(url: string, options: FetchRetryOptions = {}): Promise<unknown> {
  const { headers, parseAs = "text", retries = 2, timeoutMs = 10000, legacyTls = false } = options;
  const safeUrl = redactUrlForLogs(url);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      let status: number;
      let body: string;
      if (legacyTls) {
        // safetydata.go.kr rejects TLS 1.3 — use undici with TLS 1.2 + skip cert validation
        const { Agent, fetch: undiciFetch } = await import("undici");
        const agent = new Agent({ connect: { rejectUnauthorized: false, maxVersion: "TLSv1.2" } });
        const res = await undiciFetch(url, { headers: headers as Record<string, string>, dispatcher: agent, signal: AbortSignal.timeout(timeoutMs) });
        status = res.status;
        body = await res.text();
      } else {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
        status = res.status;
        body = await res.text();
      }
      if (status < 200 || status >= 300) {
        const message = `HTTP ${status} for ${safeUrl}${body ? ` body=${previewBody(body)}` : ""}`;
        if (attempt < retries && RETRYABLE_STATUS_CODES.has(status)) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }
        throw new Error(message);
      }
      if (parseAs === "json") {
        try {
          return body ? JSON.parse(body) : null;
        } catch (error) {
          throw new Error(`Invalid JSON for ${safeUrl}: ${error instanceof Error ? error.message : String(error)} body=${previewBody(body)}`);
        }
      }
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = attempt < retries && !/^HTTP (401|403|404)\b/.test(message);
      if (!retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Request failed for ${safeUrl}`);
}

export async function fetchTextWithRetry(url: string, options?: Omit<FetchRetryOptions, "parseAs">): Promise<string> {
  return fetchWithRetry(url, { ...options, parseAs: "text" }) as Promise<string>;
}

export async function fetchJsonWithRetry<T = unknown>(url: string, options?: Omit<FetchRetryOptions, "parseAs">): Promise<T> {
  return fetchWithRetry(url, { ...options, parseAs: "json" }) as Promise<T>;
}

export async function fetchText(url: string): Promise<string> {
  return fetchTextWithRetry(url);
}

export async function fetchJson(url: string): Promise<unknown> {
  return fetchJsonWithRetry(url);
}

export function xmlItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
}

export function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function lastRegionToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export function geometryCenter(geometry: unknown): { lat: number; lng: number } | null {
  const coords = extractCoords(geometry);
  if (!coords.length) return null;
  const lngs = coords.map(([lng]) => lng);
  const lats = coords.map(([, lat]) => lat);
  return { lat: round((Math.min(...lats) + Math.max(...lats)) / 2, 6), lng: round((Math.min(...lngs) + Math.max(...lngs)) / 2, 6) };
}

function extractCoords(geometry: unknown): Array<[number, number]> {
  if (!geometry || typeof geometry !== "object") return [];
  const candidate = geometry as { coordinates?: unknown };
  return flattenCoordinates(candidate.coordinates);
}

function flattenCoordinates(input: unknown): Array<[number, number]> {
  if (!Array.isArray(input)) return [];
  if (input.length >= 2 && typeof input[0] === "number" && typeof input[1] === "number") {
    return [[input[0], input[1]]];
  }
  const result: Array<[number, number]> = [];
  for (const item of input) result.push(...flattenCoordinates(item));
  return result;
}

export function parseJsonItems(payload: unknown): any[] {
  const root = payload as Record<string, any>;
  const response = root?.response ?? root;
  const body = response?.body ?? response;
  if (Array.isArray(body)) return body;
  const items = body?.items ?? body?.item ?? response?.items ?? root?.items;
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.item)) return items.item;
  if (Array.isArray(body?.item)) return body.item;
  if (Array.isArray(response?.item)) return response.item;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root)) return root;
  return [];
}
