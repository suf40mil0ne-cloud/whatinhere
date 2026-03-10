import {
  buildSourceProjectId,
  normalizeDate,
  pickNumber,
  pickString,
} from "../scripts/project-normalizers.js";

const CAPITAL_PREFIXES = ["서울", "서울특별시", "인천", "인천광역시", "경기", "경기도"];
const STATUS_PRIORITY = {
  completed: 5,
  in_progress: 4,
  approved: 3,
  planned: 2,
  unknown: 1,
  traffic_control: 1,
};
const CONFIDENCE_PRIORITY = {
  high: 3,
  medium: 2,
  low: 1,
  undefined: 0,
};

export function filterCapitalRows(rows) {
  return rows.filter((record) => isCapitalRecord(record));
}

export function isCapitalRecord(record) {
  const address = pickString(record, ["address", "소재지", "위치", "공사현장주소", "공사위치", "대지위치", "사업위치"]);
  return isCapitalAddress(address);
}

export function isCapitalAddress(address) {
  if (!address) return false;
  return CAPITAL_PREFIXES.some((prefix) => String(address).trim().startsWith(prefix));
}

export function normalizeCapitalPointProject({
  sourceKey,
  category,
  sourceName,
  sourceUrl,
  agency,
  record,
  index,
  projectOrigin = "unknown",
  confidence,
  statusHint,
  addressKeys,
  nameKeys,
  startDateKeys,
  endDateKeys,
  approvalDateKeys,
  reviewDateKeys,
  descriptionFields,
}) {
  const latitude = pickNumber(record, ["latitude", "lat", "위도", "Y좌표", "좌표Y", "centerLat"]);
  const longitude = pickNumber(record, ["longitude", "lng", "경도", "X좌표", "좌표X", "centerLng"]);
  const name = pickString(record, nameKeys || ["name", "공사명", "사업명", "건축물명"]);
  const address = pickString(record, addressKeys || ["address", "공사현장주소", "공사위치", "대지위치", "사업위치", "소재지"]);

  if (!name || latitude == null || longitude == null || !isCapitalAddress(address)) {
    return null;
  }

  const startDate = normalizeDate(pickString(record, startDateKeys || ["착공일", "공사시작일", "착공예정일"]));
  const usageApprovalDate = normalizeDate(pickString(record, ["사용승인일", "준공일"]));
  const endDate =
    usageApprovalDate || normalizeDate(pickString(record, endDateKeys || ["준공예정일", "준공일", "공사종료일"]));
  const approvalDate = normalizeDate(pickString(record, approvalDateKeys || ["허가일", "승인일", "계획승인일"]));
  const reviewDate = normalizeDate(pickString(record, reviewDateKeys || ["심의일", "위원회일자"]));
  const resolvedStatus = determineCapitalStatus({
    statusHint,
    startDate,
    endDate,
    approvalDate,
    usageApprovalDate,
    reviewDate,
  });

  return {
    id: buildSourceProjectId(sourceKey, record, index),
    category,
    name,
    geometryType: "point",
    latitude,
    longitude,
    address,
    status: resolvedStatus,
    sourceName,
    sourceUrl,
    agency: agency || pickString(record, ["agency", "발주자", "발주청", "시행자", "기관명", "사업주체", "구분기관"]),
    startDate,
    endDate,
    description: buildCapitalDescription(record, descriptionFields),
    updatedAt:
      normalizeDate(pickString(record, ["updatedAt", "갱신일", "수정일", "기준일자", "허가일", "승인일", "심의일"])) ||
      new Date().toISOString().slice(0, 10),
    projectOrigin,
    confidence: confidence || determineCapitalConfidence({ startDate, approvalDate, usageApprovalDate, reviewDate }),
  };
}

export function determineCapitalStatus({ statusHint, startDate, endDate, approvalDate, usageApprovalDate, reviewDate }) {
  if (usageApprovalDate) return "completed";

  if (endDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (endDate <= today) return "completed";
  }

  if (startDate) return "in_progress";
  if (approvalDate) return "approved";
  if (statusHint === "planned" || reviewDate) return "planned";
  return "unknown";
}

export function determineCapitalConfidence({ startDate, approvalDate, usageApprovalDate, reviewDate }) {
  if (startDate || usageApprovalDate) return "high";
  if (approvalDate) return "medium";
  if (reviewDate) return "low";
  return "medium";
}

export function buildCapitalDescription(record, descriptionFields = []) {
  const explicitDescription = pickString(record, ["description", "공사개요", "사업내용", "비고"]);
  const parts = explicitDescription ? [explicitDescription] : [];

  descriptionFields.forEach(({ label, keys }) => {
    const value = pickString(record, keys);
    if (value) {
      parts.push(`${label}: ${value}`);
    }
  });

  return uniqueStrings(parts).join(" / ") || undefined;
}

export function mergeCapitalProjects(items) {
  const merged = [];

  items.forEach((item) => {
    const existingIndex = merged.findIndex((candidate) => areSameProject(candidate, item));
    if (existingIndex === -1) {
      merged.push({ ...item });
      return;
    }

    merged[existingIndex] = combineProjects(merged[existingIndex], item);
  });

  return merged;
}

function areSameProject(left, right) {
  if (left.permitKey && right.permitKey && left.permitKey === right.permitKey) return true;
  if (left.category !== right.category) return false;

  const sameAddress = normalizeAddress(left.address) && normalizeAddress(left.address) === normalizeAddress(right.address);
  const sameName = normalizeName(left.name) === normalizeName(right.name);
  const nearCoords = distanceKm(left, right) <= 0.25;
  const sameAgency = normalizeToken(left.agency) && normalizeToken(left.agency) === normalizeToken(right.agency);
  const similarDates = areDatesSimilar(left.startDate, right.startDate) || areDatesSimilar(left.endDate, right.endDate);

  if (sameName && (sameAddress || nearCoords || similarDates || sameAgency)) return true;
  if (sameAddress && (nearCoords || similarDates || sameAgency)) return true;
  return false;
}

function combineProjects(base, incoming) {
  const preferred = pickPreferred(base, incoming);
  const secondary = preferred === base ? incoming : base;
  const origin = mergeOrigin(base.projectOrigin, incoming.projectOrigin);
  const sourceNames = uniqueStrings([base.sourceName, incoming.sourceName]);
  const descriptions = uniqueStrings([base.description, incoming.description]);

  return {
    ...preferred,
    id: preferred.id,
    permitKey: preferred.permitKey || secondary.permitKey,
    address: preferred.address || secondary.address,
    agency: preferred.agency || secondary.agency,
    startDate: pickEarlierDate(base.startDate, incoming.startDate),
    endDate: pickLaterDate(base.endDate, incoming.endDate),
    status: pickHigherPriority(base.status, incoming.status, STATUS_PRIORITY, "unknown"),
    sourceName: sourceNames.join(" + "),
    sourceUrl: preferred.sourceUrl || secondary.sourceUrl,
    updatedAt: pickLaterDate(base.updatedAt, incoming.updatedAt),
    projectOrigin: origin,
    confidence: pickHigherPriority(base.confidence, incoming.confidence, CONFIDENCE_PRIORITY, undefined),
    description: appendSourceSummary(descriptions, sourceNames),
  };
}

function appendSourceSummary(descriptions, sourceNames) {
  const parts = [...descriptions];
  const summary = sourceNames.length > 1 ? `출처 통합: ${sourceNames.join(", ")}` : undefined;
  if (summary) parts.push(summary);
  return parts.join(" / ") || undefined;
}

function pickPreferred(left, right) {
  const leftScore = STATUS_PRIORITY[left.status] + CONFIDENCE_PRIORITY[left.confidence] * 0.1;
  const rightScore = STATUS_PRIORITY[right.status] + CONFIDENCE_PRIORITY[right.confidence] * 0.1;

  if (rightScore > leftScore) return right;
  if (leftScore > rightScore) return left;

  const leftUpdated = left.updatedAt || "";
  const rightUpdated = right.updatedAt || "";
  return rightUpdated > leftUpdated ? right : left;
}

function mergeOrigin(left = "unknown", right = "unknown") {
  if (left === right) return left;
  if (left === "unknown") return right;
  if (right === "unknown") return left;
  return "mixed";
}

function normalizeName(value) {
  return normalizeToken(value)
    .replace(/\b(주택건설사업|건설사업|신축|개발사업|개발계획|복합개발|건립사업)\b/g, "")
    .replace(/\s+/g, "");
}

function normalizeAddress(value) {
  return normalizeToken(value)
    .replace(/(서울특별시|인천광역시|경기도)/g, (matched) => matched.slice(0, 2))
    .replace(/\s+/g, "");
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[()\-_,./]/g, " ")
    .trim();
}

function distanceKm(left, right) {
  const latDiff = (left.latitude - right.latitude) * 111;
  const lngDiff = (left.longitude - right.longitude) * 88;
  return Math.sqrt(latDiff ** 2 + lngDiff ** 2);
}

function areDatesSimilar(left, right) {
  if (!left || !right) return false;
  return String(left).slice(0, 7) === String(right).slice(0, 7);
}

function pickEarlierDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}

function pickLaterDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function pickHigherPriority(left, right, priorities, fallback) {
  const leftPriority = priorities[left] || 0;
  const rightPriority = priorities[right] || 0;
  if (rightPriority > leftPriority) return right;
  if (leftPriority > rightPriority) return left;
  return left || right || fallback;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
