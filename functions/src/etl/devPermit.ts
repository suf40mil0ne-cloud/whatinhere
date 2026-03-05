import { httpGetJson, sleep } from "../shared/http";
import { type NormalizedRecord } from "./normalize";

function pick(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/\./g, "-").replace(/\//g, "-");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function mapDevPermitItemToNormalized(raw: unknown): NormalizedRecord {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = String(
    pick(item, ["bizNm", "사업명", "prjNm", "prjName", "title", "bizName"]) ?? "개발행위(미상)"
  );
  const address = pick(item, ["addr", "address", "소재지", "대지위치", "locAddr", "roadAddr"]);
  const issued = pick(item, ["prmisnDe", "허가일", "permitDate", "issuedAt", "date"]);
  const use = pick(item, ["use", "용도", "mainUse", "facilityUse", "landUse"]);
  const area = pick(item, ["area", "면적", "devArea", "planArea", "areaM2"]);
  const sourceId = pick(item, ["id", "관리번호", "no", "prjId", "pk", "seq"]);
  const pnu = pick(item, ["pnu", "PNU", "지번코드", "lotPnu"]);
  const link = pick(item, ["link", "sourceUrl", "detailUrl", "원문링크"]);

  const addressStr = address ? String(address) : undefined;
  const issuedIso = toIso(issued);
  const sourceRecordId = String(sourceId ?? `${title}|${addressStr ?? ""}|${issuedIso ?? ""}`);

  return {
    source: "DEV_PERMIT",
    sourceRecordId,
    title,
    address_raw: addressStr,
    pnu: pnu ? String(pnu) : undefined,
    issued_at: issuedIso,
    use: use ? String(use) : undefined,
    area_m2: toNumber(area),
    evidence_urls: link ? [String(link)] : undefined,
  };
}

export async function fetchDevPermits(params: {
  serviceKey: string;
  baseUrl: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<NormalizedRecord[]> {
  const pageNo = params.pageNo ?? 1;
  const numOfRows = params.numOfRows ?? 200;

  const sep = params.baseUrl.includes("?") ? "&" : "?";
  const url = `${params.baseUrl}${sep}serviceKey=${encodeURIComponent(params.serviceKey)}&pageNo=${pageNo}&numOfRows=${numOfRows}&type=json`;

  const json = await httpGetJson<Record<string, unknown>>(url);
  const response = (json.response ?? {}) as Record<string, unknown>;
  const body = (response.body ?? {}) as Record<string, unknown>;
  const itemsNode = (body.items ?? json.items) as unknown;
  const itemNode =
    itemsNode && typeof itemsNode === "object" && !Array.isArray(itemsNode)
      ? (itemsNode as Record<string, unknown>).item ?? itemsNode
      : itemsNode;

  const rows = toArray(itemNode);
  const out: NormalizedRecord[] = rows.map((row) => mapDevPermitItemToNormalized(row));

  await sleep(150);
  return out;
}
