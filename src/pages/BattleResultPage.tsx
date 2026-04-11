import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface BattleScores {
  transport: number;
  walk: number;
  value: number;
  childcare: number;
  safety: number;
}

interface BattleComment {
  id: string;
  nickname: string;
  profileImg: string | null;
  comment: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
}

interface BattleDispute {
  id: string;
  category: string;
  reason: string;
  createdAt: string;
}

interface Battle {
  id: string;
  aptAId: string;
  aptBId: string;
  aptAName: string;
  aptBName: string;
  winner: string | null;
  scoreA: BattleScores;
  scoreB: BattleScores;
  viewCount: number;
  createdAt: string;
  comments: BattleComment[];
  disputes: BattleDispute[];
}

const SCORE_LABELS: Record<keyof BattleScores, string> = {
  transport: "교통",
  walk: "산책",
  value: "가성비",
  childcare: "육아",
  safety: "안심",
};

const DISPUTE_CATEGORIES = [
  { value: "transport", label: "교통" },
  { value: "walk", label: "산책" },
  { value: "value", label: "가성비" },
  { value: "childcare", label: "육아" },
  { value: "safety", label: "안심" },
];

function ScoreBar({
  scoreA,
  scoreB,
  category,
  myIsA,
}: {
  scoreA: number;
  scoreB: number;
  category: keyof BattleScores;
  myIsA: boolean | null;
}) {
  const label = SCORE_LABELS[category];
  const aWins = scoreA > scoreB;
  const bWins = scoreB > scoreA;
  const aMine = myIsA === true;
  const bMine = myIsA === false;

  return (
    <div className="score-row">
      <span className={`score-row__num score-row__num--a ${aWins ? "score-row__num--winner" : ""}`}>
        {scoreA}
      </span>
      <div className="score-row__bars">
        <div className="score-row__bar-a-wrap">
          <div
            className={`score-row__bar score-row__bar--a ${aWins ? "score-row__bar--winner" : aMine ? "score-row__bar--mine" : ""}`}
            style={{ width: `${scoreA}%` }}
          />
        </div>
        <div className="score-row__label">{label}</div>
        <div className="score-row__bar-b-wrap">
          <div
            className={`score-row__bar score-row__bar--b ${bWins ? "score-row__bar--winner" : bMine ? "score-row__bar--mine" : ""}`}
            style={{ width: `${scoreB}%` }}
          />
        </div>
      </div>
      <span className={`score-row__num score-row__num--b ${bWins ? "score-row__num--winner" : ""}`}>
        {scoreB}
      </span>
    </div>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast">{message}</div>;
}

export function BattleResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user, authChecked, isAuthenticated, startKakaoLogin } = useAuth();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState("transport");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);

  const loggedIn = authChecked && isAuthenticated;
  const hasFetched = useRef(false);

  useEffect(() => {
    console.info("[auth-ui] battle result render state", {
      authChecked,
      isAuthenticated,
      hasUser: Boolean(user),
      battleId: id ?? null,
    });
  }, [authChecked, id, isAuthenticated, user]);

  useEffect(() => {
    if (!id || hasFetched.current) return;
    hasFetched.current = true;

    fetch(`/api/battles/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if ((data as { error?: string }).error) throw new Error((data as { error: string }).error);
        setBattle(data as Battle);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, [id]);

  function showToast(msg: string) {
    setToast(msg);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => showToast("복사됐어요!")).catch(() => showToast("복사 실패"));
  }

  async function reloadBattle(): Promise<void> {
    if (!id) return;
    const data = await fetch(`/api/battles/${id}`, { credentials: "include" }).then((r) => r.json());
    setBattle(data as Battle);
    hasFetched.current = true;
  }

  async function submitComment() {
    if (!comment.trim() || !id) return;
    setCommentLoading(true);
    try {
      const res = await fetch(`/api/battles/${id}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      if (!res.ok) throw new Error("댓글 등록 실패");
      setComment("");
      hasFetched.current = false;
      await reloadBattle();
    } catch {
      showToast("댓글 등록 실패");
    } finally {
      setCommentLoading(false);
    }
  }

  async function likeComment(commentId: string) {
    if (!id) return;
    const res = await fetch(`/api/battles/${id}/comments/${commentId}/like`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      showToast("좋아요 실패");
      return;
    }
    setBattle((b) => {
      if (!b) return b;
      return {
        ...b,
        comments: b.comments.map((c) =>
          c.id === commentId ? { ...c, likes: c.likes + 1, likedByMe: true } : c
        ),
      };
    });
  }

  async function submitDispute() {
    if (!disputeReason.trim() || !id) return;
    setDisputeLoading(true);
    try {
      const res = await fetch(`/api/battles/${id}/disputes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: disputeCategory, reason: disputeReason.trim() }),
      });
      if (!res.ok) throw new Error("딴지 등록 실패");
      setDisputeOpen(false);
      setDisputeReason("");
      showToast("딴지를 걸었어요!");
    } catch {
      showToast("딴지 등록 실패");
    } finally {
      setDisputeLoading(false);
    }
  }

  if (loading) return <div className="battle-result__loading">불러오는 중...</div>;
  if (error || !battle) return <div className="battle-result__error">{error ?? "대결을 찾을 수 없어요"}</div>;

  // Check if apt A is "my apt" based on localStorage
  const MY_APT_KEY = "whatsinhere_my_apt";
  let myAptId: string | null = null;
  try { myAptId = (JSON.parse(localStorage.getItem(MY_APT_KEY) ?? "null") as { id?: string } | null)?.id ?? null; } catch { /* ignore */ }
  const myIsA = myAptId === battle.aptAId;
  const myIsB = myAptId === battle.aptBId;
  const hasMyApt = myIsA || myIsB;

  const keys: Array<keyof BattleScores> = ["transport", "walk", "value", "childcare", "safety"];
  let winsA = 0;
  let winsB = 0;
  for (const k of keys) {
    if (battle.scoreA[k] > battle.scoreB[k]) winsA++;
    else if (battle.scoreB[k] > battle.scoreA[k]) winsB++;
  }

  const myWins = myIsA ? winsA : winsB;
  const opWins = myIsA ? winsB : winsA;
  const myWon = myIsA ? battle.winner === "a" : myIsB ? battle.winner === "b" : false;
  const opWon = myIsA ? battle.winner === "b" : myIsB ? battle.winner === "a" : false;

  const draws = 5 - myWins - opWins;

  const verdict = !hasMyApt
    ? (battle.winner === "draw" ? <strong>팽팽한 접전!</strong> : <>{battle.winner === "a" ? battle.aptAName : battle.aptBName} <strong>{Math.max(winsA, winsB)}:{Math.min(winsA, winsB)} 승리</strong></>)
    : myWon ? <strong>우리 단지가 {myWins}:{opWins}로 이겼어요! 🎉</strong>
    : opWon ? <strong>아쉽게 {myWins}:{opWins}로 졌어요 😢</strong>
    : <strong>{myWins}:{opWins}{draws > 0 ? `:${draws}` : ""} 무승부예요!</strong>;

  return (
    <div className="battle-result">
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <div className="battle-result__header">
        <div className="battle-result__apt">
          <span className="battle-result__apt-name">{battle.aptAName}</span>
          {myIsA && <span className="battle-result__my-badge">우리 단지</span>}
          {battle.winner === "a" && <span className="battle-result__crown">🏆</span>}
        </div>
        <div className="battle-result__vs">⚔️</div>
        <div className="battle-result__apt battle-result__apt--b">
          {battle.winner === "b" && <span className="battle-result__crown">🏆</span>}
          {myIsB && <span className="battle-result__my-badge">우리 단지</span>}
          <span className="battle-result__apt-name">{battle.aptBName}</span>
        </div>
      </div>

      <div className="battle-result__scores">
        {keys.map((k) => (
          <ScoreBar key={k} category={k} scoreA={battle.scoreA[k]} scoreB={battle.scoreB[k]} myIsA={hasMyApt ? myIsA : null} />
        ))}
      </div>

      <div className="battle-result__verdict">{verdict}</div>

      <div className="battle-result__actions">
        <button className="btn btn--outline" onClick={copyLink}>📤 결과 공유</button>
        <button className="btn btn--outline" onClick={() => setDisputeOpen(true)}>⚠️ 이 결과 틀렸어요</button>
        <Link to="/battle" className="btn btn--outline">새 대결 만들기</Link>
      </div>

      <div className="battle-result__comments">
        <h2 className="battle-result__comments-title">💬 댓글</h2>

        {!authChecked ? null : loggedIn ? (
          <div className="comment-form">
            <textarea
              className="comment-form__input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="이 대결에 대한 의견을 남겨보세요 (최대 300자)"
              maxLength={300}
              rows={2}
            />
            <button
              className="btn btn--primary"
              onClick={submitComment}
              disabled={!comment.trim() || commentLoading}
            >
              {commentLoading ? "등록 중..." : "등록"}
            </button>
          </div>
        ) : (
          <div className="battle-result__login-prompt">
            <span>댓글을 달려면 로그인이 필요해요</span>
            <button className="btn btn--kakao" onClick={() => startKakaoLogin()}>카카오 로그인</button>
          </div>
        )}

        <div className="comment-list">
          {battle.comments.length === 0 && (
            <p className="comment-list__empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
          )}
          {battle.comments.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-item__meta">
                <span className="comment-item__nickname">{c.nickname}</span>
                <span className="comment-item__date">{c.createdAt.slice(0, 10)}</span>
              </div>
              <p className="comment-item__text">{c.comment}</p>
              <button
                className={`comment-item__like ${c.likedByMe ? "comment-item__like--active" : ""}`}
                onClick={() => loggedIn ? void likeComment(c.id) : startKakaoLogin()}
                disabled={c.likedByMe}
              >
                ♥ {c.likes}
              </button>
            </div>
          ))}
        </div>
      </div>

      {disputeOpen && (
        <div className="modal-backdrop" onClick={() => setDisputeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">⚠️ 딴지 걸기</h3>
            <p className="modal__desc">어떤 항목이 잘못됐나요?</p>

            <div className="modal__field">
              <label className="modal__label">카테고리</label>
              <select
                className="apt-selector__select"
                value={disputeCategory}
                onChange={(e) => setDisputeCategory(e.target.value)}
              >
                {DISPUTE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="modal__field">
              <label className="modal__label">이유 (최대 200자)</label>
              <textarea
                className="comment-form__input"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="어떤 점이 잘못됐는지 알려주세요"
                maxLength={200}
                rows={3}
              />
            </div>

            <div className="modal__actions">
              <button className="btn btn--outline" onClick={() => setDisputeOpen(false)}>취소</button>
              <button
                className="btn btn--primary"
                onClick={submitDispute}
                disabled={!disputeReason.trim() || disputeLoading}
              >
                {disputeLoading ? "제출 중..." : "딴지 걸기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
