import {
  buildSourceProjectId,
  normalizeDate,
  pickNumber,
  pickString,
} from "../scripts/project-normalizers.js";

const CAPITAL_PREFIXES = ["서울", "서울특별시", "인천", "인천광역시", "경기", "경기도"];
const CAPITAL_SGG_PREFIXES = ["11", "28", "41"];
const REPRESENTATIVE_VALUES = new Set(["Y", "1", "예", "대표", "TRUE"]);

export function normalizeBuildingPlotRows({ rows, coordinateIndex = new Map(), regionScope = "capital" }) {
  const stats = {
    rawRowCount: Array.isArray(rows) ? rows.length : 0,
    capitalFilterBeforeCount: Array.isArray(rows) ? rows.length : 0,
    capitalFilterAfterCount: 0,
    groupedCount: 0,
    representativePreferredCount: 0,
    coordinateResolvedCount: 0,
    normalizedSuccessCount: 0,
    dedupeRemovedCount: 0,
    skipCounts: {
      outsideCapital: 0,
      addressMissing: 0,
      permitIdMissing: 0,
      duplicateAddress: 0,
      coordinateMissing: 0,
      nameMissing: 0,
    },
  };

  const capitalRows = (rows || []).filter((row) => {
    const keep = regionScope === "nationwide" ? true : isCapitalBuildingPlot(row);
    if (!keep) stats.skipCounts.outsideCapital += 1;
    return keep;
  });
  stats.capitalFilterAfterCount = capitalRows.length;

  const grouped = groupByPermitId(capitalRows);
  stats.groupedCount = grouped.length;

  const items = [];
  const seenFingerprints = new Set();

  grouped.forEach(({ permitId, members }, index) => {
    const preferred = pickPreferredMember(members);
    if (preferred.isRepresentative) stats.representativePreferredCount += 1;

    const record = preferred.record;
    const address = buildPlotAddress(record);
    if (!address) {
      stats.skipCounts.addressMissing += 1;
      return;
    }

    const name = buildPlotName(record, address);
    if (!name) {
      stats.skipCounts.nameMissing += 1;
      return;
    }

    const coords = resolveCoordinates(record, address, coordinateIndex);
    if (!coords) {
      stats.skipCounts.coordinateMissing += 1;
      return;
    }

    stats.coordinateResolvedCount += 1;

    const fingerprint = `${normalizeToken(address)}|${permitId || ""}`;
    if (seenFingerprints.has(fingerprint)) {
      stats.skipCounts.duplicateAddress += 1;
      stats.dedupeRemovedCount += 1;
      return;
    }
    seenFingerprints.add(fingerprint);

    const permitDate = normalizeDate(
      pickString(record, ["허가일", "인허가일", "허가승인일", "pmsDay", "PERMIT_DE"])
    );
    if (!permitId || String(permitId).startsWith("missing-")) {
      stats.skipCounts.permitIdMissing += 1;
    }

    items.push({
      id: buildSourceProjectId("building-plot", { ...record, 관리허가대장관리번호: permitId, name }, index),
      category: "public_construction",
      name,
      geometryType: "point",
      latitude: coords.latitude,
      longitude: coords.longitude,
      address,
      status: permitDate ? "approved" : "unknown",
      sourceName: "국토교통부 건축인허가 대지위치",
      sourceUrl: "https://www.data.go.kr/",
      agency: "국토교통부",
      description: buildDescription(record, {
        permitId,
        unitId: pickString(record, ["관리동별개요관리번호", "mgmDongPk", "MGM_DONG_PK"]),
        memberCount: members.length,
        address,
      }),
      updatedAt:
        normalizeDate(pickString(record, ["기준일자", "수정일", "갱신일", "updateDate", "lastUpdtDt"])) ||
        new Date().toISOString().slice(0, 10),
      projectOrigin: "private",
      confidence: permitDate ? "medium" : "low",
      permitKey: permitId || undefined,
      permitManagementId: permitId || undefined,
      unitManagementId: pickString(record, ["관리동별개요관리번호", "mgmDongPk", "MGM_DONG_PK"]),
    });
  });

  stats.normalizedSuccessCount = items.length;

  return { items, stats };
}

export function createCoordinateIndex(referenceItems) {
  const index = new Map();

  (referenceItems || []).forEach((item) => {
    const address = pickString(item, ["address", "대지위치"]);
    const latitude = pickNumber(item, ["latitude", "lat", "위도"]);
    const longitude = pickNumber(item, ["longitude", "lng", "경도"]);
    if (!address || latitude == null || longitude == null) return;

    const keys = [normalizeToken(address), normalizeToken(stripLotSuffix(address))].filter(Boolean);
    keys.forEach((key) => {
      if (!index.has(key)) {
        index.set(key, { latitude, longitude });
      }
    });
  });

  return index;
}

function isCapitalBuildingPlot(record) {
  const address = buildPlotAddress(record);
  if (address && CAPITAL_PREFIXES.some((prefix) => address.startsWith(prefix))) {
    return true;
  }

  const sigunguCode = pickString(record, ["시군구코드", "sigunguCd", "sigungu_code", "SGG_CD"]);
  if (sigunguCode && CAPITAL_SGG_PREFIXES.some((prefix) => sigunguCode.startsWith(prefix))) {
    return true;
  }

  const permitId = pickString(record, ["관리허가대장관리번호", "mgmPmsrgstPk", "MGM_PMSRGST_PK"]);
  if (permitId && CAPITAL_SGG_PREFIXES.some((prefix) => permitId.startsWith(prefix))) {
    return true;
  }

  return false;
}

function groupByPermitId(rows) {
  const grouped = new Map();

  rows.forEach((record, index) => {
    const permitId =
      pickString(record, ["관리허가대장관리번호", "mgmPmsrgstPk", "MGM_PMSRGST_PK"]) || `missing-${index + 1}`;
    const bucket = grouped.get(permitId) || [];
    bucket.push(record);
    grouped.set(permitId, bucket);
  });

  return [...grouped.entries()].map(([permitId, members]) => ({ permitId, members }));
}

function pickPreferredMember(members) {
  const sorted = [...members].sort((left, right) => scoreRepresentative(right) - scoreRepresentative(left));
  return {
    record: sorted[0],
    isRepresentative: scoreRepresentative(sorted[0]) > 0,
  };
}

function scoreRepresentative(record) {
  const explicit = pickString(record, ["대표여부", "대표구분", "대표건축물여부", "reprYn", "repYn"]);
  if (explicit && REPRESENTATIVE_VALUES.has(String(explicit).trim().toUpperCase())) {
    return 2;
  }

  const unitId = pickString(record, ["관리동별개요관리번호", "mgmDongPk", "MGM_DONG_PK"]);
  return unitId ? 1 : 0;
}

function buildPlotName(record, address) {
  return (
    pickString(record, ["건축물명", "대지위치명", "platNm", "bldNm", "name"]) ||
    `${extractDistrict(address)} 건축인허가 후보`
  );
}

function buildPlotAddress(record) {
  const base =
    pickString(record, ["대지위치", "platPlc", "platPlcNm", "소재지", "address", "지번주소"]) || "";
  const related =
    pickString(record, ["관련지번명", "relJibunNm", "새주소관련지번", "지번"]) ||
    [pickString(record, ["번", "bun"]), pickString(record, ["지", "ji"])].filter(Boolean).join("-");

  if (base && related && !base.includes(related)) {
    return `${base} ${related}`.trim();
  }

  return base || undefined;
}

function resolveCoordinates(record, address, coordinateIndex) {
  const latitude = pickNumber(record, ["latitude", "lat", "위도", "Y좌표"]);
  const longitude = pickNumber(record, ["longitude", "lng", "경도", "X좌표"]);
  if (latitude != null && longitude != null) {
    return { latitude, longitude };
  }

  const keys = [normalizeToken(address), normalizeToken(stripLotSuffix(address))].filter(Boolean);
  for (const key of keys) {
    const matched = coordinateIndex.get(key);
    if (matched) return matched;
  }

  return null;
}

function buildDescription(record, { permitId, unitId, memberCount, address }) {
  const parts = [];
  const sigunguCode = pickString(record, ["시군구코드", "sigunguCd", "SGG_CD"]);
  const bjdongCode = pickString(record, ["법정동코드", "bjdongCd", "BJDONG_CD"]);
  const jimok = pickString(record, ["지목명", "jimokNm"]);
  const block = pickString(record, ["블록", "block", "blk"]);
  const lot = pickString(record, ["로트", "lot", "lttot"]);

  if (address) parts.push(`대지위치: ${address}`);
  if (permitId) parts.push(`관리허가대장관리번호: ${permitId}`);
  if (unitId) parts.push(`관리동별개요관리번호: ${unitId}`);
  if (sigunguCode) parts.push(`시군구코드: ${sigunguCode}`);
  if (bjdongCode) parts.push(`법정동코드: ${bjdongCode}`);
  if (jimok) parts.push(`지목명: ${jimok}`);
  if (block) parts.push(`블록: ${block}`);
  if (lot) parts.push(`로트: ${lot}`);
  if (memberCount > 1) parts.push(`동별 묶음건수: ${memberCount}`);

  return parts.join(" / ") || undefined;
}

function stripLotSuffix(address) {
  return String(address || "")
    .replace(/\s+\d+(-\d+)?(?:번지)?$/u, "")
    .trim();
}

function extractDistrict(address) {
  const tokens = String(address || "").split(/\s+/).filter(Boolean);
  return tokens.slice(0, 2).join(" ") || "수도권";
}

function normalizeToken(value) {
  return String(value || "")
    .replace(/서울특별시/g, "서울")
    .replace(/인천광역시/g, "인천")
    .replace(/경기도/g, "경기")
    .replace(/\s+/g, " ")
    .trim();
}
