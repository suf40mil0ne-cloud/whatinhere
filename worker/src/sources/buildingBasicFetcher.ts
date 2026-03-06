import type { Env, SourceRecord } from "../types";
import { fetchOpenApiItems, pickNumber, pickString } from "./common";

const ENDPOINT = "https://apis.data.go.kr/1741000/StanBuildngPrmisnInfoService/getStanBuildngPrmisnInfoList";

export async function fetchBuildingBasic(env: Env): Promise<SourceRecord[]> {
  const items = await fetchOpenApiItems(env, ENDPOINT);

  return items.map((item, index) => ({
    sourceId: "building-basic-openapi",
    sourceRecordId: pickString(item, ["mgmBldrgstPk", "recordId", "id"]) || `basic-${index}`,
    title: pickString(item, ["platPlc", "bldNm", "건물명"]) || "건축인허가",
    addressRoad: pickString(item, ["newPlatPlc", "roadAddress", "소재지도로명주소"]),
    addressJibun: pickString(item, ["platPlc", "jibunAddress", "소재지지번주소"]),
    permitType: pickString(item, ["archGbCdNm", "permitType", "건축구분"]),
    mainUse: pickString(item, ["mainPurpsCdNm", "mainUse", "주용도"]),
    subUse: pickString(item, ["etcPurps", "subUse", "기타용도"]),
    permitDate: pickString(item, ["pmsDay", "permitDate", "허가일"]),
    startDate: pickString(item, ["stcnsDay", "startDate", "착공일"]),
    approvalDate: pickString(item, ["useAprDay", "approvalDate", "사용승인일"]),
    rawStatus: pickString(item, ["stcnsSchedDay", "status", "상태"]),
    buildingArea: pickNumber(item, ["archArea", "buildingArea", "건축면적"]),
    grossFloorArea: pickNumber(item, ["totArea", "grossFloorArea", "연면적"]),
    floorsAbove: pickNumber(item, ["grndFlrCnt", "floorsAbove", "지상층수"]),
    floorsBelow: pickNumber(item, ["ugrndFlrCnt", "floorsBelow", "지하층수"]),
    households: pickNumber(item, ["hhldCnt", "households", "세대수"]),
    lat: pickNumber(item, ["lat", "위도"]),
    lng: pickNumber(item, ["lot", "lng", "경도"]),
    localGovernment: pickString(item, ["sigunguCdNm", "기관명", "localGovernment"]),
    raw: item,
  }));
}
