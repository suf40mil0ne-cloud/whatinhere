import { Repository } from "../db/repository";
import { readAptScores } from "../lib/apt-scores";
import type { BattleScores, Env } from "../types";
import { badRequest, json, serverError } from "./http";
import { requireAuth } from "./auth";

const VALID_CATEGORIES = new Set(["transport", "walk", "value", "childcare", "safety"]);

function determineBattleWinner(a: BattleScores, b: BattleScores): "a" | "b" | "draw" {
  const keys: Array<keyof BattleScores> = ["transport", "walk", "value", "childcare", "safety"];
  let winsA = 0, winsB = 0;
  for (const key of keys) {
    if (a[key] > b[key]) winsA++;
    else if (b[key] > a[key]) winsB++;
  }
  if (winsA > winsB) return "a";
  if (winsB > winsA) return "b";
  return "draw";
}

export async function createBattle(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("JSON body required"); }
  const { apt_a_id, apt_b_id } = body as Record<string, unknown>;
  if (typeof apt_a_id !== "string" || typeof apt_b_id !== "string") {
    return badRequest("apt_a_id and apt_b_id are required");
  }
  if (apt_a_id === apt_b_id) return badRequest("Cannot battle an apt against itself");

  const repo = new Repository(env.DB);
  const [aptA, aptB] = await Promise.all([repo.getAptById2(apt_a_id), repo.getAptById2(apt_b_id)]);
  if (!aptA || !aptB) return json({ error: "One or both apartments not found" }, 404);

  const scoreA: BattleScores = readAptScores(aptA);
  const scoreB: BattleScores = readAptScores(aptB);
  const winner = determineBattleWinner(scoreA, scoreB);

  const id = crypto.randomUUID();
  await repo.createBattle({
    id, aptAId: apt_a_id, aptBId: apt_b_id,
    aptAName: aptA.name, aptBName: aptB.name,
    winner, scoreA: JSON.stringify(scoreA), scoreB: JSON.stringify(scoreB),
  });

  return json({ id, winner, scoreA, scoreB });
}

export async function getBattle(request: Request, env: Env, id: string): Promise<Response> {
  const token = request.headers.get("authorization")?.slice(7) ?? undefined;
  let currentUserId: string | undefined;
  if (token) {
    const repo2 = new Repository(env.DB);
    const user = await repo2.getSessionUser(token);
    if (user && new Date(user.expires_at) >= new Date()) currentUserId = user.id;
  }

  const repo = new Repository(env.DB);
  const battle = await repo.getBattle(id, currentUserId);
  if (!battle) return json({ error: "Not found" }, 404);

  const [aptA, aptB] = await Promise.all([
    repo.getAptById2(battle.apt_a_id),
    repo.getAptById2(battle.apt_b_id),
  ]);

  let scoreA: BattleScores;
  let scoreB: BattleScores;
  let winner = battle.winner;

  if (aptA && aptB) {
    scoreA = readAptScores(aptA);
    scoreB = readAptScores(aptB);
    winner = determineBattleWinner(scoreA, scoreB);
  } else {
    try {
      scoreA = JSON.parse(battle.score_a) as BattleScores;
      scoreB = JSON.parse(battle.score_b) as BattleScores;
    } catch { return serverError("Invalid battle data"); }
  }

  return json({
    id: battle.id,
    aptAId: battle.apt_a_id,
    aptBId: battle.apt_b_id,
    aptAName: battle.apt_a_name,
    aptBName: battle.apt_b_name,
    winner,
    scoreA, scoreB,
    viewCount: battle.view_count,
    createdAt: battle.created_at,
    comments: battle.comments,
    disputes: battle.disputes,
  });
}

export async function addBattleComment(request: Request, env: Env, battleId: string): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("JSON body required"); }
  const { comment } = body as Record<string, unknown>;
  if (typeof comment !== "string" || !comment.trim()) return badRequest("comment is required");
  if (comment.length > 300) return badRequest("comment must be 300 chars or fewer");

  const repo = new Repository(env.DB);
  await repo.addBattleComment({ id: crypto.randomUUID(), battleId, userId, comment: comment.trim() });
  return json({ ok: true });
}

export async function likeBattleComment(request: Request, env: Env, commentId: string): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const repo = new Repository(env.DB);
  await repo.likeBattleComment(userId, commentId);
  return json({ ok: true });
}

export async function addDispute(request: Request, env: Env, battleId: string): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("JSON body required"); }
  const { category, reason } = body as Record<string, unknown>;
  if (typeof category !== "string" || !VALID_CATEGORIES.has(category)) {
    return badRequest("category must be one of: transport, walk, value, childcare, safety");
  }
  if (typeof reason !== "string" || !reason.trim()) return badRequest("reason is required");
  if (reason.length > 200) return badRequest("reason must be 200 chars or fewer");

  // Get userId if logged in (optional)
  const token = request.headers.get("authorization")?.slice(7);
  let userId: string | null = null;
  if (token) {
    const repo2 = new Repository(env.DB);
    const user = await repo2.getSessionUser(token);
    if (user && new Date(user.expires_at) >= new Date()) userId = user.id;
  }

  const repo = new Repository(env.DB);
  await repo.addDispute({ id: crypto.randomUUID(), battleId, userId, category, reason: reason.trim() });
  return json({ ok: true });
}

export async function getRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sido = url.searchParams.get("sido") ?? undefined;
  const sigungu = url.searchParams.get("sigungu") ?? undefined;

  const repo = new Repository(env.DB);
  const ranking = await repo.getRanking({ sido, sigungu });
  return json({ ranking });
}

export async function getHot(_request: Request, env: Env): Promise<Response> {
  const repo = new Repository(env.DB);
  const { byDisputes, byViews } = await repo.getHotBattles();

  const parseBattle = (b: import("../types").BattleRow) => ({
    id: b.id, aptAId: b.apt_a_id, aptBId: b.apt_b_id,
    aptAName: b.apt_a_name, aptBName: b.apt_b_name,
    winner: b.winner, viewCount: b.view_count, createdAt: b.created_at,
  });

  return json({
    byDisputes: byDisputes.map(parseBattle),
    byViews: byViews.map(parseBattle),
  });
}
