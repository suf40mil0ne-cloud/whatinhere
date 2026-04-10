import { listProjects, getProject, searchProject } from "./api/projects";
import { listDistricts, getDistrict, voteDistrict } from "./api/districts";
import { listApts, getApt, createComment, likeComment, searchApts } from "./api/apartments";
import { syncAll, syncOne, resetBattles, getAdminStats, runCollectTransport, runCollectWalk, runCollectSafety, runTestFetch, runTestWalk, runTestSafety, testJoin } from "./api/admin";
import { collectTransport } from "./cron/collectTransport";
import { collectWalk } from "./cron/collectWalk";
import { collectSafety } from "./cron/collectSafety";
import { json, serverError } from "./api/http";
import { kakaoLoginRedirect, kakaoCallback, getMe, logout, updateNickname } from "./api/auth";
import { createBattle, getBattle, addBattleComment, likeBattleComment, addDispute, getRanking, getHot } from "./api/battles";
import type { Env } from "./types";

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }

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
        collectSafety(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.CCTV_API_KEY, env.SAFETY_INDEX_API_KEY),
      ])
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;

      if (request.method === "GET" && path === "/api/projects") {
        return withCors(request, await listProjects(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/projects/")) {
        const projectId = decodeURIComponent(path.replace("/api/projects/", ""));
        return withCors(request, await getProject(request, env, projectId));
      }
      if (request.method === "GET" && path === "/api/search") {
        return withCors(request, await searchProject(request, env));
      }
      if (request.method === "POST" && path.startsWith("/api/admin/sync/source/")) {
        const sourceId = decodeURIComponent(path.replace("/api/admin/sync/source/", ""));
        return withCors(request, await syncOne(request, env, sourceId));
      }
      if (request.method === "POST" && path === "/api/admin/sync/all") {
        return withCors(request, await syncAll(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/reset-battles") {
        return withCors(request, await resetBattles(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/stats") {
        return withCors(request, await getAdminStats(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/test-fetch") {
        return withCors(request, await runTestFetch(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/test-walk") {
        return withCors(request, await runTestWalk(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/test-safety") {
        return withCors(request, await runTestSafety(request, env));
      }
      if (request.method === "GET" && path === "/api/admin/test-join") {
        return withCors(request, await testJoin(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-transport") {
        return withCors(request, await runCollectTransport(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-walk") {
        return withCors(request, await runCollectWalk(request, env));
      }
      if (request.method === "POST" && path === "/api/admin/collect-safety") {
        return withCors(request, await runCollectSafety(request, env));
      }

      if (request.method === "GET" && path === "/api/districts") {
        return withCors(request, await listDistricts(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/districts/") && !path.endsWith("/vote")) {
        const code = decodeURIComponent(path.replace("/api/districts/", ""));
        return withCors(request, await getDistrict(request, env, code));
      }
      if (request.method === "POST" && path.startsWith("/api/districts/") && path.endsWith("/vote")) {
        const code = decodeURIComponent(path.replace("/api/districts/", "").replace("/vote", ""));
        return withCors(request, await voteDistrict(request, env, code));
      }

      if (request.method === "GET" && path === "/api/auth/kakao") {
        return withCors(request, kakaoLoginRedirect(request, env));
      }
      if (request.method === "GET" && path === "/api/auth/kakao/callback") {
        return withCors(request, await kakaoCallback(request, env));
      }
      if (request.method === "GET" && path === "/api/auth/me") {
        return withCors(request, await getMe(request, env));
      }
      if (request.method === "POST" && path === "/api/auth/logout") {
        return withCors(request, await logout(request, env));
      }
      if (request.method === "POST" && path === "/api/auth/nickname") {
        return withCors(request, await updateNickname(request, env));
      }

      if (request.method === "POST" && path === "/api/battles") {
        return withCors(request, await createBattle(request, env));
      }
      if (request.method === "GET" && path === "/api/battles/ranking") {
        return withCors(request, await getRanking(request, env));
      }
      if (request.method === "GET" && path === "/api/battles/hot") {
        return withCors(request, await getHot(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/battles/") && !path.includes("/comments")) {
        const id = decodeURIComponent(path.replace("/api/battles/", ""));
        return withCors(request, await getBattle(request, env, id));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/comments$/.test(path)) {
        const battleId = decodeURIComponent(path.replace("/api/battles/", "").replace("/comments", ""));
        return withCors(request, await addBattleComment(request, env, battleId));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/comments\/[^/]+\/like$/.test(path)) {
        const commentId = decodeURIComponent(path.split("/").at(-2) ?? "");
        return withCors(request, await likeBattleComment(request, env, commentId));
      }
      if (request.method === "POST" && /^\/api\/battles\/[^/]+\/disputes$/.test(path)) {
        const battleId = decodeURIComponent(path.replace("/api/battles/", "").replace("/disputes", ""));
        return withCors(request, await addDispute(request, env, battleId));
      }

      if (request.method === "GET" && path === "/api/apartments") {
        return withCors(request, await listApts(request, env));
      }
      if (request.method === "GET" && path === "/api/apartments/search") {
        return withCors(request, await searchApts(request, env));
      }
      if (request.method === "GET" && path.startsWith("/api/apartments/") && !path.includes("/comments")) {
        const id = decodeURIComponent(path.replace("/api/apartments/", ""));
        return withCors(request, await getApt(request, env, id));
      }
      if (request.method === "POST" && /^\/api\/apartments\/[^/]+\/comments$/.test(path)) {
        const aptId = decodeURIComponent(path.replace("/api/apartments/", "").replace("/comments", ""));
        return withCors(request, await createComment(request, env, aptId));
      }
      if (request.method === "POST" && /^\/api\/apartments\/[^/]+\/comments\/[^/]+\/like$/.test(path)) {
        const commentId = decodeURIComponent(path.split("/").at(-2) ?? "");
        return withCors(request, await likeComment(request, env, commentId));
      }

      return withCors(request, json({ error: "Not found" }, 404));
    } catch (error) {
      console.error("worker error", error);
      return withCors(request, serverError("일부 데이터가 아직 정리 중입니다."));
    }
  },
};
