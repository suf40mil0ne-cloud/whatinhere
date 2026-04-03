import {
  buildUpdateSql,
  info,
  loadState,
  paramsToUrl,
  saveState,
  warn,
  writeSqlFile,
  xmlItems,
  xmlTag,
} from "./district-score-lib";

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("Run 00-fetch-districts.ts first");
  if (!SERVICE_KEY) {
    warn("01-fetch-population: DATA_GO_KR_SERVICE_KEY missing, skipping population fetch");
    return;
  }

  for (const district of districts) {
    const url = paramsToUrl("https://apis.data.go.kr/1741000/admmPpltnHhStus", {
      serviceKey: SERVICE_KEY,
      pageNo: 1,
      numOfRows: 1000,
      admmCd: district.code,
    });

    try {
      const xml = await fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
      const item = xmlItems(xml)[0] ?? xml;
      district.households = Number(xmlTag(item, "hhCnt") ?? 0) || null;
      district.population = Number(xmlTag(item, "ppltnCnt") ?? 0) || null;
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
