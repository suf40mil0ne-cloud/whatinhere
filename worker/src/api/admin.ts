import { syncAllSources, syncSource } from "../services/syncService";
import type { Env } from "../types";
import { json, unauthorized } from "./http";
import { collectTransport } from "../cron/collectTransport";
import { collectWalk } from "../cron/collectWalk";
import { collectSafety } from "../cron/collectSafety";

const BATTLE_ADMIN_PASSWORD = "danjijeon2024";

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

function isBattleAdmin(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${BATTLE_ADMIN_PASSWORD}`;
}

export async function syncOne(request: Request, env: Env, sourceId: string): Promise<Response> {
  if (!isAuthorized(request, env)) return unauthorized();
  const summary = await syncSource(env, sourceId);
  return json({ ok: true, summary });
}

export async function syncAll(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) return unauthorized();
  const summary = await syncAllSources(env);
  return json({ ok: true, summary });
}

export async function resetBattles(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  await env.DB.prepare("DELETE FROM battle_disputes").run();
  await env.DB.prepare("DELETE FROM battle_comments").run();
  await env.DB.prepare("DELETE FROM comment_likes").run();
  await env.DB.prepare("DELETE FROM battles").run();
  return json({ ok: true });
}

export async function runCollectTransport(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  console.log(`[admin] collect-transport start, kakaoKey=${env.KAKAO_REST_API_KEY ? "set" : "missing"}`);
  const updated = await collectTransport(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.TAGO_API_KEY, env.KAKAO_REST_API_KEY);
  console.log(`[admin] collect-transport done, updated=${updated} districts`);
  return json({ ok: true, updated });
}

export async function runCollectWalk(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  const updated = await collectWalk(env.DB, env.DATA_GO_KR_SERVICE_KEY);
  return json({ ok: true, updated });
}

export async function runCollectSafety(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  const updated = await collectSafety(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.CCTV_API_KEY);
  return json({ ok: true, updated });
}

export async function getAdminStats(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();

  const [battleRow, commentRow, top5Row] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM battles").first<{ cnt: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM battle_comments").first<{ cnt: number }>(),
    env.DB.prepare(`
      SELECT name, COUNT(*) AS battle_count
      FROM (
        SELECT apt_a_name AS name FROM battles
        UNION ALL
        SELECT apt_b_name AS name FROM battles
      )
      GROUP BY name
      ORDER BY battle_count DESC
      LIMIT 5
    `).all<{ name: string; battle_count: number }>(),
  ]);

  return json({
    totalBattles: Number(battleRow?.cnt ?? 0),
    totalComments: Number(commentRow?.cnt ?? 0),
    top5: top5Row.results,
  });
}
