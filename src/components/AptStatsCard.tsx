export interface AptScores {
  transport: number;
  walk: number;
  value: number;
  childcare: number;
  safety: number;
}

export const SCORE_LABELS: Array<{ key: keyof AptScores; label: string; tooltip: string }> = [
  { key: "transport", label: "교통",  tooltip: "VISTA 알고리즘 기반 · 가까운 지하철역·버스정류장까지의 거리와 주변 노선 수를 기준으로 계산해요." },
  { key: "walk",      label: "산책",  tooltip: "VISTA 알고리즘 기반 · 인근 공원·녹지의 면적과 접근성을 기준으로 계산해요." },
  { key: "value",     label: "가성비", tooltip: "VISTA 알고리즘 기반 · 면적 대비 실거래가를 전국 중위가격과 비교해 계산해요." },
  { key: "childcare", label: "육아",  tooltip: "VISTA 알고리즘 기반 · 주변 어린이집·초등학교·학원 밀도를 기준으로 계산해요." },
  { key: "safety",    label: "안심",  tooltip: "VISTA 알고리즘 기반 · 범죄 통계와 CCTV·어린이보호구역 등을 기준으로 계산해요." },
];

export function grade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

export function RadarChart({ scores }: { scores: AptScores }) {
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

export function AptScoreBars({ scores }: { scores: AptScores }) {
  return (
    <div className="my-apt-card__scores">
      {SCORE_LABELS.map(({ key, label, tooltip }) => {
        const val = scores[key] ?? 0;
        const g = grade(val);
        return (
          <div key={key} className="my-apt-score-row">
            <span className="my-apt-score-row__label">
              {label}
              <span className="vista-tip" title={tooltip}>ℹ️</span>
            </span>
            <div className="my-apt-score-row__bar-wrap">
              <div className="my-apt-score-row__bar" style={{ width: `${val}%` }} />
            </div>
            <span className="my-apt-score-row__val">{val}</span>
            <span className={`score-grade score-grade--${g.toLowerCase()}`}>{g}</span>
          </div>
        );
      })}
    </div>
  );
}
