import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface HotBattle {
  id: string;
  aptAId: string;
  aptBId: string;
  aptAName: string;
  aptBName: string;
  winner: string | null;
  viewCount: number;
  createdAt: string;
  disputeCount?: number;
}

interface HotData {
  byDisputes: HotBattle[];
  byViews: HotBattle[];
}

function winnerLabel(battle: HotBattle): string {
  if (battle.winner === "a") return `${battle.aptAName} 승`;
  if (battle.winner === "b") return `${battle.aptBName} 승`;
  return "무승부";
}

function BattleCard({ battle, showDisputes }: { battle: HotBattle; showDisputes: boolean }) {
  return (
    <Link to={`/battle/${battle.id}`} className="hot-card">
      <div className="hot-card__names">
        <span className="hot-card__apt">{battle.aptAName}</span>
        <span className="hot-card__vs">vs</span>
        <span className="hot-card__apt">{battle.aptBName}</span>
      </div>
      <div className="hot-card__meta">
        <span className="hot-card__winner">{winnerLabel(battle)}</span>
        <span className="hot-card__stats">
          {showDisputes && battle.disputeCount != null && (
            <span>⚠️ 딴지 {battle.disputeCount}개</span>
          )}
          <span>👀 조회 {battle.viewCount.toLocaleString()}</span>
        </span>
      </div>
    </Link>
  );
}

export function HotPage() {
  const [data, setData] = useState<HotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"disputes" | "views">("disputes");

  useEffect(() => {
    fetch("/api/battles/hot")
      .then((r) => r.json())
      .then((d) => setData(d as HotData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const battles = tab === "disputes" ? (data?.byDisputes ?? []) : (data?.byViews ?? []);

  return (
    <div className="hot-page">
      <div className="hot-page__header">
        <h1 className="hot-page__title">HOT 대결</h1>
        <div className="hot-page__tabs">
          <button
            className={`hot-page__tab ${tab === "disputes" ? "hot-page__tab--active" : ""}`}
            onClick={() => setTab("disputes")}
          >
            🔥 논란의 대결
          </button>
          <button
            className={`hot-page__tab ${tab === "views" ? "hot-page__tab--active" : ""}`}
            onClick={() => setTab("views")}
          >
            👀 많이 본 대결
          </button>
        </div>
      </div>

      {loading ? (
        <p className="hot-page__loading">로딩 중...</p>
      ) : battles.length === 0 ? (
        <p className="hot-page__empty">아직 대결 데이터가 없어요.</p>
      ) : (
        <div className="hot-page__list">
          {battles.map((b) => (
            <BattleCard key={b.id} battle={b} showDisputes={tab === "disputes"} />
          ))}
        </div>
      )}
    </div>
  );
}
