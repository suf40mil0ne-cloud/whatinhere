import {
  buildUpdateSql,
  fetchJsonWithRetry,
  info,
  loadState,
  parseJsonItems,
  paramsToUrl,
  saveState,
  warn,
  writeSqlFile,
} from "./district-score-lib";

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
const POPULATION_API_BASE_URL = "https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus";

// ponytail: 조회년월을 이번 달 단일 월로 고정. API 발표 지연으로 데이터가 없으면 전월로 당기는 보정 필요.
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  if (!SERVICE_KEY) {
    warn("01-fetch-population: DATA_GO_KR_SERVICE_KEY missing, skipping population fetch");
    return;
  }

  const yearMonth = currentYearMonth();

  for (const district of districts) {
    const url = paramsToUrl(POPULATION_API_BASE_URL, {
      serviceKey: SERVICE_KEY,
      pageNo: 1,
      numOfRows: 1000,
      admmCd: district.code,
      srchFrYm: yearMonth,
      srchToYm: yearMonth,
      lv: 4,
      regSeCd: 1,
      type: "JSON",
    });

    try {
      const payload = await fetchJsonWithRetry(url);
      const item = parseJsonItems(payload)[0];
      district.households = Number(item?.hhCnt ?? 0) || null;
      district.population = Number(item?.ppltnCnt ?? 0) || null;
    } catch (error) {
      warn(`01-fetch-population: ${district.code} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await saveState(districts);
  await writeSqlFile("01-population.sql", buildUpdateSql(districts, ["households", "population"]));
  info(`01-fetch-population: updated ${districts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
