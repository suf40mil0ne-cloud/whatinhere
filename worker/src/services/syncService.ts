import { Repository } from "../db/repository";
import { mergeProjects, shouldMerge } from "../normalize/dedupe";
import { toNormalizedProject } from "../normalize/projectBuilder";
import { normalizeStatus } from "../normalize/status";
import { SOURCE_ADAPTERS } from "../sources/registry";
import type { Env, NormalizedProject, SourceRecord } from "../types";
import { sha256 } from "../utils/hash";
import { makeId } from "../utils/id";
import { geocodeAddress } from "./geocode";

const SOURCE_PRIORITY: Record<string, number> = {
  "dev-permit-openapi": 70,
  "building-basic-openapi": 85,
  "building-hub-openapi": 95,
  "local-csv-upload": 100,
};

async function maybeGeocode(env: Env, source: SourceRecord): Promise<SourceRecord> {
  // 원본에 좌표가 있으면 그대로 신뢰하고, 없을 때만 주소 기반 보정 지오코딩을 수행한다.
  if (source.lat != null && source.lng != null) return source;
  const address = source.addressRoad || source.addressJibun;
  if (!address) return source;

  const geo = await geocodeAddress(env, address);
  if (!geo) return source;

  return {
    ...source,
    lat: geo.lat,
    lng: geo.lng,
  };
}

async function persistMergedProject(
  repo: Repository,
  sourceId: string,
  source: SourceRecord,
  project: NormalizedProject
): Promise<void> {
  await repo.upsertProject(project);

  const normalizedStatus = normalizeStatus(source.rawStatus, source.startDate ?? null, source.approvalDate ?? null);
  await repo.addStatusHistory({
    historyId: makeId("hist"),
    projectId: project.project_id,
    sourceId,
    rawStatus: source.rawStatus,
    normalizedStatus,
    statusDate: source.approvalDate || source.startDate || source.permitDate || null,
    note: source.note || source.sourceUrl,
  });
}

async function upsertSourceRecord(repo: Repository, env: Env, sourceId: string, source: SourceRecord): Promise<void> {
  // 동일 payload 재처리를 막기 위해 source + record + payload 기반 hash를 생성한다.
  const withGeo = await maybeGeocode(env, source);
  const rawPayloadJson = JSON.stringify(withGeo.raw);
  const rawHash = await sha256(`${sourceId}:${withGeo.sourceRecordId}:${rawPayloadJson}`);

  const exists = await repo.existsRawHash(rawHash);
  if (exists) return;

  await repo.insertRaw({
    rawId: makeId("raw"),
    sourceId,
    fetchedAt: new Date().toISOString(),
    rawPayloadJson,
    rawHash,
    sourceRecordId: withGeo.sourceRecordId,
  });

  const normalized = toNormalizedProject(withGeo, SOURCE_PRIORITY[sourceId] ?? 50);
  // 기존 후보군과 점수 기반으로 병합 여부를 판단한다.
  const candidates = await repo.findCandidates(normalized);
  const merged = candidates.find((candidate) => shouldMerge(candidate, normalized));

  if (!merged) {
    await persistMergedProject(repo, sourceId, withGeo, normalized);
    return;
  }

  const finalProject = mergeProjects(merged, normalized);
  finalProject.project_id = merged.project_id;
  await persistMergedProject(repo, sourceId, withGeo, finalProject);
}

export async function syncSource(env: Env, sourceId: string): Promise<{ sourceId: string; ingested: number }> {
  const adapter = SOURCE_ADAPTERS[sourceId];
  if (!adapter) {
    throw new Error(`Unknown source adapter: ${sourceId}`);
  }

  const repo = new Repository(env.DB);
  const rows = await adapter.fetch(env);

  let ingested = 0;
  for (const row of rows) {
    try {
      await upsertSourceRecord(repo, env, sourceId, row);
      ingested += 1;
    } catch (error) {
      console.error("sync row failed", sourceId, row.sourceRecordId, error);
    }
  }

  return { sourceId, ingested };
}

export async function syncAllSources(env: Env): Promise<Array<{ sourceId: string; ingested: number }>> {
  const ids = Object.keys(SOURCE_ADAPTERS);
  const result: Array<{ sourceId: string; ingested: number }> = [];

  for (const sourceId of ids) {
    try {
      const summary = await syncSource(env, sourceId);
      result.push(summary);
    } catch (error) {
      console.error("sync source failed", sourceId, error);
      result.push({ sourceId, ingested: 0 });
    }
  }

  return result;
}
