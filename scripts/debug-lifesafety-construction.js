import fs from "node:fs";
import path from "node:path";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  loadSettings,
  recordFailure,
} from "./source-diagnostics.js";
import { writeJsonFile } from "./project-normalizers.js";

const settings = loadSettings();
const apiKey = settings.SAFEMAP_API_KEY || settings.SAFEMAP_SERVICE_KEY || "";
const maskedKey = apiKey ? `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}` : "";
const rawDir = path.join(path.resolve("."), "logs", "raw");
fs.mkdirSync(rawDir, { recursive: true });

const candidates = [
  {
    name: "sm-apis",
    url: `https://www.safemap.go.kr/sm/apis.do?apikey=${encodeURIComponent(apiKey)}&layers=VIEW_CNTWRKSTTUS&styles=A2SM_CntwrkSttus&format=image/png&exceptions=text/xml&transparent=true`,
  },
  {
    name: "getLayerData",
    url: `https://www.safemap.go.kr/openApiService/wms/getLayerData.do?serviceKey=${encodeURIComponent(apiKey)}&layer=VIEW_CNTWRKSTTUS&style=A2SM_CntwrkSttus&pageNo=1&numOfRows=10&dataType=JSON`,
  },
];

const { report } = createDiagnosticContext({
  sourceKey: "capital-construction-debug",
  sourceName: "행정안전부 생활안전지도 건설공사현황 디버그",
  sourceUrl: "https://www.safemap.go.kr/openApiService/wms/getLayerData.do",
  strategy: "C",
  endpointType: "wms-debug",
  requiredEnv: ["SAFEMAP_API_KEY"],
  notes: [
    "실제 row API 여부를 확인하기 위해 현재 프로젝트가 가정하는 두 개의 candidate endpoint를 직접 호출한다.",
    "키가 없으면 빈 키로 호출해 raw 에러 문서를 저장한다.",
  ],
});

report.calledUrls = [];
report.responses = [];

for (const candidate of candidates) {
  const response = await fetch(candidate.url);
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const summary = summarizeBody(contentType, body);
  const maskedUrl = maskSecret(candidate.url, apiKey, maskedKey);

  fs.writeFileSync(path.join(rawDir, `lifesafety-construction.${candidate.name}.raw.txt`), body, "utf8");
  writeJsonFile(path.join(rawDir, `lifesafety-construction.${candidate.name}.summary.json`), {
    status: response.status,
    contentType,
    maskedUrl,
    ...summary,
  });

  report.calledUrls.push(maskedUrl);
  report.responses.push({
    endpoint: candidate.name,
    status: response.status,
    contentType,
    ...summary,
  });
}

if (!apiKey) {
  recordFailure(report, "service-key-missing");
}

if (report.responses.some((entry) => entry.bodyKind === "html")) {
  recordFailure(report, "html-error-response");
}

if (report.responses.every((entry) => entry.bodyKind !== "json")) {
  recordFailure(report, "no-json-row-response-confirmed");
}

report.fetchAttempted = true;
report.fetchSucceeded = report.responses.some((entry) => entry.status >= 200 && entry.status < 300);
report.actualCallUrl = report.calledUrls[1] || report.calledUrls[0];
report.responseStatusCodes = report.responses.map((entry) => `${entry.endpoint}:${entry.status}`);

finalizeDiagnostic(report);

console.log(`[lifesafety-debug] actual-url=${report.actualCallUrl}`);
report.responses.forEach((entry) => {
  console.log(
    `[lifesafety-debug] endpoint=${entry.endpoint} status=${entry.status} contentType=${entry.contentType} bodyKind=${entry.bodyKind} structure=${entry.structure}`
  );
});

function summarizeBody(contentType, body) {
  const trimmed = body.trim();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(body);
      return {
        bodyKind: "json",
        structure: Array.isArray(parsed) ? "array" : `object:${Object.keys(parsed).slice(0, 8).join(",")}`,
      };
    } catch {
      return {
        bodyKind: "json-like-invalid",
        structure: "invalid-json",
      };
    }
  }

  if (contentType.includes("xml") || trimmed.startsWith("<?xml") || trimmed.startsWith("<response")) {
    const rootTag = trimmed.match(/^<\??([a-zA-Z0-9:_-]+)/)?.[1] || "xml";
    return {
      bodyKind: "xml",
      structure: `xml:${rootTag}`,
    };
  }

  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    const title = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
    return {
      bodyKind: "html",
      structure: title ? `html:${title}` : "html",
    };
  }

  return {
    bodyKind: "text",
    structure: trimmed.slice(0, 80),
  };
}

function maskSecret(url, secret, masked) {
  if (!secret) return url;
  return url.replaceAll(secret, masked);
}
