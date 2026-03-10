import path from "node:path";
import { normalizeBuildingHubRows, createBuildingReferenceContext } from "../lib/normalize-building-supplements.js";
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
const ENDPOINT = "https://apis.data.go.kr/1613000/ArchHubBuildingPermitService/getBuildingPermitList";

ensurePipelineDirs();

const { report, settings } = createDiagnosticContext({
  sourceKey: "building-hub",
  sourceName: "국토교통부 건축HUB 건축인허가정보",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "A/B",
  endpointType: "openapi-or-public-snapshot",
  requiredEnv: ["DATA_GO_KR_SERVICE_KEY"],
  notes: [
    "건축HUB API가 가능하면 paged OpenAPI를 사용한다.",
    "API나 raw 파일이 없으면 저장소 내 공공데이터 기반 snapshot을 fallback으로 사용한다.",
  ],
});

const regionScope = settings.BUILDING_REGION_SCOPE === "capital" ? "capital" : "nationwide";
report.regionScope = regionScope;

const rawFile = resolveRawFile("building-hub");
let rows = [];
let usedSnapshotFallback = false;

if (rawFile) {
  rows = readSourceRows("building-hub", []);
  report.rawFile = rawFile;
} else if (settings.DATA_GO_KR_SERVICE_KEY) {
  rows = await fetchAllHubRows(settings.DATA_GO_KR_SERVICE_KEY, report);
} else {
  recordFailure(report, "service-key-missing");
}

if (!rows.length) {
  const snapshotRows = loadSnapshotFallbackRows();
  if (snapshotRows.length > 0) {
    rows = snapshotRows;
    usedSnapshotFallback = true;
    report.fallbackRowCount = snapshotRows.length;
    recordSkip(report, "official-raw-missing-using-public-snapshot-fallback");
    recordFailure(report, "using-public-snapshot-fallback");
  }
}

if (!rows.length && !rawFile && !settings.DATA_GO_KR_SERVICE_KEY) {
  recordFailure(report, "raw-file-missing");
}

report.rawRowCount = rows.length;
if (rows.length > 0) {
  inspectRows("building-hub", rows);
}

const referenceContext = createBuildingReferenceContext({
  coordinateReferenceItems: loadCoordinateReferenceItems(),
  plotItems: readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "building-plot.json"), []),
});

const { items, stats } = normalizeBuildingHubRows({
  rows,
  referenceContext,
  regionScope,
});

writeNormalizedSource("building-hub", items);
writeJsonFile(path.join(ROOT_DIR, "logs", "raw", "building-hub.normalize-summary.json"), stats);

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
if (!usedSnapshotFallback && !rawFile && !settings.DATA_GO_KR_SERVICE_KEY) {
  recordSkip(report, "openapi-not-configured");
}

finalizeDiagnostic(report);

async function fetchAllHubRows(serviceKey, diagReport) {
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
    diagReport.attemptedUrl = maskServiceKey(url.toString(), serviceKey);

    try {
      const response = await fetch(url);
      diagReport.httpStatus = response.status;
      if (!response.ok) {
        recordFailure(diagReport, "http-error");
        break;
      }

      const payload = await response.json();
      if (pageNo === 1) {
        writeJsonFile(path.join(ROOT_DIR, "logs", "raw", "building-hub.response.json"), payload);
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

function loadSnapshotFallbackRows() {
  const snapshotPath = path.join(ROOT_DIR, "public", "data", "metro-seoul-projects.json");
  const items = readJsonFile(snapshotPath, []);
  return items
    .filter((item) => item.sourceName === "국토교통부 건축HUB 건축인허가정보")
    .map((item) => ({
      sourceRecordId: item.sourceRecordId || item.id,
      title: item.title,
      addressRoad: item.address,
      addressJibun: item.address,
      lat: item.lat,
      lng: item.lng,
      permitDate: item.permitDate,
      startDate: item.startDate,
      approvalDate: item.approvalDate,
      mainUse: item.mainPurpose || item.buildingUse,
      buildingUse: item.buildingUse,
      summary: item.summary,
      updatedAt: item.updatedAt,
      verifiedAt: item.verifiedAt,
      permitKey: item.sourceRecordId || item.id,
    }));
}

function loadCoordinateReferenceItems() {
  return [
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "projects.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "metro-seoul-projects.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "building-permits.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "housing-approvals.json"), []),
  ].filter(Boolean);
}

function maskServiceKey(url, serviceKey) {
  return url.replace(serviceKey, "***");
}
