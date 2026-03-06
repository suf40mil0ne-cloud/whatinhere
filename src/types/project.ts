export type NormalizedStatus =
  | "접수"
  | "허가"
  | "착공준비"
  | "착공"
  | "공사중"
  | "사용승인"
  | "준공/완료"
  | "정보부족";

export interface Project {
  project_id: string;
  title: string;
  address_road: string | null;
  address_jibun: string | null;
  lat: number | null;
  lng: number | null;
  permit_type: string | null;
  main_use: string | null;
  permit_date: string | null;
  start_date: string | null;
  approval_date: string | null;
  status_normalized: NormalizedStatus;
  building_area: number | null;
  gross_floor_area: number | null;
  floors_above: number | null;
  floors_below: number | null;
  households: number | null;
  contractor: string | null;
  designer: string | null;
  supervisor: string | null;
  local_government: string | null;
  source_count: number;
  confidence_score: number;
}

export interface ProjectListResponse {
  mode: "projects" | "summary";
  total: number;
  projects: Project[];
  summary?: {
    by_status: Record<string, number>;
  };
}
