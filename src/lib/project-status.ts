import type { ProjectRecord, ProjectStatus } from "../types/content";

const RECENT_CONSTRUCTION_DAYS = 720;

function daysBetween(from: string, to: Date): number {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((to.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function deriveProjectStatus(input: {
  permitDate?: string | null;
  startDate?: string | null;
  approvalDate?: string | null;
}): { status: ProjectStatus; reason: string } {
  if (input.approvalDate) {
    return {
      status: "approval",
      reason: "사용승인일 확인",
    };
  }

  if (input.startDate) {
    return {
      status: "start",
      reason: "착공일 확인, 사용승인일 미확인",
    };
  }

  if (input.permitDate) {
    return {
      status: "permit",
      reason: "허가일만 확인",
    };
  }

  return {
    status: "unknown",
    reason: "핵심 일정 정보 부족",
  };
}

export function getStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case "permit":
      return "허가";
    case "start":
      return "착공";
    case "construction":
      return "공사중 추정";
    case "approval":
      return "사용승인";
    default:
      return "미확인";
  }
}

export function getDisplayStatus(project: Pick<ProjectRecord, "status" | "startDate" | "approvalDate">): {
  label: string;
  emphasizeEstimated: boolean;
} {
  if (project.status === "approval") {
    return { label: "사용승인 확인", emphasizeEstimated: false };
  }

  if (project.status === "start" && project.startDate && !project.approvalDate) {
    const age = daysBetween(project.startDate, new Date());
    if (age <= RECENT_CONSTRUCTION_DAYS) {
      return { label: "공사중 추정", emphasizeEstimated: true };
    }
    return { label: "착공 확인", emphasizeEstimated: false };
  }

  if (project.status === "permit") {
    return { label: "허가 확인", emphasizeEstimated: false };
  }

  return { label: getStatusLabel(project.status), emphasizeEstimated: false };
}

export function buildFactSummary(project: Pick<ProjectRecord, "status" | "buildingUse" | "mainPurpose" | "permitDate" | "startDate" | "approvalDate" | "sourceName">): string {
  const useText = project.buildingUse || project.mainPurpose || "용도 미확인 사업";

  if (project.approvalDate) {
    return `${project.sourceName} 기준 사용승인일이 확인된 ${useText}입니다.`;
  }

  if (project.startDate) {
    return `${project.sourceName} 기준 착공일이 확인된 ${useText}입니다.`;
  }

  if (project.permitDate) {
    return `${project.sourceName} 기준 허가일이 확인된 ${useText}입니다.`;
  }

  return `${project.sourceName} 기준 핵심 일정 정보가 부족해 추가 확인이 필요한 사업입니다.`;
}
