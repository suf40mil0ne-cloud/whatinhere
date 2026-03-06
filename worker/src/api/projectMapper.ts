import type { ApiConfidenceLabel, ApiProjectRecord, ApiProjectStatus, NormalizedProject } from "../types";

function extractRegions(address: string | null): { region1: string | null; region2: string | null; region3: string | null } {
  if (!address) {
    return { region1: null, region2: null, region3: null };
  }

  const [region1, region2, region3] = address.split(/\s+/);
  return {
    region1: region1 || null,
    region2: region2 || null,
    region3: region3 || null,
  };
}

function deriveStatus(project: NormalizedProject): { status: ApiProjectStatus; reason: string } {
  if (project.approval_date) {
    return { status: "approval", reason: "사용승인일 확인" };
  }

  if (project.start_date) {
    return { status: "start", reason: "착공일 확인, 사용승인일 미확인" };
  }

  if (project.permit_date) {
    return { status: "permit", reason: "허가일만 확인" };
  }

  return { status: "unknown", reason: "핵심 일정 정보 부족" };
}

function deriveConfidenceLabel(score: number): ApiConfidenceLabel {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function buildSummary(project: NormalizedProject, sourceName: string): string {
  const use = project.main_use || project.sub_use || "용도 미확인 사업";
  if (project.approval_date) {
    return `${sourceName} 기준 사용승인일이 확인된 ${use}입니다.`;
  }
  if (project.start_date) {
    return `${sourceName} 기준 착공일이 확인된 ${use}입니다.`;
  }
  if (project.permit_date) {
    return `${sourceName} 기준 허가일이 확인된 ${use}입니다.`;
  }
  return `${sourceName} 기준 일정 정보가 부족해 추가 확인이 필요한 사업입니다.`;
}

export function toApiProjectRecord(project: NormalizedProject): ApiProjectRecord {
  const address = project.address_road || project.address_jibun;
  const sourceName = project.local_government || "공공데이터 통합 레코드";
  const regions = extractRegions(address);
  const status = deriveStatus(project);
  const updatedAt = project.updated_at || null;

  return {
    id: project.project_id,
    source: "normalized-project",
    sourceRecordId: null,
    slug: project.project_id,
    title: project.title,
    address,
    lat: project.lat,
    lng: project.lng,
    region1: regions.region1,
    region2: regions.region2,
    region3: regions.region3,
    permitDate: project.permit_date,
    startDate: project.start_date,
    approvalDate: project.approval_date,
    status: status.status,
    statusReason: status.reason,
    buildingUse: project.main_use,
    mainPurpose: project.sub_use || project.main_use,
    category: project.permit_type,
    summary: buildSummary(project, sourceName),
    description: "정규화된 공공데이터 레코드입니다. 세부 정보는 원문 출처와 지자체 자료를 함께 확인해 주세요.",
    sourceUrl: null,
    sourceName,
    updatedAt,
    verifiedAt: updatedAt,
    confidenceScore: project.confidence_score,
    confidenceLabel: deriveConfidenceLabel(project.confidence_score),
    raw: {},
  };
}
