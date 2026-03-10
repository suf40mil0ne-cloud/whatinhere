import { normalizeUrbanPlanRows } from "../lib/normalize-public-projects.js";
import { readSourceRows, writeJsonFile, writeNormalizedSource } from "./project-normalizers.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "urban-plan",
  sourceName: "국토교통부 (도시계획) 실시계획인가정보(월간)",
  sourceUrl: "https://www.data.go.kr/data/15047837/fileData.do",
  strategy: "B",
  endpointType: "monthly-csv-ingest",
  notes: [
    "실시계획인가정보는 월간 CSV ingest가 맞다.",
    "좌표 컬럼이 없는 월에는 지도 포인트로 만들 수 없어 skip된다.",
  ],
});
const rows = readSourceRows("urban-plan");
report.rawRowCount = rows.length;
if (!report.rawFile) {
  recordSkip(report, "raw-file-missing");
}
if (rows.length > 0) {
  inspectRows("urban-plan", rows);
}
const result = normalizeUrbanPlanRows(rows);

writeNormalizedSource("urban-plan", result.items);
report.normalizedRowCount = result.items.length;
report.normalizeAttemptCount = result.stats.normalizeAttemptCount;
report.normalizeSuccessCount = result.stats.normalizeSuccessCount;
report.capitalFilterBeforeCount = result.stats.capitalFilterBeforeCount;
report.capitalFilterAfterCount = result.stats.capitalFilterAfterCount;
report.coordinateValidCount = result.stats.coordinateValidCount;
report.skipCounts = { ...result.stats.skipCounts, deduped: 0 };
writeJsonFile("logs/raw/urban-plan.normalize-summary.json", result.stats);
if (rows.length > 0 && result.items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
