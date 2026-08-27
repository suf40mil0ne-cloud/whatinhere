import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildUpdateSql,
  DATA_DIR,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchJsonWithRetry,
  flushWarningSummary,
  info,
  linearScore,
  loadCrimeStats,
  loadState,
  nearestDistance,
  numeric,
  paramsToUrl,
  parseJsonItems,
  round,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  text,
  CAPITAL_SIDO_NAMES,
  OUTPUT_DIR,
  ensureOutputDir,
  getSigunguCodeMap,
} from "./district-score-lib";

const execFile = promisify(execFileCallback);

interface CctvPoint { lat: number; lng: number; cameras: number; }
interface ChildZonePoint { lat: number; lng: number; }

interface CurlProbeResult {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  body: string;
  stderr: string;
  errorCode: string | null;
  errorMessage: string | null;
}

const SAFETY_INDEX_API_KEY = process.env.SAFETY_INDEX_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const CCTV_API_BASE_URL = "https://safety-proxy.vercel.app/api/cctv-admin";
const ALLOWED_CCTV_PURPOSES = new Set(["생활방범", "어린이보호", "방범"]);
const SAFETY_INDEX_API_BASE_URL = "https://safety-proxy.vercel.app/api/safety-index";

const GRADE_SCORE: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 };

let legalSigunguCodeToNameCache: Map<string, string> | null = null;

// 법정동코드(DONG_CD) 앞 5자리 → 시군구명. getSigunguCodeMap()("시도:시군구" → 코드)의 역방향.
function legalSigunguCodeToName(): Map<string, string> {
  if (legalSigunguCodeToNameCache) return legalSigunguCodeToNameCache;
  const reversed = new Map<string, string>();
  for (const [key, code] of getSigunguCodeMap()) {
    reversed.set(code, key.split(":")[1]);
  }
  legalSigunguCodeToNameCache = reversed;
  return reversed;
}

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^HTTP (401|403)\b/.test(message);
}

function preview(textValue: string): string {
  return textValue.replace(/\s+/g, " ").trim().slice(0, 300);
}

function errorCodeOf(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

function errorCauseOf(error: unknown): string | null {
  if (error && typeof error === "object" && "cause" in error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) return cause.message;
    if (cause != null) return String(cause);
  }
  return null;
}

function looksLikePermissionIssue(body: string): boolean {
  return /권한|신청|승인|access denied|not registered|servicekey|인증/i.test(body);
}

async function runCurlProbe(url: string, args: string[]): Promise<CurlProbeResult> {
  const marker = "__CURL_META__";
  try {
    const { stdout, stderr } = await execFile(
      "curl",
      ["-s", ...args, "-o", "-", "-w", `\n${marker}%{http_code}|%{content_type}`, url],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const output = stdout.toString();
    const markerIndex = output.lastIndexOf(`\n${marker}`);
    const body = markerIndex === -1 ? output : output.slice(0, markerIndex);
    const meta = markerIndex === -1 ? "" : output.slice(markerIndex + marker.length + 1).trim();
    const [statusRaw, contentTypeRaw] = meta.split("|");
    return {
      ok: true,
      status: Number(statusRaw) || null,
      contentType: contentTypeRaw || null,
      body,
      stderr: stderr.toString(),
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      ok: false,
      status: null,
      contentType: null,
      body: typeof err.stdout === "string" ? err.stdout : (err.stdout?.toString() ?? ""),
      stderr: typeof err.stderr === "string" ? err.stderr : (err.stderr?.toString() ?? ""),
      errorCode: err.code ?? null,
      errorMessage: err.message ?? String(error),
    };
  }
}

async function fetchCctv(): Promise<CctvPoint[]> {
  const rows: CctvPoint[] = [];
  let skippedMissingCoords = 0;
  const probeUrl = paramsToUrl(CCTV_API_BASE_URL, { page: 1, numOfRows: 3 });
  const probe = await runCurlProbe(probeUrl, ["--max-time", "20"]);
  if (!probe.ok) {
    warn(`06-fetch-safety: CCTV admin API probe failed errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} message=${probe.errorMessage ?? "unknown"}`);
    return rows;
  }
  info(`06-fetch-safety: CCTV admin probe status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`);
  if ((probe.status != null && probe.status >= 400) || looksLikePermissionIssue(probe.body)) {
    warn(`06-fetch-safety: CCTV admin API rejected status=${probe.status ?? "n/a"} body=${preview(probe.body)}`);
    return rows;
  }

  const CONCURRENCY = 8;
  const PAGE_SIZE = 100;

  function processItems(payload: unknown): void {
    for (const item of parseJsonItems(payload)) {
      const purpose = text(item.INSTL_PRPS_SE_NM) ?? "";
      if (!ALLOWED_CCTV_PURPOSES.has(purpose)) continue;
      const lat = numeric(item.WGS84_LAT);
      const lng = numeric(item.WGS84_LOT);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skippedMissingCoords += 1; continue; }
      if (lat < 36.9 || lat > 38.3 || lng < 126.0 || lng > 128.5) continue;
      rows.push({ lat, lng, cameras: numeric(item.CAM_CNTOM) ?? 1 });
    }
  }

  try {
    const firstUrl = paramsToUrl(CCTV_API_BASE_URL, { page: 1, numOfRows: PAGE_SIZE });
    const firstPayload = await fetchJsonWithRetry(firstUrl, { timeoutMs: 30000 }) as Record<string, unknown>;
    const apiBody = (firstPayload as any)?.response?.body;
    const totalCount: number = typeof apiBody?.totalCount === "number" ? apiBody.totalCount : 0;
    processItems(firstPayload);

    if (totalCount <= 0) {
      warn(`06-fetch-safety: CCTV admin API returned totalCount=${totalCount}, skipping remaining pages`);
      return rows;
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    info(`06-fetch-safety: CCTV admin totalCount=${totalCount} totalPages=${totalPages} concurrency=${CONCURRENCY}`);

    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
      const batch = remainingPages.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((page) => {
        const url = paramsToUrl(CCTV_API_BASE_URL, { page, numOfRows: PAGE_SIZE });
        return fetchJsonWithRetry(url, { timeoutMs: 30000 }) as Promise<Record<string, unknown>>;
      }));
      for (const result of results) {
        if (result.status === "rejected") {
          if (isAuthFailure(result.reason)) throw result.reason;
          warn(`06-fetch-safety: CCTV admin batch page failed message=${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          continue;
        }
        processItems(result.value);
      }
      if ((i / CONCURRENCY) % 50 === 49) {
        info(`06-fetch-safety: CCTV admin progress page=${batch[batch.length - 1]}/${totalPages} collected=${rows.length}`);
      }
    }
  } catch (error) {
    if (isAuthFailure(error)) {
      throw new Error(`06-fetch-safety: CCTV admin API rejected auth (${error instanceof Error ? error.message : String(error)})`);
    }
    warn(
      `06-fetch-safety: CCTV admin API failed message=${error instanceof Error ? error.message : String(error)} errorCode=${errorCodeOf(error) ?? "n/a"} cause=${errorCauseOf(error) ?? "n/a"} using=${rows.length}`
    );
  }
  flushWarningSummary("06-fetch-safety", "CCTV rows with missing coordinates", skippedMissingCoords);
  return rows;
}

async function fetchChildZones(): Promise<ChildZonePoint[]> {
  const rows: ChildZonePoint[] = [];
  let skippedMissingCoords = 0;
  const sampleUrl = paramsToUrl("https://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api", {
    serviceKey: SERVICE_KEY,
    pageNo: 1,
    numOfRows: 3,
    type: "json",
  });

  try {
    try {
      await fetchJsonWithRetry(sampleUrl, { timeoutMs: 15000 });
    } catch (error) {
      warn(
        `06-fetch-safety: child zone direct fetch failed before curl fallback message=${error instanceof Error ? error.message : String(error)} errorCode=${errorCodeOf(error) ?? "n/a"} cause=${errorCauseOf(error) ?? "n/a"} note=this usually indicates environment-specific TLS/network issues rather than JSON parsing`
      );
    }

    for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
      const url = paramsToUrl("https://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api", {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const probe = await runCurlProbe(url, ["-k", "--tlsv1.2", "--max-time", "20"]);
      if (pageNo === 1) {
        info(
          `06-fetch-safety: child zone page=${pageNo} status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} body=${preview(probe.body)}`
        );
      }
      if (!probe.ok) {
        warn(
          `06-fetch-safety: child zone transport failure page=${pageNo} errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} message=${probe.errorMessage ?? "unknown"} note=likely environment/network issue if the same key works elsewhere`
        );
        break;
      }
      if (probe.status != null && probe.status >= 400) {
        warn(`06-fetch-safety: child zone HTTP error page=${pageNo} status=${probe.status} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`);
        break;
      }
      let payload: any;
      try {
        payload = JSON.parse(probe.body);
      } catch (error) {
        warn(`06-fetch-safety: child zone JSON parse failed page=${pageNo} status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)} error=${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      const items = parseJsonItems(payload);
      if (pageNo === 1) {
        console.log('[debug] childzone first item keys:', Object.keys(items[0] || {}));
        console.log('[debug] childzone first item:', JSON.stringify(items[0] ?? null));
      }
      if (!items.length) {
        warn(`06-fetch-safety: child zone page=${pageNo} returned zero items after successful parse body=${preview(probe.body)}`);
        break;
      }
      for (const item of items) {
        const lat = parseFloat(item.la || item.latitude || item.LAT || item.grdLa || item.ctpvNm || '');
        const lng = parseFloat(item.lo || item.longitude || item.LOT || item.grdLo || item.loNm || '');
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          skippedMissingCoords += 1;
          continue;
        }
        const address = text(item.rdnmadr) ?? text(item.lnmadr);
        if (address && !CAPITAL_SIDO_NAMES.some((name) => address.includes(name))) continue;
        rows.push({ lat, lng });
      }
      if (items.length < 1000) break;
    }
  } catch (error) {
    warn(
      `06-fetch-safety: child zone API failed message=${error instanceof Error ? error.message : String(error)} errorCode=${errorCodeOf(error) ?? "n/a"} cause=${errorCauseOf(error) ?? "n/a"} using=${rows.length}`
    );
  }
  if (rows.length === 0) {
    warn("06-fetch-safety: child zones remain empty. Current evidence points to transport/TLS instability in this environment, not a la/lo vs latitude/longitude parsing bug.");
  }
  flushWarningSummary("06-fetch-safety", "child zones with missing coordinates", skippedMissingCoords);
  return rows;
}

async function fetchSafetyIndex(): Promise<Map<string, number>> {
  if (!SAFETY_INDEX_API_KEY) {
    warn("06-fetch-safety: SAFETY_INDEX_API_KEY missing, safety index will be zeroed");
    return new Map<string, number>();
  }

  const result = new Map<string, number>();
  const probeUrl = paramsToUrl(SAFETY_INDEX_API_BASE_URL, { serviceKey: SAFETY_INDEX_API_KEY, pageIndex: 1, pageSize: 3 });
  const probe = await runCurlProbe(probeUrl, ["-k", "--tlsv1.2", "--max-time", "20"]);
  if (!probe.ok) {
    warn(`06-fetch-safety: safety-index V2 API host/protocol probe failed errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} message=${probe.errorMessage ?? "unknown"} note=host_or_tls_issue_before_permission_check`);
    return result;
  }
  info(`06-fetch-safety: safety-index probe status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`);
  if ((probe.status != null && probe.status >= 400) || looksLikePermissionIssue(probe.body)) {
    warn(`06-fetch-safety: safety-index V2 API appears to reject or gate this key status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)} note=permission_or_application_issue`);
    return result;
  }
  try {
    for (let pageIndex = 1; pageIndex <= 20; pageIndex += 1) {
      const url = paramsToUrl(SAFETY_INDEX_API_BASE_URL, {
        serviceKey: SAFETY_INDEX_API_KEY,
        pageIndex,
        pageSize: 100,
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 30000 });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const dongCd = text(item.DONG_CD ?? item.dongCd);
        const gradeRaw = numeric(item.STATS_VL ?? item.safetyGrade ?? item.grade);
        if (!dongCd || gradeRaw == null) continue;
        const sggCode = dongCd.padStart(10, "0").slice(0, 5);
        const sggNm = legalSigunguCodeToName().get(sggCode);
        if (!sggNm) continue;
        const score = GRADE_SCORE[Math.round(gradeRaw)] ?? 0;
        if (!result.has(sggNm) || score > (result.get(sggNm) ?? 0)) result.set(sggNm, score);
      }
      if (items.length < 100) break;
    }
  } catch (error) {
    warn(
      `06-fetch-safety: safety index API failed message=${error instanceof Error ? error.message : String(error)} errorCode=${errorCodeOf(error) ?? "n/a"} cause=${errorCauseOf(error) ?? "n/a"} using=0`
    );
  }
  if (result.size === 0) warn("06-fetch-safety: safety-index V2 API returned zero mapped rows after a successful probe. This is either a 0-row response or a schema mismatch worth checking against the live payload.");
  return result;
}

function applySafetyScores(
  districts: DistrictState[],
  cctvs: CctvPoint[],
  childZones: ChildZonePoint[],
  safetyIndex: Map<string, number>,
  crimeStats: Map<string, number>
) {
  const hasCctv = cctvs.length > 0;
  const hasSafetyIndex = safetyIndex.size > 0;
  const hasCrimeStats = crimeStats.size > 0;

  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };

    const cctvCount500m    = hasCctv ? countWithin(point, cctvs, 500, (row) => row.cameras) : 0;
    const cctvDistanceM    = hasCctv ? nearestDistance(point, cctvs) : null;
    const childZoneCount1km = childZones.length ? countWithin(point, childZones, 1000) : 0;
    const safetyIndexScore  = safetyIndex.get(district.sigungu) ?? 0;
    const crimeRate         = crimeStats.get(district.sigungu) ?? null;

    district.raw_safety = { cctvCount500m, cctvDistanceM, childZoneCount1km, safetyIndexScore, crimeRate };

    // absolute scoring
    const cctvCountScore  = linearScore(cctvCount500m,  30,    0);  // 30개=100
    const cctvDistScore   = linearScore(cctvDistanceM,  50,  500);  // 50m=100, 500m=0
    const childZoneScore  = linearScore(childZoneCount1km, 3, 0);   // 3개=100
    // safetyIndexScore already 0–100 (GRADE_SCORE mapping)
    const crimeRateScore  = linearScore(crimeRate,     500, 3000);  // 500건이하=100, 3000건이상=0

    // proportional fallback: use only available components, normalize weights
    const components: Array<[number, number]> = [
      [childZoneScore, 0.15],
      ...(hasCctv       ? [[cctvCountScore, 0.25], [cctvDistScore, 0.10]] as [number, number][] : []),
      ...(hasSafetyIndex ? [[safetyIndexScore, 0.25]] as [number, number][] : []),
      ...(hasCrimeStats  ? [[crimeRateScore, 0.25]] as [number, number][] : []),
    ];
    const totalWeight = components.reduce((s, [, w]) => s + w, 0);
    district.s_safety = totalWeight > 0
      ? round(components.reduce((s, [score, w]) => s + score * w, 0) / totalWeight, 2)
      : 0;
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  let [safetyIndex, cctvs, childZones, crimeStats] = await Promise.all([
    fetchSafetyIndex(), fetchCctv(), fetchChildZones(), loadCrimeStats(),
  ]);
  // child zone API 부분 실패(페이지 중단) 시 캐시 우선 사용 (수집 코드 불변, main에서만 fallback) // FIXED
  try {
    const cached = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "safety-raw.json"), "utf8")) as { childZones?: ChildZonePoint[] };
    const cachedZones = cached.childZones ?? [];
    if (cachedZones.length > childZones.length) {
      childZones = cachedZones;
      info(`06-fetch-safety: child zone API partial (got ${childZones.length < cachedZones.length ? childZones.length : 0}), using cached ${cachedZones.length} zones from safety-raw.json`); // FIXED
    }
  } catch { /* no cache, use whatever was fetched */ }
  if (!cctvs.length && !childZones.length && safetyIndex.size === 0) {
    throw new Error("06-fetch-safety: no safety source data fetched; refusing to overwrite existing scores");
  }
  applySafetyScores(districts, cctvs, childZones, safetyIndex, crimeStats);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("06-safety.sql", buildUpdateSql(districts, ["s_safety", "raw_safety"]));
  await ensureOutputDir();
  const safetyIndexObj: Record<string, number> = {};
  safetyIndex.forEach((v, k) => { safetyIndexObj[k] = v; });
  await fs.writeFile(path.join(OUTPUT_DIR, "safety-raw.json"), JSON.stringify({ cctvs, childZones, safetyIndex: safetyIndexObj }, null, 2));
  info(`06-fetch-safety: cctv=${cctvs.length}, childZones=${childZones.length}, safetyIndex=${safetyIndex.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
