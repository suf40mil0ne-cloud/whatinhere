import fs from "node:fs/promises";
import path from "node:path";
import { buildUpsertSql, DistrictState, info, linearScore, loadState, round, updateOverallScores, writeSqlFile, OUTPUT_DIR } from "./district-score-lib";

function parseValueTokens(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && s[i] === " ") i++;
    if (i >= s.length) break;
    let token: string;
    if (s[i] === "'") {
      const start = i++;
      while (i < s.length && s[i] !== "'") i++;
      i++;
      token = s.slice(start, i);
    } else {
      const start = i;
      while (i < s.length && s[i] !== "," && s[i] !== " ") i++;
      token = s.slice(start, i);
    }
    tokens.push(token);
    while (i < s.length && (s[i] === " " || s[i] === ",")) i++;
  }
  return tokens;
}

function stripAptComplexesCols(sql: string, colsToStrip: string[]): string {
  const COLS = ["id", "name", "address", "lat", "lng", "district_code", "built_year", "total_units", "avg_price_per_m2", "s_transport", "s_walk", "s_value", "s_childcare", "s_safety", "price_source"];
  const stripSet = new Set(colsToStrip);
  const stripIdxs = new Set(COLS.map((c, i) => (stripSet.has(c) ? i : -1)).filter((i) => i >= 0));
  const keptCols = COLS.filter((_, i) => !stripIdxs.has(i)).join(", ");
  return sql.replace(
    /^INSERT OR REPLACE INTO apt_complexes \([^)]+\) VALUES \((.+)\);$/gm,
    (_, valStr) => {
      const vals = parseValueTokens(valStr);
      const keptVals = vals.filter((_, i) => !stripIdxs.has(i)).join(", ");
      return `INSERT OR REPLACE INTO apt_complexes (${keptCols}) VALUES (${keptVals});`;
    }
  );
}

function computeValueScores(districts: DistrictState[], nationalMedianPrice: number | null): void {
  for (const district of districts) {
    const price = district.raw_value?.pricePerSqmMedian ?? null;
    let priceScore: number;
    if (price == null || nationalMedianPrice == null || nationalMedianPrice <= 0) {
      priceScore = 50;
    } else {
      const ratio = price / nationalMedianPrice;
      priceScore = linearScore(ratio, 0.3, 3.0);
    }
    const otherAvg = (district.s_transport + district.s_walk + district.s_childcare + district.s_safety) / 4;
    district.s_value = round(priceScore * 0.70 + otherAvg * 0.30, 2);
  }
}

async function loadMetroMedianPrice(): Promise<number | null> {
  const aptPricesPath = path.join(OUTPUT_DIR, "04-apt-prices.state.json");
  let raw: string;
  try {
    raw = await fs.readFile(aptPricesPath, "utf8");
  } catch {
    return null;
  }
  const priceState = JSON.parse(raw) as Array<{ id: string; avgPricePerM2: number }>;
  const prices = priceState.map((p) => p.avgPricePerM2).filter((v) => v != null && v > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  return prices[Math.floor(prices.length / 2)];
}

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("No district state found. Run 00~07 scripts first.");
  const nationalMedianPrice = await loadMetroMedianPrice();
  if (nationalMedianPrice != null) info(`99-merge-scores: 수도권 실거래 중위가격=${round(nationalMedianPrice, 0)}만원/m²`);
  computeValueScores(districts, nationalMedianPrice);
  updateOverallScores(districts);

  // Final deployment SQL must be generated from the resolved in-memory state only.
  // Collector debug artifacts remain in output/0x-*.sql, but we do not prepend them
  // here because a transient source outage can otherwise zero out existing DB scores
  // before the preserving upsert runs.
  let districtSql = buildUpsertSql(districts);

  // Prepend apt complex base rows stripped of score columns (08-apt-scores.sql sets those)
  const aptComplexesPath = path.join(OUTPUT_DIR, "07-apt-complexes.sql");
  try {
    const aptComplexesSql = await fs.readFile(aptComplexesPath, "utf8");
    if (aptComplexesSql.trim()) {
      const stripped = stripAptComplexesCols(aptComplexesSql, ["avg_price_per_m2", "s_value", "price_source"]);
      districtSql = `${districtSql}\n${stripped}`;
    }
  } catch {
    // 07-apt-complexes.sql not yet generated — skip
  }

  // Append apt complex scores if available
  const aptScoresPath = path.join(OUTPUT_DIR, "08-apt-scores.sql");
  try {
    const aptSql = await fs.readFile(aptScoresPath, "utf8");
    if (aptSql.trim()) {
      districtSql = `${districtSql}\n${aptSql}`;
    }
  } catch {
    // 08-apt-scores.sql not yet generated — skip
  }

  // Append scale factor scores (must run after 08-apt-scores.sql so s_* values are set)
  const scaleScoresPath = path.join(OUTPUT_DIR, "07-scale.sql");
  try {
    const scaleSql = await fs.readFile(scaleScoresPath, "utf8");
    if (scaleSql.trim()) {
      districtSql = `${districtSql}\n${scaleSql}`;
    }
  } catch {
    // 07-scale.sql not yet generated — skip
  }

  await writeSqlFile("99-final.sql", districtSql);
  info(`99-merge-scores: wrote final upsert for ${districts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
