import type { NormalizedProject, SourceRecord } from "../types";
import { makeId } from "../utils/id";
import { normalizeStatus } from "./status";

export function toNormalizedProject(source: SourceRecord, sourcePriority: number): NormalizedProject {
  const status = normalizeStatus(source.rawStatus, source.startDate ?? null, source.approvalDate ?? null);

  return {
    project_id: makeId("prj"),
    title: source.title || source.mainUse || "미상 프로젝트",
    source_priority: sourcePriority,
    address_road: source.addressRoad ?? null,
    address_jibun: source.addressJibun ?? null,
    lat: source.lat ?? null,
    lng: source.lng ?? null,
    permit_type: source.permitType ?? null,
    main_use: source.mainUse ?? null,
    sub_use: source.subUse ?? null,
    permit_date: source.permitDate ?? null,
    start_date: source.startDate ?? null,
    approval_date: source.approvalDate ?? null,
    status_normalized: status,
    building_area: source.buildingArea ?? null,
    gross_floor_area: source.grossFloorArea ?? null,
    floors_above: source.floorsAbove ?? null,
    floors_below: source.floorsBelow ?? null,
    households: source.households ?? null,
    contractor: source.contractor ?? null,
    designer: source.designer ?? null,
    supervisor: source.supervisor ?? null,
    local_government: source.localGovernment ?? null,
    source_count: 1,
    confidence_score: source.lat && source.lng ? 0.8 : 0.55,
  };
}
