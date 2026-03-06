import type { Env, SourceRecord } from "../types";
import { fetchOpenApiItems, pickNumber, pickString } from "./common";

const ENDPOINT = "https://apis.data.go.kr/1613000/ArchHubBuildingPermitService/getBuildingPermitList";

export async function fetchBuildingHub(env: Env): Promise<SourceRecord[]> {
  const items = await fetchOpenApiItems(env, ENDPOINT);

  return items.map((item, index) => ({
    sourceId: "building-hub-openapi",
    sourceRecordId: pickString(item, ["manageNo", "mgmNo", "id"]) || `hub-${index}`,
    title: pickString(item, ["bldNm", "title", "건물명"]) || "건축허가",
    addressRoad: pickString(item, ["rnAdres", "roadAddress", "도로명주소"]),
    addressJibun: pickString(item, ["lnmAdres", "jibunAddress", "지번주소"]),
    permitType: pickString(item, ["prmisnSe", "permitType", "허가구분"]),
    mainUse: pickString(item, ["mainPrposCodeNm", "mainUse", "주용도"]),
    permitDate: pickString(item, ["prmisnDe", "permitDate", "허가일"]),
    startDate: pickString(item, ["stcnsDe", "startDate", "착공일"]),
    approvalDate: pickString(item, ["useAprDe", "approvalDate", "사용승인일"]),
    rawStatus: pickString(item, ["prmisnSttus", "status", "상태"]),
    buildingArea: pickNumber(item, ["archArea", "buildingArea", "건축면적"]),
    grossFloorArea: pickNumber(item, ["totArea", "grossFloorArea", "연면적"]),
    floorsAbove: pickNumber(item, ["grndFlrCnt", "floorsAbove", "지상층수"]),
    floorsBelow: pickNumber(item, ["ugrndFlrCnt", "floorsBelow", "지하층수"]),
    households: pickNumber(item, ["hhldCnt", "households", "세대수"]),
    contractor: pickString(item, ["cnstrctEntrprsNm", "contractor", "시공자"]),
    designer: pickString(item, ["dsgnEntrprsNm", "designer", "설계자"]),
    supervisor: pickString(item, ["spvsEntrprsNm", "supervisor", "감리자"]),
    lat: pickNumber(item, ["lat", "위도"]),
    lng: pickNumber(item, ["lot", "lng", "경도"]),
    localGovernment: pickString(item, ["sigunguNm", "기관명", "localGovernment"]),
    raw: item,
  }));
}
