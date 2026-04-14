import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const MY_APT_KEY = "whatsinhere_my_apt";

interface AptScores {
  transport: number;
  walk: number;
  value: number;
  childcare: number;
  safety: number;
}

interface AptDetail {
  id: string;
  name: string;
  address: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  scores: AptScores;
}

interface AptItem { id: string; name: string; address: string | null }

const SCORE_LABELS: Array<{ key: keyof AptScores; label: string }> = [
  { key: "transport", label: "교통" },
  { key: "walk",      label: "산책" },
  { key: "value",     label: "가성비" },
  { key: "childcare", label: "육아" },
  { key: "safety",    label: "안심" },
];

function grade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// ── Radar Chart ─────────────────────────────────────────────────────────────

function RadarChart({ scores }: { scores: AptScores }) {
  const cx = 100, cy = 105, r = 70;
  const axes = SCORE_LABELS.map(({ key, label }, i) => ({
    key, label,
    angle: -Math.PI / 2 + (2 * Math.PI / 5) * i,
  }));

  function pt(angle: number, radius: number) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function polygon(pct: number) {
    return axes.map(a => { const p = pt(a.angle, r * pct); return `${p.x},${p.y}`; }).join(" ");
  }

  const scorePolygon = axes.map(a => {
    const p = pt(a.angle, r * Math.max(0.03, (scores[a.key] ?? 0) / 100));
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 200 210" className="radar-svg">
      {[0.25, 0.5, 0.75, 1.0].map(pct => (
        <polygon key={pct} points={polygon(pct)} fill="none" stroke="var(--surface-3)" strokeWidth="1" />
      ))}
      {axes.map(a => {
        const outer = pt(a.angle, r);
        return <line key={a.key} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="var(--surface-3)" strokeWidth="1" />;
      })}
      <polygon points={scorePolygon} fill="rgba(111,58,34,0.15)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {axes.map(a => {
        const pct = Math.max(0.03, (scores[a.key] ?? 0) / 100);
        const p = pt(a.angle, r * pct);
        return <circle key={a.key} cx={p.x} cy={p.y} r="3.5" fill="var(--accent)" />;
      })}
      {axes.map(a => {
        const p = pt(a.angle, r * 1.24);
        return (
          <text key={a.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fill="var(--muted)" fontFamily="inherit" fontWeight="600">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

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

  // Restore saved apt name on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MY_APT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { id?: string; name?: string };
        if (saved.name) setAptName(saved.name);
      }
    } catch { /* ignore */ }
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
    localStorage.setItem(MY_APT_KEY, JSON.stringify({ id: aptId, name: aptName }));
    navigate("/battle");
  }

  const savedAptName = (() => {
    try { return (JSON.parse(localStorage.getItem(MY_APT_KEY) ?? "null") as { name?: string } | null)?.name ?? null; } catch { return null; }
  })();

  return (
    <div className="my-apt-page">
      <div className="my-apt-page__header">
        <h1 className="my-apt-page__title">🏠 내 단지</h1>
        {savedAptName && !aptId && (
          <p className="my-apt-page__saved">저장된 단지: <strong>{savedAptName}</strong></p>
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
            <h2 className="my-apt-card__name">{detail.name}</h2>
            {detail.address && <p className="my-apt-card__address">{detail.address}</p>}
            <div className="my-apt-card__meta">
              {detail.builtYear && <span>{detail.builtYear}년 준공</span>}
              {detail.totalUnits && <span>{detail.totalUnits.toLocaleString()}세대</span>}
            </div>
          </div>

          <div className="my-apt-card__radar">
            <RadarChart scores={detail.scores} />
          </div>

          <div className="my-apt-card__scores">
            {SCORE_LABELS.map(({ key, label }) => {
              const val = detail.scores[key] ?? 0;
              const g = grade(val);
              return (
                <div key={key} className="my-apt-score-row">
                  <span className="my-apt-score-row__label">{label}</span>
                  <div className="my-apt-score-row__bar-wrap">
                    <div className="my-apt-score-row__bar" style={{ width: `${val}%` }} />
                  </div>
                  <span className="my-apt-score-row__val">{val}</span>
                  <span className={`score-grade score-grade--${g.toLowerCase()}`}>{g}</span>
                </div>
              );
            })}
          </div>

          <button className="btn btn--primary my-apt-card__cta" onClick={startBattle}>
            ⚔️ 이 단지로 대결하기
          </button>
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
