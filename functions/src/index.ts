import * as functions from "firebase-functions";
import { db, FieldValue } from "./shared/firestore";
import { fetchDevPermits } from "./etl/devPermit";
import { fetchBuildPermits } from "./etl/buildPermit";
import { geocodeKakao } from "./etl/geocode";
import { ensureDedupKey, hashStringToId } from "./etl/dedup";
import { gridIdFor } from "./etl/grid";
import { rebuildTilesCache } from "./etl/tilesCache";
import { inferStatusFromSource, normalizeAddress, type NormalizedRecord, type ProjectStatus } from "./etl/normalize";

const DATA_GO_KR_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY || "";
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || "";
const DEV_PERMIT_BASE_URL = process.env.DEV_PERMIT_BASE_URL || "";
const BUILD_PERMIT_BASE_URL = process.env.BUILD_PERMIT_BASE_URL || "";

type UpsertOptions = {
  sourceSummaryKey: "devPermit" | "buildPermit";
  eventType: "RECEIVED" | "APPROVED";
  minimumStatus: ProjectStatus;
};

export const etlDevPermitDaily = functions
  .region("asia-northeast3")
  .pubsub.schedule("every day 03:30")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    ensureRequiredEnv(["DATA_GO_KR_SERVICE_KEY", "KAKAO_REST_API_KEY", "DEV_PERMIT_BASE_URL"]);

    const records = await fetchDevPermits({
      serviceKey: DATA_GO_KR_SERVICE_KEY,
      baseUrl: DEV_PERMIT_BASE_URL,
      pageNo: 1,
      numOfRows: 200,
    });

    const result = await upsertRecords(records, {
      sourceSummaryKey: "devPermit",
      eventType: "RECEIVED",
      minimumStatus: "RECEIVED",
    });

    functions.logger.info("etlDevPermitDaily completed", result);
    return null;
  });

export const etlBuildPermitDaily = functions
  .region("asia-northeast3")
  .pubsub.schedule("every day 04:00")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    ensureRequiredEnv(["DATA_GO_KR_SERVICE_KEY", "KAKAO_REST_API_KEY", "BUILD_PERMIT_BASE_URL"]);

    const records = await fetchBuildPermits({
      serviceKey: DATA_GO_KR_SERVICE_KEY,
      baseUrl: BUILD_PERMIT_BASE_URL,
      pageNo: 1,
      numOfRows: 200,
    });

    const result = await upsertRecords(records, {
      sourceSummaryKey: "buildPermit",
      eventType: "APPROVED",
      minimumStatus: "APPROVED",
    });

    functions.logger.info("etlBuildPermitDaily completed", result);
    return null;
  });

export const tilesCacheDaily = functions
  .region("asia-northeast3")
  .pubsub.schedule("every day 06:10")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const result = await rebuildTilesCache({ limit: 5000 });
    functions.logger.info("tilesCacheDaily completed", result);
    return null;
  });

async function upsertRecords(records: NormalizedRecord[], opts: UpsertOptions): Promise<{ upserted: number; skipped: number }> {
  const firestore = db();
  let upserted = 0;
  let skipped = 0;

  for (const raw of records) {
    try {
      const normalized = ensureDedupKey(raw);
      if (!normalized.sourceRecordId || !normalized.title) {
        skipped += 1;
        continue;
      }

      const projectId = hashStringToId(normalized.dedup_key || normalized.sourceRecordId);

      if ((!normalized.lat || !normalized.lng) && normalized.address_raw) {
        const geo = await geocodeKakao(normalized.address_raw, KAKAO_REST_API_KEY);
        if (geo.lat && geo.lng) {
          normalized.lat = geo.lat;
          normalized.lng = geo.lng;
          normalized.geocode_accuracy = geo.accuracy;
        }
      }

      const sourceIdHash = hashStringToId(normalized.sourceRecordId).replace(/^p_/, "");
      const recordId = `rec_${normalized.source}_${projectId}_${sourceIdHash}`;

      await firestore.doc(`records/${recordId}`).set(
        {
          projectId,
          source: normalized.source,
          sourceRecordId: normalized.sourceRecordId,
          title: normalized.title,
          address_raw: normalized.address_raw ?? null,
          address_norm: normalizeAddress(normalized.address_raw),
          pnu: normalized.pnu ?? null,
          issued_at: normalized.issued_at ?? null,
          applied_at: normalized.applied_at ?? null,
          use: normalized.use ?? null,
          area_m2: normalized.area_m2 ?? null,
          floors: normalized.floors ?? null,
          units: normalized.units ?? null,
          evidence_urls: normalized.evidence_urls ?? [],
          lat: normalized.lat ?? null,
          lng: normalized.lng ?? null,
          geocode_accuracy: normalized.geocode_accuracy ?? null,
          dedup_key: normalized.dedup_key ?? null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const projectRef = firestore.doc(`projects/${projectId}`);
      await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(projectRef);
        const now = FieldValue.serverTimestamp();

        const center =
          Number.isFinite(normalized.lat) && Number.isFinite(normalized.lng)
            ? { lat: normalized.lat as number, lng: normalized.lng as number }
            : null;

        const gridKeys = center
          ? [
              gridIdFor(center.lat, center.lng, 12),
              gridIdFor(center.lat, center.lng, 14),
            ]
          : [];

        const currentStatus = (snap.get("status") as ProjectStatus | undefined) ?? undefined;
        const inferred = inferStatusFromSource(normalized);
        const baselineStatus = upgradeStatus(opts.minimumStatus, inferred);
        const nextStatus = currentStatus ? upgradeStatus(currentStatus, baselineStatus) : baselineStatus;

        const currentSources = (snap.get("sources_summary") as Record<string, boolean> | undefined) ?? {};

        tx.set(
          projectRef,
          {
            title: snap.exists ? snap.get("title") || normalized.title : normalized.title,
            address_display: snap.exists
              ? snap.get("address_display") || normalized.address_raw || null
              : normalized.address_raw ?? null,
            address_norm: snap.exists
              ? snap.get("address_norm") || normalizeAddress(normalized.address_raw)
              : normalizeAddress(normalized.address_raw),
            pnu: snap.exists ? snap.get("pnu") || normalized.pnu || null : normalized.pnu ?? null,
            center: snap.exists ? snap.get("center") || center : center,
            gridKeys,
            status: nextStatus,
            category: snap.exists ? snap.get("category") || guessCategory(normalized.use, normalized.title) : guessCategory(normalized.use, normalized.title),
            confidence: snap.exists
              ? Math.max(Number(snap.get("confidence") || 0), Number(normalized.geocode_accuracy || 0.5))
              : normalized.geocode_accuracy ?? 0.5,
            first_seen_at: snap.exists ? snap.get("first_seen_at") || now : now,
            last_updated_at: now,
            sources_summary: {
              ...currentSources,
              [opts.sourceSummaryKey]: true,
            },
          },
          { merge: true }
        );

        const eventRef = projectRef.collection("events").doc(`ev_${recordId}`);
        tx.set(
          eventRef,
          {
            type: opts.eventType,
            at: normalized.issued_at ?? null,
            text: normalized.title,
            evidence_url: Array.isArray(normalized.evidence_urls) ? normalized.evidence_urls[0] ?? null : null,
            created_at: now,
          },
          { merge: true }
        );
      });

      upserted += 1;
    } catch (error) {
      skipped += 1;
      functions.logger.error("record upsert failed", {
        error: error instanceof Error ? error.message : String(error),
        source: raw.source,
        sourceRecordId: raw.sourceRecordId,
      });
    }
  }

  return { upserted, skipped };
}

function ensureRequiredEnv(keys: string[]): void {
  for (const key of keys) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key}`);
    }
  }
}

function guessCategory(use?: string, title?: string): string {
  const text = `${use || ""} ${title || ""}`.toLowerCase();
  if (text.includes("아파트") || text.includes("주택") || text.includes("오피스텔")) return "주거";
  if (text.includes("물류") || text.includes("창고")) return "물류";
  if (text.includes("공장") || text.includes("산업")) return "산업";
  if (text.includes("학교") || text.includes("도서관") || text.includes("체육") || text.includes("전시장")) return "공공";
  return "기타";
}

function upgradeStatus(current: ProjectStatus, incoming: ProjectStatus): ProjectStatus {
  const order: Record<ProjectStatus, number> = {
    RECEIVED: 1,
    APPROVED: 2,
    STARTED: 3,
    IN_PROGRESS: 4,
    COMPLETED: 5,
  };
  return order[incoming] > order[current] ? incoming : current;
}
