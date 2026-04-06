import { useEffect, useState } from "react";

interface RankingItem {
  id: string;
  name: string;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number;
}

const SIDO_LIST = ["서울특별시", "인천광역시", "경기도"];

function winRateColor(rate: number): string {
  if (rate >= 70) return "ranking-badge ranking-badge--green";
  if (rate >= 50) return "ranking-badge ranking-badge--yellow";
  return "ranking-badge ranking-badge--red";
}

export function RankingPage() {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [sigungus, setSigungus] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sido) params.set("sido", sido);
    if (sigungu) params.set("sigungu", sigungu);

    setLoading(true);
    fetch(`/api/battles/ranking?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setRanking((data as { ranking: RankingItem[] }).ranking ?? []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false));
  }, [sido, sigungu]);

  async function onSido(value: string) {
    setSido(value);
    setSigungu("");
    setSigungus([]);
    if (!value) return;
    try {
      const res = await fetch(`/api/apartments/search?sido=${encodeURIComponent(value)}`);
      const data = await res.json() as { items: string[] };
      setSigungus(data.items ?? []);
    } catch { /* ignore */ }
  }

  return (
    <div className="ranking-page">
      <div className="ranking-page__header">
        <h1 className="ranking-page__title">단지 전적 랭킹</h1>
        <div className="ranking-page__filters">
          <select
            className="apt-selector__select"
            value={sido}
            onChange={(e) => onSido(e.target.value)}
          >
            <option value="">전체 시도</option>
            {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="apt-selector__select"
            value={sigungu}
            onChange={(e) => setSigungu(e.target.value)}
            disabled={!sido}
          >
            <option value="">전체 시군구</option>
            {sigungus.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="ranking-page__loading">로딩 중...</p>
      ) : ranking.length === 0 ? (
        <p className="ranking-page__empty">아직 대결 데이터가 없어요.<br />배틀 페이지에서 첫 대결을 시작해보세요!</p>
      ) : (
        <div className="ranking-table">
          <div className="ranking-table__header">
            <span>순위</span>
            <span>단지명</span>
            <span>전적</span>
            <span>승률</span>
          </div>
          {ranking.map((item, idx) => (
            <div key={item.id} className="ranking-table__row">
              <span className="ranking-table__rank">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}위`}
              </span>
              <span className="ranking-table__name">
                {item.name}
                {item.sido && (
                  <span className="ranking-table__region">{item.sido} {item.sigungu}</span>
                )}
              </span>
              <span className="ranking-table__record">
                {item.total}전 {item.wins}승 {item.losses}패{item.draws > 0 ? ` ${item.draws}무` : ""}
              </span>
              <span className={winRateColor(item.winRate)}>{item.winRate}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
