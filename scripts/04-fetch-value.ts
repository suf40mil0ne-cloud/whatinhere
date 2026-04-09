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
const PAGE_SIZE = 1000;

interface TradeRow {
  lawdCd: string;
  dong: string;
  unitPrice: number;
}

const CAPITAL_LAWD_CODES: Record<string, string> = {
  "서울특별시:종로구": "11110",
  "서울특별시:중구": "11140",
  "서울특별시:용산구": "11170",
  "서울특별시:성동구": "11200",
  "서울특별시:광진구": "11215",
  "서울특별시:동대문구": "11230",
  "서울특별시:중랑구": "11260",
  "서울특별시:성북구": "11290",
  "서울특별시:강북구": "11305",
  "서울특별시:도봉구": "11320",
  "서울특별시:노원구": "11350",
  "서울특별시:은평구": "11380",
  "서울특별시:서대문구": "11410",
  "서울특별시:마포구": "11440",
  "서울특별시:양천구": "11470",
  "서울특별시:강서구": "11500",
  "서울특별시:구로구": "11530",
  "서울특별시:금천구": "11545",
  "서울특별시:영등포구": "11560",
  "서울특별시:동작구": "11590",
  "서울특별시:관악구": "11620",
  "서울특별시:서초구": "11650",
  "서울특별시:강남구": "11680",
  "서울특별시:송파구": "11710",
  "서울특별시:강동구": "11740",
  "인천광역시:중구": "28110",
  "인천광역시:동구": "28140",
  "인천광역시:미추홀구": "28177",
  "인천광역시:연수구": "28185",
  "인천광역시:남동구": "28200",
  "인천광역시:부평구": "28237",
  "인천광역시:계양구": "28245",
  "인천광역시:서구": "28260",
  "인천광역시:강화군": "28710",
  "인천광역시:옹진군": "28720",
  "경기도:수원시장안구": "41111",
  "경기도:수원시권선구": "41113",
  "경기도:수원시팔달구": "41115",
  "경기도:수원시영통구": "41117",
  "경기도:성남시수정구": "41131",
  "경기도:성남시중원구": "41133",
  "경기도:성남시분당구": "41135",
  "경기도:의정부시": "41150",
  "경기도:안양시만안구": "41171",
  "경기도:안양시동안구": "41173",
  "경기도:부천시원미구": "41192",
  "경기도:부천시소사구": "41194",
  "경기도:부천시오정구": "41196",
  "경기도:광명시": "41210",
  "경기도:평택시": "41220",
  "경기도:동두천시": "41250",
  "경기도:안산시상록구": "41271",
  "경기도:안산시단원구": "41273",
  "경기도:고양시덕양구": "41281",
  "경기도:고양시일산동구": "41285",
  "경기도:고양시일산서구": "41287",
  "경기도:과천시": "41290",
  "경기도:구리시": "41310",
  "경기도:남양주시": "41360",
  "경기도:오산시": "41370",
  "경기도:시흥시": "41390",
  "경기도:군포시": "41410",
  "경기도:의왕시": "41430",
  "경기도:하남시": "41450",
  "경기도:용인시처인구": "41461",
  "경기도:용인시기흥구": "41463",
  "경기도:용인시수지구": "41465",
  "경기도:파주시": "41480",
  "경기도:이천시": "41500",
  "경기도:안성시": "41550",
  "경기도:김포시": "41570",
  "경기도:화성시": "41590",
  "경기도:광주시": "41610",
  "경기도:양주시": "41630",
  "경기도:포천시": "41650",
  "경기도:여주시": "41670",
  "경기도:연천군": "41800",
  "경기도:가평군": "41820",
  "경기도:양평군": "41830",
};

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
    const lawdCd = CAPITAL_LAWD_CODES[key];
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
            rows.push({ lawdCd, dong, unitPrice: amount / area });
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
  const districtLawdMap = new Map(districts.map((district) => [`${district.sido}:${district.sigungu}`, CAPITAL_LAWD_CODES[`${district.sido}:${district.sigungu}`] ?? null]));
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

  const priceNorm = normalizeWithinSgg(districts, (row) => row.sigungu, (row) => row.raw_value?.pricePerSqmMedian ?? null, true);
  for (const district of districts) {
    const convenience = (district.s_transport + district.s_walk) / 2;
    const hasPrice = district.raw_value?.pricePerSqmMedian != null;
    const priceScore = hasPrice ? (priceNorm.get(district) ?? 0) : 0.5;
    district.s_value = round(priceScore * 0.6 + convenience * 0.4, 2);
  }
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  const lawdCds = districtLawdCodes(districts);
  info(`04-fetch-value: querying ${lawdCds.length} LAWD_CD values across ${recentMonths(12).length} completed months`);
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
