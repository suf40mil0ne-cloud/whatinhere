import { buildUpsertSql, info, loadState, updateOverallScores, writeSqlFile } from "./district-score-lib";

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("No district state found. Run 00~07 scripts first.");
  updateOverallScores(districts);

  // Final deployment SQL must be generated from the resolved in-memory state only.
  // Collector debug artifacts remain in output/0x-*.sql, but we do not prepend them
  // here because a transient source outage can otherwise zero out existing DB scores
  // before the preserving upsert runs.
  await writeSqlFile("99-final.sql", buildUpsertSql(districts));
  info(`99-merge-scores: wrote final upsert for ${districts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
