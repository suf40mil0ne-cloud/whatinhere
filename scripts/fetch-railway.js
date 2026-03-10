import { normalizeRailwayRows } from "../lib/normalize-public-projects.js";
import { writeJsonFile, writeNormalizedSource } from "./project-normalizers.js";
import {
  createDiagnosticContext,
  extractRows,
  fetchJsonWithDiagnostics,
  finalizeDiagnostic,
  inspectRows,
  readRowsWithFallback,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { settings, report } = createDiagnosticContext({
  sourceKey: "railway",
  sourceName: "국가철도공단 철도공단사업",
  sourceUrl: "https://www.data.go.kr/data/15088605/fileData.do",
  strategy: "A/B",
  endpointType: "datago-auto-converted-api-or-file",
  requiredEnv: ["DATA_GO_KR_SERVICE_KEY", "RAILWAY_API_URL"],
  notes: [
    "철도공단사업은 raw CSV/XLS 다운로드 후 ingest가 가능하고, data.go.kr 자동변환 JSON/XML API도 가능하다.",
    "현재 저장소에는 API URL이 고정되어 있지 않아 환경변수로 주입해야 한다.",
  ],
});

let { rows, rawFile } = readRowsWithFallback("railway");
report.rawRowCount = rows.length;
report.rawFile = rawFile;

if (!rawFile && settings.DATA_GO_KR_SERVICE_KEY && settings.RAILWAY_API_URL) {
  const separator = settings.RAILWAY_API_URL.includes("?") ? "&" : "?";
  const url = `${settings.RAILWAY_API_URL}${separator}serviceKey=${encodeURIComponent(settings.DATA_GO_KR_SERVICE_KEY)}&pageNo=1&numOfRows=1000&_type=json`;
  const payload = await fetchJsonWithDiagnostics({
    report,
    url,
    sourceKey: "railway",
  });

  const apiRows = payload ? extractRows(payload, ["response.body.items.item", "response.body.items", "items", "data"]) : [];
  if (apiRows.length > 0) {
    rows = apiRows;
    report.rawRowCount = rows.length;
  } else if (payload) {
    recordFailure(report, "response-shape-mismatch-or-empty");
  }
}

if (!rawFile && !report.fetchAttempted) {
  recordSkip(report, "raw-file-missing");
  if (!settings.RAILWAY_API_URL) recordFailure(report, "endpoint-not-configured");
  if (!settings.DATA_GO_KR_SERVICE_KEY) recordFailure(report, "service-key-missing");
}

if (rows.length > 0) {
  inspectRows("railway", rows);
}

const items = rows
  ? normalizeRailwayRows(rows)
  : { items: [], stats: { normalizeAttemptCount: 0, normalizeSuccessCount: 0, capitalFilterBeforeCount: 0, capitalFilterAfterCount: 0, coordinateValidCount: 0, skipCounts: {} } };

writeNormalizedSource("railway", items.items);
report.normalizedRowCount = items.items.length;
report.normalizeAttemptCount = items.stats.normalizeAttemptCount;
report.normalizeSuccessCount = items.stats.normalizeSuccessCount;
report.capitalFilterBeforeCount = items.stats.capitalFilterBeforeCount;
report.capitalFilterAfterCount = items.stats.capitalFilterAfterCount;
report.coordinateValidCount = items.stats.coordinateValidCount;
report.skipCounts = { ...items.stats.skipCounts, deduped: 0 };
writeJsonFile("logs/raw/railway.normalize-summary.json", items.stats);
if (rows.length > 0 && items.items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
