import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUpdateSql,
  DistrictState,
  fetchJsonWithRetry,
  flushWarningSummary,
  info,
  linearScore,
  loadState,
  nearestDistance,
  paramsToUrl,
  round,
  saveState,
  toMeters,
  updateOverallScores,
  warn,
  writeSqlFile,
  countWithin,
  OUTPUT_DIR,
  ensureOutputDir,
} from "./district-score-lib";
import type { AptComplexState } from "./07-fetch-apt-complexes";

interface ChildcareCenter {
  lat: number;
  lng: number;
  spare: number;
  sigungu: string;
  name?: string;
}

interface ElementarySchool {
  lat: number;
  lng: number;
  sido: string;
  source?: "neis" | "kakao";
}

interface Academy {
  lat: number;
  lng: number;
  realm: string;
  source: "exact" | "dong" | "sigungu";
}

interface Mall {
  lat: number;
  lng: number;
}

interface Pediatric {
  lat: number;
  lng: number;
}

interface Library {
  lat: number;
  lng: number;
}

const NEIS_API_KEY = process.env.NEIS_API_KEY ?? "9b61b187cc55411a90b99d802758e3a2";
const KA_HEADER = "sdk/1.0 os/web origin/https://whatsinhere.pages.dev";
const KAKAO_REQUEST_DELAY_MS = 50;
const GRID_CELL_SIZE_M = 500;
const PEDIATRIC_QUERY_RADIUS_M = 1400;
const MALL_LIBRARY_QUERY_RADIUS_M = 2400;

let _kakaoRLQueue = Promise.resolve();

async function waitForKakaoRateLimit(): Promise<void> {
  const prev = _kakaoRLQueue;
  let release!: () => void;
  _kakaoRLQueue = new Promise<void>((res) => { release = res; });
  await prev;
  await new Promise((r) => setTimeout(r, KAKAO_REQUEST_DELAY_MS));
  release();
}

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// "경기 성남시 분당구 ..." → "성남시분당구", "서울 강남구 ..." → "강남구"
function extractSigunguFromAddress(address: string): string {
  const parts = address.split(" ");
  const part1 = parts[1] ?? "";
  const part2 = parts[2] ?? "";
  if (part1.endsWith("시") && part2.endsWith("구")) return part1 + part2;
  return part1;
}

function metersPerLngDegree(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function buildGridKey(lat: number, lng: number, cellSizeM: number): string {
  const gx = Math.floor((lng * metersPerLngDegree(lat)) / cellSizeM);
  const gy = Math.floor((lat * 111320) / cellSizeM);
  return `${gx},${gy}`;
}

function buildGridCenters(aptState: AptComplexState[], cellSizeM: number): Array<{ key: string; lat: number; lng: number }> {
  const buckets = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const complex of aptState) {
    if (complex.lat == null || complex.lng == null) continue;
    const key = buildGridKey(complex.lat, complex.lng, cellSizeM);
    const bucket = buckets.get(key) ?? { latSum: 0, lngSum: 0, count: 0 };
    bucket.latSum += complex.lat;
    bucket.lngSum += complex.lng;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    lat: round(bucket.latSum / bucket.count, 7),
    lng: round(bucket.lngSum / bucket.count, 7),
  }));
}

async function kakaoFetch(url: string, key: string, retries = 2): Promise<Response> {
  const headers = { "Authorization": `KakaoAK ${key}`, "KA": KA_HEADER };
  let lastErr: Error = new Error("unknown");
  for (let i = 0; i <= retries; i++) {
    try {
      await waitForKakaoRateLimit();
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok || (res.status !== 429 && res.status < 500)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < retries) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchChildcareCentersFromKakao(aptState: AptComplexState[]): Promise<ChildcareCenter[]> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";
  if (!KAKAO_KEY) {
    warn("05-fetch-childcare: KAKAO_REST_API_KEY not set, childcare metrics will be zeroed");
    return [];
  }

  const seen = new Map<string, ChildcareCenter>(); // place_id → center (중복 제거)
  let reqCount = 0;
  let errCount = 0;

  for (const complex of aptState) {
    if (complex.lat == null || complex.lng == null) continue;

    for (const categoryCode of ["PS3", "SC4"] as const) {
      for (let page = 1; page <= 3; page++) {
        const url =
          `https://dapi.kakao.com/v2/local/search/category.json` +
          `?category_group_code=${categoryCode}` +
          `&x=${complex.lng}&y=${complex.lat}` +
          `&radius=1000&size=15&page=${page}&sort=distance`;
        try {
          const res = await kakaoFetch(url, KAKAO_KEY);
          reqCount++;
          if (!res.ok) { if (page === 1) errCount++; break; }

          const data = await res.json() as {
            documents: Array<{ id: string; y: string; x: string; place_name: string; address_name: string }>;
            meta: { is_end: boolean };
          };

          for (const doc of data.documents) {
            if (seen.has(doc.id)) continue;
            const lat = parseFloat(doc.y);
            const lng = parseFloat(doc.x);
            if (isNaN(lat) || isNaN(lng)) continue;
            const sigungu = extractSigunguFromAddress(doc.address_name ?? "");
            seen.set(doc.id, { lat, lng, spare: 0, sigungu, name: doc.place_name });
          }

          if (data.meta.is_end) break;
        } catch (e) {
          errCount++;
          break;
        }
      }
    }

    await new Promise((r) => setTimeout(r, 50));

    if (reqCount > 0 && reqCount % 500 === 0) {
      info(`05-fetch-childcare: Kakao childcare progress — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
    }
  }

  info(`05-fetch-childcare: Kakao childcare done — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
  if (errCount > 0) warn(`05-fetch-childcare: ${errCount} Kakao childcare requests failed`);
  return [...seen.values()];
}

async function fetchElementarySchools(): Promise<ElementarySchool[]> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";

  const officeConfigs = [
    { code: "B10", sido: "서울특별시" },
    { code: "J10", sido: "경기도" },
    { code: "E10", sido: "인천광역시" },
  ] as const;

  interface RawSchool { name: string; sido: string; la: number | null; lo: number | null; }
  const rawSchools: RawSchool[] = [];

  try {
    for (const office of officeConfigs) {
      for (let pIndex = 1; pIndex <= 20; pIndex += 1) {
        const url = paramsToUrl("https://open.neis.go.kr/hub/schoolInfo", {
          KEY: NEIS_API_KEY,
          Type: "json",
          ATPT_OFCDC_SC_CODE: office.code,
          pIndex,
          pSize: 1000,
        });
        const payload = await fetchJsonWithRetry(url, { timeoutMs: 10000 });
        const items: any[] = (payload as any)?.schoolInfo?.[1]?.row ?? [];
        if (!items.length) break;
        for (const item of items) {
          if ((item.SCHUL_KND_SC_NM ?? "") !== "초등학교") continue;
          const la = parseFloat(item.LA ?? "");
          const lo = parseFloat(item.LO ?? "");
          rawSchools.push({
            name: item.SCHUL_NM ?? "",
            sido: office.sido,
            la: (!isNaN(la) && la !== 0) ? la : null,
            lo: (!isNaN(lo) && lo !== 0) ? lo : null,
          });
        }
        if (items.length < 1000) break;
      }
    }
  } catch (error) {
    warn(`05-fetch-childcare: NEIS school API failed (${error instanceof Error ? error.message : String(error)})`);
  }

  const schools: ElementarySchool[] = [];
  let neisCount = 0;
  let kakaoCount = 0;
  let skippedCount = 0;
  let kakaoReqCount = 0;

  for (const raw of rawSchools) {
    if (raw.la !== null && raw.lo !== null) {
      schools.push({ lat: raw.la, lng: raw.lo, sido: raw.sido, source: "neis" });
      neisCount++;
      continue;
    }

    // 카카오 키워드 검색으로 실좌표 보완 (centroid fallback 없앰)
    if (!KAKAO_KEY) { skippedCount++; continue; }
    try {
      const query = encodeURIComponent(`${raw.name} ${raw.sido}`);
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${query}&category_group_code=SC4&size=1`;
      const res = await kakaoFetch(url, KAKAO_KEY);
      kakaoReqCount++;

      if (res.ok) {
        const data = await res.json() as { documents: Array<{ x: string; y: string }> };
        const doc = data.documents[0];
        if (doc) {
          const lat = parseFloat(doc.y);
          const lng = parseFloat(doc.x);
          if (!isNaN(lat) && !isNaN(lng)) {
            schools.push({ lat, lng, sido: raw.sido, source: "kakao" });
            kakaoCount++;
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
        }
      }
    } catch (e) { /* no-op */ }
    skippedCount++;

    if (kakaoReqCount > 0 && kakaoReqCount % 500 === 0) {
      info(`05-fetch-childcare: school Kakao progress — requests=${kakaoReqCount} found=${kakaoCount}`);
    }
  }

  info(`05-fetch-childcare: schools — neis=${neisCount} kakao=${kakaoCount} skipped=${skippedCount} total=${schools.length}`);
  flushWarningSummary("05-fetch-childcare", "elementary schools with unresolved coordinates", skippedCount);
  if (schools.length === 0) {
    warn("05-fetch-childcare: school API returned no elementary school rows for capital-area office codes");
  }
  return schools;
}

const ACADEMY_INCLUDE_KEYWORDS = [
  "국어", "수학", "영어", "과학", "사회", "논술", "독서", "한자",
  "음악", "미술", "체육", "태권도", "발레", "수영", "피아노",
  "영재", "보습", "입시", "학습", "예능", "외국어", "코딩", "컴퓨터",
  "바이올린", "첼로", "플루트", "기타", "드럼", "합창",
  "축구", "농구", "야구", "유도", "검도", "줄넘기",
];

const ACADEMY_EXCLUDE_KEYWORDS = [
  "애견", "미용", "요리", "요가", "필라테스", "골프", "당구",
  "운전", "자격증", "직업", "평생교육", "성인", "헬스",
  "웨딩", "꽃꽂이", "바리스타", "제과", "제빵", "네일",
];

function isEducationalAcademy(categoryName: string): boolean {
  if (ACADEMY_EXCLUDE_KEYWORDS.some((kw) => categoryName.includes(kw))) return false;
  return ACADEMY_INCLUDE_KEYWORDS.some((kw) => categoryName.includes(kw));
}

/**
 * 카카오 로컬 API (카테고리 검색 AC5=학원)를 이용해 각 아파트 단지 중심 1km 내
 * 학원을 수집한다. apt-complexes.state.json을 읽어 단지별로 검색하며,
 * place_id 기준 중복을 제거하여 전체 학원 목록을 반환한다.
 *
 * - 단지마다 최대 3페이지(=45건) 조회, 단지 간 50ms 딜레이
 * - Kakao free-tier 기준 일 300,000 req 이내 (단지 수 ≈ 14,000 × 3 = 42,000 req)
 */
async function fetchAcademies(): Promise<Academy[]> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";
  if (!KAKAO_KEY) {
    warn("05-fetch-childcare: KAKAO_REST_API_KEY not set, academy metrics will be zeroed");
    return [];
  }

  const aptState = await loadJson<AptComplexState[]>("apt-complexes.state.json");
  if (!aptState || aptState.length === 0) {
    warn("05-fetch-childcare: apt-complexes.state.json not found or empty, academy metrics will be zeroed");
    return [];
  }

  const seen = new Map<string, Academy>(); // place_id → Academy (중복 제거)
  let reqCount = 0;
  let errCount = 0;

  for (const complex of aptState) {
    if (complex.lat == null || complex.lng == null) continue;

    // 단지 중심 기준 최대 3페이지(=45건) × 반경 1000m
    for (let page = 1; page <= 3; page++) {
      try {
        const url =
          `https://dapi.kakao.com/v2/local/search/category.json` +
          `?category_group_code=AC5` +
          `&x=${complex.lng}&y=${complex.lat}` +
          `&radius=1000&size=15&page=${page}&sort=distance`;

        const res = await kakaoFetch(url, KAKAO_KEY);
        reqCount++;

        if (!res.ok) {
          if (page === 1) errCount++;
          break;
        }

        const data = await res.json() as {
          documents: Array<{ id: string; y: string; x: string; category_name: string }>;
          meta: { is_end: boolean; total_count: number };
        };

        for (const doc of data.documents) {
          if (seen.has(doc.id)) continue;
          const lat = parseFloat(doc.y);
          const lng = parseFloat(doc.x);
          if (isNaN(lat) || isNaN(lng)) continue;
          // category_name 예: "교육,학문 > 학원 > 수학학원" → realm = "수학학원"
          const parts = (doc.category_name ?? "").split(" > ");
          const realm = parts.length >= 3 ? parts[2] : (parts[parts.length - 1] ?? "기타");
          if (!isEducationalAcademy(doc.category_name ?? "")) continue;
          seen.set(doc.id, { lat, lng, realm, source: "exact" });
        }

        if (data.meta.is_end) break;
      } catch (e) {
        errCount++;
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 50)); // 단지 간 딜레이

    if (reqCount % 500 === 0 && reqCount > 0) {
      info(`05-fetch-childcare: Kakao academy progress — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
    }
  }

  info(`05-fetch-childcare: Kakao academy done — requests=${reqCount} unique=${seen.size} errors=${errCount}`);
  if (errCount > 0) warn(`05-fetch-childcare: ${errCount} Kakao requests failed`);
  return [...seen.values()];
}

const MALL_EXCLUDE_TERMS = [
  "이마트24", "롯데슈퍼", "홈플러스 익스프레스", "편의점", "슈퍼마켓", "익스프레스",
];
const LIBRARY_INCLUDE_TERMS = ["어린이", "공공", "시립", "구립", "군립"];
const LIBRARY_EXCLUDE_TERMS = ["학교", "대학", "사립", "전문"];

function isPublicLibrary(placeName: string): boolean {
  if (!placeName.includes("도서관")) return false;
  if (LIBRARY_EXCLUDE_TERMS.some((term) => placeName.includes(term))) return false;
  if (LIBRARY_INCLUDE_TERMS.some((term) => placeName.includes(term))) return true;
  return placeName.endsWith("도서관");
}

async function fetchMallsPediatricsLibraries(aptState: AptComplexState[]): Promise<{
  malls: Mall[];
  pediatrics: Pediatric[];
  libraries: Library[];
}> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";
  if (!KAKAO_KEY) {
    warn("05-fetch-childcare: KAKAO_REST_API_KEY not set, mall/pediatric/library metrics will be zeroed");
    return { malls: [], pediatrics: [], libraries: [] };
  }

  const seenMalls = new Map<string, Mall>();
  const seenPediatrics = new Map<string, Pediatric>();
  const seenLibraries = new Map<string, Library>();
  const gridCenters = buildGridCenters(aptState, GRID_CELL_SIZE_M);
  let reqCount = 0;
  let errCount = 0;
  let nextProgressLogAt = 500;

  type CallTag = "mall" | "pediatric" | "library";

  for (const grid of gridCenters) {
    const coord = `&x=${grid.lng}&y=${grid.lat}`;

    const pending: Promise<{ tag: CallTag; res: Response }>[] = [
      // MT1, CS2 각 2페이지 (4호출) — 브랜드 키워드 검색 대신 카테고리 검색
      ...["MT1", "CS2"].flatMap((code) =>
        [1, 2].map((page) =>
          kakaoFetch(
            `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}${coord}&radius=${MALL_LIBRARY_QUERY_RADIUS_M}&size=15&page=${page}`,
            KAKAO_KEY
          ).then((res) => ({ tag: "mall" as const, res }))
        )
      ),
      // HP8 소아과 2페이지 (2호출)
      ...[1, 2].map((page) =>
        kakaoFetch(
          `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8${coord}&radius=${PEDIATRIC_QUERY_RADIUS_M}&size=15&page=${page}&sort=distance`,
          KAKAO_KEY
        ).then((res) => ({ tag: "pediatric" as const, res }))
      ),
      // 도서관 키워드 (1호출)
      kakaoFetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent("도서관")}${coord}&radius=${MALL_LIBRARY_QUERY_RADIUS_M}&size=15`,
        KAKAO_KEY
      ).then((res) => ({ tag: "library" as const, res })),
    ];

    const settled = await Promise.allSettled(pending);
    reqCount += pending.length;

    for (const result of settled) {
      if (result.status === "rejected") { errCount++; continue; }
      const { tag, res } = result.value;
      if (!res.ok) { errCount++; continue; }
      try {
        const data = await res.json() as {
          documents: Array<{ id: string; y: string; x: string; place_name: string; category_name?: string }>;
        };
        for (const doc of data.documents) {
          const dlat = parseFloat(doc.y);
          const dlng = parseFloat(doc.x);
          if (isNaN(dlat) || isNaN(dlng)) continue;
          if (tag === "mall") {
            if (seenMalls.has(doc.id)) continue;
            if (MALL_EXCLUDE_TERMS.some((t) => doc.place_name.includes(t))) continue;
            seenMalls.set(doc.id, { lat: dlat, lng: dlng });
          } else if (tag === "pediatric") {
            if (seenPediatrics.has(doc.id)) continue;
            if (!doc.place_name.includes("소아") && !(doc.category_name ?? "").includes("소아")) continue;
            seenPediatrics.set(doc.id, { lat: dlat, lng: dlng });
          } else {
            if (seenLibraries.has(doc.id)) continue;
            if (!isPublicLibrary(doc.place_name)) continue;
            seenLibraries.set(doc.id, { lat: dlat, lng: dlng });
          }
        }
      } catch { errCount++; }
    }

    await new Promise((r) => setTimeout(r, KAKAO_REQUEST_DELAY_MS));
    if (reqCount >= nextProgressLogAt) {
      info(`05-fetch-childcare: mall/pediatric/library progress — requests=${reqCount} malls=${seenMalls.size} pediatrics=${seenPediatrics.size} libraries=${seenLibraries.size} errors=${errCount}`);
      nextProgressLogAt += 500;
    }
  }

  info(`05-fetch-childcare: mall/pediatric/library done — grids=${gridCenters.length} requests=${reqCount} malls=${seenMalls.size} pediatrics=${seenPediatrics.size} libraries=${seenLibraries.size} errors=${errCount}`);
  if (errCount > 0) warn(`05-fetch-childcare: ${errCount} mall/pediatric/library requests failed`);
  return {
    malls: [...seenMalls.values()],
    pediatrics: [...seenPediatrics.values()],
    libraries: [...seenLibraries.values()],
  };
}

function applyChildcareScores(
  districts: DistrictState[],
  centers: ChildcareCenter[],
  schools: ElementarySchool[],
  academies: Academy[],
  malls: Mall[],
  pediatrics: Pediatric[],
  libraries: Library[]
) {
  for (const district of districts) {
    if (district.center_lat == null || district.center_lng == null) continue;
    const point = { lat: district.center_lat, lng: district.center_lng };
    const sigunguCenters = centers.filter((row) => row.sigungu === district.sigungu);

    const childcareCount = countWithin(point, sigunguCenters, 1000);
    const elementaryDistanceM = schools.length
      ? nearestDistance(point, schools.filter((row) => row.sido === district.sido))
      : null;

    const nearbyAcademies = academies.filter((a) => {
      const d = Math.abs(a.lat - (district.center_lat ?? 0)) + Math.abs(a.lng - (district.center_lng ?? 0));
      return d < 0.02;
    });
    const academyCount1km = academies.length ? countWithin(point, academies, 1000) : 0;
    const uniqueRealms = new Set(
      nearbyAcademies
        .filter((a) => toMeters(point.lat, point.lng, a.lat, a.lng) <= 1000)
        .map((a) => a.realm)
    );
    const academyDiversityScore = uniqueRealms.size;
    const mallCount2km = malls.length ? countWithin(point, malls, 2000) : 0;
    const pediatricCount1km = pediatrics.length ? countWithin(point, pediatrics, 1000) : 0;
    const libraryExists2km = libraries.length ? (countWithin(point, libraries, 2000) > 0 ? 1 : 0) : 0;

    district.raw_childcare = {
      childcareCount,
      elementaryDistanceM,
      academyCount1km,
      academyDiversityScore,
      mallCount2km,
      pediatricCount1km,
      libraryExists2km,
    };

    const households = Math.max(district.households ?? 0, 1);
    const centerPerHousehold = round(childcareCount / households, 6);

    const centerScore   = linearScore(centerPerHousehold,  0.01,     0);
    const schoolScore   = linearScore(elementaryDistanceM,  400,  1500);
    const acaCountScore = linearScore(academyCount1km,      150,     0);
    const acaDivScore   = linearScore(academyDiversityScore,  5,     0);

    district.s_childcare = round(
      centerScore * 0.30 + schoolScore * 0.30 + acaCountScore * 0.25 + acaDivScore * 0.15, 2
    );
  }
}

async function testKakaoApi(): Promise<void> {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY ?? "";
  if (!KAKAO_KEY) { warn("05-fetch-childcare: KAKAO_REST_API_KEY not set"); return; }
  const lat = 37.5007;
  const lng = 127.0369;
  const tests: Array<{ name: string; url: string }> = [
    { name: "mall (MT1)",       url: `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=MT1&x=${lng}&y=${lat}&radius=${MALL_LIBRARY_QUERY_RADIUS_M}&size=5` },
    { name: "pediatric (HP8)", url: `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=HP8&x=${lng}&y=${lat}&radius=${PEDIATRIC_QUERY_RADIUS_M}&size=5` },
    { name: "library",         url: `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent("도서관")}&x=${lng}&y=${lat}&radius=${MALL_LIBRARY_QUERY_RADIUS_M}&size=5` },
    { name: "academy (AC5)",   url: `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=AC5&x=${lng}&y=${lat}&radius=1000&size=5` },
    { name: "childcare (PS3)", url: `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PS3&x=${lng}&y=${lat}&radius=1000&size=5` },
  ];
  info("05-fetch-childcare: --- KAKAO API TEST (역삼동 37.5007,127.0369) ---");
  for (const t of tests) {
    try {
      const res = await kakaoFetch(t.url, KAKAO_KEY);
      if (res.ok) {
        const data = await res.json() as { documents: unknown[]; meta: { total_count: number } };
        info(`  [OK] ${t.name}: total=${data.meta.total_count} first_batch=${data.documents.length}건`);
      } else {
        warn(`  [FAIL] ${t.name}: HTTP ${res.status}`);
      }
    } catch (e) {
      warn(`  [ERROR] ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  info("05-fetch-childcare: --- TEST END ---");
}

async function main() {
  if (process.argv.includes("--test")) { await testKakaoApi(); return; }

  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");

  const aptState = await loadJson<AptComplexState[]>("apt-complexes.state.json");
  if (!aptState || aptState.length === 0) {
    warn("05-fetch-childcare: apt-complexes.state.json not found or empty — childcare centers will be zeroed");
  }

  const [centers, schools, academies, { malls, pediatrics, libraries }] = await Promise.all([
    fetchChildcareCentersFromKakao(aptState ?? []),
    fetchElementarySchools(),
    fetchAcademies(),
    fetchMallsPediatricsLibraries(aptState ?? []),
  ]);

  applyChildcareScores(districts, centers, schools, academies, malls, pediatrics, libraries);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("05-childcare.sql", buildUpdateSql(districts, ["s_childcare", "raw_childcare"]));
  await ensureOutputDir();
  await fs.writeFile(
    path.join(OUTPUT_DIR, "childcare-raw.json"),
    JSON.stringify({ centers, schools, academies, malls, pediatrics, libraries }, null, 2)
  );
  info(`05-fetch-childcare: centers=${centers.length}, schools=${schools.length}, academies=${academies.length}, malls=${malls.length}, pediatrics=${pediatrics.length}, libraries=${libraries.length}`);
  if (centers.length === 0) warn("05-fetch-childcare: childcare centers dataset is empty");
  if (academies.length === 0) warn("05-fetch-childcare: academy dataset is empty after fetch");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
