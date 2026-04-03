import { useEffect, useMemo, useState } from "react";
import type { DistrictRecord, DistrictStatKey } from "../lib/district-types";

const STAT_META: Array<{ key: DistrictStatKey; label: string }> = [
  { key: "transport", label: "교통" },
  { key: "walk", label: "산책" },
  { key: "value", label: "가성비" },
  { key: "childcare", label: "육아" },
  { key: "safety", label: "안심" },
];

function getGrade(score: number): { label: string; colorClass: string } {
  if (score >= 80) return { label: "S", colorClass: "grade-s" };
  if (score >= 60) return { label: "A", colorClass: "grade-a" };
  if (score >= 40) return { label: "B", colorClass: "grade-b" };
  if (score >= 20) return { label: "C", colorClass: "grade-c" };
  return { label: "D", colorClass: "grade-d" };
}

function formatInt(value: number | null | undefined): string {
  return value == null ? "-" : Math.round(value).toLocaleString("ko-KR");
}

function formatDistance(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}m`;
}

function buildDescription(district: DistrictRecord, key: DistrictStatKey): string {
  switch (key) {
    case "transport":
      return `지하철역 ${formatDistance(district.rawTransport?.subwayStationDistanceM)} · 버스정류소 ${formatInt(district.rawTransport?.busStopCount500m)}개`;
    case "walk":
      return `1km 내 공원 ${formatInt(district.rawWalk?.parkCount1km)}곳 · 총 면적 ${formatInt(district.rawWalk?.parkArea1km)}㎡`;
    case "value":
      return `㎡당 중위가 ${formatInt(district.rawValue?.pricePerSqmMedian)}만원`;
    case "childcare":
      return `어린이집 ${formatInt(district.rawChildcare?.childcareCount)}곳 · 학원 ${formatInt(district.rawChildcare?.academyCount1km)}곳`;
    case "safety":
      return `범죄예방 CCTV ${formatInt(district.rawSafety?.cctvCount500m)}대 · 보호구역 ${formatInt(district.rawSafety?.childZoneCount1km)}곳`;
  }
}

function shareDistrict(district: DistrictRecord): void {
  const text = `${district.sigungu} ${district.dong} 동네스탯\n교통 ${Math.round(district.scores.transport)} · 산책 ${Math.round(district.scores.walk)} · 가성비 ${Math.round(district.scores.value)} · 육아 ${Math.round(district.scores.childcare)} · 안심 ${Math.round(district.scores.safety)}`;
  if (navigator.share) {
    void navigator.share({ title: `동네스탯 · ${district.dong}`, text, url: window.location.href });
    return;
  }
  void navigator.clipboard?.writeText(`${text}\n${window.location.href}`);
}

export function DistrictPanel({ district }: { district: DistrictRecord | null }) {
  const storageKey = district ? `district-votes:${district.code}` : null;
  const [votes, setVotes] = useState<Record<DistrictStatKey, number>>({
    transport: 0,
    walk: 0,
    value: 0,
    childcare: 0,
    safety: 0,
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      setVotes({ ...votes, ...JSON.parse(raw) as Record<DistrictStatKey, number> });
    } catch {
      // ignore local storage parse failures
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(votes));
  }, [storageKey, votes]);

  const overallGrade = useMemo(() => (district ? getGrade(district.scores.overall) : null), [district]);

  if (!district) {
    return (
      <aside className="district-panel empty">
        <div className="district-panel-card">
          <p className="district-panel-kicker">동네스탯</p>
          <h2>읍면동을 선택하세요</h2>
          <p className="district-panel-copy">지도에서 폴리곤을 클릭하면 5개 스탯과 체감 투표를 볼 수 있습니다.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="district-panel">
      <div className="district-panel-card">
        <div className="district-panel-head">
          <div>
            <p className="district-panel-kicker">동네스탯</p>
            <h2>{district.dong}</h2>
            <p className="district-panel-copy">{district.sigungu} · {district.sido}</p>
          </div>
          {overallGrade ? <span className={`district-grade-badge ${overallGrade.colorClass}`}>{overallGrade.label}</span> : null}
        </div>

        <div className="district-score-list">
          {STAT_META.map((stat) => {
            const score = district.scores[stat.key];
            const grade = getGrade(score);
            return (
              <section key={stat.key} className="district-score-row">
                <div className="district-score-head">
                  <strong>{stat.label}</strong>
                  <span className={`district-grade-badge ${grade.colorClass}`}>{grade.label}</span>
                </div>
                <div className="district-score-bar-shell">
                  <div className="district-score-bar-fill" style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
                </div>
                <p className="district-score-copy">{buildDescription(district, stat.key)}</p>
                <div className="district-vote-row">
                  <span>체감</span>
                  <div className="district-stars" role="group" aria-label={`${stat.label} 체감 투표`}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`district-star ${votes[stat.key] >= value ? "active" : ""}`}
                        onClick={() => {
                          setVotes((current) => ({ ...current, [stat.key]: value }));
                          void fetch(`/api/districts/${encodeURIComponent(district.code)}/vote`, {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ category: stat.key, score: value }),
                          });
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="district-panel-actions">
          <button type="button" className="district-share-button" onClick={() => shareDistrict(district)}>
            공유
          </button>
        </div>
      </div>
    </aside>
  );
}
