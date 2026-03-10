import { normalizePointProject, readSourceRows, writeNormalizedSource } from "./project-normalizers.js";
import { BUILDING_PERMIT_ROWS } from "./private-source-seeds.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "building-permits",
  sourceName: "지자체 세움터 기반 건축허가·착공 자료",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "B/C",
  endpointType: "municipal-file-or-openapi",
  notes: [
    "지자체별 형식이 달라 앱 런타임 직접호출보다 사전 수집/정규화가 맞다.",
    "현재 저장소에서는 공식 raw 파일이 없을 때 seed fallback이 사용된다.",
  ],
});
const rows = readSourceRows("building-permits", BUILDING_PERMIT_ROWS);
report.rawRowCount = rows.length;
report.fallbackRowCount = report.rawFile ? 0 : BUILDING_PERMIT_ROWS.length;
if (!report.rawFile) {
  recordSkip(report, "official-raw-missing-using-seed-fallback");
}
if (rows.length > 0) {
  inspectRows("building-permits", rows);
}

const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "building-permits",
      category: "public_construction",
      sourceName: "지자체 세움터 기반 건축허가·착공 자료",
      sourceUrl: "https://www.data.go.kr/",
      record,
      index,
      projectOrigin: "private",
      confidence: record.착공일 ? "high" : "medium",
    })
  )
  .filter(Boolean);

writeNormalizedSource("building-permits", items);
report.normalizedRowCount = items.length;
if (report.rawFile == null && items.length > 0) {
  recordFailure(report, "not-official-ingest-seed-fallback");
}
if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
