import {
  buildSourceProjectId,
  normalizeDate,
  pickString,
} from "../scripts/project-normalizers.js";

const CAPITAL_PREFIXES = ["서울", "서울특별시", "인천", "인천광역시", "경기", "경기도"];

export function normalizeRailwayRows(rows = []) {
  return normalizeRows(rows, {
    sourceKey: "railway",
    category: "railway",
    sourceName: "국가철도공단 철도공단사업",
    sourceUrl: "https://www.data.go.kr/data/15088605/fileData.do",
    nameKeys: ["사업명", "노선명", "name"],
    addressKeys: ["위치", "소재지", "사업위치", "주소"],
    startDateKeys: ["사업시작일자", "착공일", "시작일"],
    endDateKeys: ["사업종료일자", "준공일", "종료일"],
    rawStatusKeys: ["진행단계", "사업단계", "상태"],
    descriptionFields: [
      { label: "사업내용", keys: ["사업내용"] },
      { label: "총사업비", keys: ["총사업비"] },
      { label: "사업코드", keys: ["사업코드"] },
    ],
    filterCapital: false,
    projectOrigin: "public",
  });
}

export function normalizeHousingRows(rows = []) {
  return normalizeRows(rows, {
    sourceKey: "housing",
    category: "housing",
    sourceName: "국토교통부 택지정보 단계별사업정보",
    sourceUrl: "https://www.data.go.kr/data/15149148/fileData.do",
    nameKeys: ["지구명", "사업지구명", "택지지구명", "name"],
    addressKeys: ["소재지", "위치", "지구위치", "주소"],
    startDateKeys: ["착공일", "사업시작일", "시작일"],
    endDateKeys: ["준공일", "사업종료일", "종료일"],
    rawStatusKeys: ["단계", "상태", "추진현황"],
    descriptionFields: [
      { label: "단계", keys: ["단계"] },
      { label: "상태", keys: ["상태", "추진현황"] },
      { label: "면적", keys: ["면적", "지구면적"] },
    ],
    filterCapital: true,
    projectOrigin: "public",
  });
}

export function normalizeUrbanPlanRows(rows = []) {
  return normalizeRows(rows, {
    sourceKey: "urban-plan",
    category: "urban_plan",
    sourceName: "국토교통부 (도시계획) 실시계획인가정보(월간)",
    sourceUrl: "https://www.data.go.kr/data/15047837/fileData.do",
    nameKeys: ["실시계획인가고시명", "고시명", "사업명", "name"],
    addressKeys: ["소재지", "위치", "지자체명", "주소"],
    startDateKeys: ["고시일자", "인가일자", "시작일"],
    endDateKeys: ["종료일"],
    rawStatusKeys: ["단계", "상태"],
    descriptionFields: [
      { label: "지자체", keys: ["지자체명"] },
      { label: "고시일자", keys: ["고시일자"] },
      { label: "고시번호", keys: ["고시번호"] },
    ],
    filterCapital: true,
    projectOrigin: "public",
  });
}

function normalizeRows(rows, config) {
  const stats = {
    rawRowCount: rows.length,
    normalizeAttemptCount: 0,
    normalizeSuccessCount: 0,
    capitalFilterBeforeCount: rows.length,
    capitalFilterAfterCount: 0,
    coordinateValidCount: 0,
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
    const address = pickString(record, config.addressKeys);
    if (config.filterCapital && !isCapitalAddress(address)) {
      stats.skipCounts.outsideCapital += 1;
      return;
    }

    stats.capitalFilterAfterCount += 1;
    stats.normalizeAttemptCount += 1;

    const name = pickString(record, config.nameKeys);
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

    const startDate = normalizeDate(pickString(record, config.startDateKeys));
    const endDate = normalizeDate(pickString(record, config.endDateKeys));
    const rawStatus = pickString(record, config.rawStatusKeys);
    const status = determineStatus(rawStatus, startDate, endDate);
    if (status === "unknown") {
      stats.skipCounts.statusCalculationFailed += 1;
    }

    items.push({
      id: buildSourceProjectId(config.sourceKey, record, index),
      category: config.category,
      name,
      geometryType: "point",
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      address,
      status,
      sourceName: config.sourceName,
      sourceUrl: config.sourceUrl,
      agency: pickString(record, ["기관명", "시행자", "발주자", "사업시행자", "관리기관"]),
      startDate,
      endDate,
      description: buildDescription(record, config.descriptionFields),
      updatedAt:
        normalizeDate(pickString(record, ["수정일", "갱신일", "updatedAt", "기준일자", "고시일자"])) ||
        new Date().toISOString().slice(0, 10),
      projectOrigin: config.projectOrigin,
      confidence: startDate || endDate ? "high" : "medium",
    });

    stats.normalizeSuccessCount += 1;
  });

  stats.projectItemCount = items.length;
  return { items, stats };
}

function buildDescription(record, fields) {
  const parts = [];
  fields.forEach(({ label, keys }) => {
    const value = pickString(record, keys);
    if (value) parts.push(`${label}: ${value}`);
  });
  return parts.join(" / ") || undefined;
}

function determineStatus(rawStatus, startDate, endDate) {
  const text = String(rawStatus || "").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  if (endDate && endDate <= today) return "completed";
  if (text.includes("완료") || text.includes("준공")) return "completed";
  if (startDate) return "in_progress";
  if (text.includes("인가") || text.includes("승인") || text.includes("고시")) return "approved";
  if (text.includes("계획")) return "planned";
  return "unknown";
}

function isCapitalAddress(address) {
  if (!address) return false;
  return CAPITAL_PREFIXES.some((prefix) => String(address).trim().startsWith(prefix));
}

function resolveCoordinate(record) {
  const xValue = pickString(record, ["X좌표", "x", "X", "경도", "longitude", "lng", "대표X좌표"]);
  const yValue = pickString(record, ["Y좌표", "y", "Y", "위도", "latitude", "lat", "대표Y좌표"]);

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
