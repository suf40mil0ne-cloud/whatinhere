import { httpGetJson, sleep } from "../shared/http";
import { NormalizedRecord } from "./normalize";

function mapBuildPermitItemToNormalized(item: any): NormalizedRecord {
  const address = item?.platPlc || item?.대지위치 || item?.addr || "";
  const title = item?.bldNm || item?.건물명 || item?.mainPurpsCdNm || "건축 인허가(미상)";
  const issued = item?.pmsDay || item?.허가일 || item?.permitDate || "";

  return {
    source: "BUILD_PERMIT",
    sourceRecordId: String(item?.mgmPmsrgstPk || item?.관리번호 || `${title}|${address}|${issued}`),
    title,
    address_raw: address || undefined,
    issued_at: issued ? new Date(issued).toISOString() : undefined,
    use: item?.mainPurpsCdNm || item?.용도 || item?.use || undefined,
    area_m2: item?.totArea ? Number(item.totArea) : undefined,
    floors: item?.grndFlrCnt ? Number(item.grndFlrCnt) : undefined,
    units: item?.hhldCnt ? Number(item.hhldCnt) : undefined,
    evidence_urls: item?.link ? [String(item.link)] : undefined,
  };
}

export async function fetchBuildPermits(params: {
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
  for (const it of items) out.push(mapBuildPermitItemToNormalized(it));
  await sleep(150);
  return out;
}
