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

const CCTV_API_KEY = process.env.CCTV_API_KEY;
const SAFETY_INDEX_API_KEY = process.env.SAFETY_INDEX_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const CCTV_API_BASE_URL = "https://www.safetydata.go.kr/V2/api/DSSP-IF-20011";
const SAFETY_INDEX_API_BASE_URL = "https://www.safetydata.go.kr/V2/api/DSSP-IF-00421";

const GRADE_SCORE: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 };

const LEGAL_SIGUNGU_CODE_TO_NAME = new Map<string, string>([
  ["11110", "종로구"], ["11140", "중구"],    ["11170", "용산구"],  ["11200", "성동구"],
  ["11215", "광진구"], ["11230", "동대문구"], ["11260", "중랑구"],  ["11290", "성북구"],
  ["11305", "강북구"], ["11320", "도봉구"],  ["11350", "노원구"],  ["11380", "은평구"],
  ["11410", "서대문구"],["11440", "마포구"], ["11470", "양천구"],  ["11500", "강서구"],
  ["11530", "구로구"], ["11545", "금천구"],  ["11560", "영등포구"],["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"],  ["11680", "강남구"],  ["11710", "송파구"],
  ["11740", "강동구"],
  ["28110", "중구"],   ["28140", "동구"],    ["28177", "미추홀구"],["28185", "연수구"],
  ["28200", "남동구"], ["28237", "부평구"],  ["28245", "계양구"],  ["28260", "서구"],
  ["28710", "강화군"], ["28720", "옹진군"],
  ["41110", "수원시"], ["41130", "성남시"],  ["41150", "의정부시"],["41170", "안양시"],
  ["41190", "부천시"], ["41210", "광명시"],  ["41220", "평택시"],  ["41250", "동두천시"],
  ["41270", "안산시"], ["41280", "고양시"],  ["41290", "과천시"],  ["41310", "구리시"],
  ["41360", "남양주시"],["41370", "오산시"], ["41390", "시흥시"],  ["41410", "군포시"],
  ["41430", "의왕시"], ["41450", "하남시"],  ["41460", "용인시"],  ["41480", "파주시"],
  ["41500", "이천시"], ["41550", "안성시"],  ["41570", "김포시"],  ["41590", "화성시"],
  ["41610", "광주시"], ["41630", "양주시"],  ["41650", "포천시"],  ["41670", "여주시"],
  ["41800", "연천군"], ["41820", "가평군"],  ["41830", "양평군"],
]);

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
  if (!CCTV_API_KEY) {
    warn("06-fetch-safety: CCTV_API_KEY missing, CCTV metrics will be zeroed");
    return [];
  }

  const rows: CctvPoint[] = [];
  let skippedMissingCoords = 0;
  let totalFetched = 0;
  let totalCount = Infinity;
  const probeUrl = paramsToUrl(CCTV_API_BASE_URL, { serviceKey: CCTV_API_KEY, pageIndex: 1, pageSize: 3 });
  const probe = await runCurlProbe(probeUrl, ["-k", "--tlsv1.2", "--max-time", "20"]);
  if (!probe.ok) {
    warn(`06-fetch-safety: CCTV V2 API (공통기반_CCTV_정보_기본) host/protocol probe failed errorCode=${probe.errorCode ?? "n/a"} stderr=${preview(probe.stderr)} message=${probe.errorMessage ?? "unknown"} note=host_or_tls_issue_before_permission_check`);
    return rows;
  }
  info(`06-fetch-safety: CCTV probe status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)}`);
  if ((probe.status != null && probe.status >= 400) || looksLikePermissionIssue(probe.body)) {
    warn(`06-fetch-safety: CCTV V2 API (공통기반_CCTV_정보_기본) appears to reject or gate this key status=${probe.status ?? "n/a"} content-type=${probe.contentType ?? "unknown"} body=${preview(probe.body)} note=permission_or_application_issue`);
    return rows;
  }
  try {
    for (let pageIndex = 1; totalFetched < totalCount; pageIndex += 1) {
      const url = paramsToUrl(CCTV_API_BASE_URL, {
        serviceKey: CCTV_API_KEY,
        pageIndex,
        pageSize: 1000,
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 15000, legacyTls: true }) as Record<string, unknown>;
      if (typeof payload?.totalCount === "number" && pageIndex === 1) totalCount = payload.totalCount;
      const items = parseJsonItems(payload);
      if (!items.length) break;
      totalFetched += items.length;
      for (const item of items) {
        const cameraType = text(item.CAMERA_TYPE ?? item.cameraType) ?? "";
        const instlPurpose = text(item.INSTL_PURPOSE ?? item.instlPurpose) ?? "";
        const hasFilterFields = (item.CAMERA_TYPE ?? item.cameraType ?? item.INSTL_PURPOSE ?? item.instlPurpose) != null;
        if (hasFilterFields && cameraType !== "방범용" && instlPurpose !== "범죄예방") continue;
        const lat = numeric(item.INSTL_YCRD ?? item.latitude ?? item.lat);
        const lng = numeric(item.INSTL_XCRD ?? item.longitude ?? item.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          skippedMissingCoords += 1;
          continue;
        }
        rows.push({ lat, lng, cameras: numeric(item.CAMERA_COUNT ?? item.cameraCount) ?? 1 });
      }
    }
  } catch (error) {
    if (isAuthFailure(error)) {
      throw new Error(`06-fetch-safety: CCTV_API_KEY rejected by CCTV API (${error instanceof Error ? error.message : String(error)})`);
    }
    warn(
      `06-fetch-safety: CCTV API failed message=${error instanceof Error ? error.message : String(error)} errorCode=${errorCodeOf(error) ?? "n/a"} cause=${errorCauseOf(error) ?? "n/a"} using=${rows.length}`
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
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 15000, legacyTls: true });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const dongCd = text(item.DONG_CD ?? item.dongCd);
        const gradeRaw = numeric(item.STATS_VL ?? item.safetyGrade ?? item.grade);
        if (!dongCd || gradeRaw == null) continue;
        const sggCode = dongCd.padStart(10, "0").slice(0, 5);
        const sggNm = LEGAL_SIGUNGU_CODE_TO_NAME.get(sggCode);
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
  const [safetyIndex, cctvs, childZones, crimeStats] = await Promise.all([
    fetchSafetyIndex(), fetchCctv(), fetchChildZones(), loadCrimeStats(),
  ]);
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
