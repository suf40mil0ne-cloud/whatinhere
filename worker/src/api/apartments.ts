import { readAptScores } from "../lib/apt-scores";
import { Repository } from "../db/repository";
import type { ApiAptRecord, AptComplexRow, Env } from "../types";
import { badRequest, json } from "./http";

function parseBbox(value: string): { swLng: number; swLat: number; neLng: number; neLat: number } | null {
  const parts = value.split(",").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { swLng: parts[0], swLat: parts[1], neLng: parts[2], neLat: parts[3] };
}

function parseJsonSafe(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

type AptRowWithRaw = AptComplexRow & {
  raw_transport: string | null;
  raw_walk: string | null;
  raw_value: string | null;
  raw_childcare: string | null;
  raw_safety: string | null;
};

function toApiRecord(row: AptRowWithRaw): ApiAptRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    districtCode: row.district_code,
    builtYear: row.built_year,
    totalUnits: row.total_units,
    avgPricePerM2: row.avg_price_per_m2,
    priceSource: row.price_source ?? null,
    sScale: row.s_scale ?? null,
    overallScoreAdjusted: row.overall_score_adjusted ?? null,
    scores: readAptScores(row),
    rawTransport: parseJsonSafe(row.raw_transport),
    rawWalk: parseJsonSafe(row.raw_walk),
    rawValue: parseJsonSafe(row.raw_value),
    rawChildcare: parseJsonSafe(row.raw_childcare),
    rawSafety: parseJsonSafe(row.raw_safety),
  };
}

const VALID_CATEGORIES = new Set(["transport", "walk", "value", "childcare", "safety", "general"]);

export async function listApts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const bboxRaw = url.searchParams.get("bbox");
  if (!bboxRaw) return badRequest("bbox query is required");
  const bbox = parseBbox(bboxRaw);
  if (!bbox) return badRequest("bbox format should be swLng,swLat,neLng,neLat");

  const repo = new Repository(env.DB);
  const [total, apts] = await Promise.all([
    repo.countAptsInBounds(bbox),
    repo.listApts(bbox),
  ]);
  return json({ total, apts: apts.map((row) => toApiRecord(row as AptRowWithRaw)) });
}

export async function getApt(_request: Request, env: Env, id: string): Promise<Response> {
  const repo = new Repository(env.DB);
  const row = await repo.getAptById(id);
  if (!row) return json({ error: "Not found" }, 404);

  const record: ApiAptRecord = {
    ...toApiRecord(row as AptRowWithRaw),
    comments: row.comments.map((c) => ({
      id: c.id,
      aptId: c.apt_id,
      category: c.category,
      comment: c.comment,
      userScore: c.user_score,
      likes: c.likes,
      createdAt: c.created_at,
    })),
  };
  return json(record);
}

export async function createComment(request: Request, env: Env, aptId: string): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("request body must be JSON"); }

  const { category, comment, user_score } = body as Record<string, unknown>;
  if (typeof comment !== "string" || !comment.trim()) return badRequest("comment is required");
  if (comment.length > 200) return badRequest("comment must be 200 characters or fewer");
  if (category !== undefined && (typeof category !== "string" || !VALID_CATEGORIES.has(category))) {
    return badRequest("category must be one of: transport, walk, value, childcare, safety, general");
  }
  const scoreNum = user_score != null ? Number(user_score) : null;
  if (scoreNum !== null && (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5)) {
    return badRequest("user_score must be an integer between 1 and 5");
  }

  const repo = new Repository(env.DB);
  const apt = await repo.getAptById(aptId);
  if (!apt) return json({ error: "Not found" }, 404);

  await repo.insertComment({
    id: crypto.randomUUID(),
    aptId,
    category: typeof category === "string" ? category : null,
    comment: comment.trim(),
    userScore: scoreNum,
  });
  return json({ ok: true });
}

export async function likeComment(_request: Request, env: Env, commentId: string): Promise<Response> {
  const repo = new Repository(env.DB);
  await repo.likeComment(commentId);
  return json({ ok: true });
}

export async function getNearbyApts(_request: Request, env: Env, aptId: string): Promise<Response> {
  const repo = new Repository(env.DB);
  const nearby = await repo.getNearbyApts(aptId);
  return json({ nearby });
}

export async function searchApts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sido = url.searchParams.get("sido") ?? undefined;
  const sigungu = url.searchParams.get("sigungu") ?? undefined;
  const dong = url.searchParams.get("dong") ?? undefined;
  const name = url.searchParams.get("name") ?? undefined;

  const repo = new Repository(env.DB);

  if (!sido) {
    const sidos = await repo.searchAptSidos();
    return json({ type: "sidos", items: sidos });
  }
  if (!sigungu) {
    const sigungus = await repo.searchAptSigungus(sido);
    return json({ type: "sigungus", items: sigungus });
  }
  if (!dong) {
    const dongs = await repo.searchAptDongs(sido, sigungu);
    return json({ type: "dongs", items: dongs });
  }
  const apts = await repo.searchAptsByDong(sido, sigungu, dong, name);
  return json({ type: "apts", items: apts.map((a) => ({ id: a.id, name: a.name, address: a.address })) });
}
