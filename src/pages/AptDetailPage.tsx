import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { RadarChart, AptScoreBars, grade, SCORE_LABELS, type AptScores } from "../components/AptStatsCard";
import { ExternalLinks } from "../components/ExternalLinks";
import { AptComments } from "../components/AptComments";

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

function toMin(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

function transportDesc(_name: string, _score: number, raw: Record<string, unknown> | null): string {
  const subway = num(raw?.subwayStationDistanceM);
  const bus = num(raw?.busStopCount500m);
  if (subway != null && subway <= 1500) {
    return `지하철역까지 도보 ${toMin(subway)}분 거리예요. 역세권 단지로 어디든 빠르게 이동할 수 있어요 🚇`;
  }
  if (bus != null && bus > 0) {
    return `지하철역은 조금 멀지만, 버스 정류장이 ${Math.round(bus)}개나 있어서 대중교통 이용엔 문제없어요 🚌`;
  }
  return `대중교통보다 자가용이 편한 단지예요 🚗`;
}

function walkDesc(_score: number, raw: Record<string, unknown> | null): string {
  const count = num(raw?.parkCount1km);
  const area = num(raw?.parkArea1km);
  const distM = num(raw?.parkDistanceM);
  if (count != null && count >= 5) {
    const areaText = area != null
      ? ` 총 ${Math.round(area).toLocaleString()}㎡(축구장 약 ${(area / 7140).toFixed(1)}개)의 녹지가 펼쳐져 있어요`
      : "";
    return `1km 안에 공원이 ${Math.round(count)}개!${areaText} 🌳`;
  }
  if (distM != null) {
    return `주변 녹지가 아쉬운 편이에요. 가까운 공원까지 도보 ${toMin(distM)}분 거리예요 🌿`;
  }
  return `주변 녹지 환경 정보가 부족해요 🌿`;
}

function valueDesc(_score: number, avgPrice: number | null, raw: Record<string, unknown> | null, priceSource: string | null, address: string | null): string {
  if (priceSource === 'apt' && avgPrice != null) {
    const distMedian = num(raw?.pricePerSqmMedian);
    const ratio = distMedian != null && distMedian > 0 ? avgPrice / distMedian : null;
    const price = Math.round(avgPrice).toLocaleString();
    if (ratio != null && ratio < 0.7) {
      return `이 지역 평균보다 저렴한 알짜 단지예요! ㎡당 ${price}만원으로 가성비가 좋아요 💰`;
    }
    if (ratio != null && ratio > 1.5) {
      return `프리미엄 단지답게 ㎡당 ${price}만원이에요. 높은 가격만큼 입지가 탄탄해요 🏆`;
    }
    return `수도권 평균 수준의 가격대예요. ㎡당 ${price}만원으로 합리적인 선택이에요 👍`;
  }
  if (priceSource === 'sgg' && avgPrice != null) {
    const sigungu = address?.split(' ')[1] ?? "이 지역";
    return `정확한 실거래가 데이터를 찾지 못해 ${sigungu} 지역 평균가(${Math.round(avgPrice).toLocaleString()}만원/㎡)를 참고했어요. 실제와 다를 수 있어요 📊`;
  }
  return `아직 실거래 데이터가 없는 단지예요. 새 아파트이거나 거래가 드문 경우예요 🔍`;
}

function childcareDesc(_score: number, raw: Record<string, unknown> | null): string {
  const count = num(raw?.childcareCount);
  const elemDist = num(raw?.elementaryDistanceM);
  const academy = num(raw?.academyCount1km);
  const pediatric = num(raw?.pediatricCount1km);
  const mall = num(raw?.mallCount2km);
  const parts: string[] = [];
  const infoParts: string[] = [];
  if (count != null) infoParts.push(`어린이집·유치원 ${Math.round(count)}곳`);
  if (academy != null) infoParts.push(`학원 ${Math.round(academy)}곳`);
  if (infoParts.length) {
    const elemText = elemDist != null ? ` 초등학교까지 도보 ${toMin(elemDist)}분 거리예요 🎒` : "";
    parts.push(`반경 1km 내 ${infoParts.join(", ")}이 있어요.${elemText}`);
  } else if (elemDist != null) {
    parts.push(`초등학교까지 도보 ${toMin(elemDist)}분 거리예요 🎒`);
  }
  if (mall != null && mall > 0) parts.push(`근처에 대형마트·백화점 문화센터도 있어서 아이와 함께 즐길 거리가 많아요 🛍️`);
  if (pediatric != null && pediatric > 0) parts.push(`소아과도 ${Math.round(pediatric)}곳 있어서 아플 때 걱정 없어요 🏥`);
  return parts.join(" ") || `육아 환경 정보를 불러오는 중이에요.`;
}

function safetyDesc(_score: number, raw: Record<string, unknown> | null): string {
  const cctv = num(raw?.cctvCount500m);
  const childZone = num(raw?.childZoneCount1km);
  const safetyIdx = num(raw?.safetyIndexScore);
  const crimeRate = num(raw?.crimeRate);
  const parts: string[] = [];
  if (cctv != null) {
    parts.push(cctv >= 20
      ? `방범 CCTV ${Math.round(cctv)}개가 든든하게 지켜주고 있어요 📷`
      : `방범 시설은 아쉬운 편이에요 😅`);
  }
  if (childZone != null && childZone > 0) {
    parts.push(`반경 1km 내 어린이보호구역 ${Math.round(childZone)}곳으로 아이들이 안전하게 다닐 수 있어요 🚸`);
  }
  if (safetyIdx != null) {
    parts.push(safetyIdx >= 60
      ? `지자체 안전지수도 양호한 편이에요 ✅`
      : `지자체 안전지수는 아쉬운 편이에요 ⚠️`);
  }
  if (crimeRate != null) {
    parts.push(crimeRate <= 1000
      ? `범죄 발생률이 낮은 안전한 지역이에요 🛡️`
      : `범죄율이 다소 높은 편이니 참고하세요 😬`);
  }
  return parts.join(" ") || `안심 정보를 불러오는 중이에요.`;
}

function scaleLabel(units: number): string {
  if (units >= 1000) return "대단지";
  if (units >= 300) return "중형";
  return "소형";
}

function summaryText(apt: AptDetail): string {
  const sorted = SCORE_LABELS.map(({ key, label }) => ({ label, score: apt.scores[key] })).sort((a, b) => b.score - a.score);
  const strong = sorted[0]?.label ?? "";
  const weak = sorted[sorted.length - 1]?.label ?? "";
  const strongMap: Record<string, string> = {
    "교통": "교통이 특히 편리한", "산책": "산책 환경이 쾌적한",
    "가성비": "가성비가 뛰어난", "육아": "육아 환경이 특히 뛰어난", "안심": "안전 환경이 우수한",
  };
  const weakMap: Record<string, string> = {
    "교통": "교통은 아쉬운 편이에요", "산책": "산책 환경은 아쉬운 편이에요",
    "가성비": "가성비는 아쉬운 편이에요", "육아": "육아 시설은 조금 부족한 편이에요", "안심": "방범 환경은 개선이 필요해요",
  };
  const scaleText = apt.totalUnits ? ` ${apt.totalUnits.toLocaleString()}세대 ${scaleLabel(apt.totalUnits)} 단지로,` : "";
  const strongText = strongMap[strong] ?? `${strong}이 우수한`;
  const weakText = weakMap[weak] ?? `${weak}은 상대적으로 낮아요`;
  return `${apt.name}은 ${strongText} 단지예요.${scaleText} ${weakText}. 🏠`;
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
          <ExternalLinks name={apt.name} address={apt.address} />
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

      <AptComments aptId={apt.id} />

      <button className="btn btn--primary apt-detail-cta" onClick={startBattle}>
        ⚔️ 이 단지로 대결하기
      </button>

      {nearby.length > 0 && (
        <div className="apt-detail-nearby panel-card">
          <p className="page-kicker">같은 지역 상위 단지</p>
          <ul className="apt-detail-nearby-list">
            {nearby.filter((item) => !/예정/.test(item.name)).map((item, i) => (
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
