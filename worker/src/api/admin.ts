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

  // Test subway API (page 1 only)
  let subwayStatus: string;
  let subwaySample: unknown[] = [];
  try {
    const url = new URL("https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList");
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "5");
    url.searchParams.set("type", "json");
    const res = await fetch(url.toString());
    const data = await res.json() as Record<string, unknown>;
    subwayStatus = res.ok ? `ok (${res.status})` : `error (${res.status})`;
    const body = (data?.response as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
    const items = (body?.items as Record<string, unknown>)?.item;
    subwaySample = Array.isArray(items) ? items.slice(0, 3) : [];
  } catch (e) {
    subwayStatus = `exception: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test Kakao keyword search (one station)
  let kakaoStatus: string;
  let kakaoSample: unknown = null;
  if (kakaoKey) {
    try {
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", "강남 역");
      url.searchParams.set("category_group_code", "SW8");
      const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
      const data = await res.json() as { documents?: unknown[] };
      kakaoStatus = res.ok ? `ok (${res.status})` : `error (${res.status})`;
      kakaoSample = data.documents?.[0] ?? null;
    } catch (e) {
      kakaoStatus = `exception: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    kakaoStatus = "KAKAO_REST_API_KEY not set";
  }

  return json({ ok: true, subway: { status: subwayStatus, sample: subwaySample }, kakao: { status: kakaoStatus, sample: kakaoSample } });
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

  const url = new URL("http://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api");
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
    console.log(`[test-walk] park API status=${status} body_preview=${raw.slice(0, 300)}`);
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const body = (data?.response as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
      totalCount = body?.totalCount ?? null;
      const items = (body?.items as Record<string, unknown>)?.item;
      itemCount = Array.isArray(items) ? items.length : null;
      bodyPreview = { totalCount, itemCount, firstItem: Array.isArray(items) ? items[0] : null };
    } catch {
      bodyPreview = raw.slice(0, 500);
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
  let cctvStatus: string;
  let cctvItemCount: number | null = null;
  try {
    const url = new URL("https://www.safetydata.go.kr/V2/api/DSSP-IF-20011");
    url.searchParams.set("serviceKey", env.CCTV_API_KEY ?? "");
    url.searchParams.set("pageIndex", "1");
    url.searchParams.set("pageSize", "10");
    const cctvController = new AbortController();
    const cctvTimeout = setTimeout(() => cctvController.abort(), 10000);
    const res = await fetch(url.toString(), { signal: cctvController.signal });
    clearTimeout(cctvTimeout);
    const raw = await res.text();
    cctvStatus = `${res.status}`;
    console.log(`[test-safety] cctv status=${res.status} body_preview=${raw.slice(0, 300)}`);
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const items = extractItems(data);
      cctvItemCount = items.length;
    } catch { cctvItemCount = null; }
  } catch (e) {
    cctvStatus = `exception: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test child zone API
  let childStatus: string;
  let childItemCount: number | null = null;
  try {
    const url = new URL("http://api.data.go.kr/openapi/tn_pubr_public_child_prtc_zn_api");
    url.searchParams.set("serviceKey", env.DATA_GO_KR_SERVICE_KEY);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "10");
    url.searchParams.set("type", "json");
    const childController = new AbortController();
    const childTimeout = setTimeout(() => childController.abort(), 10000);
    const res = await fetch(url.toString(), { signal: childController.signal });
    clearTimeout(childTimeout);
    const raw = await res.text();
    childStatus = `${res.status}`;
    console.log(`[test-safety] child zone status=${res.status} body_preview=${raw.slice(0, 300)}`);
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const items = extractItems(data);
      childItemCount = items.length;
    } catch { childItemCount = null; }
  } catch (e) {
    childStatus = `exception: ${e instanceof Error ? e.message : String(e)}`;
  }

  return json({
    ok: true,
    cctv: { status: cctvStatus, itemCount: cctvItemCount, keySet: !!env.CCTV_API_KEY },
    childZone: { status: childStatus, itemCount: childItemCount },
  });
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
