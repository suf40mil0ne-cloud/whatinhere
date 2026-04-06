import { useEffect, useState } from "react";

const ADMIN_PASSWORD = "danjijeon2024";

interface Stats {
  totalBattles: number;
  totalComments: number;
  top5: { name: string; battle_count: number }[];
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast">{message}</div>;
}

export function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function login() {
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  useEffect(() => {
    if (!authed) return;
    setStatsLoading(true);
    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${ADMIN_PASSWORD}` },
    })
      .then((r) => r.json())
      .then((d) => setStats(d as Stats))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [authed]);

  async function resetBattles() {
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-battles", {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_PASSWORD}` },
      });
      if (!res.ok) throw new Error();
      setToast("초기화됐습니다");
      setConfirmOpen(false);
      setStats((s) => s ? { ...s, totalBattles: 0, totalComments: 0, top5: [] } : s);
    } catch {
      setToast("초기화 실패");
    } finally {
      setResetLoading(false);
    }
  }

  if (!authed) {
    return (
      <div className="admin-login">
        <h1 className="admin-login__title">관리자</h1>
        <div className="admin-login__form">
          <input
            type="password"
            className="admin-login__input"
            placeholder="비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            autoFocus
          />
          <button className="btn btn--primary" onClick={login}>
            입장
          </button>
        </div>
        {pwError && <p className="admin-login__error">비밀번호가 틀렸습니다</p>}
      </div>
    );
  }

  return (
    <div className="admin-page">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <h1 className="admin-page__title">관리자 대시보드</h1>

      {/* 통계 */}
      <section className="admin-section">
        <h2 className="admin-section__title">배틀 통계</h2>
        {statsLoading ? (
          <p className="admin-section__loading">로딩 중...</p>
        ) : stats ? (
          <>
            <div className="admin-stats">
              <div className="admin-stat">
                <span className="admin-stat__label">총 배틀 수</span>
                <span className="admin-stat__value">{stats.totalBattles.toLocaleString()}</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__label">총 댓글 수</span>
                <span className="admin-stat__value">{stats.totalComments.toLocaleString()}</span>
              </div>
            </div>
            <h3 className="admin-section__subtitle">가장 많이 대결한 단지 TOP 5</h3>
            <ol className="admin-top5">
              {stats.top5.length === 0 ? (
                <li className="admin-top5__empty">데이터 없음</li>
              ) : (
                stats.top5.map((item, i) => (
                  <li key={i} className="admin-top5__item">
                    <span className="admin-top5__rank">{i + 1}위</span>
                    <span className="admin-top5__name">{item.name}</span>
                    <span className="admin-top5__count">{item.battle_count}회</span>
                  </li>
                ))
              )}
            </ol>
          </>
        ) : (
          <p className="admin-section__loading">통계를 불러올 수 없습니다</p>
        )}
      </section>

      {/* 초기화 */}
      <section className="admin-section">
        <h2 className="admin-section__title">데이터 관리</h2>
        <button className="btn btn--danger" onClick={() => setConfirmOpen(true)}>
          전적 초기화
        </button>
      </section>

      {/* 확인 모달 */}
      {confirmOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">⚠️ 전적 초기화</h3>
            <p className="modal__desc">
              모든 배틀, 댓글, 딴지 데이터가 삭제됩니다.<br />
              정말 초기화하시겠습니까?
            </p>
            <div className="modal__actions">
              <button className="btn btn--outline" onClick={() => setConfirmOpen(false)}>
                취소
              </button>
              <button
                className="btn btn--danger"
                onClick={resetBattles}
                disabled={resetLoading}
              >
                {resetLoading ? "초기화 중..." : "초기화"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
