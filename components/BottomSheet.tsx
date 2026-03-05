"use client";

import React, { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

type ProjectDetail = {
  project: any;
  events: any[];
  records: any[];
};

function fmtDate(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("ko-KR");
  }

  if (typeof value === "object" && value !== null) {
    const ts = value as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleDateString("ko-KR");
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toLocaleDateString("ko-KR");
    if (typeof ts._seconds === "number") return new Date(ts._seconds * 1000).toLocaleDateString("ko-KR");
  }

  return "";
}

export default function BottomSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDetail(null);
    if (!project?.id) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${project.id}`);
        const json = await res.json();
        setDetail(json);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [project?.id]);

  if (!project) return null;

  const records = Array.isArray(detail?.records) ? detail!.records.slice(0, 4) : [];
  const events = Array.isArray(detail?.events) ? detail!.events.slice(0, 10) : [];

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <div className="mx-auto max-h-[75vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{project.title}</div>
            <div className="mt-1 text-sm text-gray-600">{project.address_display || "주소 정보 없음"}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-1">{project.status}</span>
              {project.category ? <span className="rounded-full bg-gray-100 px-2 py-1">{project.category}</span> : null}
            </div>
          </div>
          <button className="rounded-xl border px-3 py-1 text-sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          {loading ? <div className="text-gray-600">상세 정보를 불러오는 중...</div> : null}

          {!loading && !detail ? <div className="text-gray-600">상세 정보를 불러오지 못했습니다.</div> : null}

          {detail ? (
            <>
              <section>
                <div className="font-semibold">원천 요약</div>
                <div className="mt-2 space-y-2">
                  {records.map((record) => (
                    <div key={record.id} className="rounded-2xl border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-gray-100 px-2 py-1">{record.source || "SOURCE"}</span>
                        {record.issued_at ? (
                          <span className="rounded-full bg-gray-100 px-2 py-1">{fmtDate(record.issued_at)}</span>
                        ) : null}
                      </div>
                      <div className="mt-2 font-medium">{record.title || "제목 없음"}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">
                        {record.use ? <span>용도: {record.use}</span> : null}
                        {typeof record.area_m2 === "number" ? <span>연면적: {record.area_m2}㎡</span> : null}
                        {typeof record.floors === "number" ? <span>층수: {record.floors}</span> : null}
                        {typeof record.units === "number" ? <span>세대수: {record.units}</span> : null}
                      </div>
                      {Array.isArray(record.evidence_urls) && record.evidence_urls[0] ? (
                        <a
                          href={record.evidence_urls[0]}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs underline"
                        >
                          근거 링크
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="font-semibold">타임라인</div>
                <div className="mt-2 space-y-2">
                  {events.map((event) => (
                    <div key={event.id} className="rounded-2xl border p-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-gray-100 px-2 py-1">{event.type || "EVENT"}</span>
                        {event.at ? <span className="rounded-full bg-gray-100 px-2 py-1">{fmtDate(event.at)}</span> : null}
                      </div>
                      <div className="mt-2 text-gray-800">{event.text || ""}</div>
                      {event.evidence_url ? (
                        <a href={event.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">
                          근거 링크
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
