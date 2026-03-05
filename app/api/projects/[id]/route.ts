import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminDb() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  const db = getAdminDb();

  const projectRef = db.collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [eventsSnap, recordsSnap] = await Promise.all([
    projectRef.collection("events").orderBy("created_at", "desc").limit(30).get(),
    db.collection("records").where("projectId", "==", projectId).orderBy("issued_at", "desc").limit(20).get(),
  ]);

  const events = eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const records = recordsSnap.docs.map((doc) => ({
    id: doc.id,
    source: doc.get("source"),
    title: doc.get("title"),
    issued_at: doc.get("issued_at"),
    applied_at: doc.get("applied_at"),
    use: doc.get("use"),
    area_m2: doc.get("area_m2"),
    floors: doc.get("floors"),
    units: doc.get("units"),
    evidence_urls: doc.get("evidence_urls") || [],
  }));

  return NextResponse.json({
    project: { id: projectSnap.id, ...projectSnap.data() },
    events,
    records,
  });
}
