import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { info, quote, writeSqlFile, OUTPUT_DIR } from "./district-score-lib";

type AptRow = {
  id: string;
  name: string;
  address: string | null;
  district_code: string | null;
};

type KaptRow = {
  kaptCode: string;
  name: string;
  sigungu: string;
  address: string;
  totalUnits: number;
  normalizedName: string;
};

type MatchResult = {
  aptId: string;
  aptName: string;
  aptAddress: string | null;
  totalUnits: number;
  kaptCode: string;
  kaptName: string;
  kaptAddress: string;
  strategy: "name_sigungu" | "name_sigungu_address" | "address_similarity";
  score: number;
};

const KAPT_BASICINFO_PATH = process.env.KAPT_BASICINFO_XLSX ?? "/tmp/kapt-basicinfo.xlsx";
const APT_COMPLEXES_JSON_PATH = process.env.APT_COMPLEXES_JSON ?? "/tmp/apt-complexes.json";
const REPORT_PATH = path.join(OUTPUT_DIR, "update-total-units.report.json");

const NOISE_NAME_PATTERNS = [
  "전기차충전소",
  "충전소",
  "상가",
  "상가동",
  "관리사무소",
  "입주자대표회의",
  "오피스",
  "오피스텔",
  "레지던스",
];

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeSidoPrefix(value: string): string {
  return value
    .replace(/^서울\b/u, "서울특별시")
    .replace(/^부산\b/u, "부산광역시")
    .replace(/^대구\b/u, "대구광역시")
    .replace(/^인천\b/u, "인천광역시")
    .replace(/^광주\b/u, "광주광역시")
    .replace(/^대전\b/u, "대전광역시")
    .replace(/^울산\b/u, "울산광역시")
    .replace(/^세종\b/u, "세종특별자치시")
    .replace(/^경기\b/u, "경기도")
    .replace(/^강원\b/u, "강원특별자치도")
    .replace(/^충북\b/u, "충청북도")
    .replace(/^충남\b/u, "충청남도")
    .replace(/^전북\b/u, "전북특별자치도")
    .replace(/^전남\b/u, "전라남도")
    .replace(/^경북\b/u, "경상북도")
    .replace(/^경남\b/u, "경상남도")
    .replace(/^제주\b/u, "제주특별자치도");
}

function normalizeName(name: string): string {
  return cleanText(name)
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/아파트/gu, "")
    .replace(/주상복합/gu, "")
    .replace(/\s+/g, "")
    .replace(/[·._,'"-]/g, "")
    .toLowerCase();
}

function normalizeAddress(address: string): string {
  return normalizeSidoPrefix(cleanText(address))
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function addressTokens(address: string): string[] {
  return normalizeAddress(address)
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "대한민국");
}

function extractSigungu(address: string | null): string {
  const tokens = addressTokens(address ?? "");
  for (let i = 1; i < tokens.length; i++) {
    if (/[시군구]$/u.test(tokens[i])) return tokens[i];
  }
  return tokens[0] ?? "";
}

function parseUnits(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function isNoiseAptName(name: string): boolean {
  return NOISE_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  let common = 0;
  const short = a.length <= b.length ? a : b;
  const long = short === a ? b : a;
  for (const ch of new Set(short.split(""))) {
    if (long.includes(ch)) common += 1;
  }
  return common / new Set(long.split("")).size;
}

function addressSimilarity(a: string, b: string): number {
  const aa = normalizeAddress(a);
  const bb = normalizeAddress(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.95;
  const aTokens = new Set(addressTokens(aa));
  const bTokens = new Set(addressTokens(bb));
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union > 0 ? overlap / union : 0;
}

function loadAptRows(raw: string): AptRow[] {
  const parsed = JSON.parse(raw) as Array<{ results?: AptRow[] }> | AptRow[];
  if (Array.isArray(parsed) && parsed.length > 0 && "results" in parsed[0]) {
    return (parsed[0] as { results?: AptRow[] }).results ?? [];
  }
  return parsed as AptRow[];
}

function loadKaptRows(): KaptRow[] {
  const workbook = XLSX.readFile(KAPT_BASICINFO_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
  const header = rows[1] ?? [];
  const dataRows = rows.slice(2);
  const index = new Map<string, number>();
  header.forEach((name, idx) => index.set(String(name), idx));

  const result: KaptRow[] = [];
  for (const row of dataRows) {
    const totalUnits = parseUnits(row[index.get("세대수") ?? -1]);
    if (totalUnits == null) continue;
    const name = cleanText(row[index.get("단지명") ?? -1]);
    if (!name) continue;
    const sigungu = cleanText(row[index.get("시군구") ?? -1]);
    const roadAddress = cleanText(row[index.get("도로명주소") ?? -1]);
    const legalAddress = cleanText(row[index.get("법정동주소") ?? -1]);
    result.push({
      kaptCode: cleanText(row[index.get("단지코드") ?? -1]),
      name,
      sigungu: sigungu || extractSigungu(roadAddress || legalAddress),
      address: roadAddress || legalAddress,
      totalUnits,
      normalizedName: normalizeName(name),
    });
  }
  return result;
}

function chooseBestMatch(apt: AptRow, byExactKey: Map<string, KaptRow[]>, bySigungu: Map<string, KaptRow[]>): MatchResult | null {
  if (isNoiseAptName(apt.name)) return null;
  const sigungu = extractSigungu(apt.address);
  const aptNameNorm = normalizeName(apt.name);
  const aptAddress = apt.address ?? "";
  const exactKey = `${sigungu}|${aptNameNorm}`;
  const exactCandidates = byExactKey.get(exactKey) ?? [];

  if (exactCandidates.length === 1) {
    const chosen = exactCandidates[0];
    return {
      aptId: apt.id,
      aptName: apt.name,
      aptAddress: apt.address,
      totalUnits: chosen.totalUnits,
      kaptCode: chosen.kaptCode,
      kaptName: chosen.name,
      kaptAddress: chosen.address,
      strategy: "name_sigungu",
      score: 1,
    };
  }

  if (exactCandidates.length > 1) {
    const ranked = exactCandidates
      .map((row) => ({ row, score: addressSimilarity(aptAddress, row.address) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0] && ranked[0].score >= 0.72 && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.08)) {
      return {
        aptId: apt.id,
        aptName: apt.name,
        aptAddress: apt.address,
        totalUnits: ranked[0].row.totalUnits,
        kaptCode: ranked[0].row.kaptCode,
        kaptName: ranked[0].row.name,
        kaptAddress: ranked[0].row.address,
        strategy: "name_sigungu_address",
        score: ranked[0].score,
      };
    }
  }

  const localCandidates = (bySigungu.get(sigungu) ?? [])
    .map((row) => {
      const nameScore = nameSimilarity(aptNameNorm, row.normalizedName);
      const addrScore = addressSimilarity(aptAddress, row.address);
      return { row, score: nameScore * 0.45 + addrScore * 0.55, nameScore, addrScore };
    })
    .filter((item) => item.addrScore >= 0.82 || (item.addrScore >= 0.65 && item.nameScore >= 0.78))
    .sort((a, b) => b.score - a.score);

  if (localCandidates[0] && (!localCandidates[1] || localCandidates[0].score - localCandidates[1].score >= 0.06)) {
    return {
      aptId: apt.id,
      aptName: apt.name,
      aptAddress: apt.address,
      totalUnits: localCandidates[0].row.totalUnits,
      kaptCode: localCandidates[0].row.kaptCode,
      kaptName: localCandidates[0].row.name,
      kaptAddress: localCandidates[0].row.address,
      strategy: "address_similarity",
      score: Number(localCandidates[0].score.toFixed(4)),
    };
  }

  return null;
}

async function main() {
  const aptRows = loadAptRows(await fs.readFile(APT_COMPLEXES_JSON_PATH, "utf8"));
  const kaptRows = loadKaptRows();
  const byExactKey = new Map<string, KaptRow[]>();
  const bySigungu = new Map<string, KaptRow[]>();

  for (const row of kaptRows) {
    const exactKey = `${row.sigungu}|${row.normalizedName}`;
    const exactBucket = byExactKey.get(exactKey);
    if (exactBucket) exactBucket.push(row);
    else byExactKey.set(exactKey, [row]);

    const sigunguBucket = bySigungu.get(row.sigungu);
    if (sigunguBucket) sigunguBucket.push(row);
    else bySigungu.set(row.sigungu, [row]);
  }

  const matches: MatchResult[] = [];
  let skippedNoise = 0;
  for (const apt of aptRows) {
    if (isNoiseAptName(apt.name)) {
      skippedNoise += 1;
      continue;
    }
    const match = chooseBestMatch(apt, byExactKey, bySigungu);
    if (match) matches.push(match);
  }

  const sql = matches
    .map((match) => `UPDATE apt_complexes SET total_units=${match.totalUnits} WHERE id=${quote(match.aptId)};`)
    .join("\n");
  await writeSqlFile("update-total-units.sql", `${sql}\n`);

  const summary = {
    kaptRows: kaptRows.length,
    aptRows: aptRows.length,
    matched: matches.length,
    unmatched: aptRows.length - matches.length - skippedNoise,
    skippedNoise,
    byStrategy: matches.reduce<Record<string, number>>((acc, match) => {
      acc[match.strategy] = (acc[match.strategy] ?? 0) + 1;
      return acc;
    }, {}),
    sample: matches.slice(0, 50),
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  info(`fetch-total-units: loaded ${kaptRows.length} K-APT rows and ${aptRows.length} apt rows`);
  info(`fetch-total-units: matched ${matches.length} rows; skipped noise ${skippedNoise}`);
  info(`fetch-total-units: wrote output/update-total-units.sql and output/update-total-units.report.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
