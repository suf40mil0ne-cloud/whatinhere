import { useEffect, useState } from "react";
import type { AptComment, AptRecord, DistrictStatKey } from "../lib/district-types";

const STAT_META: Array<{ key: DistrictStatKey; label: string }> = [
  { key: "transport", label: "교통" },
  { key: "walk", label: "산책" },
  { key: "value", label: "가성비" },
  { key: "childcare", label: "육아" },
  { key: "safety", label: "안심" },
];

const CATEGORY_OPTIONS = [
  { value: "transport", label: "교통" },
  { value: "walk", label: "산책/공원" },
  { value: "value", label: "가성비" },
  { value: "childcare", label: "육아" },
  { value: "safety", label: "안심/안전" },
  { value: "general", label: "전반적" },
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

function buildAptDescription(apt: AptRecord, key: DistrictStatKey): string {
  switch (key) {
    case "transport":
      return `지하철역 ${formatDistance(apt.rawTransport?.subwayStationDistanceM)} · 버스 ${formatInt(apt.rawTransport?.busStopCount500m)}개`;
    case "walk":
      return `공원 ${formatInt(apt.rawWalk?.parkCount1km)}곳 · ${formatInt(apt.rawWalk?.parkArea1km)}㎡`;
    case "value":
      return `㎡당 ${formatInt(apt.avgPricePerM2)}만원`;
    case "childcare":
      return `어린이집 ${formatInt(apt.rawChildcare?.childcareCount)}곳 · 학원 ${formatInt(apt.rawChildcare?.academyCount1km)}곳`;
    case "safety":
      return `CCTV ${formatInt(apt.rawSafety?.cctvCount500m)}대 · 보호구역 ${formatInt(apt.rawSafety?.childZoneCount1km)}곳`;
  }
}

export function AptPanel({ apt }: { apt: AptRecord | null }) {
  const [comments, setComments] = useState<AptComment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState("general");
  const [formScore, setFormScore] = useState(0);
  const [formComment, setFormComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!apt) {
      setComments([]);
      return;
    }
    void fetch(`/api/apartments/${encodeURIComponent(apt.id)}`)
      .then((res) => res.ok ? res.json() : { comments: [] })
      .then((data) => {
        const d = data as { comments?: AptComment[] };
        if (d.comments) {
          setComments([...d.comments].sort((a, b) => b.likes - a.likes));
        }
      })
      .catch(() => {});
  }, [apt]);

  if (!apt) {
    return (
      <aside className="apt-panel empty">
        <div className="apt-panel-card">
          <p className="district-panel-kicker">단지스탯</p>
          <h2>아파트 단지를 선택하세요</h2>
        </div>
      </aside>
    );
  }

  const overallScore = Math.round(
    (apt.scores.transport + apt.scores.walk + apt.scores.value + apt.scores.childcare + apt.scores.safety) / 5
  );
  const overallGrade = getGrade(overallScore);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formComment.trim() || !apt) return;
    setSubmitting(true);
    try {
      await fetch(`/api/apartments/${encodeURIComponent(apt.id)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: formCategory,
          comment: formComment.trim(),
          user_score: formScore > 0 ? formScore : null,
        }),
      });
      setFormComment("");
      setFormScore(0);
      setFormCategory("general");
      setShowForm(false);
      // Refresh comments
      const res = await fetch(`/api/apartments/${encodeURIComponent(apt.id)}`);
      if (res.ok) {
        const data = await res.json() as { comments?: AptComment[] };
        if (data.comments) {
          setComments([...data.comments].sort((a, b) => b.likes - a.likes));
        }
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLike(commentId: string) {
    if (!apt) return;
    await fetch(`/api/apartments/${encodeURIComponent(apt.id)}/comments/${encodeURIComponent(commentId)}/like`, {
      method: "POST",
    }).catch(() => {});
    setComments((prev) =>
      [...prev]
        .map((c) => c.id === commentId ? { ...c, likes: c.likes + 1 } : c)
        .sort((a, b) => b.likes - a.likes)
    );
  }

  return (
    <aside className="apt-panel">
      <div className="apt-panel-card">
        <div className="apt-panel-head">
          <div>
            <p className="district-panel-kicker">단지스탯</p>
            <h2>{apt.name}</h2>
            {apt.address ? <p className="apt-panel-meta">{apt.address}</p> : null}
          </div>
          <span className={`apt-grade-badge ${overallGrade.colorClass}`}>{overallGrade.label}</span>
        </div>

        <p className="apt-panel-meta">
          {apt.builtYear ? `${apt.builtYear}년 준공` : "-"}
          {apt.totalUnits ? ` · ${formatInt(apt.totalUnits)}세대` : ""}
          {apt.avgPricePerM2 ? ` · ㎡당 ${formatInt(apt.avgPricePerM2)}만원` : ""}
        </p>

        <div className="apt-score-list">
          {STAT_META.map((stat) => {
            const score = apt.scores[stat.key];
            const grade = getGrade(score);
            return (
              <section key={stat.key} className="apt-score-row">
                <div className="apt-score-head">
                  <strong>{stat.label}</strong>
                  <span className={`apt-grade-badge ${grade.colorClass}`}>{grade.label}</span>
                </div>
                <div className="apt-score-bar-shell">
                  <div className="apt-score-bar-fill" style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
                </div>
                <p className="apt-score-copy">{buildAptDescription(apt, stat.key)}</p>
              </section>
            );
          })}
        </div>

        <div className="apt-comment-section">
          <button
            type="button"
            className="apt-comment-toggle-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "취소" : "이 점수 틀렸어요"}
          </button>

          {showForm ? (
            <form className="apt-comment-form" onSubmit={(e) => void handleSubmit(e)}>
              <select
                className="apt-comment-select"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <div className="apt-stars-input" role="group" aria-label="별점">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`apt-star-btn ${formScore >= v ? "active" : ""}`}
                    onClick={() => setFormScore(v)}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                className="apt-comment-textarea"
                value={formComment}
                onChange={(e) => setFormComment(e.target.value.slice(0, 200))}
                placeholder="의견을 입력하세요 (최대 200자)"
                required
                maxLength={200}
              />

              <button
                type="submit"
                className="apt-comment-submit-btn"
                disabled={submitting || !formComment.trim()}
              >
                {submitting ? "제출 중…" : "제출"}
              </button>
            </form>
          ) : null}

          {comments.length > 0 ? (
            <ul className="apt-comment-list">
              {comments.map((c) => (
                <li key={c.id} className="apt-comment-item">
                  {c.category ? (
                    <span style={{ fontWeight: 700, marginRight: 6 }}>
                      {CATEGORY_OPTIONS.find((o) => o.value === c.category)?.label ?? c.category}
                    </span>
                  ) : null}
                  {c.userScore ? <span style={{ color: "#f4a261" }}>{"★".repeat(c.userScore)}</span> : null}
                  <span style={{ marginLeft: c.category || c.userScore ? 6 : 0 }}>{c.comment}</span>
                  <div style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="apt-comment-like-btn"
                      onClick={() => void handleLike(c.id)}
                    >
                      ♥ 좋아요 {c.likes > 0 ? c.likes : ""}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
