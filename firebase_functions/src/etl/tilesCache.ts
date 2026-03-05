import { db, FieldValue } from "../shared/firestore";

export async function rebuildTilesCache(opts?: { limit?: number }): Promise<{ grids: number; projectsScanned: number }> {
  const firestore = db();
  const limit = Number.isFinite(opts?.limit) && (opts?.limit as number) > 0 ? (opts?.limit as number) : 3000;

  const snap = await firestore
    .collection("projects")
    .orderBy("last_updated_at", "desc")
    .limit(limit)
    .get();

  const bucket = new Map<string, Set<string>>();

  for (const doc of snap.docs) {
    const gridKeys = doc.get("gridKeys");
    if (!Array.isArray(gridKeys)) continue;

    for (const raw of gridKeys) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const key = raw.trim();
      if (!bucket.has(key)) bucket.set(key, new Set<string>());
      bucket.get(key)?.add(doc.id);
    }
  }

  let batch = firestore.batch();
  let opCount = 0;

  for (const [gridId, ids] of bucket.entries()) {
    const zoom = Number(gridId.split("_")[0]);
    const ref = firestore.doc(`tiles_cache/${gridId}`);

    batch.set(
      ref,
      {
        zoom: Number.isFinite(zoom) ? zoom : null,
        gridId,
        projectIds: Array.from(ids),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    opCount += 1;
    if (opCount >= 400) {
      await batch.commit();
      batch = firestore.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  return { grids: bucket.size, projectsScanned: snap.size };
}
