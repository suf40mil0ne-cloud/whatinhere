import {
  buildSourceProjectId,
  normalizeDate,
  pickNumber,
  pickString,
} from "../scripts/project-normalizers.js";

const CAPITAL_PREFIXES = ["서울", "서울특별시", "인천", "인천광역시", "경기", "경기도"];

export function createBuildingReferenceContext({ coordinateReferenceItems = [], plotItems = [] }) {
  const coordinateIndex = new Map();
  const plotByPermitKey = new Map();
  const plotByAddress = new Map();

  [...coordinateReferenceItems, ...plotItems].forEach((item) => {
    const address = pickString(item, ["address", "대지위치"]);
    const latitude = pickNumber(item, ["latitude", "lat", "위도"]);
    const longitude = pickNumber(item, ["longitude", "lng", "경도"]);
    const permitKey = pickString(item, ["permitKey", "permitManagementId", "관리허가대장관리번호"]);

    if (permitKey && !plotByPermitKey.has(permitKey)) {
      plotByPermitKey.set(permitKey, item);
    }
    if (address && !plotByAddress.has(normalizeAddress(address))) {
      plotByAddress.set(normalizeAddress(address), item);
    }

    if (address && latitude != null && longitude != null) {
      [normalizeAddress(address), normalizeAddress(stripLotSuffix(address))]
        .filter(Boolean)
        .forEach((key) => {
          if (!coordinateIndex.has(key)) {
            coordinateIndex.set(key, { latitude, longitude });
          }
        });
    }
  });

  return { coordinateIndex, plotByPermitKey, plotByAddress };
}

export function normalizeBuildingHubRows({
  rows,
  referenceContext,
  regionScope = "nationwide",
  sourceName = "국토교통부 건축HUB 건축인허가정보",
  sourceUrl = "https://www.data.go.kr/",
}) {
  return normalizeBuildingSupplementRows({
    sourceKey: "building-hub",
    rows,
    referenceContext,
    regionScope,
    sourceName,
    sourceUrl,
    nameKeys: ["title", "bldNm", "건물명", "name"],
    addressKeys: ["addressRoad", "rnAdres", "도로명주소", "addressJibun", "lnmAdres", "지번주소", "address"],
    permitKeyKeys: ["permitKey", "manageNo", "mgmNo", "관리허가대장관리번호", "sourceRecordId"],
    mainUseKeys: ["mainUse", "mainPrposCodeNm", "주용도", "buildingUse"],
    contractorKeys: ["contractor", "cnstrctEntrprsNm", "시공자"],
    descriptionKeys: ["summary", "description", "기본개요"],
    sourceName,
    sourceUrl,
  });
}

export function normalizeBuildingOverviewRows({
  rows,
  referenceContext,
  regionScope = "nationwide",
  sourceName = "국토교통부 건축인허가 기본개요",
  sourceUrl = "https://www.data.go.kr/",
}) {
  return normalizeBuildingSupplementRows({
    sourceKey: "building-overview",
    rows,
    referenceContext,
    regionScope,
    sourceName,
    sourceUrl,
    nameKeys: ["bldNm", "건물명", "title", "name"],
    addressKeys: ["platPlc", "대지위치", "addressJibun", "지번주소", "newPlatPlc", "addressRoad", "도로명주소"],
    permitKeyKeys: ["permitKey", "mgmBldrgstPk", "mgmPmsrgstPk", "관리허가대장관리번호", "sourceRecordId"],
    mainUseKeys: ["mainPurpsCdNm", "mainUse", "주용도", "buildingUse"],
    contractorKeys: ["시공자", "contractor"],
    descriptionKeys: ["기본개요", "summary", "description", "etcPurps"],
    sourceName,
    sourceUrl,
  });
}

function normalizeBuildingSupplementRows({
  sourceKey,
  rows,
  referenceContext,
  regionScope,
  nameKeys,
  addressKeys,
  permitKeyKeys,
  mainUseKeys,
  contractorKeys,
  descriptionKeys,
  sourceName,
  sourceUrl,
}) {
  const stats = {
    rawRowCount: Array.isArray(rows) ? rows.length : 0,
    filterBeforeCount: Array.isArray(rows) ? rows.length : 0,
    filterAfterCount: 0,
    coordinateValidCount: 0,
    joinSuccessCount: 0,
    normalizedSuccessCount: 0,
    dedupeRemovedCount: 0,
    skipCounts: {
      outsideScope: 0,
      addressMissing: 0,
      coordinateMissing: 0,
      nameMissing: 0,
      duplicatePermitKey: 0,
    },
  };

  const filteredRows = (rows || []).filter((record) => {
    if (regionScope !== "capital") return true;
    const address = pickString(record, addressKeys);
    const keep = isCapitalAddress(address);
    if (!keep) stats.skipCounts.outsideScope += 1;
    return keep;
  });
  stats.filterAfterCount = filteredRows.length;

  const items = [];
  const seenKeys = new Set();

  filteredRows.forEach((record, index) => {
    const permitKey = pickString(record, permitKeyKeys);
    const address = pickString(record, addressKeys);
    if (!address) {
      stats.skipCounts.addressMissing += 1;
      return;
    }

    const name =
      pickString(record, nameKeys) ||
      pickString(record, mainUseKeys) ||
      "민간 건축 인허가 후보";
    if (!name) {
      stats.skipCounts.nameMissing += 1;
      return;
    }

    const coords = resolveCoordinates(record, address, permitKey, referenceContext);
    if (!coords) {
      stats.skipCounts.coordinateMissing += 1;
      return;
    }
    stats.coordinateValidCount += 1;

    if (coords.joinedFromPlot) {
      stats.joinSuccessCount += 1;
    }

    const dedupeKey = permitKey || `${normalizeAddress(address)}|${normalizeAddress(name)}`;
    if (seenKeys.has(dedupeKey)) {
      stats.skipCounts.duplicatePermitKey += 1;
      stats.dedupeRemovedCount += 1;
      return;
    }
    seenKeys.add(dedupeKey);

    const permitDate = normalizeDate(
      pickString(record, ["permitDate", "prmisnDe", "pmsDay", "허가일", "승인일"])
    );
    const startDate = normalizeDate(
      pickString(record, ["startDate", "stcnsDe", "stcnsDay", "착공일"])
    );
    const approvalDate = normalizeDate(
      pickString(record, ["approvalDate", "useAprDe", "useAprDay", "사용승인일"])
    );
    const endDate = approvalDate || normalizeDate(pickString(record, ["준공일", "endDate"]));

    items.push({
      id: buildSourceProjectId(sourceKey, { ...record, name, permitKey, address }, index),
      category: "public_construction",
      name,
      geometryType: "point",
      latitude: coords.latitude,
      longitude: coords.longitude,
      address,
      status: determineBuildingStatus({ permitDate, startDate, approvalDate, rawStatus: pickString(record, ["rawStatus", "prmisnSttus", "status"]) }),
      sourceName,
      sourceUrl,
      agency: "국토교통부",
      startDate,
      endDate,
      description: buildDescription(record, {
        permitKey,
        mainUse: pickString(record, mainUseKeys),
        contractor: pickString(record, contractorKeys),
      }, descriptionKeys),
      updatedAt:
        normalizeDate(pickString(record, ["updatedAt", "verifiedAt", "기준일자", "lastUpdtDt"])) ||
        new Date().toISOString().slice(0, 10),
      projectOrigin: "private",
      confidence: approvalDate || startDate ? "high" : permitDate ? "medium" : "low",
      permitKey: permitKey || undefined,
    });
  });

  stats.normalizedSuccessCount = items.length;
  return { items, stats };
}

function resolveCoordinates(record, address, permitKey, referenceContext) {
  const latitude = pickNumber(record, ["latitude", "lat", "위도", "Y좌표"]);
  const longitude = pickNumber(record, ["longitude", "lng", "경도", "X좌표"]);
  if (latitude != null && longitude != null) {
    return { latitude, longitude, joinedFromPlot: false };
  }

  if (permitKey) {
    const matchedPlot = referenceContext.plotByPermitKey.get(permitKey);
    if (matchedPlot?.latitude != null && matchedPlot?.longitude != null) {
      return { latitude: matchedPlot.latitude, longitude: matchedPlot.longitude, joinedFromPlot: true };
    }
  }

  const normalizedAddress = normalizeAddress(address);
  const matchedAddress = referenceContext.plotByAddress.get(normalizedAddress);
  if (matchedAddress?.latitude != null && matchedAddress?.longitude != null) {
    return { latitude: matchedAddress.latitude, longitude: matchedAddress.longitude, joinedFromPlot: true };
  }

  const keys = [normalizedAddress, normalizeAddress(stripLotSuffix(address))].filter(Boolean);
  for (const key of keys) {
    const coords = referenceContext.coordinateIndex.get(key);
    if (coords) return { ...coords, joinedFromPlot: false };
  }

  return null;
}

function determineBuildingStatus({ permitDate, startDate, approvalDate, rawStatus }) {
  const statusText = String(rawStatus || "").toLowerCase();
  if (approvalDate || statusText.includes("사용승인") || statusText.includes("완료")) return "completed";
  if (startDate || statusText.includes("착공")) return "in_progress";
  if (permitDate || statusText.includes("허가") || statusText.includes("승인")) return "approved";
  return "unknown";
}

function buildDescription(record, base, descriptionKeys) {
  const parts = [];
  if (base.permitKey) parts.push(`관리번호: ${base.permitKey}`);
  if (base.mainUse) parts.push(`주용도: ${base.mainUse}`);
  if (pickNumber(record, ["grossFloorArea", "totArea", "연면적"]) != null) {
    parts.push(`연면적: ${pickNumber(record, ["grossFloorArea", "totArea", "연면적"])}`);
  }
  if (pickNumber(record, ["buildingArea", "archArea", "건축면적"]) != null) {
    parts.push(`건축면적: ${pickNumber(record, ["buildingArea", "archArea", "건축면적"])}`);
  }
  if (pickNumber(record, ["floorsAbove", "grndFlrCnt", "지상층수"]) != null) {
    parts.push(`지상층수: ${pickNumber(record, ["floorsAbove", "grndFlrCnt", "지상층수"])}`);
  }
  if (pickNumber(record, ["floorsBelow", "ugrndFlrCnt", "지하층수"]) != null) {
    parts.push(`지하층수: ${pickNumber(record, ["floorsBelow", "ugrndFlrCnt", "지하층수"])}`);
  }
  if (pickNumber(record, ["households", "hhldCnt", "세대수"]) != null) {
    parts.push(`세대수: ${pickNumber(record, ["households", "hhldCnt", "세대수"])}`);
  }
  if (base.contractor) parts.push(`시공자: ${base.contractor}`);

  const explicit = pickString(record, descriptionKeys);
  if (explicit) parts.push(explicit);

  return [...new Set(parts.filter(Boolean))].join(" / ") || undefined;
}

function isCapitalAddress(address) {
  return CAPITAL_PREFIXES.some((prefix) => String(address || "").startsWith(prefix));
}

function normalizeAddress(value) {
  return String(value || "")
    .replace(/서울특별시/g, "서울")
    .replace(/인천광역시/g, "인천")
    .replace(/경기도/g, "경기")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLotSuffix(address) {
  return String(address || "")
    .replace(/\s+\d+(-\d+)?(?:번지)?$/u, "")
    .trim();
}
