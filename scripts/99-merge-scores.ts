import fs from "node:fs/promises";
import path from "node:path";
import { buildUpsertSql, info, loadState, updateOverallScores, writeSqlFile, OUTPUT_DIR } from "./district-score-lib";

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("No district state found. Run 00~07 scripts first.");
  updateOverallScores(districts);

  // Final deployment SQL must be generated from the resolved in-memory state only.
  // Collector debug artifacts remain in output/0x-*.sql, but we do not prepend them
  // here because a transient source outage can otherwise zero out existing DB scores
  // before the preserving upsert runs.
  let districtSql = buildUpsertSql(districts);

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
