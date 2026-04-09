export interface AuthUser {
  id: string;
  nickname: string;
  profileImg: string | null;
}

const LEGACY_TOKEN_KEY = "danjiwar_token";
const RETURN_TO_KEY = "danjiwar_return";
const CALLBACK_PATH = "/auth/kakao/callback";

export function clearLegacyToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export async function fetchMe(): Promise<AuthUser | null> {
  clearLegacyToken();
  const requestUrl = typeof window === "undefined"
    ? "/api/auth/me"
    : `/api/auth/me?_=${Date.now()}`;
  const res = await fetch(requestUrl, {
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    console.info("[auth-ui] fetchMe unauthenticated", { status: res.status });
    return null;
  }

  return (await res.json()) as AuthUser;
}

function normalizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value === CALLBACK_PATH || value.startsWith(`${CALLBACK_PATH}?`)) return "/";
  return value;
}

export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/";
  const value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return normalizeReturnTo(value);
}

export function consumeReturnTo(): string {
  if (typeof window === "undefined") return "/";
  const value = window.sessionStorage.getItem(RETURN_TO_KEY);
  window.sessionStorage.removeItem(RETURN_TO_KEY);
  return normalizeReturnTo(value);
}

export function startKakaoLogin(returnTo = currentReturnTo()): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RETURN_TO_KEY, normalizeReturnTo(returnTo));
  window.location.assign("/api/auth/kakao");
}

export function forwardKakaoCode(code: string): void {
  if (typeof window === "undefined") return;
  const target = `/api/auth/kakao/callback?code=${encodeURIComponent(code)}`;
  window.location.replace(target);
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  clearLegacyToken();

  if (!res.ok) {
    throw new Error("logout failed");
  }
}
