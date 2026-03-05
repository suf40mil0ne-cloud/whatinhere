import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type GridZoom = 12 | 14;

function getAdminDb() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

function cellSizeDeg(zoom: GridZoom): number {
  return zoom === 12 ? 0.02 : 0.005;
}

function chooseZoomByLevel(level?: number): GridZoom {
  if (typeof level === "number" && Number.isFinite(level) && level <= 5) return 14;
  return 12;
}

function gridIdsForBounds(south: number, west: number, north: number, east: number, zoom: GridZoom): string[] {
  const cell = cellSizeDeg(zoom);
  const x1 = Math.floor((west + 180) / cell);
  const x2 = Math.floor((east + 180) / cell);
  const y1 = Math.floor((south + 90) / cell);
  const y2 = Math.floor((north + 90) / cell);

  const ids: string[] = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
      ids.push(`${zoom}_${x}_${y}`);
    }
  }
  return ids;
}

function tsToMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (typeof value === "object" && value !== null) {
    const maybe = value as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
    if (typeof maybe._seconds === "number") return maybe._seconds * 1000;
    if (typeof maybe.toDate === "function") {
      const d = maybe.toDate();
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const south = Number(searchParams.get("south"));
  const west = Number(searchParams.get("west"));
  const north = Number(searchParams.get("north"));
  const east = Number(searchParams.get("east"));
  const level = searchParams.get("level") ? Number(searchParams.get("level")) : undefined;
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  if (![south, west, north, east].every((n) => Number.isFinite(n))) {
    return NextResponse.json({ error: "bounds required" }, { status: 400 });
  }

  const db = getAdminDb();
  const zoom = chooseZoomByLevel(level);
  const gridIds = gridIdsForBounds(south, west, north, east, zoom);

  const tileSnaps = await Promise.all(gridIds.slice(0, 120).map((gid) => db.doc(`tiles_cache/${gid}`).get()));

  const idSet = new Set<string>();
  for (const tile of tileSnaps) {
    if (!tile.exists) continue;
    const projectIds = tile.get("projectIds");
    if (!Array.isArray(projectIds)) continue;
    for (const id of projectIds) {
      if (typeof id === "string" && id.trim()) idSet.add(id);
    }
  }

  const refs = Array.from(idSet)
    .slice(0, 600)
    .map((id) => db.collection("projects").doc(id));

  const docs = refs.length ? await db.getAll(...refs) : [];

  let items = docs
    .filter((doc) => doc.exists)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((project: any) => {
      const center = project.center;
      if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") return false;
      return center.lat >= south && center.lat <= north && center.lng >= west && center.lng <= east;
    });

  if (status) items = items.filter((project: any) => project.status === status);
  if (category) items = items.filter((project: any) => project.category === category);

  items.sort((a: any, b: any) => tsToMs(b.last_updated_at) - tsToMs(a.last_updated_at));

  return NextResponse.json({ zoom, gridCount: gridIds.length, items: items.slice(0, 300) });
}
