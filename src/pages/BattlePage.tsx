import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface AptItem {
  id: string;
  name: string;
  address: string | null;
}

interface SearchState {
  sido: string;
  sigungu: string;
  dong: string;
  aptId: string;
  aptName: string;
}

interface DropdownOptions {
  sigungus: string[];
  dongs: string[];
  apts: AptItem[];
}

const EMPTY_SEARCH: SearchState = { sido: "", sigungu: "", dong: "", aptId: "", aptName: "" };
const EMPTY_OPTIONS: DropdownOptions = { sigungus: [], dongs: [], apts: [] };

// Static sido list for Korea
const SIDO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도",
  "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

async function fetchSearch(params: Record<string, string>): Promise<{ type: string; items: unknown[] }> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/apartments/search?${qs}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json() as Promise<{ type: string; items: unknown[] }>;
}

function AptSelector({
  label,
  state,
  options,
  loading,
  onChange,
}: {
  label: string;
  state: SearchState;
  options: DropdownOptions;
  loading: boolean;
  onChange: (updates: Partial<SearchState & DropdownOptions>) => void;
}) {
  async function onSido(sido: string) {
    onChange({ sido, sigungu: "", dong: "", aptId: "", aptName: "", sigungus: [], dongs: [], apts: [] });
    if (!sido) return;
    try {
      const data = await fetchSearch({ sido });
      onChange({ sigungus: (data.items as string[]) });
    } catch { /* ignore */ }
  }

  async function onSigungu(sigungu: string) {
    onChange({ sigungu, dong: "", aptId: "", aptName: "", dongs: [], apts: [] });
    if (!sigungu) return;
    try {
      const data = await fetchSearch({ sido: state.sido, sigungu });
      onChange({ dongs: (data.items as string[]) });
    } catch { /* ignore */ }
  }

  async function onDong(dong: string) {
    onChange({ dong, aptId: "", aptName: "", apts: [] });
    if (!dong) return;
    try {
      const data = await fetchSearch({ sido: state.sido, sigungu: state.sigungu, dong });
      onChange({ apts: (data.items as AptItem[]) });
    } catch { /* ignore */ }
  }

  function onApt(aptId: string) {
    const apt = options.apts.find((a) => a.id === aptId);
    onChange({ aptId, aptName: apt?.name ?? "" });
  }

  return (
    <div className="apt-selector">
      <h3 className="apt-selector__label">{label}</h3>
      <div className="apt-selector__fields">
        <select
          value={state.sido}
          onChange={(e) => onSido(e.target.value)}
          disabled={loading}
          className="apt-selector__select"
        >
          <option value="">시도 선택</option>
          {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={state.sigungu}
          onChange={(e) => onSigungu(e.target.value)}
          disabled={!state.sido || loading}
          className="apt-selector__select"
        >
          <option value="">시군구 선택</option>
          {options.sigungus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={state.dong}
          onChange={(e) => onDong(e.target.value)}
          disabled={!state.sigungu || loading}
          className="apt-selector__select"
        >
          <option value="">읍면동 선택</option>
          {options.dongs.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          value={state.aptId}
          onChange={(e) => onApt(e.target.value)}
          disabled={!state.dong || loading}
          className="apt-selector__select"
        >
          <option value="">단지 선택</option>
          {options.apts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {state.aptName && (
          <div className="apt-selector__selected">
            선택됨: <strong>{state.aptName}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

export function BattlePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stateA, setStateA] = useState<SearchState>(EMPTY_SEARCH);
  const [optionsA, setOptionsA] = useState<DropdownOptions>(EMPTY_OPTIONS);
  const [stateB, setStateB] = useState<SearchState>(EMPTY_SEARCH);
  const [optionsB, setOptionsB] = useState<DropdownOptions>(EMPTY_OPTIONS);

  function patchA(updates: Partial<SearchState & DropdownOptions>) {
    setStateA((s) => ({ ...s, ...updates }));
    setOptionsA((o) => ({ ...o, ...updates }));
  }

  function patchB(updates: Partial<SearchState & DropdownOptions>) {
    setStateB((s) => ({ ...s, ...updates }));
    setOptionsB((o) => ({ ...o, ...updates }));
  }

  const canStart = !!stateA.aptId && !!stateB.aptId && stateA.aptId !== stateB.aptId;

  async function startBattle() {
    if (!canStart) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apt_a_id: stateA.aptId, apt_b_id: stateB.aptId }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "대결 생성 실패");
      }
      const data = await res.json() as { id: string };
      navigate(`/battle/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="battle-page">
      <div className="battle-page__header">
        <h1 className="battle-page__title">단지戰 ⚔️</h1>
        <p className="battle-page__subtitle">두 단지를 골라 스탯으로 승부를 가려보세요</p>
      </div>

      <div className="battle-page__selectors">
        <AptSelector
          label="1번 단지"
          state={stateA}
          options={optionsA}
          loading={loading}
          onChange={patchA}
        />

        <div className="battle-page__vs">⚔️</div>

        <AptSelector
          label="2번 단지"
          state={stateB}
          options={optionsB}
          loading={loading}
          onChange={patchB}
        />
      </div>

      {stateA.aptId && stateB.aptId && stateA.aptId === stateB.aptId && (
        <p className="battle-page__warning">같은 단지는 대결할 수 없어요</p>
      )}

      {error && <p className="battle-page__error">{error}</p>}

      <button
        className="battle-page__start-btn"
        disabled={!canStart || loading}
        onClick={startBattle}
      >
        {loading ? "대결 중..." : "⚔️ 대결 시작"}
      </button>
    </div>
  );
}
