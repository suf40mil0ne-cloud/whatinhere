import { filterCapitalRows, normalizeCapitalPointProject } from "../lib/capital-normalizers.js";
import { writeNormalizedSource } from "./project-normalizers.js";
import { CAPITAL_CONSTRUCTION_ROWS } from "./capital-source-seeds.js";
import {
  createDiagnosticContext,
  finalizeDiagnostic,
  inspectRows,
  readRowsWithFallback,
  recordFailure,
  recordSkip,
} from "./source-diagnostics.js";

const { settings, report } = createDiagnosticContext({
  sourceKey: "capital-construction",
  sourceName: "행정안전부 생활안전지도 건설공사현황",
  sourceUrl: "https://www.safemap.go.kr/openApiService/wms/getLayerData.do",
  strategy: "C",
  endpointType: "wms-link-api",
  requiredEnv: ["SAFEMAP_API_KEY"],
  notes: [
    "생활안전지도 공개 예시는 WMS getLayerData.do + apikey 조합으로 제공된다.",
    "브라우저 런타임 호출보다 사전 수집 또는 반자동 export ingest가 맞다.",
    "현재 저장소에는 서비스키와 공식 raw export가 없어 seed fallback만 사용 중이다.",
  ],
});
report.linkType = "WMS";
report.requiresPagination = "unknown-until-row-endpoint-confirmed";
report.corsAssessment = "browser-call-risk-high";
report.coordinateFields = ["X좌표", "Y좌표", "경도", "위도"];
report.sourceChecklist = {
  actualUrl: "https://www.safemap.go.kr/openApiService/wms/getLayerData.do",
  serviceKeyRequired: true,
  serviceKeyPresent: Boolean(settings.SAFEMAP_API_KEY),
  directRestEndpointConfirmed: false,
  totalCountFieldConfirmed: false,
  pageParamsConfirmed: false,
  capitalFilterParamConfirmed: false,
};

const { rows: loadedRows, rawFile } = readRowsWithFallback("capital-construction", CAPITAL_CONSTRUCTION_ROWS);
const rows = filterCapitalRows(loadedRows);
report.rawFile = rawFile;
report.rawRowCount = rows.length;
report.fallbackRowCount = rawFile ? 0 : CAPITAL_CONSTRUCTION_ROWS.length;

if (!rawFile) {
  recordSkip(report, "official-raw-missing-using-seed-fallback");
  if (!settings.SAFEMAP_API_KEY) recordFailure(report, "service-key-missing");
  recordFailure(report, "link-api-not-row-rest");
}

if (rows.length > 0) {
  inspectRows("capital-construction", rows);
}

const items = rows
  .map((record, index) =>
    normalizeCapitalPointProject({
      sourceKey: "capital-construction",
      category: "public_construction",
      sourceName: "행정안전부 생활안전지도 건설공사현황",
      sourceUrl: "https://www.safemap.go.kr/",
      record: {
        ...record,
        address: record.공사현장주소,
      },
      index,
      projectOrigin:
        record.공사구분 === "공공" ? "public" : record.공사구분 === "민간" ? "private" : "mixed",
      confidence: record.착공일 ? "high" : "medium",
      addressKeys: ["공사현장주소", "address"],
      nameKeys: ["공사명"],
      startDateKeys: ["착공일"],
      endDateKeys: ["준공일"],
      descriptionFields: [
        { label: "공사구분", keys: ["공사구분"] },
        { label: "발주자", keys: ["발주자"] },
      ],
    })
  )
  .filter(Boolean);

writeNormalizedSource("capital-construction", items);
report.normalizedRowCount = items.length;
if (report.rawFile == null && items.length > 0) {
  recordFailure(report, "not-official-ingest-seed-fallback");
}
if (rows.length > 0 && items.length === 0) {
  recordFailure(report, "normalize-filtered-all-rows");
}
finalizeDiagnostic(report);
