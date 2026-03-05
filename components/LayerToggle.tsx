"use client";

import React from "react";

export default function LayerToggle({
  filters,
  onChange,
}: {
  filters: { status?: string; category?: string };
  onChange: (v: { status?: string; category?: string }) => void;
}) {
  return (
    <div className="bg-white/95 rounded-2xl shadow p-3 flex gap-2 items-center">
      <select
        className="border rounded-xl px-2 py-1"
        value={filters.status ?? ""}
        onChange={(e) => onChange({ ...filters, status: e.target.value || undefined })}
      >
        <option value="">전체 상태</option>
        <option value="RECEIVED">개발 접수</option>
        <option value="APPROVED">허가/인허가</option>
        <option value="IN_PROGRESS">공사중</option>
        <option value="COMPLETED">완료</option>
      </select>

      <select
        className="border rounded-xl px-2 py-1"
        value={filters.category ?? ""}
        onChange={(e) => onChange({ ...filters, category: e.target.value || undefined })}
      >
        <option value="">전체 유형</option>
        <option value="주거">주거</option>
        <option value="물류">물류</option>
        <option value="산업">산업</option>
        <option value="공공">공공</option>
        <option value="기타">기타</option>
      </select>
    </div>
  );
}
