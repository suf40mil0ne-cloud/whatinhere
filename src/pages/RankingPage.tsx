import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface RankingItem {
  id: string;
  name: string;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  score: number | null;
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

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ by, limit: "20" });
    if (region) params.set("region", region);
    fetch(`/api/ranking?${params}`)
      .then((r) => r.json())
      .then((d) => setRanking((d as { ranking: RankingItem[] }).ranking ?? []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false));
  }, [region, by]);

  function selectApt(item: RankingItem) {
    localStorage.setItem(MY_APT_KEY, JSON.stringify({ id: item.id, name: item.name }));
    navigate("/battle");
  }

  const byLabel = SCORE_OPTIONS.find((o) => o.value === by)?.label ?? "";

  return (
    <div className="ranking-page">
      <div className="ranking-page__header">
        <h1 className="ranking-page__title">단지 점수 랭킹</h1>

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
            <button
              key={item.id}
              className="rank-item"
              onClick={() => selectApt(item)}
              title="내 단지로 설정하고 대결 시작"
            >
              <span className="rank-item__rank">
                {idx < 3 ? RANK_MEDALS[idx] : `${idx + 1}`}
              </span>
              <span className="rank-item__info">
                <span className="rank-item__name">{item.name}</span>
                {item.sigungu && (
                  <span className="rank-item__region">{item.sigungu}</span>
                )}
              </span>
              <span className="rank-item__score">
                <span className="rank-item__score-val">{Math.round(item.score ?? 0)}</span>
                <span className="rank-item__score-label">{byLabel}</span>
              </span>
            </button>
          ))}
          <p className="rank-hint">단지를 탭하면 내 단지로 설정 후 대결 탭으로 이동해요</p>
        </div>
      )}
    </div>
  );
}
