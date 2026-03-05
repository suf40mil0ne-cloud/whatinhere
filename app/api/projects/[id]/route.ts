import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function db() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  const projectRef = db().collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const eventsSnap = await projectRef.collection("events").orderBy("created_at", "desc").limit(30).get();
  const recordsSnap = await db().collection("records").where("projectId", "==", projectId).orderBy("issued_at", "desc").limit(20).get();

  return NextResponse.json({
    project: { id: projectSnap.id, ...projectSnap.data() },
    events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    records: recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}
