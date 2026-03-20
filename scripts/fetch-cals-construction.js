import path from "node:path";
import { normalizeCalsConstructionRows } from "../lib/normalize-cals-construction.js";
import { writeJsonFile, writeNormalizedSource } from "./project-normalizers.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  readRowsWithFallback,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const SOURCE_KEY = "cals-construction";
const ENDPOINT = "http://www.calspia.go.kr/io/openapi/cm/selectIoCmConstructionList.do";

const { settings, report } = createDiagnosticContext({
  sourceKey: SOURCE_KEY,
  sourceName: "국토교통부 건설CALS 공사정보 목록",
  sourceUrl: "https://www.data.go.kr/data/15061025/openapi.do",
  strategy: "A/B",
  endpointType: "openapi-or-raw-fallback",
  requiredEnv: ["CALS_API_KEY"],
  notes: [
    "건설CALS 공사정보 목록은 자체 OpenAPI를 사용한다.",
    "원본 응답에는 좌표가 없어 기존 공공건설 포인트와 이름 기준 매칭해 지도용 레코드로 만든다.",
    "현재 실행 환경에서 CALS 서버가 연결을 재설정할 수 있어 raw fallback을 지원한다.",
  ],
});

let { rows, rawFile } = readRowsWithFallback(SOURCE_KEY);
report.rawRowCount = rows.length;
report.rawFile = rawFile;

if (!rawFile && settings.CALS_API_KEY) {
  rows = await fetchAllRows(settings.CALS_API_KEY, report);
  report.rawRowCount = rows.length;
}

if (!rows.length && !rawFile && !report.fetchAttempted) {
  recordSkip(report, "raw-file-missing");
  recordFailure(report, "service-key-missing");
}

if (!rows.length && report.fetchAttempted) {
  recordFailure(report, "live-fetch-empty");
}

if (rows.length > 0) {
  inspectRows(SOURCE_KEY, rows);
}

const { items, stats } = normalizeCalsConstructionRows(rows);
writeNormalizedSource(SOURCE_KEY, items);
writeJsonFile(path.join("logs", "raw", `${SOURCE_KEY}.normalize-summary.json`), stats);

report.normalizedRowCount = items.length;
report.normalizeAttemptCount = stats.normalizeAttemptCount;
report.normalizeSuccessCount = stats.normalizeSuccessCount;
report.matchedReferenceCount = stats.matchedReferenceCount;
report.unmatchedCount = stats.unmatchedCount;
report.skipCounts = stats.skipCounts;

if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}

finalizeDiagnostic(report);

async function fetchAllRows(serviceKey, diagReport) {
  const rows = [];
  const numOfRows = 200;
  let pageNo = 1;
  let totalCount = null;

  while (pageNo <= 20) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("type", "json");
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("searchCcwYn", "0");

    diagReport.fetchAttempted = true;
    diagReport.attemptedUrl = maskServiceKey(url.toString(), serviceKey);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": "Mozilla/5.0",
        },
      });

      diagReport.httpStatus = response.status;
      const text = await response.text();
      const payload = safeParseJson(text);

      if (pageNo === 1) {
        writeJsonFile(path.join("logs", "raw", `${SOURCE_KEY}.response.json`), payload ?? { rawText: text });
      }

      const pageRows = extractRows(payload);
      rows.push(...pageRows);

      totalCount = Number(resolveValue(payload, ["response.body.totalCount", "body.totalCount", "totalCount"])) || rows.length;
      if (!pageRows.length || !totalCount || rows.length >= totalCount) break;
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

function extractRows(payload) {
  const resolved =
    resolveValue(payload, ["response.body.items.item", "response.body.items", "body.items.item", "body.items", "items.item", "items", "data"]) || [];

  if (Array.isArray(resolved)) return resolved;
  if (resolved && typeof resolved === "object") return [resolved];
  return [];
}

function resolveValue(payload, paths) {
  for (const pathKey of paths) {
    const value = pathKey.split(".").reduce((acc, key) => acc?.[key], payload);
    if (value != null) return value;
  }
  return null;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function maskServiceKey(url, serviceKey) {
  return url.replace(serviceKey, "***");
}
