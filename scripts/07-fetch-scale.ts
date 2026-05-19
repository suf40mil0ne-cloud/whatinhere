import {
  info,
  writeSqlFile,
} from "./district-score-lib";

const RESOLVED_COMPONENT_EXPR = [
  "(",
  "  COALESCE(s_transport, 0)",
  "  + COALESCE(s_walk, 0)",
  "  + COALESCE(s_value, 0)",
  "  + COALESCE(s_childcare, 0)",
  "  + COALESCE(s_safety, 0)",
  ") / NULLIF(",
  "  (CASE WHEN s_transport IS NOT NULL THEN 1 ELSE 0 END",
  "  + CASE WHEN s_walk IS NOT NULL THEN 1 ELSE 0 END",
  "  + CASE WHEN s_value IS NOT NULL THEN 1 ELSE 0 END",
  "  + CASE WHEN s_childcare IS NOT NULL THEN 1 ELSE 0 END",
  "  + CASE WHEN s_safety IS NOT NULL THEN 1 ELSE 0 END),",
  "0)",
].join("\n");

const S_SCALE_EXPR = [
  "CASE",
  "  WHEN total_units IS NULL THEN 50",
  "  ELSE MIN(100, MAX(0, ROUND((total_units - 50) * 100.0 / 950.0, 2)))",
  "END",
].join("\n");

const FACTOR_EXPR = `MIN(1.0, MAX(0.7, 0.7 + (${S_SCALE_EXPR}) / 100.0 * 0.3))`;

async function main() {
  const sql = [
    "UPDATE apt_complexes",
    `SET s_scale = ${S_SCALE_EXPR},`,
    `    overall_score_adjusted = ROUND((${RESOLVED_COMPONENT_EXPR}) * ${FACTOR_EXPR}, 2);`,
    "",
  ].join("\n");

  await writeSqlFile("07-scale.sql", sql);

  info("07-fetch-scale: using apt_complexes.total_units for s_scale");
  info("07-fetch-scale: total_units <= 50 => s_scale 0, factor 0.7");
  info("07-fetch-scale: total_units >= 1000 => s_scale 100, factor 1.0");
  info("07-fetch-scale: total_units is null => s_scale 50, factor 0.85");
  info("07-fetch-scale: overall_score_adjusted uses existing component averages in current DB schema");
  info("07-fetch-scale: wrote output/07-scale.sql");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
