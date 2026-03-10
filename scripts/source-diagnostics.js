import fs from "node:fs";
import path from "node:path";
import {
  ensurePipelineDirs,
  readSourceRows,
  resolveRawFile,
  writeJsonFile,
} from "./project-normalizers.js";

const ROOT_DIR = path.resolve(".");
const LOG_DIR = path.join(ROOT_DIR, "logs");
const RAW_LOG_DIR = path.join(LOG_DIR, "raw");
const DIAG_LOG_DIR = path.join(LOG_DIR, "diagnostics");
const MERGED_OUTPUT = path.join(ROOT_DIR, "public", "data", "projects.generated.json");

export function ensureDiagnosticDirs() {
  ensurePipelineDirs();
  [LOG_DIR, RAW_LOG_DIR, DIAG_LOG_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

export function loadSettings() {
  const parsed = [".dev.vars", ".env", ".env.local"].reduce((acc, filename) => {
    const filePath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(filePath)) return acc;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line) => {
      if (!line || line.trim().startsWith("#")) return;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) return;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !(key in acc)) {
        acc[key] = value;
      }
    });

    return acc;
  }, {});

  return new Proxy(parsed, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      return process.env[prop] ?? target[prop];
    },
  });
}

export function createDiagnosticContext({
  sourceKey,
  sourceName,
  sourceUrl,
  strategy,
  endpointType,
  requiredEnv = [],
  notes = [],
}) {
  ensureDiagnosticDirs();
  const settings = loadSettings();
  const requiredEnvStatus = Object.fromEntries(requiredEnv.map((key) => [key, Boolean(settings[key])]));

  return {
    settings,
    report: {
      sourceKey,
      sourceName,
      sourceUrl,
      strategy,
      endpointType,
      collectedAt: new Date().toISOString(),
      runtime: "script-prebuild",
      requiredEnv: requiredEnvStatus,
      rawFile: resolveRawFile(sourceKey),
      fetchAttempted: false,
      fetchSucceeded: false,
      rawRowCount: 0,
      normalizedRowCount: 0,
      mergedRowCount: 0,
      fallbackRowCount: 0,
      failureReasons: [],
      skipReasons: [],
      notes: [...notes],
    },
  };
}

export function recordFailure(report, reason) {
  if (!report.failureReasons.includes(reason)) {
    report.failureReasons.push(reason);
  }
}

export function recordSkip(report, reason) {
  if (!report.skipReasons.includes(reason)) {
    report.skipReasons.push(reason);
  }
}

export function inspectRows(sourceKey, rows) {
  ensureDiagnosticDirs();
  const preview = Array.isArray(rows) ? rows.slice(0, 5) : [];
  writeJsonFile(path.join(RAW_LOG_DIR, `${sourceKey}.preview.json`), {
    previewRowCount: preview.length,
    preview,
  });
}

export async function fetchJsonWithDiagnostics({
  report,
  url,
  sourceKey,
  headers,
}) {
  report.fetchAttempted = true;
  report.attemptedUrl = url;

  try {
    const response = await fetch(url, { headers });
    report.httpStatus = response.status;
    report.fetchSucceeded = response.ok;

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { rawText: text };
      recordFailure(report, "response-not-json");
    }

    writeJsonFile(path.join(RAW_LOG_DIR, `${sourceKey}.response.json`), payload);
    return payload;
  } catch (error) {
    report.fetchSucceeded = false;
    report.errorMessage = error instanceof Error ? error.message : String(error);
    recordFailure(report, "fetch-error");
    writeJsonFile(path.join(RAW_LOG_DIR, `${sourceKey}.response.json`), {
      error: report.errorMessage,
      attemptedUrl: url,
    });
    return null;
  }
}

export function extractRows(payload, rowPaths = []) {
  for (const rowPath of rowPaths) {
    const resolved = rowPath.split(".").reduce((acc, key) => acc?.[key], payload);
    if (Array.isArray(resolved)) return resolved;
  }

  return [];
}

export function finalizeDiagnostic(report) {
  ensureDiagnosticDirs();
  writeJsonFile(path.join(DIAG_LOG_DIR, `${report.sourceKey}.json`), report);

  const status = report.fetchAttempted
    ? report.fetchSucceeded
      ? "fetch-ok"
      : "fetch-failed"
    : report.rawFile
      ? "raw-ingest"
      : "no-fetch";

  console.log(
    `[source:${report.sourceKey}] status=${status} raw=${report.rawRowCount} normalized=${report.normalizedRowCount} fallback=${report.fallbackRowCount} failures=${report.failureReasons.join("|") || "-"} skips=${report.skipReasons.join("|") || "-"}`
  );
}

export function readRowsWithFallback(sourceKey, fallbackRows = []) {
  const rows = readSourceRows(sourceKey, fallbackRows);
  return {
    rows,
    rawFile: resolveRawFile(sourceKey),
    usedFallback: !resolveRawFile(sourceKey) && fallbackRows.length > 0,
  };
}

export function countMergedRows(sourceName) {
  if (!fs.existsSync(MERGED_OUTPUT)) return 0;
  const items = JSON.parse(fs.readFileSync(MERGED_OUTPUT, "utf8"));
  return items.filter((item) => String(item.sourceName || "").includes(sourceName)).length;
}

export function writeSummaryReport(sourceKeys) {
  ensureDiagnosticDirs();
  const summary = sourceKeys.map((sourceKey) => {
    const filePath = path.join(DIAG_LOG_DIR, `${sourceKey}.json`);
    if (!fs.existsSync(filePath)) {
      return { sourceKey, missing: true };
    }

    const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return report;
  });

  writeJsonFile(path.join(DIAG_LOG_DIR, "summary.json"), summary);
  summary.forEach((report) => {
    if (report.missing) {
      console.log(`[summary:${report.sourceKey}] missing diagnostic`);
      return;
    }

    console.log(
      `[summary:${report.sourceKey}] strategy=${report.strategy} raw=${report.rawRowCount} normalized=${report.normalizedRowCount} merged=${report.mergedRowCount} failures=${report.failureReasons.join("|") || "-"}`
    );
  });
}
