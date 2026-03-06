import type { AreaInfo, FaqItem, NearbyConstructionRecord } from "../types/content";
import { loadLocalGovernmentDatasetRecords } from "./connectors/local-gov-datasets";
import { loadMolitBuildingHubRecords } from "./connectors/molit-buildinghub";
import { loadMolitDevelopmentPermitRecords } from "./connectors/molit-development-permits";
import { mergeProjectRecords } from "./merge";

export const LAST_UPDATED = "2026-03-06";
export const METRO_CACHE_PATH = "/data/metro-seoul-projects.json";

export const AREAS: AreaInfo[] = [
  {
    slug: "seoul",
    name: "서울",
    shortDescription: "역세권과 업무지구, 수변 정비 사업이 동시에 나타나는 수도권 중심 권역입니다.",
    regionalContext:
      "서울은 업무지구 재편과 공공공간 정비가 겹치는 지역이 많아 허가, 착공, 사용승인 기준일 차이를 확인하는 것이 중요합니다.",
    whyImportant:
      "복합개발과 기반시설 정비가 생활권 이동, 상권 흐름, 통근 동선에 직접 반영될 수 있습니다.",
    fallbackCenter: { lat: 37.5665, lng: 126.978 },
  },
  {
    slug: "gyeonggi",
    name: "경기",
    shortDescription: "주거 확장과 교통·물류·전시권 개발이 함께 진행되는 수도권 외곽 핵심 권역입니다.",
    regionalContext:
      "경기는 신도시 공급, 물류시설, 광역교통 공사가 동시에 진행되는 지역이 많아 현재 위치 주변 허가·착공 상태 확인 가치가 큽니다.",
    whyImportant:
      "착공 여부와 사용승인 여부를 구분해서 봐야 실제 공사 체감 시점을 잘 판단할 수 있습니다.",
    fallbackCenter: { lat: 37.5388, lng: 127.0828 },
  },
  {
    slug: "incheon",
    name: "인천",
    shortDescription: "공항·항만·주거 확장과 도시정비가 함께 진행되는 수도권 서부 권역입니다.",
    regionalContext:
      "인천은 항만·공항 배후 개발과 원도심 정비, 주거 공급이 혼합되어 지역별 데이터 편차가 큰 편입니다.",
    whyImportant:
      "생활권 변화가 큰 사업이 많아 출처, 기준일, 좌표 정확도를 함께 보는 것이 중요합니다.",
    fallbackCenter: { lat: 37.4563, lng: 126.7052 },
  },
];

export const FAQS: FaqItem[] = [
  {
    q: "앱을 열면 바로 무엇을 보여주나요?",
    a: "현재 위치 또는 수도권 기본 좌표를 기준으로 주변 공사·개발·건축 인허가 마커를 바로 보여줍니다.",
  },
  {
    q: "정보는 어디서 오나요?",
    a: "국토교통부 건축HUB, 개발행위허가정보, 서울·인천·경기 지자체 자료처럼 공식 공개자료를 우선 사용합니다.",
  },
  {
    q: "공사중이라고 단정하나요?",
    a: "아닙니다. 착공일이 확인되고 사용승인일이 없을 때만 공사중 추정으로 표시합니다.",
  },
  {
    q: "위치 권한을 거부해도 되나요?",
    a: "가능합니다. 이 경우 수도권 기본 위치로 시작하며, 사용자는 지도를 움직여 주변 공사 정보를 볼 수 있습니다.",
  },
  {
    q: "데이터가 없는 곳도 있나요?",
    a: "있습니다. 좌표가 없거나 공개자료가 부족한 경우 지도에는 나타나지 않을 수 있습니다.",
  },
];

export const SOURCE_CONNECTORS = [
  "molit-buildinghub",
  "molit-development-permit",
  "local-gov-datasets",
] as const;

const RAW_PROJECTS = [
  ...loadMolitBuildingHubRecords(),
  ...loadMolitDevelopmentPermitRecords(),
  ...loadLocalGovernmentDatasetRecords(),
];

export const PROJECTS: NearbyConstructionRecord[] = mergeProjectRecords(RAW_PROJECTS).sort((a, b) =>
  (b.verifiedAt || b.updatedAt || "").localeCompare(a.verifiedAt || a.updatedAt || "")
);

export async function loadMetroProjectsFromCache(): Promise<NearbyConstructionRecord[]> {
  const response = await fetch(METRO_CACHE_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load metro cache: ${response.status}`);
  }

  return (await response.json()) as NearbyConstructionRecord[];
}

export function getProjectBySlug(slug: string): NearbyConstructionRecord | undefined {
  return PROJECTS.find((item) => item.slug === slug);
}

export function getAreaBySlug(slug: string): AreaInfo | undefined {
  return AREAS.find((item) => item.slug === slug);
}

export function getProjectsByArea(areaSlug: string): NearbyConstructionRecord[] {
  return PROJECTS.filter((item) => {
    if (areaSlug === "seoul") return item.sido === "서울";
    if (areaSlug === "incheon") return item.sido === "인천";
    if (areaSlug === "gyeonggi") return item.sido === "경기";
    return false;
  });
}
