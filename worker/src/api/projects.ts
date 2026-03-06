import { Repository } from "../db/repository";
import { toApiProjectRecord } from "./projectMapper";
import { SAMPLE_PROJECTS } from "../mock/sampleData";
import type { Env } from "../types";
import { badRequest, json } from "./http";

function parseBbox(value: string): { swLng: number; swLat: number; neLng: number; neLat: number } | null {
  const parts = value.split(",").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return {
    swLng: parts[0],
    swLat: parts[1],
    neLng: parts[2],
    neLat: parts[3],
  };
}

export async function listProjects(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const bboxRaw = url.searchParams.get("bbox");
  if (!bboxRaw) return badRequest("bbox query is required");

  const bbox = parseBbox(bboxRaw);
  if (!bbox) return badRequest("bbox format should be swLng,swLat,neLng,neLat");

  const zoom = Number(url.searchParams.get("zoom") || "10");
  const status = url.searchParams.get("status") || undefined;
  const use = url.searchParams.get("use") || undefined;
  const sort = url.searchParams.get("sort") || undefined;

  const repo = new Repository(env.DB);
  const total = await repo.countProjectsInBounds({ ...bbox });

  // 범위가 넓거나 줌아웃 상태에서는 개별 마커 대신 요약 통계를 내려 네트워크/렌더링 비용을 줄인다.
  if (zoom <= 7 || total > 1500) {
    const byStatus = await repo.countByStatusInBounds({ ...bbox });
    return json({ mode: "summary", total, projects: [], summary: { by_status: byStatus } });
  }

  const projects = await repo.listProjects({ ...bbox, status, use, sort, limit: 800 });

  // 초기 환경에서 DB 비어있을 경우 샘플 반환
  if (projects.length === 0) {
    return json({ mode: "projects", total: SAMPLE_PROJECTS.length, projects: SAMPLE_PROJECTS });
  }

  return json({ mode: "projects", total, projects: projects.map(toApiProjectRecord) });
}

export async function getProject(_request: Request, env: Env, projectId: string): Promise<Response> {
  const repo = new Repository(env.DB);
  const project = await repo.getProject(projectId);

  if (!project) {
    const sample = SAMPLE_PROJECTS.find((item) => item.id === projectId || item.slug === projectId);
    if (!sample) return json({ error: "Not found" }, 404);
    return json(sample);
  }

  return json(toApiProjectRecord(project));
}

export async function searchProject(request: Request, env: Env): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!q) return json({ projects: [] });

  const repo = new Repository(env.DB);
  const projects = await repo.searchProjects(q);

  if (projects.length === 0) {
    const lowered = q.toLowerCase();
    return json({
      projects: SAMPLE_PROJECTS.filter((p) => {
        const hay = `${p.title} ${p.address ?? ""} ${p.buildingUse ?? ""}`.toLowerCase();
        return hay.includes(lowered);
      }),
    });
  }

  return json({ projects: projects.map(toApiProjectRecord) });
}
