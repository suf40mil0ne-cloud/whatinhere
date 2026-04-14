import { Repository } from "../db/repository";
import type { Env } from "../types";
import { json } from "./http";

const VALID_COLS = new Set(["s_overall", "s_transport", "s_walk", "s_value", "s_childcare", "s_safety"]);

export async function getRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") || undefined;
  const by = url.searchParams.get("by") || "s_overall";
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)), 50);

  if (!VALID_COLS.has(by)) {
    return json({ error: "invalid by parameter" }, 400);
  }

  const repo = new Repository(env.DB);
  const ranking = await repo.getRankingByScore({ region, scoreCol: by, limit });
  return json({ ranking });
}
