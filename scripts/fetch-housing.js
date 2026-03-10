import { normalizeHousingRows } from "../lib/normalize-public-projects.js";
import { readSourceRows, writeJsonFile, writeNormalizedSource } from "./project-normalizers.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "housing",
  sourceName: "국토교통부 택지정보 단계별사업정보",
  sourceUrl: "https://www.data.go.kr/data/15149148/fileData.do",
  strategy: "B",
  endpointType: "filedata-download-ingest",
  notes: [
    "택지정보 단계별사업정보는 파일데이터 다운로드 후 ingest가 맞다.",
    "대표좌표 또는 위도/경도 컬럼이 없으면 지도용 point로 변환되지 않아 skip된다.",
  ],
});
const rows = readSourceRows("housing");
report.rawRowCount = rows.length;
if (!report.rawFile) {
  recordSkip(report, "raw-file-missing");
}
if (rows.length > 0) {
  inspectRows("housing", rows);
}
const result = normalizeHousingRows(rows);

writeNormalizedSource("housing", result.items);
report.normalizedRowCount = result.items.length;
report.normalizeAttemptCount = result.stats.normalizeAttemptCount;
report.normalizeSuccessCount = result.stats.normalizeSuccessCount;
report.capitalFilterBeforeCount = result.stats.capitalFilterBeforeCount;
report.capitalFilterAfterCount = result.stats.capitalFilterAfterCount;
report.coordinateValidCount = result.stats.coordinateValidCount;
report.skipCounts = { ...result.stats.skipCounts, deduped: 0 };
writeJsonFile("logs/raw/housing.normalize-summary.json", result.stats);
if (rows.length > 0 && result.items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
