import type { Env } from "../types";

export function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key];
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function fetchOpenApiItems(
  env: Env,
  endpoint: string,
  extraParams: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");

  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OpenAPI fetch failed: ${response.status} ${endpoint}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const body = (((payload.response as Record<string, unknown>)?.body as Record<string, unknown>) ?? payload) as Record<string, unknown>;
  const itemsNode = (body.items as Record<string, unknown> | undefined)?.item ?? body.items;

  if (Array.isArray(itemsNode)) return itemsNode as Record<string, unknown>[];
  if (itemsNode && typeof itemsNode === "object") return [itemsNode as Record<string, unknown>];

  return [];
}
