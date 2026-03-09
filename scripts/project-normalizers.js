import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT_DIR, "data-sources", "raw");
const NORMALIZED_DIR = path.join(ROOT_DIR, "data-sources", "normalized");
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, "public", "data");

export function ensurePipelineDirs() {
  [RAW_DIR, NORMALIZED_DIR, PUBLIC_DATA_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

export function readJsonFile(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function resolveRawFile(sourceKey) {
  const candidates = [".json", ".csv"].map((ext) => path.join(RAW_DIR, `${sourceKey}${ext}`));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function readSourceRows(sourceKey, fallbackRows = []) {
  ensurePipelineDirs();
  const rawFile = resolveRawFile(sourceKey);

  if (!rawFile) {
    console.warn(`[${sourceKey}] raw source file not found in ${RAW_DIR}`);
    return fallbackRows;
  }

  const content = fs.readFileSync(rawFile, "utf8");
  if (rawFile.endsWith(".json")) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  }

  return parseCsv(content);
}

export function writeNormalizedSource(sourceKey, items) {
  ensurePipelineDirs();
  const outputPath = path.join(NORMALIZED_DIR, `${sourceKey}.json`);
  writeJsonFile(outputPath, items);
  console.log(`[${sourceKey}] normalized ${items.length} records -> ${outputPath}`);
}

export function readNormalizedSource(sourceKey) {
  return readJsonFile(path.join(NORMALIZED_DIR, `${sourceKey}.json`), []);
}

export function buildSourceProjectId(sourceKey, record, index) {
  const seed =
    pickString(record, ["id", "ID", "관리번호", "공사ID", "사업ID", "고시번호", "지구코드"]) ||
    pickString(record, ["name", "공사명", "사업명", "고시명", "지구명"]) ||
    `${sourceKey}-${index + 1}`;

  return `${sourceKey}-${slugify(seed)}`;
}

export function pickString(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

export function pickNumber(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
  }
  return undefined;
}

export function normalizeDate(value) {
  if (!value) return undefined;
  const text = String(value).trim().replace(/\./g, "-").replace(/\//g, "-");
  return text || undefined;
}

export function determineStatus({ rawStatus, startDate, endDate, trafficControl = false }) {
  const text = (rawStatus || "").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  if (trafficControl) {
    if (startDate && endDate && startDate <= today && endDate >= today) return "traffic_control";
    return "traffic_control";
  }

  if (text.includes("준공") || text.includes("완료")) return "completed";
  if (text.includes("인가") || text.includes("승인") || text.includes("고시")) return "approved";
  if (text.includes("계획") || text.includes("기획")) return "planned";
  if (startDate && endDate && startDate <= today && endDate >= today) return "in_progress";
  return "unknown";
}

export function normalizePointProject({
  sourceKey,
  category,
  sourceName,
  sourceUrl,
  agency,
  record,
  index,
  trafficControl = false,
  projectOrigin = "public",
  confidence,
}) {
  const latitude = pickNumber(record, ["latitude", "lat", "위도", "Y좌표", "centerLat"]);
  const longitude = pickNumber(record, ["longitude", "lng", "경도", "X좌표", "centerLng"]);
  const name = pickString(record, ["name", "공사명", "사업명", "고시명", "지구명", "노선명"]);
  const address = pickString(record, ["address", "소재지", "위치", "공사위치", "구간"]);
  const startDate = normalizeDate(pickString(record, ["startDate", "착공일", "공사시작일", "사업시작일", "시작일"]));
  const endDate = normalizeDate(pickString(record, ["endDate", "준공예정일", "공사종료일", "사업종료일", "종료일"]));
  const rawStatus = pickString(record, ["status", "진행단계", "공정상태", "사업단계", "단계"]);

  if (!name || latitude == null || longitude == null) {
    return null;
  }

  return {
    id: buildSourceProjectId(sourceKey, record, index),
    category,
    name,
    geometryType: "point",
    latitude,
    longitude,
    address,
    status: determineStatus({ rawStatus, startDate, endDate, trafficControl }),
    sourceName,
    sourceUrl,
    agency: agency || pickString(record, ["agency", "발주청", "시행자", "기관명", "사업시행자"]),
    startDate,
    endDate,
    description: pickString(record, ["description", "공사개요", "사업개요", "사업내용", "사유"]),
    updatedAt: normalizeDate(pickString(record, ["updatedAt", "수정일", "갱신일", "고시일자", "기준일자"])) || new Date().toISOString().slice(0, 10),
    projectOrigin,
    confidence,
  };
}

export function dedupeProjects(items) {
  const seen = new Map();

  for (const item of items) {
    const fingerprint = [
      item.name,
      item.startDate || "",
      item.endDate || "",
      roundForFingerprint(item.latitude),
      roundForFingerprint(item.longitude),
    ].join("|");

    if (!seen.has(fingerprint)) {
      seen.set(fingerprint, item);
    }
  }

  return [...seen.values()];
}

export function summarizeByCategory(items) {
  return items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
}

function roundForFingerprint(value) {
  return value == null ? "" : value.toFixed(3);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsv(content) {
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];

  const headers = splitCsvLine(headerLine);
  return lines.map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {});
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}
