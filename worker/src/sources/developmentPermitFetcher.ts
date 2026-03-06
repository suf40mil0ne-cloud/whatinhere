import type { Env, SourceRecord } from "../types";
import { fetchOpenApiItems, pickNumber, pickString } from "./common";

const ENDPOINT = "https://apis.data.go.kr/1613000/UrbanPlanDevelopmentPermitService/getUrbanPlanDevelopmentPermitList";

export async function fetchDevelopmentPermits(env: Env): Promise<SourceRecord[]> {
  const items = await fetchOpenApiItems(env, ENDPOINT);

  return items.map((item, index) => {
    const addressRoad = pickString(item, ["rnAdres", "roadAddress", "newAddr", "소재지도로명주소"]);
    const addressJibun = pickString(item, ["lnmAdres", "jibunAddress", "jibunAddr", "소재지지번주소"]);

    return {
      sourceId: "dev-permit-openapi",
      sourceRecordId: pickString(item, ["prmisnNo", "permitNo", "id"]) || `dev-${index}`,
      title: pickString(item, ["bizNm", "사업명", "title"]) || "개발행위허가",
      addressRoad,
      addressJibun,
      permitType: pickString(item, ["prmisnSe", "permitType", "허가종류"]) || "개발행위허가",
      mainUse: pickString(item, ["mainPrposCodeNm", "mainUse", "주용도"]),
      permitDate: pickString(item, ["prmisnDe", "permitDate", "허가일자"]),
      rawStatus: pickString(item, ["prmisnSttus", "status", "허가상태"]),
      lat: pickNumber(item, ["lat", "위도"]),
      lng: pickNumber(item, ["lot", "lng", "경도"]),
      localGovernment: pickString(item, ["insttNm", "sigunguNm", "기관명"]),
      raw: item,
    };
  });
}
