import { Repository } from "../db/repository";
import type { Env } from "../types";
import { json } from "./http";

const SESSION_COOKIE = "whatsinhere_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const KAKAO_CALLBACK_PATH = "/auth/kakao/callback";

const NICKNAME_ADJ = [
  "졸린", "급한", "느긋한", "신나는", "배고픈",
  "꼼꼼한", "대담한", "소심한", "의심많은", "용감한",
  "당당한", "수줍은", "부지런한", "게으른", "억울한",
  "뿌듯한", "억척스런", "고집센", "눈치빠른", "철두철미한",
  "겁많은", "호기심많은", "까다로운", "느려터진", "번개같은",
];
const NICKNAME_NOUN = [
  "입주민", "관리소장", "경비아저씨", "경비아줌마", "세입자",
  "집주인", "부동산중개사", "청약당첨자", "재건축파", "갭투자자",
  "실거주자", "분양권자", "동대표", "층간소음민원인", "이사짐센터",
  "베란다텃밭러", "주차자리지킴이", "택배함지킴이", "헬스장단골", "재활용분리왕",
];

function generateNickname(): string {
  const adj  = NICKNAME_ADJ[Math.floor(Math.random() * NICKNAME_ADJ.length)];
  const noun = NICKNAME_NOUN[Math.floor(Math.random() * NICKNAME_NOUN.length)];
  const dong = Math.floor(Math.random() * 199) + 101; // 101–299동
  return `${dong}동 ${adj} ${noun}`;
}

function getFrontendBase(request: Request): string {
  const url = new URL(request.url);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return isLocal ? "http://localhost:5173" : `${url.protocol}//${url.host}`;
}

function getKakaoCallbackUri(request: Request): string {
  return `${getFrontendBase(request)}${KAKAO_CALLBACK_PATH}`;
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function createSessionCookie(request: Request, token: string): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isSecureRequest(request)) attributes.push("Secure");
  return attributes.join("; ");
}

function clearSessionCookie(request: Request): string {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isSecureRequest(request)) attributes.push("Secure");
  return attributes.join("; ");
}

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function authResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  const response = json(data, status);
  const merged = new Headers(response.headers);
  merged.set("cache-control", "no-store");

  if (headers) {
    const extra = new Headers(headers);
    extra.forEach((value, key) => merged.set(key, value));
  }

  return new Response(response.body, { status: response.status, headers: merged });
}

function authError(message: string, status = 500, headers?: HeadersInit): Response {
  return authResponse({ error: message }, status, headers);
}

function authRedirect(location: string, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set("Location", location);
  merged.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers: merged });
}

function normalizeEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getKakaoEnvDiagnostics(env: Env) {
  const restApiKey = normalizeEnvValue(env.KAKAO_REST_API_KEY);
  const clientSecret = normalizeEnvValue(env.KAKAO_CLIENT_SECRET);
  const jsSdkKey = normalizeEnvValue(env.VITE_KAKAO_JS_KEY) ?? normalizeEnvValue(env.VITE_KAKAO_MAP_JS_KEY);
  const jsSdkKeyName = normalizeEnvValue(env.VITE_KAKAO_JS_KEY)
    ? "VITE_KAKAO_JS_KEY"
    : normalizeEnvValue(env.VITE_KAKAO_MAP_JS_KEY)
      ? "VITE_KAKAO_MAP_JS_KEY"
      : null;

  return {
    restApiKey,
    clientSecret,
    jsSdkKey,
    jsSdkKeyName,
    restApiKeyMasked: maskSecret(restApiKey),
    clientSecretConfigured: Boolean(clientSecret),
    jsSdkKeyConfigured: Boolean(jsSdkKey),
    jsSdkKeyMatchesRestApiKey: Boolean(jsSdkKey && restApiKey && jsSdkKey === restApiKey),
  };
}

function validateKakaoAuthConfig(env: Env, redirectUri: string): string | null {
  const diagnostics = getKakaoEnvDiagnostics(env);
  console.info("[auth] kakao config check", {
    redirectUri,
    restApiKeyConfigured: Boolean(diagnostics.restApiKey),
    restApiKeyMasked: diagnostics.restApiKeyMasked,
    clientSecretConfigured: diagnostics.clientSecretConfigured,
    jsSdkKeyName: diagnostics.jsSdkKeyName,
    jsSdkKeyConfigured: diagnostics.jsSdkKeyConfigured,
    jsSdkKeyMatchesRestApiKey: diagnostics.jsSdkKeyMatchesRestApiKey,
  });

  if (!diagnostics.restApiKey) {
    console.error("[auth] kakao config missing REST API key", {
      redirectUri,
      jsSdkKeyName: diagnostics.jsSdkKeyName,
      jsSdkKeyConfigured: diagnostics.jsSdkKeyConfigured,
      note: "Server token exchange must use KAKAO_REST_API_KEY. Frontend SDK keys such as VITE_KAKAO_JS_KEY or VITE_KAKAO_MAP_JS_KEY cannot replace it.",
    });
    return "KAKAO_REST_API_KEY not configured. Server token exchange must use the Kakao REST API key.";
  }

  if (diagnostics.jsSdkKeyMatchesRestApiKey) {
    console.warn("[auth] kakao config warning", {
      redirectUri,
      jsSdkKeyName: diagnostics.jsSdkKeyName,
      note: "Frontend JS SDK key and KAKAO_REST_API_KEY are identical. Verify this is intentional and that the server is using the REST API key from Kakao Developers.",
    });
  }

  return null;
}

function sanitizeTokenResponseBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["access_token", "refresh_token", "id_token"]) {
      if (typeof parsed[key] === "string") {
        parsed[key] = "[redacted]";
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

export function kakaoLoginRedirect(request: Request, env: Env): Response {
  const redirectUri = getKakaoCallbackUri(request);
  const configError = validateKakaoAuthConfig(env, redirectUri);
  if (configError) return authError(configError);

  const clientId = env.KAKAO_REST_API_KEY!.trim();
  console.info("[auth] kakao login redirect start", { redirectUri });
  const url = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  return authRedirect(url);
}

export async function kakaoCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = getKakaoCallbackUri(request);
  console.info("[auth] kakao callback", { hasCode: Boolean(code), redirectUri });
  if (!code) return authError("code is required", 400);

  const configError = validateKakaoAuthConfig(env, redirectUri);
  if (configError) return authError(configError);

  const clientId = env.KAKAO_REST_API_KEY!.trim();
  const tokenParams: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  };
  if (env.KAKAO_CLIENT_SECRET) {
    tokenParams.client_secret = env.KAKAO_CLIENT_SECRET.trim();
  }

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(tokenParams),
  });
  const tokenBody = await tokenRes.text();
  console.info("[auth] kakao token exchange", {
    ok: tokenRes.ok,
    status: tokenRes.status,
    redirectUri,
    clientSecretConfigured: Boolean(tokenParams.client_secret),
    restApiKeyConfigured: Boolean(clientId),
    body: sanitizeTokenResponseBody(tokenBody),
  });
  if (!tokenRes.ok) return authError(`Kakao token exchange failed: ${tokenBody}`);

  let tokenData: { access_token?: string };
  try {
    tokenData = JSON.parse(tokenBody) as { access_token?: string };
  } catch {
    return authError(`Kakao token response was not valid JSON: ${tokenBody}`);
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return authError(`Kakao token response missing access_token: ${tokenBody}`);
  }

  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return authError("Kakao user info fetch failed");

  const me = await meRes.json() as {
    id?: number;
    kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } };
    properties?: { nickname?: string; profile_image?: string };
  };

  const userId = String(me.id);
  const profileImg = me.kakao_account?.profile?.profile_image_url ?? me.properties?.profile_image ?? null;

  const repo = new Repository(env.DB);
  // 신규 유저는 랜덤 닉네임 부여, 기존 유저는 닉네임 유지
  await repo.upsertUser({ id: userId, nickname: generateNickname(), profileImg });

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await repo.createSession(token, userId, expiresAt);

  console.info("[auth] session cookie set attempt", { userId, secure: isSecureRequest(request) });
  return authRedirect(getKakaoCallbackUri(request), {
    "Set-Cookie": createSessionCookie(request, token),
  });
}

export async function getMe(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (!token) {
    console.info("[auth] me session parse", { ok: false, reason: "missing_token" });
    return authError("Unauthorized", 401);
  }

  const repo = new Repository(env.DB);
  const user = await repo.getSessionUser(token);
  if (!user) {
    console.info("[auth] me session parse", { ok: false, reason: "session_not_found" });
    return authError("Unauthorized", 401, {
      "Set-Cookie": clearSessionCookie(request),
    });
  }

  if (new Date(user.expires_at) < new Date()) {
    await repo.deleteSession(token);
    console.info("[auth] me session parse", { ok: false, reason: "session_expired" });
    return authError("Unauthorized", 401, {
      "Set-Cookie": clearSessionCookie(request),
    });
  }

  console.info("[auth] me session parse", { ok: true, userId: user.id });
  return authResponse({ id: user.id, nickname: user.nickname, profileImg: user.profile_img });
}

export async function updateNickname(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (!token) return authError("Unauthorized", 401);

  const repo = new Repository(env.DB);
  const user = await repo.getSessionUser(token);
  if (!user) return authError("Unauthorized", 401);
  if (new Date(user.expires_at) < new Date()) {
    await repo.deleteSession(token);
    return authError("Unauthorized", 401);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return authError("Invalid JSON", 400); }
  const { nickname } = body as Record<string, unknown>;
  if (typeof nickname !== "string" || !nickname.trim()) return authError("nickname is required", 400);
  const trimmed = nickname.trim().slice(0, 10);

  await repo.updateUserNickname(user.id, trimmed);
  return authResponse({ ok: true, nickname: trimmed });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (token) {
    const repo = new Repository(env.DB);
    await repo.deleteSession(token);
  }

  return authResponse({ ok: true }, 200, {
    "Set-Cookie": clearSessionCookie(request),
  });
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  return getCookieValue(request, SESSION_COOKIE);
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
