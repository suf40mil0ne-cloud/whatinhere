import fs from "node:fs";
import path from "node:path";
import { normalizeLifesafetyConstructionRows } from "../lib/normalize-lifesafety-construction.js";
import {
  countMergedRows,
  createDiagnosticContext,
  finalizeDiagnostic,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";
import {
  ensurePipelineDirs,
  readNormalizedSource,
  readSourceRows,
  writeJsonFile,
  writeNormalizedSource,
} from "./project-normalizers.js";

const SOURCE_KEY = "capital-construction";
const SOURCE_NAME = "행정안전부 생활안전지도 건설공사현황";
const RAW_DIR = path.join(path.resolve("."), "logs", "raw");

ensurePipelineDirs();

const { report } = createDiagnosticContext({
  sourceKey: SOURCE_KEY,
  sourceName: SOURCE_NAME,
  sourceUrl: "https://www.safemap.go.kr/openApiService/wms/getLayerData.do",
  strategy: "C",
  endpointType: "wms-or-export-ingest",
  requiredEnv: ["SAFEMAP_API_KEY"],
  notes: [
    "우선순위는 공식 raw export(data-sources/raw/capital-construction.json|csv)다.",
    "raw export가 없으면 debug script가 남긴 실제 응답을 읽어 row API 여부만 판정한다.",
    "공식 row 응답이 확인되지 않으면 seed fallback을 쓰지 않고 0건으로 남긴다.",
  ],
});

const rows = loadOfficialRows();
report.rawRowCount = rows.length;
report.rawFile = rows.length > 0 ? resolveOfficialRawPath() : null;

if (rows.length === 0) {
  const debugSummary = loadDebugSummary();
  report.debugActualCallUrl = debugSummary?.actualCallUrl;
  report.responseStatusCodes = debugSummary?.responseStatusCodes || [];
  report.rawResponseStructures = debugSummary?.responses?.map((entry) => `${entry.endpoint}:${entry.structure}`) || [];
  recordSkip(report, "official-raw-missing");

  if (!debugSummary) {
    recordFailure(report, "debug-summary-missing");
  } else {
    debugSummary.failureReasons?.forEach((reason) => recordFailure(report, reason));
  }

  writeNormalizedSource(SOURCE_KEY, []);
  report.capitalFilterBeforeCount = 0;
  report.capitalFilterAfterCount = 0;
  report.coordinateValidCount = 0;
  report.normalizeAttemptCount = 0;
  report.normalizeSuccessCount = 0;
  report.projectItemCount = 0;
  report.skipCounts = {
    nameMissing: 0,
    coordinateMissing: 0,
    coordinateParseFailed: 0,
    coordinateOutOfRange: 0,
    coordinateSystemMismatch: 0,
    outsideCapital: 0,
    statusCalculationFailed: 0,
    requiredFieldMissing: 0,
    deduped: 0,
  };
  finalizeDiagnostic(report);
  printSummary(report);
  process.exit(0);
}

const { items, stats } = normalizeLifesafetyConstructionRows(rows);
writeNormalizedSource(SOURCE_KEY, items);

Object.assign(report, stats);
report.normalizedRowCount = items.length;
report.coordinateValidCount = stats.coordinateValidCount;
report.skipCounts = {
  ...stats.skipCounts,
  deduped: 0,
};

const mergedRows = countMergedRows(SOURCE_NAME);
report.mergedRowCount = mergedRows;
if (stats.rawRowCount > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}

writeJsonFile(path.join(RAW_DIR, "lifesafety-construction.normalize-summary.json"), stats);
finalizeDiagnostic(report);
printSummary(report);

function printSummary(summary) {
  console.log(`[lifesafety-fetch] raw=${summary.rawRowCount}`);
  console.log(`[lifesafety-fetch] capital-before=${summary.capitalFilterBeforeCount ?? 0}`);
  console.log(`[lifesafety-fetch] capital-after=${summary.capitalFilterAfterCount ?? 0}`);
  console.log(`[lifesafety-fetch] coord-valid=${summary.coordinateValidCount ?? 0}`);
  console.log(`[lifesafety-fetch] normalize-success=${summary.normalizeSuccessCount ?? 0}`);
  console.log(`[lifesafety-fetch] merged=${summary.mergedRowCount ?? 0}`);
  console.log(`[lifesafety-fetch] skip=${JSON.stringify(summary.skipCounts || {})}`);
}

function loadOfficialRows() {
  const rawPath = resolveOfficialRawPath();
  if (rawPath) {
    return readSourceRows(SOURCE_KEY, []);
  }

  const parsedCandidates = [
    path.join(RAW_DIR, "lifesafety-construction.getLayerData.raw.txt"),
    path.join(RAW_DIR, "lifesafety-construction.sm-apis.raw.txt"),
  ];

  for (const candidate of parsedCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8").trim();
    if (!text || (!text.startsWith("{") && !text.startsWith("["))) continue;

    try {
      const parsed = JSON.parse(text);
      const rows = extractRows(parsed);
      if (rows.length > 0) return rows;
    } catch {
      continue;
    }
  }

  return [];
}

function resolveOfficialRawPath() {
  return [
    path.join(path.resolve("."), "data-sources", "raw", `${SOURCE_KEY}.json`),
    path.join(path.resolve("."), "data-sources", "raw", `${SOURCE_KEY}.csv`),
  ].find((candidate) => fs.existsSync(candidate));
}

function loadDebugSummary() {
  const filePath = path.join(path.resolve("."), "logs", "diagnostics", "capital-construction-debug.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractRows(payload) {
  const rowPaths = ["response.body.items.item", "response.body.items", "items", "data"];
  for (const rowPath of rowPaths) {
    const resolved = rowPath.split(".").reduce((acc, key) => acc?.[key], payload);
    if (Array.isArray(resolved)) return resolved;
  }
  return [];
}
