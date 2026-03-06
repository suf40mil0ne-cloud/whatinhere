import { listProjects, getProject, searchProject } from "./api/projects";
import { syncAll, syncOne } from "./api/admin";
import { json, serverError } from "./api/http";
import type { Env } from "./types";

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      // Miniflare/프록시 환경에서 상대 경로가 들어오는 경우를 대비해 base URL을 함께 지정한다.
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;

      if (request.method === "GET" && path === "/api/projects") {
        return withCors(await listProjects(request, env));
      }

      if (request.method === "GET" && path.startsWith("/api/projects/")) {
        const projectId = decodeURIComponent(path.replace("/api/projects/", ""));
        return withCors(await getProject(request, env, projectId));
      }

      if (request.method === "GET" && path === "/api/search") {
        return withCors(await searchProject(request, env));
      }

      if (request.method === "POST" && path.startsWith("/api/admin/sync/source/")) {
        const sourceId = decodeURIComponent(path.replace("/api/admin/sync/source/", ""));
        return withCors(await syncOne(request, env, sourceId));
      }

      if (request.method === "POST" && path === "/api/admin/sync/all") {
        return withCors(await syncAll(request, env));
      }

      return withCors(json({ error: "Not found" }, 404));
    } catch (error) {
      console.error("worker error", error);
      return withCors(serverError("일부 데이터가 아직 정리 중입니다."));
    }
  },
};
