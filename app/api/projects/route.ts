import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const south = Number(searchParams.get("south"));
  const west = Number(searchParams.get("west"));
  const north = Number(searchParams.get("north"));
  const east = Number(searchParams.get("east"));
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  if (![south, west, north, east].every(Number.isFinite)) {
    return NextResponse.json({ error: "bounds required" }, { status: 400 });
  }

  let q: FirebaseFirestore.Query = db().collection("projects").orderBy("last_updated_at", "desc").limit(500);
  if (status) q = q.where("projectStage", "==", status);
  if (category) q = q.where("category", "==", category);

  const snap = await q.get();
  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p: any) => p.center && p.center.lat >= south && p.center.lat <= north && p.center.lng >= west && p.center.lng <= east)
    .slice(0, 300);

  return NextResponse.json({ items });
}
