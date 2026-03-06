import type { Project, ProjectListResponse } from "../types/project";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  status: number;
  endpoint: string;
  details?: string;

  constructor(message: string, status: number, endpoint: string, details?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.details = details;
  }
}

async function parseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: string; message?: string };
      return body.error || body.message;
    }
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return undefined;
  }
}

async function fetchJsonOrThrow<T>(endpoint: string, fallbackMessage: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    const message =
      error instanceof Error
        ? `네트워크 오류: ${error.message}`
        : "네트워크 오류가 발생했습니다.";
    throw new ApiError(message, 0, endpoint);
  }

  if (!response.ok) {
    const details = await parseErrorDetail(response);
    throw new ApiError(fallbackMessage, response.status, endpoint, details);
  }

  return response.json() as Promise<T>;
}

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

  const endpoint = `${API_BASE}/api/projects?${params.toString()}`;
  return fetchJsonOrThrow<ProjectListResponse>(endpoint, "프로젝트 조회에 실패했습니다.");
}

export async function fetchProjectDetail(id: string): Promise<Project> {
  const endpoint = `${API_BASE}/api/projects/${encodeURIComponent(id)}`;
  return fetchJsonOrThrow<Project>(endpoint, "상세 조회에 실패했습니다.");
}

export async function searchProjects(q: string): Promise<Project[]> {
  const endpoint = `${API_BASE}/api/search?q=${encodeURIComponent(q)}`;
  const data = await fetchJsonOrThrow<{ projects: Project[] }>(endpoint, "검색에 실패했습니다.");
  return data.projects;
}
