import fs from "node:fs/promises";
import fsSync from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import XLSX from "xlsx";

const execFile = promisify(execFileCallback);
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
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const STATE_PATH = path.join(OUTPUT_DIR, "district-scores.state.json");
export const CAPITAL_SIDO_NAMES = ["서울특별시", "경기도", "인천광역시"] as const;
export const CAPITAL_SIDO_CODES = new Set(["11", "41", "28"]);
export const DEFAULT_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "93ab10ebd79f48772e33be1df27532bbfba053564aa834082eacb75da688c46b";

const DISTRICT_GEOJSON_FILES = ["seoul-emd.json", "gyeonggi-emd.json", "incheon-emd.json"];
let sigunguCodeMapCache: Map<string, string> | null = null;

/**
 * "시도:시군구" → 시군구코드(5자리). src/data/districts/*.json (00-fetch-districts.ts가 읽는 것과 동일한 파일)에서
 * 직접 파생시켜 04/06/fetch-total-units가 각자 하드코딩된 표를 따로 들고 있지 않게 한다.
 * 행정구역 개편 시 geojson만 갱신하면 이 맵을 쓰는 모든 스크립트에 자동 반영된다.
 */
export function getSigunguCodeMap(): Map<string, string> {
  if (sigunguCodeMapCache) return sigunguCodeMapCache;
  const map = new Map<string, string>();
  for (const filename of DISTRICT_GEOJSON_FILES) {
    const filePath = path.join(ROOT_DIR, "src", "data", "districts", filename);
    const geojson = JSON.parse(fsSync.readFileSync(filePath, "utf8")) as {
      features?: { properties?: { sidonm?: string; sggnm?: string; sgg?: string } }[];
    };
    for (const feature of geojson.features ?? []) {
      const { sidonm, sggnm, sgg } = feature.properties ?? {};
      if (sidonm && sggnm && sgg) map.set(`${sidonm}:${sggnm}`, sgg);
    }
  }
  sigunguCodeMapCache = map;
  return map;
}

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
  elementaryDistanceM: number | null;
  academyCount1km: number | null;
  academyDiversityScore: number | null;
  mallCount2km: number | null;
  pediatricCount1km: number | null;
  libraryExists2km: number | null;
}

export interface RawSafety {
  cctvCount500m: number | null;
  cctvDistanceM: number | null;
  childZoneCount1km: number | null;
  safetyIndexScore: number | null;
  crimeRate: number | null;
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

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Linear absolute scoring: best → 100 pts, worst → 0 pts.
 * Works for both directions:
 *   distance (inverse): linearScore(500, 100, 2000) — 100m=100, 2000m=0
 *   count   (normal):   linearScore(8, 10, 0)       — 10=100, 0=0
 */
export function linearScore(value: number | null | undefined, best: number, worst: number): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (best === worst) return value >= best ? 100 : 0;
  return clamp(round((value - worst) / (best - worst) * 100, 2), 0, 100);
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

export interface CurlTextResult {
  status: number;
  contentType: string | null;
  body: string;
}

export async function curlText(url: string, args: string[] = []): Promise<CurlTextResult> {
  const marker = "__CURL_META__";
  const { stdout } = await execFile(
    "curl",
    ["-sS", ...args, "-o", "-", "-w", `\n${marker}%{http_code}|%{content_type}`, url],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const output = stdout.toString();
  const markerIndex = output.lastIndexOf(`\n${marker}`);
  if (markerIndex === -1) return { status: 0, contentType: null, body: output };
  const body = output.slice(0, markerIndex);
  const meta = output.slice(markerIndex + marker.length + 1).trim();
  const [statusRaw, contentTypeRaw] = meta.split("|");
  return {
    status: Number(statusRaw) || 0,
    contentType: contentTypeRaw || null,
    body,
  };
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

// ── xlsx helpers ─────────────────────────────────────────────────────────────

export function readXlsxSheet(filePath: string, sheetName: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    const available = workbook.SheetNames.join(", ");
    throw new Error(`Sheet "${sheetName}" not found in ${filePath}. Available: ${available}`);
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
}

export function writeXlsxSheet(filePath: string, sheetName: string, data: Record<string, unknown>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
}

// ── Reference data loaders ────────────────────────────────────────────────────

/**
 * Reads data/national-price-reference.xlsx (sheet: "평형별중위가격").
 * Returns the simple average of all size-band national m² medians (만원/m²).
 * Creates a sample file if missing.
 */
export async function loadNationalPriceRef(): Promise<number | null> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const xlsxPath = path.join(DATA_DIR, "national-price-reference.xlsx");
  let rows: Record<string, unknown>[];
  try {
    rows = readXlsxSheet(xlsxPath, "평형별중위가격");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const sample = [
        { "평형대": "소형", "전국m²중위가격(만원)": 1200 },
        { "평형대": "중형", "전국m²중위가격(만원)": 1500 },
        { "평형대": "대형", "전국m²중위가격(만원)": 1900 },
      ];
      writeXlsxSheet(xlsxPath, "평형별중위가격", sample);
      warn("district-score-lib: data/national-price-reference.xlsx 없음 → 샘플 파일 생성. 실제 전국 중위가격으로 업데이트하세요.");
      rows = sample;
    } else throw error;
  }
  const prices = rows.map((r) => numeric(r["전국m²중위가격(만원)"])).filter((v): v is number => v != null);
  if (!prices.length) { warn("district-score-lib: national-price-reference.xlsx에 유효한 가격 행 없음"); return null; }
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

const CRIME_STATS_SAMPLE: Record<string, unknown>[] = [
  // 서울특별시
  { "시군구코드": "11110", "시군구명": "종로구",    "5대범죄합계": 2646, "인구수": 140000, "인구10만명당발생건수": 1890 },
  { "시군구코드": "11140", "시군구명": "중구",       "5대범죄합계": 2880, "인구수": 120000, "인구10만명당발생건수": 2400 },
  { "시군구코드": "11170", "시군구명": "용산구",     "5대범죄합계": 3588, "인구수": 260000, "인구10만명당발생건수": 1380 },
  { "시군구코드": "11200", "시군구명": "성동구",     "5대범죄합계": 2944, "인구수": 320000, "인구10만명당발생건수":  920 },
  { "시군구코드": "11215", "시군구명": "광진구",     "5대범죄합계": 3572, "인구수": 380000, "인구10만명당발생건수":  940 },
  { "시군구코드": "11230", "시군구명": "동대문구",   "5대범죄합계": 4608, "인구수": 360000, "인구10만명당발생건수": 1280 },
  { "시군구코드": "11260", "시군구명": "중랑구",     "5대범죄합계": 4714, "인구수": 410000, "인구10만명당발생건수": 1150 },
  { "시군구코드": "11290", "시군구명": "성북구",     "5대범죄합계": 4224, "인구수": 480000, "인구10만명당발생건수":  880 },
  { "시군구코드": "11305", "시군구명": "강북구",     "5대범죄합계": 3432, "인구수": 330000, "인구10만명당발생건수": 1040 },
  { "시군구코드": "11320", "시군구명": "도봉구",     "5대범죄합계": 2592, "인구수": 360000, "인구10만명당발생건수":  720 },
  { "시군구코드": "11350", "시군구명": "노원구",     "5대범죄합계": 3920, "인구수": 560000, "인구10만명당발생건수":  700 },
  { "시군구코드": "11380", "시군구명": "은평구",     "5대범죄합계": 3850, "인구수": 500000, "인구10만명당발생건수":  770 },
  { "시군구코드": "11410", "시군구명": "서대문구",   "5대범죄합계": 3740, "인구수": 340000, "인구10만명당발생건수": 1100 },
  { "시군구코드": "11440", "시군구명": "마포구",     "5대범죄합계": 5040, "인구수": 400000, "인구10만명당발생건수": 1260 },
  { "시군구코드": "11470", "시군구명": "양천구",     "5대범죄합계": 3400, "인구수": 500000, "인구10만명당발생건수":  680 },
  { "시군구코드": "11500", "시군구명": "강서구",     "5대범죄합계": 4856, "인구수": 600000, "인구10만명당발생건수":  810 },
  { "시군구코드": "11530", "시군구명": "구로구",     "5대범죄합계": 4704, "인구수": 420000, "인구10만명당발생건수": 1120 },
  { "시군구코드": "11545", "시군구명": "금천구",     "5대범죄합계": 3510, "인구수": 260000, "인구10만명당발생건수": 1350 },
  { "시군구코드": "11560", "시군구명": "영등포구",   "5대범죄합계": 6160, "인구수": 400000, "인구10만명당발생건수": 1540 },
  { "시군구코드": "11590", "시군구명": "동작구",     "5대범죄합계": 3828, "인구수": 440000, "인구10만명당발생건수":  870 },
  { "시군구코드": "11620", "시군구명": "관악구",     "5대범죄합계": 6344, "인구수": 520000, "인구10만명당발생건수": 1220 },
  { "시군구코드": "11650", "시군구명": "서초구",     "5대범죄합계": 3648, "인구수": 480000, "인구10만명당발생건수":  760 },
  { "시군구코드": "11680", "시군구명": "강남구",     "5대범죄합계": 4704, "인구수": 560000, "인구10만명당발생건수":  840 },
  { "시군구코드": "11710", "시군구명": "송파구",     "5대범죄합계": 5040, "인구수": 700000, "인구10만명당발생건수":  720 },
  { "시군구코드": "11740", "시군구명": "강동구",     "5대범죄합계": 3381, "인구수": 490000, "인구10만명당발생건수":  690 },
  // 인천광역시
  { "시군구코드": "28125", "시군구명": "제물포구",   "5대범죄합계":  310, "인구수":  20000, "인구10만명당발생건수": 1550 },
  { "시군구코드": "28155", "시군구명": "영종구",     "5대범죄합계":  320, "인구수":  21000, "인구10만명당발생건수": 1520 },
  { "시군구코드": "28177", "시군구명": "미추홀구",   "5대범죄합계": 1548, "인구수": 120000, "인구10만명당발생건수": 1290 },
  { "시군구코드": "28185", "시군구명": "연수구",     "5대범죄합계": 1116, "인구수": 155000, "인구10만명당발생건수":  720 },
  { "시군구코드": "28200", "시군구명": "남동구",     "5대범죄합계": 1800, "인구수": 202000, "인구10만명당발생건수":  890 },
  { "시군구코드": "28237", "시군구명": "부평구",     "5대범죄합계": 2904, "인구수": 264000, "인구10만명당발생건수": 1100 },
  { "시군구코드": "28245", "시군구명": "계양구",     "5대범죄합계": 1176, "인구수": 140000, "인구10만명당발생건수":  840 },
  { "시군구코드": "28275", "시군구명": "서해구",     "5대범죄합계": 1382, "인구수": 175000, "인구10만명당발생건수":  790 },
  { "시군구코드": "28290", "시군구명": "검단구",     "5대범죄합계":  750, "인구수":  95000, "인구10만명당발생건수":  790 },
  { "시군구코드": "28710", "시군구명": "강화군",     "5대범죄합계":  268, "인구수":  69000, "인구10만명당발생건수":  390 },
  { "시군구코드": "28720", "시군구명": "옹진군",     "5대범죄합계":   56, "인구수":  20000, "인구10만명당발생건수":  280 },
  // 경기도
  { "시군구코드": "41110", "시군구명": "수원시",     "5대범죄합계": 10788,"인구수":1160000, "인구10만명당발생건수":  930 },
  { "시군구코드": "41130", "시군구명": "성남시",     "5대범죄합계":  7112,"인구수": 900000, "인구10만명당발생건수":  790 },
  { "시군구코드": "41150", "시군구명": "의정부시",   "5대범죄합계":  4312,"인구수": 440000, "인구10만명당발생건수":  980 },
  { "시군구코드": "41170", "시군구명": "안양시",     "5대범죄합계":  5376,"인구수": 640000, "인구10만명당발생건수":  840 },
  { "시군구코드": "41190", "시군구명": "부천시",     "5대범죄합계":  8484,"인구수": 840000, "인구10만명당발생건수": 1010 },
  { "시군구코드": "41210", "시군구명": "광명시",     "5대범죄합계":  2848,"인구수": 320000, "인구10만명당발생건수":  890 },
  { "시군구코드": "41220", "시군구명": "평택시",     "5대범죄합계":  4800,"인구수": 500000, "인구10만명당발생건수":  960 },
  { "시군구코드": "41250", "시군구명": "동두천시",   "5대범죄합계":  1012,"인구수":  93000, "인구10만명당발생건수": 1090 },
  { "시군구코드": "41270", "시군구명": "안산시",     "5대범죄합계":  8568,"인구수": 720000, "인구10만명당발생건수": 1190 },
  { "시군구코드": "41280", "시군구명": "고양시",     "5대범죄합계":  7770,"인구수":1050000, "인구10만명당발생건수":  740 },
  { "시군구코드": "41290", "시군구명": "과천시",     "5대범죄합계":   356,"인구수":  66000, "인구10만명당발생건수":  540 },
  { "시군구코드": "41310", "시군구명": "구리시",     "5대범죄합계":  1596,"인구수": 190000, "인구10만명당발생건수":  840 },
  { "시군구코드": "41360", "시군구명": "남양주시",   "5대범죄합계":  4624,"인구수": 680000, "인구10만명당발생건수":  680 },
  { "시군구코드": "41370", "시군구명": "오산시",     "5대범죄합계":  1738,"인구수": 220000, "인구10만명당발생건수":  790 },
  { "시군구코드": "41390", "시군구명": "시흥시",     "5대범죄합계":  4048,"인구수": 460000, "인구10만명당발생건수":  880 },
  { "시군구코드": "41410", "시군구명": "군포시",     "5대범죄합계":  2072,"인구수": 280000, "인구10만명당발생건수":  740 },
  { "시군구코드": "41430", "시군구명": "의왕시",     "5대범죄합계":  1173,"인구수": 170000, "인구10만명당발생건수":  690 },
  { "시군구코드": "41450", "시군구명": "하남시",     "5대범죄합계":  1932,"인구수": 280000, "인구10만명당발생건수":  690 },
  { "시군구코드": "41460", "시군구명": "용인시",     "5대범죄합계":  7452,"인구수":1080000, "인구10만명당발생건수":  690 },
  { "시군구코드": "41480", "시군구명": "파주시",     "5대범죄합계":  3712,"인구수": 470000, "인구10만명당발생건수":  790 },
  { "시군구코드": "41500", "시군구명": "이천시",     "5대범죄합계":  1848,"인구수": 220000, "인구10만명당발생건수":  840 },
  { "시군구코드": "41550", "시군구명": "안성시",     "5대범죄합계":  1692,"인구수": 190000, "인구10만명당발생건수":  890 },
  { "시군구코드": "41570", "시군구명": "김포시",     "5대범죄합계":  3330,"인구수": 450000, "인구10만명당발생건수":  740 },
  { "시군구코드": "41590", "시군구명": "화성시",     "5대범죄합계":  6000,"인구수": 810000, "인구10만명당발생건수":  740 },
  { "시군구코드": "41610", "시군구명": "광주시",     "5대범죄합계":  2560,"인구수": 330000, "인구10만명당발생건수":  790 },
  { "시군구코드": "41630", "시군구명": "양주시",     "5대범죄합계":  2052,"인구수": 230000, "인구10만명당발생건수":  890 },
  { "시군구코드": "41650", "시군구명": "포천시",     "5대범죄합계":  1584,"인구수": 160000, "인구10만명당발생건수":  990 },
  { "시군구코드": "41670", "시군구명": "여주시",     "5대범죄합계":   924,"인구수": 105000, "인구10만명당발생건수":  880 },
  { "시군구코드": "41800", "시군구명": "연천군",     "5대범죄합계":   448,"인구수":  65000, "인구10만명당발생건수":  690 },
  { "시군구코드": "41820", "시군구명": "가평군",     "5대범죄합계":   360,"인구수":  61000, "인구10만명당발생건수":  590 },
  { "시군구코드": "41830", "시군구명": "양평군",     "5대범죄합계":   594,"인구수": 108000, "인구10만명당발생건수":  540 },
];

/**
 * Reads data/crime-stats.xlsx (sheet: "시군구범죄현황").
 * Returns Map<시군구명, 인구10만명당발생건수>.
 * Creates a sample file if missing.
 */
export async function loadCrimeStats(): Promise<Map<string, number>> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const xlsxPath = path.join(DATA_DIR, "crime-stats.xlsx");
  let rows: Record<string, unknown>[];
  try {
    rows = readXlsxSheet(xlsxPath, "시군구범죄현황");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      writeXlsxSheet(xlsxPath, "시군구범죄현황", CRIME_STATS_SAMPLE);
      warn("district-score-lib: data/crime-stats.xlsx 없음 → 샘플 파일 생성. 경찰청 범죄통계 연보로 업데이트하세요.");
      rows = CRIME_STATS_SAMPLE;
    } else throw error;
  }
  const result = new Map<string, number>();
  for (const row of rows) {
    const name = typeof row["시군구명"] === "string" ? row["시군구명"].trim() : null;
    const rate = numeric(row["인구10만명당발생건수"]);
    if (name && rate != null) result.set(name, rate);
  }
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
