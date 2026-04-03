import { Repository } from "../db/repository";
import type { ApiDistrictRecord, DistrictScoreRow, Env } from "../types";
import { badRequest, json } from "./http";

function parseBbox(value: string): { swLng: number; swLat: number; neLng: number; neLat: number } | null {
  const parts = value.split(",").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { swLng: parts[0], swLat: parts[1], neLng: parts[2], neLat: parts[3] };
}

function parseJsonSafe(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function toApiRecord(row: DistrictScoreRow): ApiDistrictRecord {
  return {
    code: row.code,
    sido: row.sido,
    sigungu: row.sigungu,
    dong: row.dong,
    center: { lat: row.center_lat, lng: row.center_lng },
    households: row.households,
    population: row.population,
    scores: {
      transport: row.s_transport ?? 0,
      walk: row.s_walk ?? 0,
      value: row.s_value ?? 0,
      childcare: row.s_childcare ?? 0,
      safety: row.s_safety ?? 0,
      overall: row.s_overall ?? 0,
    },
    rawTransport: parseJsonSafe(row.raw_transport),
    rawWalk: parseJsonSafe(row.raw_walk),
    rawValue: parseJsonSafe(row.raw_value),
    rawChildcare: parseJsonSafe(row.raw_childcare),
    rawSafety: parseJsonSafe(row.raw_safety),
  };
}

const VALID_CATEGORIES = new Set(["transport", "walk", "value", "childcare", "safety"]);

export async function listDistricts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const bboxRaw = url.searchParams.get("bbox");
  if (!bboxRaw) return badRequest("bbox query is required");
  const bbox = parseBbox(bboxRaw);
  if (!bbox) return badRequest("bbox format should be swLng,swLat,neLng,neLat");

  const repo = new Repository(env.DB);
  const [total, districts] = await Promise.all([
    repo.countDistrictsInBounds(bbox),
    repo.listDistricts(bbox),
  ]);
  return json({ total, districts: districts.map(toApiRecord) });
}

export async function getDistrict(_request: Request, env: Env, code: string): Promise<Response> {
  const repo = new Repository(env.DB);
  const row = await repo.getDistrictByCode(code);
  if (!row) return json({ error: "Not found" }, 404);
  return json(toApiRecord(row));
}

export async function voteDistrict(request: Request, env: Env, code: string): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("request body must be JSON"); }

  const { category, score } = body as Record<string, unknown>;
  if (typeof category !== "string" || !VALID_CATEGORIES.has(category)) {
    return badRequest("category must be one of: transport, walk, value, childcare, safety");
  }
  const scoreNum = typeof score === "number" ? score : Number(score);
  if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return badRequest("score must be an integer between 1 and 5");
  }

  const repo = new Repository(env.DB);
  const exists = await repo.getDistrictByCode(code);
  if (!exists) return json({ error: "Not found" }, 404);

  await repo.insertVote({ id: crypto.randomUUID(), districtCode: code, category, score: scoreNum });
  return json({ ok: true });
}
