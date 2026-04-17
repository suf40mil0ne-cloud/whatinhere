import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface CommentFeedItem {
  id: string;
  battleId: string;
  comment: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
  nickname: string;
  profileImg: string | null;
  aptAName: string;
  aptBName: string;
  winner: string | null;
}

type Sort = "recent" | "hot" | "active";

const SORT_TABS: { value: Sort; label: string; desc: string }[] = [
  { value: "recent",  label: "최신",   desc: "방금 달린 댓글" },
  { value: "hot",     label: "핫",     desc: "좋아요 많은 댓글" },
  { value: "active",  label: "논쟁중", desc: "댓글 많은 대결 먼저" },
];

const WINNER_LABEL: Record<string, string> = { a: "A 승", b: "B 승", draw: "무승부" };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function CommentCard({
  item,
  onLike,
  isAuthenticated,
  startKakaoLogin,
}: {
  item: CommentFeedItem;
  onLike: (id: string) => void;
  isAuthenticated: boolean;
  startKakaoLogin: () => void;
}) {
  return (
    <div className="cf-card">
      <Link to={`/battle/${item.battleId}`} className="cf-card__battle">
        <span className="cf-card__apt cf-card__apt--a">{item.aptAName}</span>
        <span className="cf-card__vs">⚔️</span>
        <span className="cf-card__apt cf-card__apt--b">{item.aptBName}</span>
        {item.winner && (
          <span className={`cf-card__winner cf-card__winner--${item.winner}`}>
            {WINNER_LABEL[item.winner] ?? ""}
          </span>
        )}
      </Link>

      <p className="cf-card__text">{item.comment}</p>

      <div className="cf-card__footer">
        <span className="cf-card__nick">{item.nickname}</span>
        <span className="cf-card__time">{timeAgo(item.createdAt)}</span>
        <button
          className={`cf-card__like ${item.likedByMe ? "cf-card__like--active" : ""}`}
          onClick={() => isAuthenticated ? onLike(item.id) : startKakaoLogin()}
          disabled={item.likedByMe}
        >
          ♥ {item.likes}
        </button>
        <Link to={`/battle/${item.battleId}`} className="cf-card__link">
          대결 보기 →
        </Link>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="cf-card cf-card--skeleton">
      <div className="skeleton-block" style={{ height: 28, width: "70%", borderRadius: 6 }} />
      <div className="skeleton-block" style={{ height: 48, marginTop: 10, borderRadius: 6 }} />
      <div className="skeleton-block" style={{ height: 18, width: "50%", marginTop: 10, borderRadius: 6 }} />
    </div>
  );
}

const PAGE_SIZE = 20;

export function CommentsPage() {
  const { authChecked, isAuthenticated, startKakaoLogin } = useAuth();
  const [sort, setSort] = useState<Sort>("recent");
  const [comments, setComments] = useState<CommentFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const sortRef = useRef(sort);

  async function loadComments(s: Sort, offset: number, append: boolean) {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await fetch(`/api/comments?sort=${s}&limit=${PAGE_SIZE}&offset=${offset}`, { credentials: "include" });
      const data = await res.json() as { comments: CommentFeedItem[]; hasMore: boolean };
      if (append) {
        setComments(prev => [...prev, ...data.comments]);
      } else {
        setComments(data.comments);
      }
      setHasMore(data.hasMore);
      offsetRef.current = offset + data.comments.length;
    } catch { /* ignore */ } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }

  useEffect(() => {
    sortRef.current = sort;
    offsetRef.current = 0;
    void loadComments(sort, 0, false);
  }, [sort]);

  async function likeComment(commentId: string) {
    // Find the battleId for this comment
    const item = comments.find(c => c.id === commentId);
    if (!item) return;
    const res = await fetch(`/api/battles/${item.battleId}/comments/${commentId}/like`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return;
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, likes: c.likes + 1, likedByMe: true } : c
    ));
  }

  function loadMore() {
    void loadComments(sortRef.current, offsetRef.current, true);
  }

  return (
    <div className="cf-page">
      <div className="cf-page__header">
        <h1 className="cf-page__title">💬 논쟁 피드</h1>
        <p className="cf-page__subtitle">대결마다 오가는 의견들</p>
        <div className="filter-tabs">
          {SORT_TABS.map(t => (
            <button
              key={t.value}
              className={`filter-tab ${sort === t.value ? "filter-tab--active" : ""}`}
              onClick={() => setSort(t.value)}
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="cf-list">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : comments.length === 0 ? (
        <div className="empty-state">
          <p>아직 댓글이 없어요.<br />대결 후 첫 댓글을 남겨보세요!</p>
          <Link to="/battle" className="btn btn--primary" style={{ marginTop: 16, display: "inline-block" }}>
            대결 시작하기
          </Link>
        </div>
      ) : (
        <>
          <div className="cf-list">
            {comments.map(item => (
              <CommentCard
                key={item.id}
                item={item}
                onLike={id => void likeComment(id)}
                isAuthenticated={authChecked && isAuthenticated}
                startKakaoLogin={startKakaoLogin}
              />
            ))}
          </div>

          {hasMore && (
            <button
              className="btn btn--outline cf-more-btn"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "불러오는 중..." : "더 보기"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
