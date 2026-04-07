import { listProjects, getProject, searchProject } from "./api/projects";
import { listDistricts, getDistrict, voteDistrict } from "./api/districts";
import { listApts, getApt, createComment, likeComment, searchApts } from "./api/apartments";
import { syncAll, syncOne, resetBattles, getAdminStats, runCollectTransport, runCollectWalk, runCollectSafety, runTestFetch } from "./api/admin";
import { collectTransport } from "./cron/collectTransport";
import { collectWalk } from "./cron/collectWalk";
import { collectSafety } from "./cron/collectSafety";
import { json, serverError } from "./api/http";
import { kakaoLoginRedirect, kakaoCallback, getMe, logout } from "./api/auth";
import { createBattle, getBattle, addBattleComment, likeBattleComment, addDispute, getRanking, getHot } from "./api/battles";
import type { Env } from "./types";

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.allSettled([
        collectTransport(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.TAGO_API_KEY),
        collectWalk(env.DB, env.DATA_GO_KR_SERVICE_KEY),
        collectSafety(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.CCTV_API_KEY),
      ])
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;

      // ── Projects (existing) ────────────────────────────────────────────────
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
      if (request.method === "POST" && path === "/api/admin/reset-battles") {
        return withCors(await resetBattles(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/stats") {
        return withCors(await getAdminStats(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/test-fetch") {
        return withCors(await runTestFetch(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-transport") {
        return withCors(await runCollectTransport(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-walk") {
        return withCors(await runCollectWalk(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-safety") {
        return withCors(await runCollectSafety(request, env));
      }

      // ── Districts ──────────────────────────────────────────────────────────
      if (request.method === "GET" && path === "/api/districts") {
        return withCors(await listDistricts(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/districts/") && !path.endsWith("/vote")) {
        const code = decodeURIComponent(path.replace("/api/districts/", ""));
        return withCors(await getDistrict(request, env, code));
      }
      if (request.method === "POST" && path.startsWith("/api/districts/") && path.endsWith("/vote")) {
        const code = decodeURIComponent(path.replace("/api/districts/", "").replace("/vote", ""));
        return withCors(await voteDistrict(request, env, code));
      }

      // ── Auth ──────────────────────────────────────────────────────────────────
      if (request.method === "GET" && path === "/api/auth/kakao") {
        return withCors(kakaoLoginRedirect(request, env));
      }
      if (request.method === "GET" && path === "/api/auth/kakao/callback") {
        return withCors(await kakaoCallback(request, env));
      }
      if (request.method === "GET" && path === "/api/auth/me") {
        return withCors(await getMe(request, env));
      }
      if (request.method === "POST" && path === "/api/auth/logout") {
        return withCors(await logout(request, env));
      }

      // ── Battles ───────────────────────────────────────────────────────────────
      if (request.method === "POST" && path === "/api/battles") {
        return withCors(await createBattle(request, env));
      }
      if (request.method === "GET" && path === "/api/battles/ranking") {
        return withCors(await getRanking(request, env));
      }
      if (request.method === "GET" && path === "/api/battles/hot") {
        return withCors(await getHot(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/battles/") && !path.includes("/comments")) {
        const id = decodeURIComponent(path.replace("/api/battles/", ""));
        return withCors(await getBattle(request, env, id));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/comments$/.test(path)) {
        const battleId = decodeURIComponent(path.replace("/api/battles/", "").replace("/comments", ""));
        return withCors(await addBattleComment(request, env, battleId));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/comments\/[^/]+\/like$/.test(path)) {
        const commentId = decodeURIComponent(path.split("/").at(-2) ?? "");
        return withCors(await likeBattleComment(request, env, commentId));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/disputes$/.test(path)) {
        const battleId = decodeURIComponent(path.replace("/api/battles/", "").replace("/disputes", ""));
        return withCors(await addDispute(request, env, battleId));
      }

      // ── Apartments ─────────────────────────────────────────────────────────
      if (request.method === "GET" && path === "/api/apartments") {
        return withCors(await listApts(request, env));
      }
      if (request.method === "GET" && path === "/api/apartments/search") {
        return withCors(await searchApts(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/apartments/") && !path.includes("/comments")) {
        const id = decodeURIComponent(path.replace("/api/apartments/", ""));
        return withCors(await getApt(request, env, id));
      }
      if (request.method === "POST" && /^\/api\/apartments\/[^/]+\/comments$/.test(path)) {
        const aptId = decodeURIComponent(path.replace("/api/apartments/", "").replace("/comments", ""));
        return withCors(await createComment(request, env, aptId));
      }
      if (request.method === "POST" && /^\/api\/apartments\/[^/]+\/comments\/[^/]+\/like$/.test(path)) {
        const commentId = decodeURIComponent(path.split("/").at(-2) ?? "");
        return withCors(await likeComment(request, env, commentId));
      }

      return withCors(json({ error: "Not found" }, 404));
    } catch (error) {
      console.error("worker error", error);
      return withCors(serverError("일부 데이터가 아직 정리 중입니다."));
    }
  },
};
