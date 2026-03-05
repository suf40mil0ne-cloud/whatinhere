import { db, FieldValue } from "../shared/firestore";

export async function rebuildTilesCache(opts?: { limit?: number }) {
  const firestore = db();
  const limit = opts?.limit ?? 3000;

  const snap = await firestore.collection("projects").orderBy("last_updated_at", "desc").limit(limit).get();

  const map = new Map<string, Set<string>>();
  for (const doc of snap.docs) {
    const gridKeys: string[] = doc.get("gridKeys") || [];
    for (const g of gridKeys) {
      if (!map.has(g)) map.set(g, new Set());
      map.get(g)!.add(doc.id);
    }
  }

  let batch = firestore.batch();
  let opCount = 0;
  for (const [gridId, ids] of map.entries()) {
    batch.set(firestore.doc(`tiles_cache/${gridId}`), {
      zoom: Number(gridId.split("_")[0]),
      gridId,
      projectIds: Array.from(ids),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    opCount += 1;
    if (opCount >= 400) {
      await batch.commit();
      batch = firestore.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();

  return { grids: map.size, projectsScanned: snap.size };
}
