import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface Stats {
  totalBattles: number;
  totalComments: number;
  top5: { name: string; battle_count: number }[];
}

type CollectKey = "transport" | "walk" | "safety";
const COLLECT_LABELS: Record<CollectKey, string> = {
  transport: "교통",
  walk: "산책",
  safety: "안심",
};

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast">{message}</div>;
}

export function AdminPage() {
  const { user, authChecked, isAuthenticated, startKakaoLogin } = useAuth();

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [collectLoading, setCollectLoading] = useState<CollectKey | null>(null);
  const [collectResult, setCollectResult] = useState<Partial<Record<CollectKey, string>>>({});

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    setStatsLoading(true);
    fetch("/api/admin/stats", { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setForbidden(true); return null; }
        return r.json() as Promise<Stats>;
      })
      .then((d) => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [authChecked, isAuthenticated]);

  async function resetBattles() {
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-battles", {
        method: "POST",
        credentials: "include",
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

  async function runCollect(key: CollectKey) {
    setCollectLoading(key);
    setCollectResult((prev) => ({ ...prev, [key]: undefined }));
    try {
      const res = await fetch(`/api/admin/collect-${key}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as { ok?: boolean; updated?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "실패");
      setCollectResult((prev) => ({ ...prev, [key]: `완료 (${data.updated ?? 0}개 업데이트)` }));
    } catch (e) {
      setCollectResult((prev) => ({ ...prev, [key]: `오류: ${e instanceof Error ? e.message : "실패"}` }));
    } finally {
      setCollectLoading(null);
    }
  }

  // 1. 인증 확인 중
  if (!authChecked) {
    return <div className="admin-login"><p style={{ color: "var(--muted)" }}>확인 중...</p></div>;
  }

  // 2. 로그인 안 됨
  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <h1 className="admin-login__title">관리자</h1>
        <button className="btn btn--kakao" onClick={() => startKakaoLogin("/admin")}>
          카카오로 로그인
        </button>
      </div>
    );
  }

  // 3. 로그인은 됐지만 권한 없음
  if (forbidden) {
    return (
      <div className="admin-login">
        <h1 className="admin-login__title">접근 불가</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 8 }}>
          관리자 권한이 없습니다.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 12 }}>
          내 카카오 ID: <code style={{ userSelect: "all" }}>{user?.id}</code>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
          wrangler.toml의 ADMIN_USER_ID에 위 값을 설정하고 재배포하세요
        </p>
      </div>
    );
  }

  // 4. 통계 로딩 중 (로그인은 됐으나 아직 응답 전)
  if (statsLoading) {
    return <div className="admin-login"><p style={{ color: "var(--muted)" }}>로딩 중...</p></div>;
  }

  return (
    <div className="admin-page">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <h1 className="admin-page__title">관리자 대시보드</h1>

      {/* 통계 */}
      <section className="admin-section">
        <h2 className="admin-section__title">배틀 통계</h2>
        {stats ? (
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

      {/* 데이터 수집 */}
      <section className="admin-section">
        <h2 className="admin-section__title">데이터 수집</h2>
        <p className="admin-section__desc">매일 오전 3시 자동 수집됩니다. 수동으로 즉시 실행할 수 있습니다.</p>
        <div className="admin-collect">
          {(["transport", "walk", "safety"] as CollectKey[]).map((key) => (
            <div key={key} className="admin-collect__item">
              <button
                className="btn btn--primary"
                disabled={collectLoading !== null}
                onClick={() => runCollect(key)}
              >
                {collectLoading === key ? "수집 중..." : `${COLLECT_LABELS[key]} 수집`}
              </button>
              {collectResult[key] && (
                <span className="admin-collect__result">{collectResult[key]}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 초기화 */}
      <section className="admin-section">
        <h2 className="admin-section__title">데이터 관리</h2>
        <button className="btn btn--danger" onClick={() => setConfirmOpen(true)}>
          전적 초기화
        </button>
      </section>

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
