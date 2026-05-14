import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { RadarChart, AptScoreBars, grade, SCORE_LABELS, type AptScores } from "../components/AptStatsCard";
import { ExternalLinks } from "../components/ExternalLinks";

const MY_APT_KEY = "whatsinhere_my_apt";

interface AptDetail {
  id: string;
  name: string;
  address: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  avgPricePerM2: number | null;
  priceSource: string | null;
  overallScoreAdjusted: number | null;
  scores: AptScores;
  rawTransport: Record<string, unknown> | null;
  rawWalk: Record<string, unknown> | null;
  rawValue: Record<string, unknown> | null;
  rawChildcare: Record<string, unknown> | null;
  rawSafety: Record<string, unknown> | null;
}

interface NearbyApt {
  id: string;
  name: string;
  address: string | null;
  overall_score: number | null;
}

function setSeoTags(name: string, scores: AptScores) {
  const title = `${name} 아파트 점수 분석 | 단지戰`;
  const desc = `${name} VISTA 알고리즘 점수: 교통 ${scores.transport}점, 산책 ${scores.walk}점, 가성비 ${scores.value}점, 육아 ${scores.childcare}점, 안심 ${scores.safety}점`;
  document.title = title;
  const setMeta = (sel: string, attr: Record<string, string>, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(sel);
    if (!el) {
      el = document.createElement("meta");
      Object.entries(attr).forEach(([k, v]) => el!.setAttribute(k, v));
      document.head.appendChild(el);
    }
    el.content = content;
  };
  setMeta('meta[name="description"]', { name: "description" }, desc);
  setMeta('meta[property="og:title"]', { property: "og:title" }, title);
  setMeta('meta[property="og:description"]', { property: "og:description" }, desc);
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function transportDesc(name: string, score: number, raw: Record<string, unknown> | null): string {
  const g = grade(score);
  const parts: string[] = [`${name}의 교통 점수는 ${score}점(${g}등급)입니다.`];
  const subway = num(raw?.subwayStationDistanceM);
  const bus = num(raw?.busStopCount500m);
  if (subway != null) parts.push(`가장 가까운 지하철역까지 약 ${Math.round(subway).toLocaleString()}m이며,`);
  if (bus != null) parts.push(`반경 500m 내 버스정류장이 ${Math.round(bus)}개 있습니다.`);
  return parts.join(" ");
}

function walkDesc(score: number, raw: Record<string, unknown> | null): string {
  const g = grade(score);
  const parts: string[] = [`산책 점수는 ${score}점(${g}등급)입니다.`];
  const count = num(raw?.parkCount1km);
  const area = num(raw?.parkArea1km);
  if (count != null) parts.push(`반경 1km 내 공원이 ${Math.round(count)}개,`);
  if (area != null) parts.push(`총 면적 ${Math.round(area).toLocaleString()}㎡입니다.`);
  return parts.join(" ");
}

function valueDesc(score: number, avgPrice: number | null, raw: Record<string, unknown> | null, priceSource: string | null, address: string | null): string {
  const g = grade(score);
  const parts: string[] = [`가성비 점수는 ${score}점(${g}등급)입니다.`];
  if (priceSource === 'apt') {
    if (avgPrice != null) {
      const distMedian = num(raw?.pricePerSqmMedian);
      parts.push(`㎡당 평균 실거래가는 약 ${Math.round(avgPrice).toLocaleString()}만원으로`);
      if (distMedian != null && distMedian > 0) {
        const ratio = (avgPrice / distMedian).toFixed(2);
        parts.push(`이 지역 중위가격 대비 ${ratio}배 수준입니다.`);
      }
    }
  } else if (priceSource === 'sgg') {
    const sigungu = address?.split(' ')[1] ?? null;
    if (avgPrice != null) {
      parts.push(`실거래가 데이터 매칭이 어려워 ${sigungu ? sigungu + ' ' : ''}중위가격(약 ${Math.round(avgPrice).toLocaleString()}만원/㎡)을 참고값으로 사용했습니다. 실제와 다를 수 있습니다.`);
    }
  } else {
    parts.push(`실거래가 데이터가 없어 가성비 점수를 산출할 수 없습니다.`);
  }
  return parts.join(" ");
}

function childcareDesc(score: number, raw: Record<string, unknown> | null): string {
  const g = grade(score);
  const parts: string[] = [`육아 점수는 ${score}점(${g}등급)입니다.`];
  const count = num(raw?.childcareCount);
  const elemDist = num(raw?.elementaryDistanceM);
  if (count != null) parts.push(`반경 1km 내 어린이집·유치원 ${Math.round(count)}개,`);
  if (elemDist != null) parts.push(`초등학교까지 약 ${Math.round(elemDist).toLocaleString()}m입니다.`);
  return parts.join(" ");
}

function safetyDesc(score: number, raw: Record<string, unknown> | null): string {
  const g = grade(score);
  const parts: string[] = [`안심 점수는 ${score}점(${g}등급)입니다.`];
  const cctv = num(raw?.cctvCount500m);
  const childZone = num(raw?.childZoneCount1km);
  if (cctv != null) parts.push(`반경 500m 내 방범 CCTV ${Math.round(cctv)}개,`);
  if (childZone != null) parts.push(`어린이보호구역 ${Math.round(childZone)}개가 있습니다.`);
  return parts.join(" ");
}

function scaleLabel(units: number): string {
  if (units >= 1000) return "대단지";
  if (units >= 300) return "중형";
  return "소형";
}

function summaryText(apt: AptDetail): string {
  const overall = apt.overallScoreAdjusted
    ?? Math.round((apt.scores.transport + apt.scores.walk + apt.scores.value + apt.scores.childcare + apt.scores.safety) / 5);
  const sorted = SCORE_LABELS.map(({ key, label }) => ({ label, score: apt.scores[key] })).sort((a, b) => b.score - a.score);
  const strong = sorted[0]?.label ?? "";
  const weak = sorted[sorted.length - 1]?.label ?? "";
  let text = `${apt.name}은 VISTA 알고리즘 기준 종합 ${overall}점으로 ${strong}이 우수하며 ${weak}은 상대적으로 낮습니다.`;
  if (apt.totalUnits) {
    text += ` ${apt.totalUnits.toLocaleString()}세대 규모의 ${scaleLabel(apt.totalUnits)} 아파트입니다.`;
  }
  return text;
}

export function AptDetailPage() {
  const { aptId } = useParams<{ aptId: string }>();
  const navigate = useNavigate();
  const [apt, setApt] = useState<AptDetail | null>(null);
  const [nearby, setNearby] = useState<NearbyApt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!aptId) return;
    setLoading(true);
    setError(false);
    setApt(null);
    setNearby([]);

    Promise.all([
      fetch(`/api/apartments/${aptId}`).then((r) => r.json() as Promise<AptDetail & { error?: string }>),
      fetch(`/api/apartments/${aptId}/nearby`)
        .then((r) => r.json() as Promise<{ nearby: NearbyApt[] }>)
        .catch(() => ({ nearby: [] as NearbyApt[] })),
    ])
      .then(([aptData, nearbyData]) => {
        if (aptData.error) { setError(true); return; }
        setApt(aptData);
        setNearby(nearbyData.nearby ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [aptId]);

  useEffect(() => {
    if (apt) setSeoTags(apt.name, apt.scores);
  }, [apt]);

  function startBattle() {
    if (!apt) return;
    localStorage.setItem(MY_APT_KEY, JSON.stringify({ id: apt.id, name: apt.name }));
    navigate("/battle");
  }

  if (loading) {
    return (
      <div className="apt-detail-page">
        <div className="apt-detail-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-block" style={{ height: 22, marginBottom: 10, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !apt) {
    return (
      <div className="apt-detail-page">
        <div className="empty-state">
          <p className="empty-state__text">단지 정보를 불러올 수 없습니다.</p>
        </div>
      </div>
    );
  }

  const descriptions = [
    transportDesc(apt.name, apt.scores.transport, apt.rawTransport),
    walkDesc(apt.scores.walk, apt.rawWalk),
    valueDesc(apt.scores.value, apt.avgPricePerM2, apt.rawValue, apt.priceSource, apt.address),
    childcareDesc(apt.scores.childcare, apt.rawChildcare),
    safetyDesc(apt.scores.safety, apt.rawSafety),
  ];

  return (
    <div className="apt-detail-page">
      <div className="apt-detail-header panel-card">
        <h1 className="apt-detail-title">
          {apt.name}
          <ExternalLinks name={apt.name} />
        </h1>
        <div className="apt-detail-meta">
          {apt.address && <span>{apt.address}</span>}
          {apt.totalUnits != null && <span>{apt.totalUnits.toLocaleString()}세대</span>}
          {apt.builtYear != null && <span>{apt.builtYear}년 준공</span>}
        </div>
      </div>

      <div className="apt-detail-score-card panel-card">
        <p className="page-kicker">VISTA 점수</p>
        <div className="apt-detail-radar-wrap">
          <RadarChart scores={apt.scores} />
        </div>
        <AptScoreBars scores={apt.scores} />
      </div>

      <div className="apt-detail-descriptions panel-card">
        <p className="page-kicker">점수 상세 분석</p>
        {descriptions.map((text, i) => (
          <p key={i} className="apt-detail-desc-item">{text}</p>
        ))}
      </div>

      <div className="apt-detail-summary panel-card">
        <p className="page-kicker">종합 분석</p>
        <p className="apt-detail-summary-text">{summaryText(apt)}</p>
      </div>

      <button className="btn btn--primary apt-detail-cta" onClick={startBattle}>
        ⚔️ 이 단지로 대결하기
      </button>

      {nearby.length > 0 && (
        <div className="apt-detail-nearby panel-card">
          <p className="page-kicker">같은 지역 상위 단지</p>
          <ul className="apt-detail-nearby-list">
            {nearby.map((item, i) => (
              <li key={item.id} className="apt-detail-nearby-item">
                <Link to={`/apt/${item.id}`} className="apt-detail-nearby-link">
                  <span className="apt-detail-nearby-rank">{i + 1}</span>
                  <span className="apt-detail-nearby-info">
                    <span className="apt-detail-nearby-name">{item.name}</span>
                    {item.address && <span className="apt-detail-nearby-addr">{item.address}</span>}
                  </span>
                  {item.overall_score != null && (
                    <span className="apt-detail-nearby-score">{Math.round(item.overall_score)}점</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
