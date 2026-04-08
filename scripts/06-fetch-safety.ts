import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  fetchJsonWithRetry,
  flushWarningSummary,
  info,
  loadState,
  nearestDistance,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  parseJsonItems,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  round,
  text,
  CAPITAL_SIDO_NAMES,
} from "./district-score-lib";

interface CctvPoint { lat: number; lng: number; cameras: number; }
interface ChildZonePoint { lat: number; lng: number; }

const CCTV_API_KEY = process.env.CCTV_API_KEY;
const SAFETY_INDEX_API_KEY = process.env.SAFETY_INDEX_API_KEY;
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;

const GRADE_SCORE: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 };

// 법정동 시군구코드(5자리) → 시군구명 — DONG_CD 앞 5자리로 매핑 (수도권 전용)
const LEGAL_SIGUNGU_CODE_TO_NAME = new Map<string, string>([
  // 서울 (시도코드 11)
  ["11110", "종로구"], ["11140", "중구"],    ["11170", "용산구"],  ["11200", "성동구"],
  ["11215", "광진구"], ["11230", "동대문구"], ["11260", "중랑구"],  ["11290", "성북구"],
  ["11305", "강북구"], ["11320", "도봉구"],  ["11350", "노원구"],  ["11380", "은평구"],
  ["11410", "서대문구"],["11440", "마포구"], ["11470", "양천구"],  ["11500", "강서구"],
  ["11530", "구로구"], ["11545", "금천구"],  ["11560", "영등포구"],["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"],  ["11680", "강남구"],  ["11710", "송파구"],
  ["11740", "강동구"],
  // 인천 (시도코드 28)
  ["28110", "중구"],   ["28140", "동구"],    ["28170", "미추홀구"],["28185", "연수구"],
  ["28200", "남동구"], ["28237", "부평구"],  ["28245", "계양구"],  ["28260", "서구"],
  ["28710", "강화군"], ["28720", "옹진군"],
  // 경기 (시도코드 41)
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

async function fetchCctv(): Promise<CctvPoint[]> {
  if (!CCTV_API_KEY) {
    warn("06-fetch-safety: CCTV_API_KEY missing, CCTV metrics will be zeroed");
    return [];
  }

  const rows: CctvPoint[] = [];
  let skippedMissingCoords = 0;
  let totalFetched = 0;
  let totalCount = Infinity;
  try {
    for (let pageIndex = 1; totalFetched < totalCount; pageIndex += 1) {
      const url = paramsToUrl("https://www.safetydata.go.kr/V2/api/DSSP-IF-20011", {
        serviceKey: CCTV_API_KEY,
        pageIndex,
        pageSize: 1000,
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 15000, legacyTls: true }) as Record<string, unknown>;
      // Use raw payload to read totalCount before extracting items
      if (typeof payload?.totalCount === "number" && pageIndex === 1) totalCount = payload.totalCount;
      const items = parseJsonItems(payload);
      if (!items.length) break;
      totalFetched += items.length;
      for (const item of items) {
        // Support both legacy lowercase and current UPPERCASE field names
        const cameraType = text(item.CAMERA_TYPE ?? item.cameraType) ?? "";
        const instlPurpose = text(item.INSTL_PURPOSE ?? item.instlPurpose) ?? "";
        // If filter fields are present, apply crime-prevention filter; otherwise include all
        const hasFilterFields = (item.CAMERA_TYPE ?? item.cameraType ?? item.INSTL_PURPOSE ?? item.instlPurpose) != null;
        if (hasFilterFields && cameraType !== "방범용" && instlPurpose !== "범죄예방") continue;
        const lat = numeric(item.INSTL_YCRD ?? item.latitude ?? item.lat);
        const lng = numeric(item.INSTL_XCRD ?? item.longitude ?? item.lng);
        if (lat == null || lng == null) {
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
    warn(`06-fetch-safety: CCTV API failed (${error instanceof Error ? error.message : String(error)}), using ${rows.length} partial results`);
  }
  flushWarningSummary("06-fetch-safety", "CCTV rows with missing coordinates", skippedMissingCoords);
  return rows;
}

async function fetchChildZones(): Promise<ChildZonePoint[]> {
  const rows: ChildZonePoint[] = [];
  let skippedMissingCoords = 0;
  try {
    for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
      const url = paramsToUrl("http://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api", {
        serviceKey: SERVICE_KEY,
        pageNo,
        numOfRows: 1000,
        type: "json",
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 15000 });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        const lat = numeric(item.la);
        const lng = numeric(item.lo);
        if (lat == null || lng == null) {
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
    warn(`06-fetch-safety: child zone API failed (${error instanceof Error ? error.message : String(error)}), using ${rows.length} partial results`);
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
  try {
    // Fetch all pages (API returns ~972 entries: 250 시군구 × multiple years)
    for (let pageIndex = 1; pageIndex <= 20; pageIndex += 1) {
      const url = paramsToUrl("https://www.safetydata.go.kr/V2/api/DSSP-IF-00421", {
        serviceKey: SAFETY_INDEX_API_KEY,
        pageIndex,
        pageSize: 100,
      });
      const payload = await fetchJsonWithRetry(url, { timeoutMs: 15000, legacyTls: true });
      const items = parseJsonItems(payload);
      if (!items.length) break;
      for (const item of items) {
        // DONG_CD: 10-digit code; first 5 digits = 시도(2)+시군구(3) = 법정동 시군구코드
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
    warn(`06-fetch-safety: safety index API failed (${error instanceof Error ? error.message : String(error)}), using 0 safety index rows`);
  }
  return result;
}

function applySafetyScores(districts: DistrictState[], cctvs: CctvPoint[], childZones: ChildZonePoint[], safetyIndex: Map<string, number>) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const cctvCount500m = cctvs.length ? countWithin(point, cctvs, 500, (row) => row.cameras) : 0;
    const cctvDistanceM = cctvs.length ? nearestDistance(point, cctvs) : null;
    const childZoneCount1km = childZones.length ? countWithin(point, childZones, 1000) : 0;
    const safetyIndexScore = safetyIndex.get(district.sigungu) ?? 0;
    district.raw_safety = { cctvCount500m, cctvDistanceM, childZoneCount1km, safetyIndexScore };
  }

  const cctvCountNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.cctvCount500m ?? null, false);
  const cctvDistanceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.cctvDistanceM ?? null, true);
  const childZoneNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_safety?.childZoneCount1km ?? null, false);

  const hasCctv = cctvs.length > 0;
  const hasSafetyIndex = safetyIndex.size > 0;

  for (const district of districts) {
    const safetyIndexScore = safetyIndex.get(district.sigungu) ?? 0;
    if (hasCctv && hasSafetyIndex) {
      district.s_safety = round(
        (cctvCountNorm.get(district) ?? 0) * 0.35 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.20 +
          (childZoneNorm.get(district) ?? 0) * 0.20 +
          safetyIndexScore * 0.25,
        2
      );
      continue;
    }
    if (hasCctv) {
      district.s_safety = round(
        (cctvCountNorm.get(district) ?? 0) * 0.47 +
          (cctvDistanceNorm.get(district) ?? 0) * 0.27 +
          (childZoneNorm.get(district) ?? 0) * 0.26,
        2
      );
      continue;
    }
    if (hasSafetyIndex) {
      district.s_safety = round((childZoneNorm.get(district) ?? 0) * 0.30 + safetyIndexScore * 0.70, 2);
      continue;
    }
    district.s_safety = round(childZoneNorm.get(district) ?? 0, 2);
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const [safetyIndex, cctvs, childZones] = await Promise.all([fetchSafetyIndex(), fetchCctv(), fetchChildZones()]);
  if (!cctvs.length && !childZones.length && safetyIndex.size === 0) {
    throw new Error("06-fetch-safety: no safety source data fetched; refusing to overwrite existing scores");
  }
  applySafetyScores(districts, cctvs, childZones, safetyIndex);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("06-safety.sql", buildUpdateSql(districts, ["s_safety", "raw_safety"]));
  info(`06-fetch-safety: cctv=${cctvs.length}, childZones=${childZones.length}, safetyIndex=${safetyIndex.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
