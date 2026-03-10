import { normalizePointProject, writeNormalizedSource } from "./project-normalizers.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  readRowsWithFallback,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { report } = createDiagnosticContext({
  sourceKey: "kiscon",
  sourceName: "국토교통부 공공건설 공사위치정보",
  sourceUrl: "https://www.data.go.kr/data/15094259/fileData.do",
  strategy: "C",
  endpointType: "portal-file-link",
  notes: [
    "KISCON은 data.go.kr 파일데이터 상세 페이지가 기관 링크(kiscon map)로 연결되는 반자동 소스다.",
    "앱 런타임이 아니라 사전 다운로드 후 raw ingest가 맞다.",
  ],
});
const { rows, rawFile } = readRowsWithFallback("kiscon");
report.rawRowCount = rows.length;
report.rawFile = rawFile;

if (!rawFile) {
  recordSkip(report, "manual-download-required");
  recordFailure(report, "raw-file-missing");
}

if (rows.length > 0) {
  inspectRows("kiscon", rows);
}

const items = rows
  .map((record, index) =>
    normalizePointProject({
      sourceKey: "kiscon",
      category: "public_construction",
      sourceName: "국토교통부 공공건설 공사위치정보",
      sourceUrl: "https://www.data.go.kr/data/15094259/fileData.do",
      record,
      index,
    })
  )
  .filter(Boolean);

writeNormalizedSource("kiscon", items);
report.normalizedRowCount = items.length;
if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
