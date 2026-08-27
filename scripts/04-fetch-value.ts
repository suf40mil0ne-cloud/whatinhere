import fs from "node:fs/promises";
import path from "node:path";
import type { AptComplexState } from "./07-fetch-apt-complexes";
import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  getSigunguCodeMap,
  info,
  lastRegionToken,
  loadState,
  median,
  numeric,
  OUTPUT_DIR,
  paramsToUrl,
  quote,
  round,
  saveState,
  sqlValue,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
} from "./district-score-lib";

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const PAGE_SIZE = 1000;

interface TradeRow {
  lawdCd: string;
  dong: string;
  aptNm: string;
  unitPrice: number;
}

function recentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function districtLawdCodes(districts: DistrictState[]): string[] {
  const missing = new Set<string>();
  const lawdCds = new Set<string>();
  for (const district of districts) {
    const key = `${district.sido}:${district.sigungu}`;
    const lawdCd = getSigunguCodeMap().get(key);
    if (lawdCd) lawdCds.add(lawdCd);
    else missing.add(key);
  }
  if (missing.size) warn(`04-fetch-value: missing LAWD_CD mapping for ${missing.size} sigungu(s): ${[...missing].slice(0, 10).join(", ")}`);
  return [...lawdCds].sort();
}

async function fetchTrades(lawdCds: string[]): Promise<TradeRow[]> {
  const rows: TradeRow[] = [];
  const months = recentMonths(12);
  for (const lawdCd of lawdCds) {
    for (const month of months) {
      for (let pageNo = 1; ; pageNo += 1) {
        const url = paramsToUrl("https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", {
          serviceKey: SERVICE_KEY,
          LAWD_CD: lawdCd,
          DEAL_YMD: month,
          pageNo,
          numOfRows: PAGE_SIZE,
        });
        try {
          const xml = await fetch(url).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          });
          const items = xmlItems(xml);
          const totalCount = numeric(xmlTag(xml, "totalCount"));
          for (const item of items) {
            const area = numeric(xmlTag(item, "excluUseAr"));
            const amount = numeric(xmlTag(item, "dealAmount"));
            const dong = lastRegionToken(xmlTag(item, "umdNm") ?? xmlTag(item, "umdNmNm") ?? xmlTag(item, "법정동") ?? "");
            if (!dong || area == null || amount == null || area <= 0) continue;
            rows.push({ lawdCd, dong, aptNm: xmlTag(item, "aptNm")?.trim() ?? "", unitPrice: amount / area });
          }
          if (!items.length) break;
          if (items.length < PAGE_SIZE) break;
          if (totalCount != null && pageNo * PAGE_SIZE >= totalCount) break;
        } catch (error) {
          warn(`04-fetch-value: ${lawdCd}/${month}/page=${pageNo} failed: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }
    }
  }
  return rows;
}

function assignValues(districts: DistrictState[], trades: TradeRow[]) {
  const districtLawdMap = new Map(districts.map((district) => [`${district.sido}:${district.sigungu}`, getSigunguCodeMap().get(`${district.sido}:${district.sigungu}`) ?? null]));
  const lawdMedian = new Map<string, number>();
  for (const lawdCd of [...new Set(trades.map((row) => row.lawdCd))]) {
    const value = median(trades.filter((row) => row.lawdCd === lawdCd).map((row) => row.unitPrice));
    if (value != null) lawdMedian.set(lawdCd, value);
  }

  for (const district of districts) {
    const lawdCd = districtLawdMap.get(`${district.sido}:${district.sigungu}`) ?? null;
    const ownTrades = lawdCd
      ? trades.filter((row) => row.lawdCd === lawdCd && row.dong === district.dong).map((row) => row.unitPrice)
      : [];
    const pricePerSqmMedian = lawdCd == null
      ? null
      : ownTrades.length >= 10
        ? median(ownTrades)
        : (lawdMedian.get(lawdCd) ?? null);
    district.raw_value = { pricePerSqmMedian };
  }
  // s_value는 99-merge-scores.ts에서 모든 점수 확정 후 계산
}

function normalizeAptName(name: string): string {
  let n = name
    .replace(/\s+/g, "")
    .replace(/아파트$/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[·•·ㆍ]/g, "")
    .replace(/제(\d)/g, "$1")
    .toLowerCase();
  // 로마자 → 아라비아 숫자 (긴 것부터 순서대로, 단어 경계 기준)
  n = n.replace(/\biv\b/g, "4").replace(/\biii\b/g, "3").replace(/\bii\b/g, "2").replace(/\bi\b/g, "1");
  return n;
}

// "N차" ↔ "N단지" 대체 이름 반환 (없으면 null)
function swapChaUnit(normName: string): string | null {
  const toDanji = normName.replace(/(\d+)차(?!\d)/g, "$1단지");
  if (toDanji !== normName) return toDanji;
  const toCha = normName.replace(/(\d+)단지(?!\d)/g, "$1차");
  if (toCha !== normName) return toCha;
  return null;
}

async function assignAptPrices(districts: DistrictState[], trades: TradeRow[]): Promise<void> {
  let aptState: AptComplexState[];
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, "apt-complexes.state.json"), "utf8");
    aptState = JSON.parse(raw) as AptComplexState[];
  } catch {
    warn("04-fetch-value: apt-complexes.state.json not found, skipping apt price assignment");
    return;
  }
  if (!aptState.length) return;

  const districtByCode = new Map(districts.map((d) => [d.code, d]));

  // dong을 키에서 제외: district.dong=행정동, API umdNm=법정동이라 거의 항상 불일치.
  // lawdCd(시군구) 범위로만 좁히고 단지명으로 매칭.
  const aptTrades = new Map<string, number[]>();
  for (const row of trades) {
    if (!row.aptNm) continue;
    const normName = normalizeAptName(row.aptNm);
    if (!normName) continue;
    const key = `${row.lawdCd}:${normName}`;
    const arr = aptTrades.get(key) ?? [];
    arr.push(row.unitPrice);
    aptTrades.set(key, arr);
  }

  const sqlLines = ["BEGIN TRANSACTION;"];
  const priceState: Array<{ id: string; avgPricePerM2: number }> = [];
  let matched = 0;
  const unmatched: string[] = [];

  for (const apt of aptState) {
    // 예정·미입주 단지는 실거래가 없으므로 스킵
    if (/예정/.test(apt.name)) continue;

    const district = apt.districtCode ? districtByCode.get(apt.districtCode) : null;
    if (!district) { unmatched.push(apt.name); continue; }
    const lawdCd = getSigunguCodeMap().get(`${district.sido}:${district.sigungu}`);
    if (!lawdCd) { unmatched.push(apt.name); continue; }

    const normName = normalizeAptName(apt.name);
    const sigunguPrefix = `${lawdCd}:`;

    function findByContainment(searchName: string): number[] | undefined {
      let bestKey: string | null = null;
      let bestLen = 0;
      for (const key of aptTrades.keys()) {
        if (!key.startsWith(sigunguPrefix)) continue;
        const keyName = key.slice(sigunguPrefix.length);
        if ((keyName.includes(searchName) || searchName.includes(keyName)) && keyName.length > bestLen) {
          bestKey = key;
          bestLen = keyName.length;
        }
      }
      return bestKey ? aptTrades.get(bestKey) : undefined;
    }

    // 1순위: 정규화된 이름 완전 일치
    let prices = aptTrades.get(`${sigunguPrefix}${normName}`);

    // 2순위: 포함 관계
    if (!prices) prices = findByContainment(normName);

    // 3순위: 차↔단지 변환 후 재시도
    if (!prices) {
      const altName = swapChaUnit(normName);
      if (altName) {
        prices = aptTrades.get(`${sigunguPrefix}${altName}`);
        if (!prices) prices = findByContainment(altName);
      }
    }

    if (prices && prices.length > 0) {
      const med = median(prices);
      if (med != null) {
        const price = round(med, 2);
        sqlLines.push(`UPDATE apt_complexes SET avg_price_per_m2 = ${sqlValue(price)} WHERE id = ${quote(apt.id)};`);
        priceState.push({ id: apt.id, avgPricePerM2: price });
        matched++;
        continue;
      }
    }
    unmatched.push(apt.name);
  }

  sqlLines.push("COMMIT;");
  await writeSqlFile("04-apt-prices.sql", `${sqlLines.join("\n")}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, "04-apt-prices.state.json"), JSON.stringify(priceState), "utf8");

  const total = aptState.length;
  const rate = total > 0 ? ((matched / total) * 100).toFixed(1) : "0.0";
  info(`04-fetch-value: apt complexes total=${total}, matched=${matched}, rate=${rate}%`);
  if (unmatched.length > 0) {
    info(`04-fetch-value: unmatched sample: ${unmatched.slice(0, 10).join(", ")}`);
  }
}

async function saveSggPrices(districts: DistrictState[], trades: TradeRow[]): Promise<void> {
  const lawdToSigungu = new Map<string, string>();
  for (const [key, lawdCd] of getSigunguCodeMap()) {
    if (!lawdToSigungu.has(lawdCd)) lawdToSigungu.set(lawdCd, key.split(":")[1]);
  }

  const lawdMedian = new Map<string, number>();
  for (const lawdCd of [...new Set(trades.map((r) => r.lawdCd))]) {
    const prices = trades.filter((r) => r.lawdCd === lawdCd).map((r) => r.unitPrice);
    const med = median(prices);
    if (med != null) lawdMedian.set(lawdCd, med);
  }

  const sggPrices: Record<string, number> = {};
  for (const [lawdCd, sigungu] of lawdToSigungu) {
    const med = lawdMedian.get(lawdCd);
    if (med != null) sggPrices[sigungu] = round(med, 2);
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "04-sgg-prices.state.json"), JSON.stringify(sggPrices), "utf8");
  info(`04-fetch-value: sgg prices saved for ${Object.keys(sggPrices).length} sigungu(s)`);
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const lawdCds = districtLawdCodes(districts);
  info(`04-fetch-value: querying ${lawdCds.length} LAWD_CD values across ${recentMonths(12).length} completed months`);
  const trades = await fetchTrades(lawdCds);
  assignValues(districts, trades);
  await saveState(districts);
  await writeSqlFile("04-value.sql", buildUpdateSql(districts, ["raw_value"]));
  info(`04-fetch-value: trades=${trades.length}`);
  await assignAptPrices(districts, trades);
  await saveSggPrices(districts, trades);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
