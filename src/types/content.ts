export type ProjectStatus =
  | "예정"
  | "접수"
  | "허가"
  | "착공준비"
  | "착공"
  | "공사중"
  | "사용승인"
  | "완공예정"
  | "준공/완료"
  | "정보부족";

export interface ProjectSourceLink {
  label: string;
  url: string;
  type: "공공데이터" | "지자체" | "공식문서" | "보도자료";
}

export interface ProjectData {
  id: string;
  slug: string;
  title: string;
  area: string;
  areaSlug: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  status: ProjectStatus;
  expectedCompletion: string;
  permitDate?: string;
  startDate?: string;
  approvalDate?: string;
  mainUse: string;
  buildingArea?: number;
  grossFloorArea?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  households?: number;
  summary: string;
  description: string;
  context: string;
  impact: string;
  timelineNote: string;
  sources: ProjectSourceLink[];
  updatedAt: string;
}

export interface AreaInfo {
  slug: string;
  name: string;
  shortDescription: string;
  regionalContext: string;
  whyImportant: string;
}

export interface FaqItem {
  q: string;
  a: string;
}
