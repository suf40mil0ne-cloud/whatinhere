import {
  buildUpdateSql,
  DEFAULT_SERVICE_KEY,
  DistrictState,
  info,
  lastRegionToken,
  loadState,
  median,
  normalizeWithinSgg,
  numeric,
  paramsToUrl,
  round,
  saveState,
  updateOverallScores,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
} from "./district-score-lib";

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? DEFAULT_SERVICE_KEY;
const CAPITAL_LAWD_PREFIXES = ["11", "41", "28"] as const;

interface TradeRow {
  lawdCd: string;
  dong: string;
  unitPrice: number;
}

function recentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

async function fetchTrades(lawdCds: string[]): Promise<TradeRow[]> {
  const rows: TradeRow[] = [];
  const months = recentMonths(12);
  for (const lawdCd of lawdCds) {
    if (!CAPITAL_LAWD_PREFIXES.includes(lawdCd.slice(0, 2) as (typeof CAPITAL_LAWD_PREFIXES)[number])) continue;
    for (const month of months) {
      const url = paramsToUrl("https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", {
        serviceKey: SERVICE_KEY,
        LAWD_CD: lawdCd,
        DEAL_YMD: month,
      });
      try {
        const xml = await fetch(url).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        });
        for (const item of xmlItems(xml)) {
          const area = numeric(xmlTag(item, "excluUseAr"));
          const amount = numeric(xmlTag(item, "dealAmount"));
          const dong = lastRegionToken(xmlTag(item, "umdNm") ?? xmlTag(item, "umdNmNm") ?? xmlTag(item, "법정동") ?? "");
          if (!dong || area == null || amount == null || area <= 0) continue;
          rows.push({ lawdCd, dong, unitPrice: amount / area });
        }
      } catch (error) {
        warn(`04-fetch-value: ${lawdCd}/${month} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return rows;
}

function assignValues(districts: DistrictState[], trades: TradeRow[]) {
  // Fallback median per sigungu code (first 5 digits of district code)
  const lawdMedian = new Map<string, number>();
  for (const lawdCd of [...new Set(trades.map((row) => row.lawdCd))]) {
    const value = median(trades.filter((row) => row.lawdCd === lawdCd).map((row) => row.unitPrice));
    if (value != null) lawdMedian.set(lawdCd, value);
  }

  for (const district of districts) {
    const lawdCd = district.code.slice(0, 5);
    const ownTrades = trades.filter((row) => row.lawdCd === lawdCd && row.dong === district.dong).map((row) => row.unitPrice);
    const pricePerSqmMedian = ownTrades.length >= 10 ? median(ownTrades) : (lawdMedian.get(lawdCd) ?? null);
    district.raw_value = { pricePerSqmMedian };
  }

  const priceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_value?.pricePerSqmMedian ?? null, true);
  for (const district of districts) {
    const convenience = (district.s_transport + district.s_walk) / 2;
    // When no trade data exists (null price), use a neutral 0.5 rather than 0
    // so the district isn't unfairly penalised for missing data.
    const hasPrice = district.raw_value?.pricePerSqmMedian != null;
    const priceScore = hasPrice ? (priceNorm.get(district) ?? 0) : 0.5;
    district.s_value = round(priceScore * 0.6 + convenience * 0.4, 2);
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  // Derive 5-digit sigungu codes from district codes
  const lawdCds = [...new Set(districts.map((row) => row.code.slice(0, 5)))];
  const trades = await fetchTrades(lawdCds);
  assignValues(districts, trades);
  updateOverallScores(districts);
  await saveState(districts);
  await writeSqlFile("04-value.sql", buildUpdateSql(districts, ["s_value", "raw_value"]));
  info(`04-fetch-value: trades=${trades.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
