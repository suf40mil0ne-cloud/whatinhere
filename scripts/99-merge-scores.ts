import fs from "node:fs/promises";
import path from "node:path";
import { buildReplaceSql, info, loadState, OUTPUT_DIR, updateOverallScores, writeSqlFile } from "./district-score-lib";

async function main() {
  const districts = await loadState();
  if (!districts.length) throw new Error("No district state found. Run 00~07 scripts first.");
  updateOverallScores(districts);

  // Read output/00*.sql through output/07*.sql in numeric order and append the replace SQL
  const files = await fs.readdir(OUTPUT_DIR);
  const sqlFiles = files
    .filter((name) => /^0[0-7]-.*\.sql$/.test(name))
    .sort();

  const parts: string[] = [];
  for (const name of sqlFiles) {
    const content = await fs.readFile(path.join(OUTPUT_DIR, name), "utf8");
    parts.push(content.trimEnd());
  }
  parts.push(buildReplaceSql(districts).trimEnd());

  await writeSqlFile("99-final.sql", `${parts.join("\n")}\n`);
  info(`99-merge-scores: merged ${sqlFiles.length} sql files + final replace for ${districts.length} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
