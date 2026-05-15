import { Repository } from "../db/repository";
import type { ApiAptUserComment, Env } from "../types";
import { json, badRequest } from "./http";
import { requireAuth } from "./auth";

const REPORT_REASONS = new Set(["욕설/비방", "광고/스팸", "허위정보", "기타"]);

function toApi(row: import("../types").AptUserCommentRow, currentUserId?: string): ApiAptUserComment & { isOwn: boolean } {
  return {
    id: row.id,
    aptId: row.apt_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    content: row.content,
    createdAt: row.created_at,
    isOwn: currentUserId === row.user_id,
  };
}

export async function getAptUserComments(request: Request, env: Env, aptId: string): Promise<Response> {
  const userId = await requireAuth(request, env);
  const repo = new Repository(env.DB);
  const rows = await repo.listAptUserComments(aptId);
  return json({ comments: rows.map((r) => toApi(r, userId ?? undefined)) });
}

export async function postAptUserComment(request: Request, env: Env, aptId: string): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return json({ error: "로그인이 필요합니다" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("request body must be JSON"); }
  const { content } = body as Record<string, unknown>;
  if (typeof content !== "string" || !content.trim()) return badRequest("content is required");
  if (content.length > 500) return badRequest("댓글은 500자 이하여야 합니다");

  const repo = new Repository(env.DB);

  const [dailyCount, aptCount] = await Promise.all([
    repo.countAptUserCommentsByUserToday(userId),
    repo.countAptUserCommentsByApt(aptId),
  ]);

  if (dailyCount >= 3) return json({ error: "하루 댓글 작성 한도(3개)를 초과했습니다" }, 429);
  if (aptCount >= 100) return json({ error: "이 단지의 댓글이 가득 찼습니다(최대 100개)" }, 409);

  const user = await env.DB.prepare(`SELECT nickname, profile_img FROM users WHERE id = ?`).bind(userId).first<{ nickname: string; profile_img: string | null }>();
  if (!user) return json({ error: "사용자 정보를 찾을 수 없습니다" }, 404);

  await repo.insertAptUserComment({
    id: crypto.randomUUID(),
    aptId,
    userId,
    userName: user.nickname,
    userPhoto: user.profile_img,
    content: content.trim(),
  });
  return json({ ok: true });
}

export async function deleteAptUserComment(request: Request, env: Env, aptId: string, commentId: string): Promise<Response> {
  void aptId;
  const userId = await requireAuth(request, env);
  if (!userId) return json({ error: "로그인이 필요합니다" }, 401);

  const repo = new Repository(env.DB);
  const deleted = await repo.deleteAptUserComment(commentId, userId);
  if (!deleted) return json({ error: "삭제할 댓글이 없거나 권한이 없습니다" }, 404);
  return json({ ok: true });
}

export async function reportAptUserComment(request: Request, env: Env, aptId: string, commentId: string): Promise<Response> {
  void aptId;
  const userId = await requireAuth(request, env);
  if (!userId) return json({ error: "로그인이 필요합니다" }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("request body must be JSON"); }
  const { reason } = body as Record<string, unknown>;
  if (typeof reason !== "string" || !REPORT_REASONS.has(reason)) {
    return badRequest("신고 사유를 선택해주세요");
  }

  const repo = new Repository(env.DB);

  const comment = await env.DB.prepare(`SELECT user_id FROM apt_user_comments WHERE id = ?`).bind(commentId).first<{ user_id: string }>();
  if (!comment) return json({ error: "존재하지 않는 댓글입니다" }, 404);
  if (comment.user_id === userId) return json({ error: "본인 댓글은 신고할 수 없습니다" }, 400);

  const alreadyReported = await repo.hasUserReportedComment(commentId, userId);
  if (alreadyReported) return json({ error: "이미 신고한 댓글입니다" }, 409);

  await repo.insertAptCommentReport({
    id: crypto.randomUUID(),
    commentId,
    userId,
    reason,
  });
  return json({ ok: true });
}
