import path from "node:path";
import { normalizeDate, pickString, readJsonFile } from "../scripts/project-normalizers.js";

const ROOT_DIR = path.resolve(".");
const SOURCE_NAME = "국토교통부 건설CALS 공사정보 목록";
const SOURCE_URL = "https://www.data.go.kr/data/15061025/openapi.do";

export function normalizeCalsConstructionRows(rows = []) {
  const referenceItems = loadReferenceItems();
  const referenceIndex = buildReferenceIndex(referenceItems);
  const stats = {
    rawRowCount: rows.length,
    normalizeAttemptCount: 0,
    normalizeSuccessCount: 0,
    matchedReferenceCount: 0,
    unmatchedCount: 0,
    skipCounts: {
      nameMissing: 0,
      referenceNotFound: 0,
    },
  };

  const items = rows
    .map((record, index) => {
      stats.normalizeAttemptCount += 1;

      const name = pickString(record, ["cwkNm", "공사명", "name"]);
      if (!name) {
        stats.skipCounts.nameMissing += 1;
        return null;
      }

      const matched = matchReference(record, referenceIndex);
      if (!matched) {
        stats.unmatchedCount += 1;
        stats.skipCounts.referenceNotFound += 1;
        return null;
      }

      stats.matchedReferenceCount += 1;

      const startDate = normalizeDate(pickString(record, ["stwrDt"]));
      const completedAt = normalizeDate(pickString(record, ["ccwDt"]));
      const expectedEndDate = normalizeDate(pickString(record, ["ccwXpcDt"]));
      const endDate = completedAt || expectedEndDate;
      const sourceNames = uniqueStrings([matched.sourceName, SOURCE_NAME]);

      stats.normalizeSuccessCount += 1;

      return {
        ...matched,
        id: `cals-construction-${slugify(pickString(record, ["cno", "sptNo", "cwkNm"]) || `${index + 1}`)}`,
        name,
        status: determineStatus(record, startDate, endDate),
        sourceName: sourceNames.join(" + "),
        sourceUrl: SOURCE_URL,
        agency: pickString(record, ["ornm"]) || matched.agency,
        startDate: startDate || matched.startDate,
        endDate: endDate || matched.endDate,
        updatedAt: new Date().toISOString().slice(0, 10),
        projectOrigin: "public",
        confidence: matched.confidence || "high",
        description: mergeDescriptions([
          matched.description,
          buildDescription(record),
        ]),
      };
    })
    .filter(Boolean);

  return { items, stats };
}

function loadReferenceItems() {
  return [
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "projects.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "data-sources", "normalized", "kiscon.json"), []),
    ...readJsonFile(path.join(ROOT_DIR, "public", "data", "projects.generated.json"), []),
  ].filter((item) => item?.category === "public_construction" && item.latitude != null && item.longitude != null);
}

function buildReferenceIndex(items) {
  const index = new Map();

  items.forEach((item) => {
    const keys = [
      normalizeName(item.name),
      normalizeName(item.name).replace(/건설사업|공사|사업/g, ""),
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!index.has(key)) {
        index.set(key, item);
      }
    });
  });

  return index;
}

function matchReference(record, referenceIndex) {
  const name = pickString(record, ["cwkNm", "공사명", "name"]);
  const section = pickString(record, ["cwkSctnNm"]);
  const route = pickString(record, ["rutNm"]);
  const candidates = [
    normalizeName(name),
    normalizeName(name).replace(/건설사업|공사|사업/g, ""),
    normalizeName([name, section].filter(Boolean).join(" ")),
    normalizeName([route, name].filter(Boolean).join(" ")),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (referenceIndex.has(candidate)) {
      return referenceIndex.get(candidate);
    }
  }

  return null;
}

function determineStatus(record, startDate, endDate) {
  const completed = pickString(record, ["ccwYn"]);
  const today = new Date().toISOString().slice(0, 10);

  if (completed === "1") return "completed";
  if (endDate && endDate <= today) return "completed";
  if (startDate) return "in_progress";
  if (endDate) return "approved";
  return "unknown";
}

function buildDescription(record) {
  const parts = [
    formatPart("발주기관", pickString(record, ["ornm"])),
    formatPart("행정구역", pickString(record, ["pdznNm"])),
    formatPart("노선", pickString(record, ["rutNm"])),
    formatPart("사업분야", pickString(record, ["bzarNm"])),
    formatPart("사업종류", pickString(record, ["bzKdNm"])),
    formatPart("공사구간", pickString(record, ["cwkSctnNm"])),
  ].filter(Boolean);

  return parts.join(" / ") || undefined;
}

function formatPart(label, value) {
  return value ? `${label}: ${value}` : undefined;
}

function mergeDescriptions(values) {
  return uniqueStrings(values).join(" / ") || undefined;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[()\-_,./]/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
