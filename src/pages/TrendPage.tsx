import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface Battle {
  id: string;
  apt_a_id: string;
  apt_b_id: string;
  apt_a_name: string;
  apt_b_name: string;
  winner: string | null;
  score_a: string;
  score_b: string;
  view_count: number;
  created_at: string;
}

interface PopularApt {
  id: string;
  name: string;
  address: string | null;
  battle_count: number;
}

function scoreResult(battle: Battle): { winsA: number; winsB: number } {
  try {
    const a = JSON.parse(battle.score_a) as Record<string, number>;
    const b = JSON.parse(battle.score_b) as Record<string, number>;
    let winsA = 0, winsB = 0;
    for (const k of ["transport","walk","value","childcare","safety"]) {
      if ((a[k] ?? 0) > (b[k] ?? 0)) winsA++;
      else if ((b[k] ?? 0) > (a[k] ?? 0)) winsB++;
    }
    return { winsA, winsB };
  } catch { return { winsA: 0, winsB: 0 }; }
}

function winnerLabel(battle: Battle): string {
  if (battle.winner === "a") return `${battle.apt_a_name} 승`;
  if (battle.winner === "b") return `${battle.apt_b_name} 승`;
  if (battle.winner === "draw") return "무승부";
  return "";
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="trend-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="trend-item trend-item--skeleton">
          <div className="skeleton-block" style={{ height: 18, flex: 1, borderRadius: 6 }} />
          <div className="skeleton-block" style={{ height: 14, width: 60, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function TrendPage() {
  const navigate = useNavigate();
  const [hot, setHot] = useState<Battle[]>([]);
  const [popular, setPopular] = useState<PopularApt[]>([]);
  const [recent, setRecent] = useState<Battle[]>([]);
  const [loadingHot, setLoadingHot] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [errorHot, setErrorHot] = useState(false);
  const [errorRecent, setErrorRecent] = useState(false);

  useEffect(() => {
    fetch("/api/trends/hot?limit=5")
      .then(r => r.json()).then(d => setHot((d as { battles: Battle[] }).battles ?? []))
      .catch(() => setErrorHot(true)).finally(() => setLoadingHot(false));

    fetch("/api/trends/popular?limit=10")
      .then(r => r.json()).then(d => setPopular((d as { apts: PopularApt[] }).apts ?? []))
      .catch(() => {}).finally(() => setLoadingPopular(false));

    fetch("/api/trends/recent?limit=10")
      .then(r => r.json()).then(d => setRecent((d as { battles: Battle[] }).battles ?? []))
      .catch(() => setErrorRecent(true)).finally(() => setLoadingRecent(false));
  }, []);

  return (
    <div className="trend-page">
      <h1 className="trend-page__title">트렌드 🔥</h1>

      {/* 섹션 1 — 요즘 핫한 대결 */}
      <section className="trend-section">
        <h2 className="trend-section__title">요즘 핫한 대결 TOP 5 👀</h2>
        {loadingHot ? <SectionSkeleton rows={5} /> : errorHot ? (
          <div className="empty-state">
            <p className="empty-state__text">데이터를 불러오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
          </div>
        ) : hot.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">아직 대결 데이터가 없어요. 첫 대결을 만들어보세요!</p>
            <button className="btn btn--primary" onClick={() => navigate("/battle")}>⚔️ 대결 시작하기</button>
          </div>
        ) : (
          <div className="trend-list">
            {hot.map((b, i) => (
              <Link key={b.id} to={`/battle/${b.id}`} className="trend-item trend-item--battle">
                <span className="trend-item__rank">{i + 1}</span>
                <span className="trend-item__names">
                  <span className="trend-item__apt">{b.apt_a_name}</span>
                  <span className="trend-item__vs">vs</span>
                  <span className="trend-item__apt">{b.apt_b_name}</span>
                </span>
                <span className="trend-item__meta">
                  <span className="trend-item__winner">{winnerLabel(b)}</span>
                  <span className="trend-item__views">👀 {b.view_count.toLocaleString()}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 섹션 2 — 많이 대결된 단지 */}
      <section className="trend-section">
        <h2 className="trend-section__title">많이 대결된 단지 TOP 10 ⚔️</h2>
        {loadingPopular ? <SectionSkeleton rows={10} /> : popular.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">아직 대결 데이터가 없어요. 첫 대결을 만들어보세요!</p>
            <button className="btn btn--primary" onClick={() => navigate("/battle")}>⚔️ 대결 시작하기</button>
          </div>
        ) : (
          <div className="trend-list">
            {popular.map((apt, i) => (
              <div key={apt.id} className="trend-item">
                <span className="trend-item__rank">{i + 1}</span>
                <span className="trend-item__info">
                  <span className="trend-item__apt-name">{apt.name}</span>
                  {apt.address && <span className="trend-item__address">{apt.address}</span>}
                </span>
                <span className="trend-item__count">{apt.battle_count}회</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 섹션 3 — 최근 대결 */}
      <section className="trend-section">
        <h2 className="trend-section__title">최근 대결 🕐</h2>
        {loadingRecent ? <SectionSkeleton rows={10} /> : errorRecent ? (
          <div className="empty-state">
            <p className="empty-state__text">데이터를 불러오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
          </div>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">아직 대결 데이터가 없어요. 첫 대결을 만들어보세요!</p>
            <button className="btn btn--primary" onClick={() => navigate("/battle")}>⚔️ 대결 시작하기</button>
          </div>
        ) : (
          <div className="trend-list">
            {recent.map(b => {
              const { winsA, winsB } = scoreResult(b);
              const scoreStr = battle_winner_score(b, winsA, winsB);
              return (
                <Link key={b.id} to={`/battle/${b.id}`} className="trend-item trend-item--battle">
                  <span className="trend-item__names">
                    <span className="trend-item__apt">{b.apt_a_name}</span>
                    <span className="trend-item__vs">vs</span>
                    <span className="trend-item__apt">{b.apt_b_name}</span>
                  </span>
                  <span className="trend-item__meta">
                    <span className="trend-item__winner">{scoreStr}</span>
                    <span className="trend-item__date">{b.created_at.slice(0, 10)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function battle_winner_score(b: Battle, winsA: number, winsB: number): string {
  if (b.winner === "a") return `${b.apt_a_name} 승 · ${winsA}:${winsB}`;
  if (b.winner === "b") return `${b.apt_b_name} 승 · ${winsB}:${winsA}`;
  return "무승부";
}
