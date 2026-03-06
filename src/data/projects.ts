import type { AreaInfo, FaqItem, ProjectRecord } from "../types/content";
import { loadLocalGovernmentDatasetRecords } from "./connectors/local-gov-datasets";
import { loadMolitBuildingHubRecords } from "./connectors/molit-buildinghub";
import { loadMolitDevelopmentPermitRecords } from "./connectors/molit-development-permits";
import { mergeProjectRecords } from "./merge";

export const LAST_UPDATED = "2026-03-06";

export const AREAS: AreaInfo[] = [
  {
    slug: "seoul",
    name: "서울",
    shortDescription: "역세권 복합개발과 수변·업무지구 정비가 동시에 진행되는 중심 권역입니다.",
    regionalContext:
      "서울은 대규모 민간 개발과 공공 기반시설 정비가 겹쳐 진행되는 지역이 많아 허가, 착공, 사용승인 단계가 생활권 체감 변화와 빠르게 연결됩니다.",
    whyImportant:
      "업무지구 재편과 공공공간 정비는 통근 동선, 상권 흐름, 생활 편의에 직접적인 변화를 만들 수 있어 기준일과 출처 확인이 중요합니다.",
    fallbackCenter: { lat: 37.5665, lng: 126.978 },
  },
  {
    slug: "ilsan",
    name: "일산",
    shortDescription: "주거 생활권과 광역 교통축, 복합업무 개발이 맞물리는 서북부 핵심 권역입니다.",
    regionalContext:
      "일산은 대규모 주거지와 상업·업무 기능이 섞여 있어 건축 인허가와 도로 공사 정보가 실거주 체감 변화와 밀접합니다.",
    whyImportant:
      "허가·착공 일정만으로도 교통 혼잡, 상권 재편, 신규 공급 규모를 가늠할 수 있어 공공데이터 기반 확인 가치가 큽니다.",
    fallbackCenter: { lat: 37.6701, lng: 126.7602 },
  },
  {
    slug: "kintex",
    name: "킨텍스권",
    shortDescription: "전시산업과 환승, 역세권 개발이 결합된 특화 권역입니다.",
    regionalContext:
      "킨텍스권은 행사 수요와 통근 수요가 겹치기 때문에 전시장, 환승시설, 역세권 복합개발 일정이 주변 이동 패턴에 직접 반영됩니다.",
    whyImportant:
      "착공이 확인된 프로젝트와 허가 단계 사업을 구분해서 보는 것이 중요하며, 실제 공사중 여부는 착공일과 사용승인일 조합으로 판단해야 합니다.",
    fallbackCenter: { lat: 37.6679, lng: 126.7454 },
  },
  {
    slug: "gimpo",
    name: "김포",
    shortDescription: "주거 확장과 물류·교통 프로젝트가 함께 진행되는 성장 권역입니다.",
    regionalContext:
      "김포는 광역 통근 수요와 물류 수요가 동시에 높은 지역이라 복합개발, 물류시설, 의료·생활 기반시설 데이터가 실거주 판단에 영향을 줍니다.",
    whyImportant:
      "개발행위허가와 착공 현황만으로도 생활권의 다음 변화를 파악하는 데 도움이 되며, 세부 일정은 지자체 파일데이터 보강이 중요합니다.",
    fallbackCenter: { lat: 37.6425, lng: 126.6318 },
  },
];

export const FAQS: FaqItem[] = [
  {
    q: "정보는 어디서 오나요?",
    a: "국토교통부 건축HUB, 도시계획 개발행위허가정보, 지자체 건축허가·착공·사용승인 현황처럼 공식 공개자료를 우선 사용합니다.",
  },
  {
    q: "정확도는 100%인가요?",
    a: "아닙니다. 원천 데이터 공개 시차와 표기 오차가 있을 수 있습니다. 그래서 각 마커에 출처, 기준일, 신뢰도를 함께 표기합니다.",
  },
  {
    q: "공사중이라고 단정해도 되나요?",
    a: "아닙니다. 착공일이 확인되고 사용승인일이 없는 경우에만 사용자 화면에서 공사중 추정으로 보여주며, 내부 표준 상태는 착공으로 유지합니다.",
  },
  {
    q: "위치 권한을 거부해도 사용할 수 있나요?",
    a: "가능합니다. 위치 권한이 없으면 서비스 기본 좌표를 기준으로 지도를 열고, 이후 사용자가 지도를 이동하며 다시 검색할 수 있습니다.",
  },
  {
    q: "데이터가 없는 지역도 있나요?",
    a: "있습니다. 좌표가 없거나 공개자료가 충분하지 않은 경우 지도에는 바로 표시되지 않을 수 있습니다. 이런 데이터는 검색 인덱스 후보로 남기고 있습니다.",
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

export const PROJECTS: ProjectRecord[] = mergeProjectRecords(RAW_PROJECTS).sort((a, b) =>
  (b.verifiedAt || "").localeCompare(a.verifiedAt || "")
);

export function getProjectBySlug(slug: string): ProjectRecord | undefined {
  return PROJECTS.find((item) => item.slug === slug);
}

export function getAreaBySlug(slug: string): AreaInfo | undefined {
  return AREAS.find((item) => item.slug === slug);
}

export function getProjectsByArea(areaSlug: string): ProjectRecord[] {
  return PROJECTS.filter((item) => item.areaSlug === areaSlug);
}
