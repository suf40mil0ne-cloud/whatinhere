"use client";

import React, { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

type ProjectDetail = {
  project: any;
  events: any[];
  records: any[];
};

export default function BottomSheet({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);

  useEffect(() => {
    setDetail(null);
    if (!project?.id) return;
    (async () => {
      const res = await fetch(`/api/projects/${project.id}`);
      const json = await res.json();
      setDetail(json);
    })();
  }, [project?.id]);

  if (!project) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <div className="mx-auto max-w-xl bg-white rounded-t-3xl shadow-lg p-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="text-lg font-semibold">{project.title}</div>
            <div className="text-sm text-gray-600 mt-1">{project.address_display || "주소 정보 없음"}</div>
          </div>
          <button className="text-sm px-3 py-1 rounded-xl border" onClick={onClose}>닫기</button>
        </div>

        <div className="mt-4 text-sm text-gray-700">
          {detail ? (
            <div>
              <div>events: {detail.events?.length ?? 0}</div>
              <div>records: {detail.records?.length ?? 0}</div>
            </div>
          ) : (
            <div>상세 로딩중...</div>
          )}
        </div>
      </div>
    </div>
  );
}
