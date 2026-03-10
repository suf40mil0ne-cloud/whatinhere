import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { COMMITTEE_RESULT_ROWS } from "./private-source-seeds.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "committee-results",
  sourceName: "건축위원회·도시건축공동위원회 심의 결과",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "B/C",
  endpointType: "municipal-file-or-portal",
  notes: [
    "심의 결과는 시군구 게시판/파일형 공고 비중이 높아 앱 런타임 직접호출에 부적합하다.",
    "현재 저장소에서는 공식 raw 파일이 없을 때 seed fallback이 사용된다.",
  ],
});
const rows = readSourceRows("committee-results", COMMITTEE_RESULT_ROWS);
report.rawRowCount = rows.length;
report.fallbackRowCount = report.rawFile ? 0 : COMMITTEE_RESULT_ROWS.length;
if (!report.rawFile) {
  recordSkip(report, "official-raw-missing-using-seed-fallback");
}
if (rows.length > 0) {
  inspectRows("committee-results", rows);
}

const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "committee-results",
      category: "urban_plan",
      sourceName: "건축위원회·도시건축공동위원회 심의 결과",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: "low",
    })
  )
  .filter(Boolean);

writeNormalizedSource("committee-results", items);
report.normalizedRowCount = items.length;
if (report.rawFile == null && items.length > 0) {
  recordFailure(report, "not-official-ingest-seed-fallback");
}
if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
