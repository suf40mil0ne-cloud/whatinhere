import { syncAllSources, syncSource } from "../services/syncService";
import type { Env } from "../types";
import { json, unauthorized } from "./http";
import { collectTransport } from "../cron/collectTransport";
import { collectWalk } from "../cron/collectWalk";
import { collectSafety } from "../cron/collectSafety";

const BATTLE_ADMIN_PASSWORD = "danjijeon2024";

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.ADMIN_TOKEN}`;
}

function isBattleAdmin(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${BATTLE_ADMIN_PASSWORD}`;
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

export async function resetBattles(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  await env.DB.prepare("DELETE FROM battle_disputes").run();
  await env.DB.prepare("DELETE FROM battle_comments").run();
  await env.DB.prepare("DELETE FROM comment_likes").run();
  await env.DB.prepare("DELETE FROM battles").run();
  return json({ ok: true });
}

export async function runTestFetch(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();

  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
  const kakaoKey = env.KAKAO_REST_API_KEY;

  // Test subway API (page 1, 3 rows)
  let subwayResult: unknown;
  try {
    const url = new URL("https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList");
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "3");
    url.searchParams.set("type", "json");
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { /* xml or other */ }
    subwayResult = { status: res.status, contentType, rawPreview: raw.slice(0, 800), parsed };
  } catch (e) {
    subwayResult = { error: e instanceof Error ? e.message : String(e) };
  }

  // Test Kakao keyword search
  let kakaoResult: unknown;
  if (kakaoKey) {
    try {
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", "강남 역");
      url.searchParams.set("category_group_code", "SW8");
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${kakaoKey}` }, signal: controller.signal });
      clearTimeout(t);
      const data = await res.json() as { documents?: unknown[]; meta?: unknown };
      kakaoResult = { status: res.status, meta: data.meta, firstDoc: data.documents?.[0] ?? null };
    } catch (e) {
      kakaoResult = { error: e instanceof Error ? e.message : String(e) };
    }
  } else {
    kakaoResult = { error: "KAKAO_REST_API_KEY not set" };
  }

  return json({ ok: true, subway: subwayResult, kakao: kakaoResult });
}

export async function runCollectTransport(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  console.log(`[admin] collect-transport start, kakaoKey=${env.KAKAO_REST_API_KEY ? "set" : "missing"}`);
  const updated = await collectTransport(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.TAGO_API_KEY, env.KAKAO_REST_API_KEY);
  console.log(`[admin] collect-transport done, updated=${updated} districts`);
  return json({ ok: true, updated });
}

export async function runTestWalk(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();

  const url = new URL("https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api");
  url.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("type", "json");

  let status: number;
  let bodyPreview: unknown;
  let itemCount: number | null = null;
  let totalCount: unknown = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    status = res.status;
    const raw = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    console.log(`[test-walk] park API status=${status} content-type=${contentType} body_preview=${raw.slice(0, 300)}`);
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const body = (data?.response as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
      totalCount = body?.totalCount ?? null;
      const items = (body?.items as Record<string, unknown>)?.item;
      itemCount = Array.isArray(items) ? items.length : null;
      bodyPreview = { contentType, totalCount, itemCount, firstItem: Array.isArray(items) ? items[0] : null, rawPreview: raw.slice(0, 500) };
    } catch {
      bodyPreview = { contentType, rawPreview: raw.slice(0, 800) };
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  return json({ ok: true, status, totalCount, itemCount, bodyPreview });
}

export async function runCollectWalk(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  const updated = await collectWalk(env.DB, env.DATA_GO_KR_SERVICE_KEY);
  return json({ ok: true, updated });
}

export async function runTestSafety(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();

  // Test CCTV API
  let cctvResult: unknown;
  try {
    const url = new URL("https://www.safetydata.go.kr/V2/api/DSSP-IF-20011");
    url.searchParams.set("serviceKey", env.CCTV_API_KEY ?? "");
    url.searchParams.set("pageIndex", "1");
    url.searchParams.set("pageSize", "3");
    const cctvController = new AbortController();
    const cctvTimeout = setTimeout(() => cctvController.abort(), 10000);
    const res = await fetch(url.toString(), { signal: cctvController.signal });
    clearTimeout(cctvTimeout);
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    console.log(`[test-safety] cctv status=${res.status} content-type=${contentType} body_preview=${raw.slice(0, 300)}`);
    let parsed: unknown = null;
    let firstItem: unknown = null;
    try {
      parsed = JSON.parse(raw);
      const items = extractItems(parsed as Record<string, unknown>);
      firstItem = items[0] ?? null;
    } catch { /* not JSON */ }
    cctvResult = { status: res.status, contentType, keySet: !!env.CCTV_API_KEY, firstItem, rawPreview: raw.slice(0, 800) };
  } catch (e) {
    cctvResult = { error: e instanceof Error ? e.message : String(e) };
  }

  // Test child zone API
  let childResult: unknown;
  try {
    const url = new URL("https://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api");
    url.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "3");
    url.searchParams.set("type", "json");
    const childController = new AbortController();
    const childTimeout = setTimeout(() => childController.abort(), 10000);
    const res = await fetch(url.toString(), { signal: childController.signal });
    clearTimeout(childTimeout);
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    console.log(`[test-safety] child zone status=${res.status} content-type=${contentType} body_preview=${raw.slice(0, 300)}`);
    let firstItem: unknown = null;
    try {
      const parsed = JSON.parse(raw);
      const items = extractItems(parsed as Record<string, unknown>);
      firstItem = items[0] ?? null;
    } catch { /* not JSON */ }
    childResult = { status: res.status, contentType, firstItem, rawPreview: raw.slice(0, 800) };
  } catch (e) {
    childResult = { error: e instanceof Error ? e.message : String(e) };
  }

  return json({ ok: true, cctv: cctvResult, childZone: childResult });
}

function extractItems(data: Record<string, unknown>): unknown[] {
  const response = (data?.response ?? data) as Record<string, unknown>;
  const body = (response?.body ?? response) as Record<string, unknown>;
  const items = body?.items ?? response?.items ?? data?.items ?? data?.data;
  if (Array.isArray(items)) return items;
  if (Array.isArray((items as Record<string, unknown>)?.item)) return (items as Record<string, unknown[]>).item as unknown[];
  if (Array.isArray(body?.item)) return body.item as unknown[];
  if (Array.isArray(data?.list)) return data.list as unknown[];
  return [];
}

export async function testJoin(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  const rows = await env.DB.prepare(`
    SELECT a.id, a.name, a.district_code, a.s_value as apt_value,
           d.code, d.s_value as district_value
    FROM apt_complexes a
    LEFT JOIN district_scores d ON a.district_code = d.code
    WHERE a.name LIKE '%계산%'
    LIMIT 5
  `).all<{ id: string; name: string; district_code: string | null; apt_value: number | null; code: string | null; district_value: number | null }>();
  return json({ ok: true, rows: rows.results });
}

export async function runCollectSafety(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();
  const updated = await collectSafety(env.DB, env.DATA_GO_KR_SERVICE_KEY, env.CCTV_API_KEY, env.SAFETY_INDEX_API_KEY);
  return json({ ok: true, updated });
}

export async function getAdminStats(request: Request, env: Env): Promise<Response> {
  if (!isBattleAdmin(request)) return unauthorized();

  const [battleRow, commentRow, top5Row] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM battles").first<{ cnt: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM battle_comments").first<{ cnt: number }>(),
    env.DB.prepare(`
      SELECT name, COUNT(*) AS battle_count
      FROM (
        SELECT apt_a_name AS name FROM battles
        UNION ALL
        SELECT apt_b_name AS name FROM battles
      )
      GROUP BY name
      ORDER BY battle_count DESC
      LIMIT 5
    `).all<{ name: string; battle_count: number }>(),
  ]);

  return json({
    totalBattles: Number(battleRow?.cnt ?? 0),
    totalComments: Number(commentRow?.cnt ?? 0),
    top5: top5Row.results,
  });
}
