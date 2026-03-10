import path from "node:path";
import { normalizeBuildingOverviewRows, createBuildingReferenceContext } from "../lib/normalize-building-supplements.js";
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
const ENDPOINT = "https://apis.data.go.kr/1741000/StanBuildngPrmisnInfoService/getStanBuildngPrmisnInfoList";

ensurePipelineDirs();

const { report, settings } = createDiagnosticContext({
  sourceKey: "building-overview",
  sourceName: "국토교통부 건축인허가 기본개요",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "A/B",
  endpointType: "filedata-or-openapi",
  requiredEnv: ["DATA_GO_KR_SERVICE_KEY"],
  notes: [
    "기본개요 파일데이터 ingest를 우선 지원한다.",
    "raw 파일이 없을 때는 공공데이터포털 기본정보 OpenAPI를 보조 경로로 시도한다.",
  ],
});

const regionScope = settings.BUILDING_REGION_SCOPE === "capital" ? "capital" : "nationwide";
report.regionScope = regionScope;

const rawFile = resolveRawFile("building-overview");
let rows = [];

if (rawFile) {
  rows = readSourceRows("building-overview", []);
  report.rawFile = rawFile;
} else if (settings.DATA_GO_KR_SERVICE_KEY) {
  rows = await fetchAllOverviewRows(settings.DATA_GO_KR_SERVICE_KEY, report);
} else {
  recordFailure(report, "service-key-missing");
  recordFailure(report, "raw-file-missing");
}

report.rawRowCount = rows.length;
if (rows.length > 0) {
  inspectRows("building-overview", rows);
}

const referenceContext = createBuildingReferenceContext({
  coordinateReferenceItems: [
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "projects.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "metro-seoul-projects.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "building-hub.json"), []),
  ],
  plotItems: readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "building-plot.json"), []),
});

const { items, stats } = normalizeBuildingOverviewRows({
  rows,
  referenceContext,
  regionScope,
});

writeNormalizedSource("building-overview", items);
writeJsonFile(path.join(ROOT_DIR, "logs", "raw", "building-overview.normalize-summary.json"), stats);

report.filterBeforeCount = stats.filterBeforeCount;
report.filterAfterCount = stats.filterAfterCount;
report.coordinateValidCount = stats.coordinateValidCount;
report.joinSuccessCount = stats.joinSuccessCount;
report.normalizedRowCount = stats.normalizedSuccessCount;
report.dedupeRemovedCount = stats.dedupeRemovedCount;
report.skipCounts = stats.skipCounts;

if (!items.length && rows.length > 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
if (!rawFile && !settings.DATA_GO_KR_SERVICE_KEY) {
  recordSkip(report, "openapi-not-configured");
}

finalizeDiagnostic(report);

async function fetchAllOverviewRows(serviceKey, diagReport) {
  const rows = [];
  const numOfRows = 100;
  let pageNo = 1;
  let totalCount = null;

  while (pageNo <= 3) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("type", "json");

    diagReport.fetchAttempted = true;
    diagReport.attemptedUrl = url.toString().replace(serviceKey, "***");

    try {
      const response = await fetch(url);
      diagReport.httpStatus = response.status;
      if (!response.ok) {
        recordFailure(diagReport, "http-error");
        break;
      }

      const payload = await response.json();
      if (pageNo === 1) {
        writeJsonFile(path.join(ROOT_DIR, "logs", "raw", "building-overview.response.json"), payload);
      }
      const body = payload?.response?.body || {};
      const pageRows = body?.items?.item || [];
      rows.push(...(Array.isArray(pageRows) ? pageRows : pageRows ? [pageRows] : []));

      totalCount = Number(body?.totalCount || rows.length);
      if (!totalCount || rows.length >= totalCount) break;
      pageNo += 1;
    } catch (error) {
      diagReport.fetchSucceeded = false;
      diagReport.errorMessage = error instanceof Error ? error.message : String(error);
      recordFailure(diagReport, "fetch-error");
      break;
    }
  }

  diagReport.fetchSucceeded = rows.length > 0;
  return rows;
}
