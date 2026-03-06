import type { Project, ProjectListResponse } from "../types/project";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface QueryOptions {
  bbox: string;
  zoom: number;
  status?: string;
  use?: string;
  sort?: string;
}

export async function fetchProjects(query: QueryOptions): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  params.set("bbox", query.bbox);
  params.set("zoom", String(query.zoom));
  if (query.status && query.status !== "전체") params.set("status", query.status);
  if (query.use && query.use !== "전체") params.set("use", query.use);
  if (query.sort) params.set("sort", query.sort);

  const response = await fetch(`${API_BASE}/api/projects?${params.toString()}`);
  if (!response.ok) throw new Error("프로젝트 조회에 실패했습니다.");
  return response.json<ProjectListResponse>();
}

export async function fetchProjectDetail(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("상세 조회에 실패했습니다.");
  return response.json<Project>();
}

export async function searchProjects(q: string): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
  if (!response.ok) throw new Error("검색에 실패했습니다.");
  const data = await response.json<{ projects: Project[] }>();
  return data.projects;
}
