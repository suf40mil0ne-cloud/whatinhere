import { Repository } from "../db/repository";
import type { Env } from "../types";
import { json } from "./http";

export async function getTrendHot(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)), 20);
  const repo = new Repository(env.DB);
  const battles = await repo.getTrendHot(limit);
  return json({ battles });
}

export async function getTrendPopular(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)), 30);
  const repo = new Repository(env.DB);
  const apts = await repo.getTrendPopular(limit);
  return json({ apts });
}

export async function getTrendRecent(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)), 30);
  const repo = new Repository(env.DB);
  const battles = await repo.getTrendRecent(limit);
  return json({ battles });
}
