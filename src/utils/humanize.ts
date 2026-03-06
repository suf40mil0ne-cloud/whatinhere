import type { Project } from "../types/project";

export function formatArea(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "정보 없음";
  return `${Math.round(value).toLocaleString("ko-KR")}㎡`;
}

export function toFriendlySummary(project: Project): string {
  const use = project.main_use || "용도 정보 없음";
  const status = project.status_normalized;
  const area = project.gross_floor_area ? `연면적 ${Math.round(project.gross_floor_area).toLocaleString("ko-KR")}㎡` : "면적 정보 보강 필요";
  const floor = project.floors_above ? `지상 ${project.floors_above}층` : "층수 정보 보강 필요";

  if (project.start_date) {
    return `${use}, ${status} 단계, ${area}, ${floor} 규모로 확인됩니다.`;
  }

  if (status === "허가") {
    return `${use} 신축으로 보이며 현재 허가 단계입니다.`;
  }

  return `개발행위허가가 확인되며 실제 착공 정보는 추가 확인이 필요합니다.`;
}
