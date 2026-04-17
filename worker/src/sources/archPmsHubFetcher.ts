import type { Env, SourceRecord } from "../types";
import { pickNumber, pickString } from "./common";

const ENDPOINT = "https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo";

async function fetchAllPages(apiKey: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("numOfRows", String(pageSize));
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("_type", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`ArchPmsHub fetch failed: ${res.status} (page ${page})`);

    const payload = (await res.json()) as Record<string, unknown>;
    const body = (
      ((payload.response as Record<string, unknown>)?.body as Record<string, unknown>) ?? payload
    ) as Record<string, unknown>;
    const totalCount = Number((body as Record<string, unknown>).totalCount ?? 0);
    const itemsNode =
      (body.items as Record<string, unknown> | undefined)?.item ?? body.items;

    const items: Record<string, unknown>[] = Array.isArray(itemsNode)
      ? (itemsNode as Record<string, unknown>[])
      : itemsNode && typeof itemsNode === "object"
      ? [itemsNode as Record<string, unknown>]
      : [];

    all.push(...items);
    if (all.length >= totalCount || items.length < pageSize) break;
    page++;
  }

  return all;
}

export async function fetchArchPmsHub(env: Env): Promise<SourceRecord[]> {
  const apiKey = env.ARCH_PMS_HUB_API_KEY ?? env.DATA_GO_KR_SERVICE_KEY;
  if (!apiKey) throw new Error("ARCH_PMS_HUB_API_KEY or DATA_GO_KR_SERVICE_KEY is not set");

  const items = await fetchAllPages(apiKey);

  return items.map((item, index) => ({
    sourceId: "arch-pms-hub",
    sourceRecordId:
      pickString(item, ["mgmPmsrgstPk", "manageNo", "id"]) || `arch-pms-hub-${index}`,
    title: pickString(item, ["bldNm", "사업명", "건물명"]) || "건축인허가",
    addressRoad: pickString(item, ["newPlatPlc", "도로명주소"]),
    addressJibun: pickString(item, ["platPlc", "지번주소"]),
    permitType: pickString(item, ["archGbCdNm", "건축구분"]),
    mainUse: pickString(item, ["mainPurpsCdNm", "주용도"]),
    subUse: pickString(item, ["etcPurps", "기타용도"]),
    permitDate: pickString(item, ["pmsDay", "허가일"]),
    startDate: pickString(item, ["stcnsDay", "착공일"]),
    approvalDate: pickString(item, ["useAprDay", "사용승인일"]),
    rawStatus: pickString(item, ["pmsDay", "상태"]),
    // 면적 정보
    buildingArea: pickNumber(item, ["archArea", "건축면적"]),
    grossFloorArea: pickNumber(item, ["totArea", "연면적"]),
    floorsAbove: pickNumber(item, ["grndFlrCnt", "지상층수"]),
    floorsBelow: pickNumber(item, ["ugrndFlrCnt", "지하층수"]),
    households: pickNumber(item, ["hhldCnt", "세대수"]),
    // 대지면적 · 용적률 · 건폐율
    platArea: pickNumber(item, ["platArea", "대지면적"]),
    vlRat: pickNumber(item, ["vlRat", "용적률"]),
    bcRat: pickNumber(item, ["bcRat", "건폐율"]),
    lat: pickNumber(item, ["lat", "위도"]),
    lng: pickNumber(item, ["lot", "경도"]),
    localGovernment: pickString(item, ["sigunguCdNm", "시군구명"]),
    raw: item,
  }));
}
