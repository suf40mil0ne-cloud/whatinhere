import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RadarChart, AptScoreBars, type AptScores } from "../components/AptStatsCard";
import { ExternalLinks } from "../components/ExternalLinks";

interface RankingItem {
  id: string;
  name: string;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  score: number | null;
}

interface AptDetail {
  id: string;
  name: string;
  address: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  scores: AptScores;
}

const MY_APT_KEY = "whatsinhere_my_apt";

const REGION_OPTIONS = [
  { label: "전체", value: "" },
  { label: "서울", value: "서울특별시" },
  { label: "경기", value: "경기도" },
  { label: "인천", value: "인천광역시" },
];

const SCORE_OPTIONS = [
  { label: "종합", value: "s_overall" },
  { label: "교통", value: "s_transport" },
  { label: "산책", value: "s_walk" },
  { label: "가성비", value: "s_value" },
  { label: "육아", value: "s_childcare" },
  { label: "안심", value: "s_safety" },
];

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function Skeleton() {
  return (
    <div className="rank-list">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rank-item rank-item--skeleton">
          <span className="rank-item__rank skeleton-block" style={{ width: 28 }} />
          <span className="rank-item__info skeleton-block" style={{ flex: 1, height: 36 }} />
          <span className="rank-item__score skeleton-block" style={{ width: 40 }} />
        </div>
      ))}
    </div>
  );
}

export function RankingPage() {
  const navigate = useNavigate();
  const [region, setRegion] = useState("");
  const [by, setBy] = useState("s_overall");
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<AptDetail | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    setExpandedDetail(null);
    const params = new URLSearchParams({ by, limit: "20" });
    if (region) params.set("region", region);
    fetch(`/api/ranking?${params}`)
      .then((r) => r.json())
      .then((d) => setRanking((d as { ranking: RankingItem[] }).ranking ?? []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false));
  }, [region, by]);

  async function toggleExpand(item: RankingItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(item.id);
    setExpandedDetail(null);
    setExpandLoading(true);
    try {
      const res = await fetch(`/api/apartments/${item.id}`);
      const data = await res.json() as AptDetail;
      setExpandedDetail(data);
    } catch { /* ignore */ } finally {
      setExpandLoading(false);
    }
  }

  function startBattle(item: RankingItem) {
    localStorage.setItem(MY_APT_KEY, JSON.stringify({ id: item.id, name: item.name }));
    navigate("/battle");
  }

  const byLabel = SCORE_OPTIONS.find((o) => o.value === by)?.label ?? "";

  return (
    <div className="ranking-page">
      <div className="ranking-page__header">
        <h1 className="ranking-page__title">단지 점수 랭킹</h1>
        <p className="ranking-page__subtitle">VISTA 알고리즘 기반 전국 단지 랭킹</p>

        <div className="filter-tabs-row">
          <div className="filter-tabs">
            {REGION_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`filter-tab ${region === o.value ? "filter-tab--active" : ""}`}
                onClick={() => setRegion(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {SCORE_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`filter-tab ${by === o.value ? "filter-tab--active" : ""}`}
                onClick={() => setBy(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : ranking.length === 0 ? (
        <div className="empty-state">
          <p>해당 조건의 단지 데이터가 없어요</p>
        </div>
      ) : (
        <div className="rank-list">
          {ranking.map((item, idx) => (
            <div key={item.id} className="rank-item-wrap">
              <button
                className={`rank-item ${expandedId === item.id ? "rank-item--expanded" : ""}`}
                onClick={() => void toggleExpand(item)}
                title="탭해서 스탯 보기"
              >
                <span className="rank-item__rank">
                  {idx < 3 ? RANK_MEDALS[idx] : `${idx + 1}`}
                </span>
                <span className="rank-item__info">
                  <span className="rank-item__name">
                    {item.name}
                    <ExternalLinks name={item.name} address={item.address} />
                  </span>
                  {(item.address || item.sigungu) && (
                    <span className="rank-item__region">{item.address || item.sigungu}</span>
                  )}
                </span>
                <span className="rank-item__score">
                  <span className="rank-item__score-val">{Math.round(item.score ?? 0)}</span>
                  <span className="rank-item__score-label">{byLabel}</span>
                </span>
                <span className="rank-item__chevron">
                  {expandedId === item.id ? "▲" : "▼"}
                </span>
              </button>

              {expandedId === item.id && (
                <div className="rank-item__panel">
                  {expandLoading || !expandedDetail ? (
                    <div className="rank-item__panel-loading">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="skeleton-block" style={{ height: 18, marginBottom: 8, borderRadius: 6 }} />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="my-apt-card__radar">
                        <RadarChart scores={expandedDetail.scores} />
                      </div>
                      <AptScoreBars scores={expandedDetail.scores} />
                      <div className="rank-item__panel-meta">
                        {expandedDetail.builtYear && <span>{expandedDetail.builtYear}년 준공</span>}
                        {expandedDetail.totalUnits && <span>{expandedDetail.totalUnits.toLocaleString()}세대</span>}
                      </div>
                      <div className="rank-item__panel-actions">
                        <Link to={`/apt/${item.id}`} className="btn btn--outline rank-item__panel-cta">
                          상세 보기
                        </Link>
                        <button
                          className="btn btn--primary rank-item__panel-cta"
                          onClick={() => startBattle(item)}
                        >
                          ⚔️ 이 단지로 대결하기
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <p className="rank-hint">단지를 탭하면 스탯을 확인할 수 있어요</p>
        </div>
      )}
    </div>
  );
}
