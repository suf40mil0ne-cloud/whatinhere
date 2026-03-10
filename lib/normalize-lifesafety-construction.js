import {
  buildSourceProjectId,
  normalizeDate,
  pickString,
} from "../scripts/project-normalizers.js";

const CAPITAL_PREFIXES = ["서울", "서울특별시", "인천", "인천광역시", "경기", "경기도"];
const SOURCE_NAME = "행정안전부 생활안전지도 건설공사현황";
const SOURCE_URL = "https://www.safemap.go.kr/openApiService/wms/getLayerData.do";

export function normalizeLifesafetyConstructionRows(rows = []) {
  const stats = {
    rawRowCount: rows.length,
    capitalFilterBeforeCount: rows.length,
    capitalFilterAfterCount: 0,
    coordinateValidCount: 0,
    normalizeAttemptCount: 0,
    normalizeSuccessCount: 0,
    projectItemCount: 0,
    skipCounts: {
      nameMissing: 0,
      coordinateMissing: 0,
      coordinateParseFailed: 0,
      coordinateOutOfRange: 0,
      coordinateSystemMismatch: 0,
      outsideCapital: 0,
      statusCalculationFailed: 0,
      requiredFieldMissing: 0,
    },
  };

  const items = [];

  rows.forEach((record, index) => {
    const address = getAddress(record);
    if (!isCapitalAddress(address)) {
      stats.skipCounts.outsideCapital += 1;
      return;
    }

    stats.capitalFilterAfterCount += 1;
    stats.normalizeAttemptCount += 1;

    const name = pickString(record, ["공사명", "name", "사업명"]);
    if (!name) {
      stats.skipCounts.nameMissing += 1;
      stats.skipCounts.requiredFieldMissing += 1;
      return;
    }

    const coordinate = resolveCoordinate(record);
    if (coordinate.reason === "missing") {
      stats.skipCounts.coordinateMissing += 1;
      return;
    }
    if (coordinate.reason === "parse-failed") {
      stats.skipCounts.coordinateParseFailed += 1;
      return;
    }
    if (coordinate.reason === "non-wgs84") {
      stats.skipCounts.coordinateSystemMismatch += 1;
      return;
    }
    if (coordinate.reason === "out-of-range") {
      stats.skipCounts.coordinateOutOfRange += 1;
      return;
    }

    stats.coordinateValidCount += 1;

    const startDate = normalizeDate(pickString(record, ["착공일", "startDate", "공사시작일"]));
    const endDate = normalizeDate(pickString(record, ["준공일", "endDate", "공사종료일"]));
    const status = determineLifesafetyStatus(record, startDate, endDate);
    if (status === "unknown") {
      stats.skipCounts.statusCalculationFailed += 1;
    }

    const item = {
      id: buildSourceProjectId("capital-construction", record, index),
      category: "public_construction",
      name,
      geometryType: "point",
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      address,
      status,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      agency: pickString(record, ["발주자", "agency", "발주청"]),
      startDate,
      endDate,
      description: buildDescription(record),
      updatedAt:
        normalizeDate(pickString(record, ["수정일", "갱신일", "updatedAt", "기준일자"])) ||
        new Date().toISOString().slice(0, 10),
      projectOrigin: determineOrigin(record),
      confidence: startDate || endDate ? "high" : "medium",
    };

    stats.normalizeSuccessCount += 1;
    items.push(item);
  });

  stats.projectItemCount = items.length;
  return { items, stats };
}

function determineOrigin(record) {
  const origin = pickString(record, ["공사구분", "사업구분"]);
  if (!origin) return "unknown";
  if (origin.includes("공공")) return "public";
  if (origin.includes("민간")) return "private";
  return "mixed";
}

function determineLifesafetyStatus(record, startDate, endDate) {
  const workFlag = pickString(record, ["공사여부", "공사상태", "진행상태"]);
  const today = new Date().toISOString().slice(0, 10);

  if (endDate && endDate <= today) return "completed";
  if (workFlag && /(준공|완료|종료)/.test(workFlag)) return "completed";
  if (startDate) return "in_progress";
  if (workFlag && /(예정|계획)/.test(workFlag)) return "planned";
  if (workFlag && /(승인|허가)/.test(workFlag)) return "approved";
  return "unknown";
}

function getAddress(record) {
  return pickString(record, ["공사현장주소", "도로명주소", "address", "위치", "소재지"]);
}

function buildDescription(record) {
  const parts = [
    pickString(record, ["공사구분"]),
    pickString(record, ["발주자"]),
    pickString(record, ["공사여부"]),
  ]
    .filter(Boolean)
    .map((value, index) => {
      if (index === 0) return `공사구분: ${value}`;
      if (index === 1) return `발주자: ${value}`;
      return `공사여부: ${value}`;
    });

  return parts.join(" / ") || undefined;
}

function isCapitalAddress(address) {
  if (!address) return false;
  return CAPITAL_PREFIXES.some((prefix) => String(address).trim().startsWith(prefix));
}

function resolveCoordinate(record) {
  const xValue = pickString(record, ["X좌표", "x", "X", "경도"]);
  const yValue = pickString(record, ["Y좌표", "y", "Y", "위도"]);

  if (!xValue || !yValue) {
    return { reason: "missing" };
  }

  const x = Number(String(xValue).replace(/,/g, ""));
  const y = Number(String(yValue).replace(/,/g, ""));
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return { reason: "parse-failed" };
  }

  if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
    return { reason: "non-wgs84" };
  }

  if (isLongitude(x) && isLatitude(y)) {
    return { latitude: y, longitude: x };
  }

  if (isLongitude(y) && isLatitude(x)) {
    return { latitude: x, longitude: y };
  }

  return { reason: "out-of-range" };
}

function isLatitude(value) {
  return value >= 33 && value <= 39.5;
}

function isLongitude(value) {
  return value >= 124 && value <= 132;
}
