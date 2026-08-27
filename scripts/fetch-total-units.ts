import fs from "node:fs/promises";
import path from "node:path";
import {
  info,
  warn,
  quote,
  writeSqlFile,
  OUTPUT_DIR,
  ensureOutputDir,
  paramsToUrl,
  fetchJsonWithRetry,
  getSigunguCodeMap,
} from "./district-score-lib";
import type { AptComplexState } from "./07-fetch-apt-complexes";

const DELAY_SIGUNGU_MS = 200;
const DELAY_BATCH_MS = 100;   // delay between concurrent batches
const CONCURRENCY = 20;       // parallel fetchHoCnt calls per batch
const RETRIES = 2;
const SERVICE_KEY = process.env.KAPT_API_KEY ?? "";

const LIST_URL = "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const DETAIL_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";

// districtCode 앞 2자리는 geojson의 adm_cd 체계(vworld 구코드)라 시도명과 다르다.
// 주의: districtCode prefix와 KAPT 코드 체계가 다름 (경기 31→41, 인천 23→28)
const SIDO_PREFIX_TO_NAME: Record<string, string> = {
  "11": "서울특별시",
  "31": "경기도",
  "23": "인천광역시",
};

function getSigunguCode(sigungu: string, districtCode: string | null): string | undefined {
  const sidoPrefix = districtCode?.slice(0, 2);
  const sidoName = sidoPrefix ? SIDO_PREFIX_TO_NAME[sidoPrefix] : undefined;
  if (!sidoName) return undefined;
  return getSigunguCodeMap().get(`${sidoName}:${sigungu}`);
}

interface ListItem {
  kaptCode?: string;
  kaptName?: string;
  bjdCode?: string;
  as3?: string;
}

interface ListBody {
  items?: { item?: ListItem | ListItem[] } | ListItem[];
  totalCount?: string | number;
}

interface ListResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: ListBody;
  };
}

interface KaptEntry {
  kaptCode: string;
  kaptName: string;
  bjdCode: string;
  as3: string;
}

interface DetailBody {
  item?: { kaptdCccnt?: string | number };
  items?: { item?: { kaptdCccnt?: string | number } };
}

interface DetailResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: DetailBody;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractListItems(body: ListBody): ListItem[] {
  const raw = body.items;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const item = (raw as { item?: ListItem | ListItem[] }).item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function parseNumber(v: string | number | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/아파트/gu, "")
    .replace(/주상복합/gu, "")
    .replace(/\s+/g, "")
    .replace(/[·._,'"·\-]/g, "")
    .replace(/viii/gi, "8")
    .replace(/vii/gi, "7")
    .replace(/vi/gi, "6")
    .replace(/iv/gi, "4")
    .replace(/iii/gi, "3")
    .replace(/ii/gi, "2")
    .toLowerCase();
}

function nameVariants(norm: string): string[] {
  const variants = new Set([norm]);
  const toDanji = norm.replace(/(\d+)차$/, "$1단지");
  if (toDanji !== norm) variants.add(toDanji);
  const toCha = norm.replace(/(\d+)단지$/, "$1차");
  if (toCha !== norm) variants.add(toCha);
  return [...variants];
}

function findKaptCode(aptName: string, entries: KaptEntry[]): string | undefined {
  const normApt = normalizeName(aptName);
  const aptVars = nameVariants(normApt);

  // Step 1: exact
  for (const e of entries) {
    const normKapt = normalizeName(e.kaptName);
    if (aptVars.some((v) => v === normKapt)) return e.kaptCode;
  }

  // Step 2: contains (한쪽이 다른쪽 포함)
  for (const e of entries) {
    const normKapt = normalizeName(e.kaptName);
    if (aptVars.some((v) => normKapt.includes(v) || v.includes(normKapt))) return e.kaptCode;
  }

  // Step 3: dong_strip — kaptName에서 as3(동이름) 제거 후 재시도
  for (const e of entries) {
    if (!e.as3) continue;
    const normAs3 = normalizeName(e.as3);
    if (!normAs3) continue;
    const normKapt = normalizeName(e.kaptName);
    if (!normKapt.startsWith(normAs3)) continue;
    const stripped = normKapt.slice(normAs3.length);
    if (!stripped) continue;
    if (aptVars.some((v) => v === stripped || stripped.includes(v) || v.includes(stripped))) {
      return e.kaptCode;
    }
  }

  // Step 4: space_apt — kaptName의 "아파트" + 공백 제거 후 재시도
  for (const e of entries) {
    const cleaned = normalizeName(e.kaptName.replace(/\s*아파트\s*/gu, ""));
    if (aptVars.some((v) => v === cleaned || cleaned.includes(v) || v.includes(cleaned))) {
      return e.kaptCode;
    }
  }

  return undefined;
}

function topCandidates(aptName: string, entries: KaptEntry[], n: number): string[] {
  const normApt = normalizeName(aptName);
  const aptBigrams = new Set<string>();
  for (let i = 0; i < normApt.length - 1; i++) aptBigrams.add(normApt.slice(i, i + 2));
  return entries
    .map((e) => {
      const normKapt = normalizeName(e.kaptName);
      let common = 0;
      for (let i = 0; i < normKapt.length - 1; i++) {
        if (aptBigrams.has(normKapt.slice(i, i + 2))) common++;
      }
      return { name: e.kaptName, score: common };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.name);
}

// ── Step 1: 시군구코드별 단지 목록 수집 ──────────────────────────────────────

async function fetchListPage(
  sigunguCode: string,
  pageNo: number,
): Promise<{ items: ListItem[]; totalCount: number }> {
  const url = paramsToUrl(LIST_URL, {
    serviceKey: SERVICE_KEY,
    sigunguCode,
    numOfRows: "1000",
    pageNo: String(pageNo),
    _type: "json",
  });
  const res = await fetchJsonWithRetry<ListResponse>(url, { retries: RETRIES, timeoutMs: 15000 });
  const body = res?.response?.body;
  if (!body) return { items: [], totalCount: 0 };
  return { items: extractListItems(body), totalCount: Number(body.totalCount ?? 0) };
}

async function fetchAllForSigungu(sigunguCode: string): Promise<ListItem[]> {
  const first = await fetchListPage(sigunguCode, 1);
  if (!first.items.length && first.totalCount === 0) return [];
  const totalPages = Math.max(1, Math.ceil(first.totalCount / 1000));
  const all = [...first.items];
  for (let p = 2; p <= totalPages; p++) {
    await delay(DELAY_SIGUNGU_MS);
    const res = await fetchListPage(sigunguCode, p);
    all.push(...res.items);
  }
  return all;
}

// ── Step 2: kaptCode로 세대수 조회 ───────────────────────────────────────────

let _nullBodyCount = 0;

async function fetchHoCnt(kaptCode: string): Promise<number | null> {
  const url = paramsToUrl(DETAIL_URL, {
    serviceKey: SERVICE_KEY,
    kaptCode,
    _type: "json",
  });
  const res = await fetchJsonWithRetry<DetailResponse>(url, { retries: RETRIES, timeoutMs: 15000 });
  const header = res?.response?.header;
  if (header?.resultCode && header.resultCode !== "00") {
    warn(`fetch-total-units: API 오류 code=${header.resultCode} msg=${header.resultMsg ?? ""} kaptCode=${kaptCode}`);
    return null;
  }
  const body = res?.response?.body;
  const bodyItem = body?.item ?? body?.items?.item;
  const hoCnt = parseNumber(bodyItem?.kaptdCccnt);
  if (hoCnt == null) {
    _nullBodyCount++;
    if (_nullBodyCount <= 3) {
      warn(`fetch-total-units: kaptdCccnt null [${_nullBodyCount}] kaptCode=${kaptCode} body=${JSON.stringify(body ?? null).slice(0, 300)}`);
    }
  }
  return hoCnt;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  await ensureOutputDir();

  const aptState = JSON.parse(
    await fs.readFile(path.join(OUTPUT_DIR, "apt-complexes.state.json"), "utf8"),
  ) as AptComplexState[];

  // sigungu 이름 + districtCode 앞 2자리(시도) → KAPT 시군구코드
  const sigunguCodes = new Set<string>();
  for (const apt of aptState) {
    const code = getSigunguCode(apt.sigungu, apt.districtCode ?? null);
    if (code) sigunguCodes.add(code);
  }
  info(`fetch-total-units: 수집 대상 시군구코드 ${sigunguCodes.size}개`);

  // Step 1: 시군구코드별 KaptEntry 목록 구축 (bjdCode + as3 포함)
  const kaptLookup = new Map<string, KaptEntry[]>(); // sigunguCode → KaptEntry[]

  let sigunguIdx = 0;
  for (const sigunguCode of sigunguCodes) {
    sigunguIdx++;
    try {
      const items = await fetchAllForSigungu(sigunguCode);
      const entries: KaptEntry[] = [];
      for (const item of items) {
        if (!item.kaptCode || !item.kaptName) continue;
        entries.push({
          kaptCode: item.kaptCode,
          kaptName: item.kaptName,
          bjdCode: item.bjdCode ?? "",
          as3: item.as3 ?? "",
        });
      }
      kaptLookup.set(sigunguCode, entries);
      info(`fetch-total-units: [${sigunguIdx}/${sigunguCodes.size}] ${sigunguCode} — ${items.length}개 단지`);
    } catch (err) {
      warn(`fetch-total-units: ${sigunguCode} 목록 실패 — ${err instanceof Error ? err.message : String(err)}`);
    }
    await delay(DELAY_SIGUNGU_MS);
  }

  const kaptTotal = [...kaptLookup.values()].reduce((sum, arr) => sum + arr.length, 0);
  info(`fetch-total-units: Step 1 완료 — 시군구 ${kaptLookup.size}개, 수집 단지 총 ${kaptTotal}개`);

  // Step 2: apt 단지명으로 kaptCode 매칭 (bjdCode 기반 4단계 매칭)
  const matched: Array<{ apt: AptComplexState; kaptCode: string }> = [];
  const unmatched: Array<{ id: string; name: string; sigungu: string; sigunguCode: string | undefined }> = [];

  for (const apt of aptState) {
    const sigunguCode = getSigunguCode(apt.sigungu, apt.districtCode ?? null);
    const entries = sigunguCode ? kaptLookup.get(sigunguCode) : undefined;
    if (!entries) {
      unmatched.push({ id: apt.id, name: apt.name, sigungu: apt.sigungu, sigunguCode });
      continue;
    }
    const foundCode = findKaptCode(apt.name, entries);
    if (foundCode) {
      matched.push({ apt, kaptCode: foundCode });
    } else {
      unmatched.push({ id: apt.id, name: apt.name, sigungu: apt.sigungu, sigunguCode });
    }
  }
  info(`fetch-total-units: 단지명 매칭 완료 — ${matched.length}개 매칭, ${unmatched.length}개 미매칭`);

  // Step 2: 매칭된 단지 세대수 조회 — CONCURRENCY개씩 병렬 호출
  const sqlLines: string[] = [];
  let detailIdx = 0;
  let nullHoCntCount = 0;

  for (let i = 0; i < matched.length; i += CONCURRENCY) {
    const batch = matched.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ apt, kaptCode }) => {
        try {
          return { apt, hoCnt: await fetchHoCnt(kaptCode) };
        } catch (err) {
          warn(`fetch-total-units: ${apt.name} (${kaptCode}) 세대수 실패 — ${err instanceof Error ? err.message : String(err)}`);
          return { apt, hoCnt: null as number | null };
        }
      }),
    );
    const prevIdx = detailIdx;
    for (const { apt, hoCnt } of batchResults) {
      detailIdx++;
      if (hoCnt != null) {
        sqlLines.push(`UPDATE apt_complexes SET total_units=${hoCnt} WHERE id=${quote(apt.id)};`);
      } else {
        nullHoCntCount++;
      }
    }
    if (Math.floor(prevIdx / 500) !== Math.floor(detailIdx / 500) || detailIdx === matched.length) {
      info(`fetch-total-units: 세대수 조회 ${detailIdx}/${matched.length}건 완료 (성공 ${sqlLines.length}, null ${nullHoCntCount})`);
    }
    await delay(DELAY_BATCH_MS);
  }
  info(`fetch-total-units: 세대수 조회 완료 — 성공 ${sqlLines.length}건 / hoCnt없음 ${nullHoCntCount}건`);

  await writeSqlFile("update-total-units.sql", `${sqlLines.join("\n")}\n`);

  const matchRate = aptState.length > 0 ? ((matched.length / aptState.length) * 100).toFixed(1) : "0.0";
  info(`fetch-total-units: 총 ${aptState.length}개 중 ${matched.length}개 매칭 (${matchRate}%), SQL ${sqlLines.length}개 생성`);
  info("fetch-total-units: 미매칭 샘플 (KAPT 후보):");
  for (const u of unmatched.slice(0, 10)) {
    const entries = u.sigunguCode ? kaptLookup.get(u.sigunguCode) : undefined;
    const candidates = entries ? topCandidates(u.name, entries, 3) : [];
    const candidatesStr = candidates.length > 0 ? JSON.stringify(candidates) : "(시군구 미매칭)";
    info(`  [debug] 매칭실패: "${u.name}" | KAPT후보: ${candidatesStr}`);
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "update-total-units.report.json"),
    `${JSON.stringify({
      aptRows: aptState.length,
      sigunguCodes: sigunguCodes.size,
      kaptTotal,
      matched: matched.length,
      sqlGenerated: sqlLines.length,
      matchRate: `${matchRate}%`,
      unmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 10),
    }, null, 2)}\n`,
    "utf8",
  );

  info("fetch-total-units: wrote output/update-total-units.sql and output/update-total-units.report.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
