import type { Project } from "../types/project";
import { formatArea, toFriendlySummary } from "../utils/humanize";

interface Props {
  project: Project | null;
  loading: boolean;
  error: string | null;
}

export function DetailPanel({ project, loading, error }: Props) {
  if (loading) return <aside className="panel">상세 정보를 불러오는 중입니다...</aside>;
  if (error) return <aside className="panel error">{error}</aside>;
  if (!project) return <aside className="panel empty">마커를 클릭하면 상세 정보가 표시됩니다.</aside>;

  return (
    <aside className="panel">
      <h3>{project.title}</h3>
      <p className="friendly">{toFriendlySummary(project)}</p>
      <ul>
        <li>주소: {project.address_road || project.address_jibun || "정보 없음"}</li>
        <li>대표 상태: {project.status_normalized}</li>
        <li>허가일: {project.permit_date || "정보 없음"}</li>
        <li>착공일: {project.start_date || "정보 없음"}</li>
        <li>사용승인일: {project.approval_date || "정보 없음"}</li>
        <li>대표 용도: {project.main_use || "정보 없음"}</li>
        <li>건축면적: {formatArea(project.building_area)}</li>
        <li>연면적: {formatArea(project.gross_floor_area)}</li>
        <li>지상층수: {project.floors_above ?? "정보 없음"}</li>
        <li>지하층수: {project.floors_below ?? "정보 없음"}</li>
        <li>세대수: {project.households ?? "정보 없음"}</li>
        <li>출처기관: {project.local_government || "정보 없음"}</li>
      </ul>
    </aside>
  );
}
