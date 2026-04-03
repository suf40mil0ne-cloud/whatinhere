import { Repository } from "../db/repository";
import type { Env } from "../types";
import { json, badRequest, serverError } from "./http";

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return isLocal
    ? "http://localhost:5173/auth/kakao/callback"
    : "https://whatsinhere.pages.dev/auth/kakao/callback";
}

export function kakaoLoginRedirect(request: Request, env: Env): Response {
  const clientId = env.KAKAO_REST_API_KEY;
  if (!clientId) return serverError("KAKAO_REST_API_KEY not configured");
  const redirectUri = encodeURIComponent(getRedirectUri(request));
  const url = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code`;
  return Response.redirect(url, 302);
}

export async function kakaoCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return badRequest("code is required");

  const clientId = env.KAKAO_REST_API_KEY;
  if (!clientId) return serverError("KAKAO_REST_API_KEY not configured");

  // Exchange code for token
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: getRedirectUri(request),
      code,
    }),
  });
  if (!tokenRes.ok) return serverError("Kakao token exchange failed");
  const tokenData = await tokenRes.json() as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) return serverError("No access token from Kakao");

  // Get user info
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return serverError("Kakao user info fetch failed");
  const me = await meRes.json() as {
    id?: number;
    kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } };
    properties?: { nickname?: string; profile_image?: string };
  };

  const userId = String(me.id);
  const nickname =
    me.kakao_account?.profile?.nickname ??
    me.properties?.nickname ??
    "익명";
  const profileImg =
    me.kakao_account?.profile?.profile_image_url ??
    me.properties?.profile_image ??
    null;

  const repo = new Repository(env.DB);
  await repo.upsertUser({ id: userId, nickname, profileImg });

  // Create session token (random UUID as opaque token)
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await repo.createSession(token, userId, expiresAt);

  // Redirect to frontend with token
  const frontendBase = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    ? "http://localhost:5173"
    : "https://whatsinhere.pages.dev";
  return Response.redirect(`${frontendBase}/auth/kakao/callback?token=${token}`, 302);
}

export async function getMe(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const repo = new Repository(env.DB);
  const user = await repo.getSessionUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (new Date(user.expires_at) < new Date()) {
    await repo.deleteSession(token);
    return json({ error: "Unauthorized" }, 401);
  }
  return json({ id: user.id, nickname: user.nickname, profileImg: user.profile_img });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (token) {
    const repo = new Repository(env.DB);
    await repo.deleteSession(token);
  }
  return json({ ok: true });
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export async function requireAuth(request: Request, env: Env): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;
  const repo = new Repository(env.DB);
  const user = await repo.getSessionUser(token);
  if (!user) return null;
  if (new Date(user.expires_at) < new Date()) {
    await repo.deleteSession(token);
    return null;
  }
  return user.id;
}
