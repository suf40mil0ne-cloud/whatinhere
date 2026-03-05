import { httpGetJson, sleep } from "../shared/http";
import { NormalizedRecord } from "./normalize";

function mapDevPermitItemToNormalized(item: any): NormalizedRecord {
  const address = item?.addr || item?.address || item?.소재지 || "";
  const title = item?.bizNm || item?.사업명 || item?.prjNm || "개발행위(미상)";
  const issued = item?.prmisnDe || item?.허가일 || item?.date || "";

  return {
    source: "DEV_PERMIT",
    sourceRecordId: String(item?.id || item?.관리번호 || item?.no || `${title}|${address}|${issued}`),
    title,
    address_raw: address || undefined,
    issued_at: issued ? new Date(issued).toISOString() : undefined,
    use: item?.use || item?.용도 || undefined,
    area_m2: item?.area ? Number(item.area) : undefined,
    evidence_urls: item?.link ? [String(item.link)] : undefined,
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
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&pageNo=${pageNo}&numOfRows=${numOfRows}&type=json`;
  const json: any = await httpGetJson(url);
  const items = json?.response?.body?.items?.item ?? json?.items ?? [];
  const out: NormalizedRecord[] = [];
  for (const it of items) out.push(mapDevPermitItemToNormalized(it));
  await sleep(150);
  return out;
}
