import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RadarChart, AptScoreBars, type AptScores } from "../components/AptStatsCard";
import { ExternalLinks } from "../components/ExternalLinks";

const MY_APT_KEY = "whatsinhere_my_apt";

interface AptDetail {
  id: string;
  name: string;
  address: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  scores: AptScores;
}

interface AptItem { id: string; name: string; address: string | null }

// ── Search dropdowns ─────────────────────────────────────────────────────────

async function fetchSearch(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/apartments/search?${qs}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json() as Promise<{ type: string; items: unknown[] }>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SIDO_LIST = ["서울특별시", "인천광역시", "경기도"];

export function MyAptPage() {
  const navigate = useNavigate();

  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [dong, setDong] = useState("");
  const [aptId, setAptId] = useState("");
  const [aptName, setAptName] = useState("");

  const [sigungus, setSigungus] = useState<string[]>([]);
  const [dongs, setDongs] = useState<string[]>([]);
  const [apts, setApts] = useState<AptItem[]>([]);

  const [detail, setDetail] = useState<AptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [savedApt, setSavedApt] = useState<{ id: string; name: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(MY_APT_KEY) ?? "null") as { id: string; name: string } | null; } catch { return null; }
  });

  // Restore saved apt name on mount
  useEffect(() => {
    if (savedApt?.name) setAptName(savedApt.name);
  }, []);

  async function onSido(v: string) {
    setSido(v); setSigungu(""); setDong(""); setAptId(""); setAptName("");
    setSigungus([]); setDongs([]); setApts([]); setDetail(null);
    if (!v) return;
    try { const d = await fetchSearch({ sido: v }); setSigungus(d.items as string[]); } catch { /* */ }
  }
  async function onSigungu(v: string) {
    setSigungu(v); setDong(""); setAptId(""); setAptName("");
    setDongs([]); setApts([]); setDetail(null);
    if (!v) return;
    try { const d = await fetchSearch({ sido, sigungu: v }); setDongs(d.items as string[]); } catch { /* */ }
  }
  async function onDong(v: string) {
    setDong(v); setAptId(""); setAptName(""); setApts([]); setDetail(null);
    if (!v) return;
    try { const d = await fetchSearch({ sido, sigungu, dong: v }); setApts(d.items as AptItem[]); } catch { /* */ }
  }
  async function onApt(v: string) {
    const apt = apts.find(a => a.id === v);
    setAptId(v);
    setAptName(apt?.name ?? "");
    setDetail(null);
    if (!v) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/apartments/${v}`);
      const data = await res.json() as AptDetail;
      setDetail(data);
    } catch { /* */ } finally { setDetailLoading(false); }
  }

  function startBattle() {
    if (!aptId || !aptName) return;
    const entry = { id: aptId, name: aptName };
    localStorage.setItem(MY_APT_KEY, JSON.stringify(entry));
    setSavedApt(entry);
    navigate("/battle");
  }

  function clearSaved() {
    localStorage.removeItem(MY_APT_KEY);
    setSavedApt(null);
  }

  return (
    <div className="my-apt-page">
      <div className="my-apt-page__header">
        <h1 className="my-apt-page__title">🏠 내 단지</h1>
        {savedApt && !aptId && (
          <div className="my-apt-page__saved-row">
            <p className="my-apt-page__saved">저장된 단지: <strong>{savedApt.name}</strong></p>
            <button className="btn btn--ghost my-apt-page__clear" onClick={clearSaved}>해제</button>
          </div>
        )}
      </div>

      <div className="my-apt-page__search">
        <select value={sido} onChange={e => onSido(e.target.value)} className="apt-selector__select">
          <option value="">시도 선택</option>
          {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sigungu} onChange={e => onSigungu(e.target.value)} disabled={!sido} className="apt-selector__select">
          <option value="">시군구 선택</option>
          {sigungus.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={dong} onChange={e => onDong(e.target.value)} disabled={!sigungu} className="apt-selector__select">
          <option value="">읍면동 선택</option>
          {dongs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={aptId} onChange={e => onApt(e.target.value)} disabled={!dong} className="apt-selector__select">
          <option value="">단지 선택</option>
          {apts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {detailLoading && (
        <div className="my-apt-page__card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-block" style={{ height: 20, marginBottom: 8, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {detail && !detailLoading && (
        <div className="my-apt-page__card">
          <div className="my-apt-card__header">
            <h2 className="my-apt-card__name">
              {detail.name}
              <ExternalLinks name={detail.name} address={detail.address} />
            </h2>
            {detail.address && <p className="my-apt-card__address">{detail.address}</p>}
            <div className="my-apt-card__meta">
              {detail.builtYear && <span>{detail.builtYear}년 준공</span>}
              {detail.totalUnits && <span>{detail.totalUnits.toLocaleString()}세대</span>}
            </div>
          </div>

          <div className="my-apt-card__radar">
            <RadarChart scores={detail.scores} />
          </div>

          <AptScoreBars scores={detail.scores} />

          <div className="my-apt-card__actions">
            <Link to={`/apt/${aptId}`} className="btn btn--outline my-apt-card__cta">
              상세 보기
            </Link>
            <button className="btn btn--primary my-apt-card__cta" onClick={startBattle}>
              ⚔️ 이 단지로 대결하기
            </button>
          </div>
        </div>
      )}

      {!aptId && !detailLoading && (
        <div className="empty-state">
          <p>단지를 검색해서 스탯을 확인하고<br />대결을 시작해보세요</p>
        </div>
      )}
    </div>
  );
}
