import { syncAllSources, syncSource } from "../services/syncService";
import type { Env } from "../types";
import { json, unauthorized } from "./http";

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
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
