import type { SourceAdapter } from "../types";
import { fetchBuildingBasic } from "./buildingBasicFetcher";
import { fetchBuildingHub } from "./buildingHubFetcher";
import { fetchDevelopmentPermits } from "./developmentPermitFetcher";
import { fetchArchPmsHub } from "./archPmsHubFetcher";

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "dev-permit-openapi": {
    id: "dev-permit-openapi",
    name: "국토교통부 도시계획 개발행위허가정보서비스",
    type: "openapi",
    fetch: fetchDevelopmentPermits,
  },
  "building-basic-openapi": {
    id: "building-basic-openapi",
    name: "전국건축인허가기본정보표준데이터",
    type: "openapi",
    fetch: fetchBuildingBasic,
  },
  "building-hub-openapi": {
    id: "building-hub-openapi",
    name: "국토교통부 건축HUB 건축인허가정보",
    type: "openapi",
    fetch: fetchBuildingHub,
  },
  "arch-pms-hub": {
    id: "arch-pms-hub",
    name: "국토교통부 건축인허가 기본정보 (ArchPmsHub)",
    type: "openapi",
    fetch: fetchArchPmsHub,
  },
};
