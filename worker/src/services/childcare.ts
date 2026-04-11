import type { Env } from "../types";

type QueryValue = string | number | boolean | null | undefined;

export interface ChildcareFetchOptions {
  path: string;
  query?: Record<string, QueryValue>;
  init?: RequestInit;
  timeoutMs?: number;
  debugLabel?: string;
}

export interface ChildcareFetchResult {
  response: Response;
  url: string;
  via: "proxy";
  startedAt: string;
  durationMs: number;
}

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function appendQuery(url: URL, query: Record<string, QueryValue> = {}): void {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
}

export function buildChildcareProxyUrl(proxyBase: string, pathname: string, query: Record<string, QueryValue> = {}): string {
  const url = new URL(proxyBase);
  url.searchParams.set("path", normalizePath(pathname));
  appendQuery(url, query);
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchChildcareApi(env: Env, options: ChildcareFetchOptions): Promise<ChildcareFetchResult> {
  if (!env.CHILDCARE_PROXY_URL) {
    throw new Error("CHILDCARE_PROXY_URL is not configured");
  }

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const proxyUrl = buildChildcareProxyUrl(env.CHILDCARE_PROXY_URL, options.path, options.query ?? {});
  const label = options.debugLabel ?? "childcare";

  console.log(`[${label}] proxy request start path=${normalizePath(options.path)} url=${proxyUrl}`);

  try {
    const response = await fetchWithTimeout(proxyUrl, options.init, options.timeoutMs);
    const durationMs = Date.now() - started;
    console.log(
      `[${label}] proxy request done status=${response.status} ok=${response.ok} durationMs=${durationMs} contentType=${response.headers.get("content-type") ?? ""}`
    );
    return {
      response,
      url: proxyUrl,
      via: "proxy",
      startedAt,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] proxy request failed durationMs=${durationMs} url=${proxyUrl} error=${message}`);
    throw new Error(`childcare proxy request failed: ${message}`);
  }
}
