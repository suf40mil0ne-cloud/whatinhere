import fs from "node:fs";
import path from "node:path";
import { createCoordinateIndex, normalizeBuildingPlotRows } from "../lib/normalize-building-plot.js";
import {
  ensurePipelineDirs,
  readJsonFile,
  readSourceRows,
  resolveRawFile,
  writeJsonFile,
  writeNormalizedSource,
} from "./project-normalizers.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const ROOT_DIR = path.resolve(".");
const RAW_DIR = path.join(ROOT_DIR, "data-sources", "raw");

ensurePipelineDirs();

const { report, settings } = createDiagnosticContext({
  sourceKey: "building-plot",
  sourceName: "국토교통부 건축인허가 대지위치",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "B",
  endpointType: "large-file-download-ingest",
  notes: [
    "기관 다운로드형 대용량 데이터로 앱 런타임 직접 로딩이 아니라 사전 ingest가 맞다.",
    "현재 스크립트는 raw json/csv ingest를 우선 지원한다. xlsx 원본은 csv/json으로 변환 후 넣는 것을 권장한다.",
    "좌표가 없는 경우 기존 포인트 레이어의 동일 주소를 재사용할 때만 지도 반영한다.",
  ],
});
const regionScope = settings.BUILDING_REGION_SCOPE === "nationwide" ? "nationwide" : "capital";
report.regionScope = regionScope;

const rawFile = resolveRawFile("building-plot");
const xlsxFile = findXlsxRawFile();
report.rawFile = rawFile || xlsxFile;

if (!rawFile && xlsxFile) {
  recordSkip(report, "xlsx-present-but-conversion-required");
  recordFailure(report, "raw-xlsx-not-ingested");
}

if (!rawFile) {
  report.rawRowCount = 0;
  writeNormalizedSource("building-plot", []);
  if (!xlsxFile) {
    recordFailure(report, "raw-file-missing");
  }
  finalizeDiagnostic(report);
  process.exit(0);
}

const rows = readSourceRows("building-plot", []);
report.rawRowCount = rows.length;
if (rows.length > 0) {
  inspectRows("building-plot", rows);
}

const coordinateIndex = createCoordinateIndex(loadCoordinateReferenceItems());
const { items, stats } = normalizeBuildingPlotRows({ rows, coordinateIndex, regionScope });

writeNormalizedSource("building-plot", items);
writeJsonFile(path.join(ROOT_DIR, "logs", "raw", "building-plot.normalize-summary.json"), stats);

report.capitalFilterBeforeCount = stats.capitalFilterBeforeCount;
report.capitalFilterAfterCount = stats.capitalFilterAfterCount;
report.groupedCount = stats.groupedCount;
report.representativePreferredCount = stats.representativePreferredCount;
report.coordinateValidCount = stats.coordinateResolvedCount;
report.normalizedRowCount = stats.normalizedSuccessCount;
report.dedupeRemovedCount = stats.dedupeRemovedCount;
report.skipCounts = stats.skipCounts;

if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
if (stats.coordinateResolvedCount === 0 && stats.capitalFilterAfterCount > 0) {
  recordSkip(report, "no-coordinate-match");
}

finalizeDiagnostic(report);

function findXlsxRawFile() {
  const xlsxPath = path.join(RAW_DIR, "building-plot.xlsx");
  return fs.existsSync(xlsxPath) ? xlsxPath : null;
}

function loadCoordinateReferenceItems() {
  const references = [
    readJsonFile(path.join(ROOT_DIR, "public", "data", "projects.json"), []),
    readJsonFile(path.join(ROOT_DIR, "public", "data", "metro-seoul-projects.json"), []),
    readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "building-permits.json"), []),
    readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "housing-approvals.json"), []),
  ];

  return references.flat().filter(Boolean);
}
