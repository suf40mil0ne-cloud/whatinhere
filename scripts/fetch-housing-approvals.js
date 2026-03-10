import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { HOUSING_APPROVAL_ROWS } from "./private-source-seeds.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "housing-approvals",
  sourceName: "지자체 주택건설사업계획 승인 현황",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "B/C",
  endpointType: "municipal-file-or-openapi",
  notes: [
    "수도권 공동주택 승인 데이터는 지자체 파일/XLS/CSV 중심이라 사전 수집이 맞다.",
    "현재 저장소에서는 공식 raw 파일이 없을 때 seed fallback이 사용된다.",
  ],
});
const rows = readSourceRows("housing-approvals", HOUSING_APPROVAL_ROWS);
report.rawRowCount = rows.length;
report.fallbackRowCount = report.rawFile ? 0 : HOUSING_APPROVAL_ROWS.length;
if (!report.rawFile) {
  recordSkip(report, "official-raw-missing-using-seed-fallback");
}
if (rows.length > 0) {
  inspectRows("housing-approvals", rows);
}

const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "housing-approvals",
      category: "housing",
      sourceName: "지자체 주택건설사업계획 승인 현황",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: record.착공일 ? "high" : "medium",
    })
  )
  .filter(Boolean);

writeNormalizedSource("housing-approvals", items);
report.normalizedRowCount = items.length;
if (report.rawFile == null && items.length > 0) {
  recordFailure(report, "not-official-ingest-seed-fallback");
}
if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
