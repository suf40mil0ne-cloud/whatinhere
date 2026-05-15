import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface AptUserComment {
  id: string;
  aptId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  content: string;
  createdAt: string;
  isOwn: boolean;
}

const REPORT_REASONS = ["욕설/비방", "광고/스팸", "허위정보", "기타"] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate + "Z").getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function DefaultAvatar() {
  return (
    <div className="apt-comment-avatar-default" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    </div>
  );
}

interface ReportModalProps {
  onConfirm: (reason: ReportReason) => void;
  onClose: () => void;
}

function ReportModal({ onConfirm, onClose }: ReportModalProps) {
  const [selected, setSelected] = useState<ReportReason>("욕설/비방");

  return (
    <div className="apt-comment-modal-overlay" onClick={onClose}>
      <div className="apt-comment-modal" onClick={(e) => e.stopPropagation()}>
        <p className="apt-comment-modal-title">신고 사유 선택</p>
        <div className="apt-comment-modal-reasons">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="apt-comment-modal-reason">
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={selected === r}
                onChange={() => setSelected(r)}
              />
              {r}
            </label>
          ))}
        </div>
        <div className="apt-comment-modal-actions">
          <button className="btn btn--ghost" onClick={onClose}>취소</button>
          <button className="btn btn--primary" onClick={() => onConfirm(selected)}>신고</button>
        </div>
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
}

function Toast({ message }: ToastProps) {
  return <div className="apt-comment-toast">{message}</div>;
}

interface CommentItemProps {
  comment: AptUserComment;
  currentUserId: string | null;
  aptId: string;
  onDeleted: (id: string) => void;
  onReported: (id: string) => void;
}

function CommentItem({ comment, currentUserId, aptId, onDeleted, onReported }: CommentItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  async function handleDelete() {
    setMenuOpen(false);
    const res = await fetch(`/api/apartments/${aptId}/user-comments/${comment.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) onDeleted(comment.id);
  }

  async function handleReport(reason: ReportReason) {
    setShowReport(false);
    const res = await fetch(`/api/apartments/${aptId}/user-comments/${comment.id}/report`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) onReported(comment.id);
  }

  return (
    <div className="apt-comment-item">
      {showReport && (
        <ReportModal onConfirm={handleReport} onClose={() => setShowReport(false)} />
      )}
      <div className="apt-comment-item-head">
        <div className="apt-comment-avatar">
          {comment.userPhoto
            ? <img src={comment.userPhoto} alt={comment.userName} className="apt-comment-avatar-img" referrerPolicy="no-referrer" />
            : <DefaultAvatar />}
        </div>
        <div className="apt-comment-meta">
          <span className="apt-comment-name">{comment.userName}</span>
          <span className="apt-comment-time">{timeAgo(comment.createdAt)}</span>
        </div>
        {currentUserId && (
          <div className="apt-comment-menu-wrap" ref={menuRef}>
            <button
              className="apt-comment-menu-btn"
              aria-label="댓글 옵션"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ···
            </button>
            {menuOpen && (
              <div className="apt-comment-menu">
                {comment.isOwn ? (
                  <button className="apt-comment-menu-item apt-comment-menu-item--danger" onClick={handleDelete}>삭제</button>
                ) : (
                  <button className="apt-comment-menu-item" onClick={() => { setMenuOpen(false); setShowReport(true); }}>신고</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="apt-comment-content">{comment.content}</p>
    </div>
  );
}

interface AptCommentsProps {
  aptId: string;
}

export function AptComments({ aptId }: AptCommentsProps) {
  const { user, authChecked, startKakaoLogin } = useAuth();
  const [comments, setComments] = useState<AptUserComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/apartments/${aptId}/user-comments`, { credentials: "include" })
      .then((r) => r.json() as Promise<{ comments: AptUserComment[] }>)
      .then((data) => setComments(data.comments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [aptId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/apartments/${aptId}/user-comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "댓글 작성에 실패했습니다");
        return;
      }
      setText("");
      // 목록 새로고침
      const listRes = await fetch(`/api/apartments/${aptId}/user-comments`, { credentials: "include" });
      const listData = await listRes.json() as { comments: AptUserComment[] };
      setComments(listData.comments ?? []);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleted(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    showToast("댓글이 삭제되었습니다");
  }

  function handleReported(id: string) {
    void id;
    showToast("신고가 접수되었습니다");
  }

  return (
    <div className="apt-comments panel-card">
      {toast && <Toast message={toast} />}
      <p className="page-kicker">댓글</p>

      {authChecked && !user ? (
        <div className="apt-comments-login">
          <p className="apt-comments-login-text">카카오 로그인 후 댓글을 남길 수 있어요</p>
          <button className="btn btn--kakao" onClick={() => startKakaoLogin()}>
            카카오 로그인
          </button>
        </div>
      ) : user ? (
        <div className="apt-comments-form">
          <textarea
            className="apt-comments-textarea"
            placeholder="이 단지에 대한 이야기를 남겨주세요"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="apt-comments-form-footer">
            <span className="apt-comments-char-count">{text.length} / 500</span>
            <button
              className="btn btn--primary apt-comments-submit"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="apt-comments-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-block" style={{ height: 60, borderRadius: 10, marginBottom: 8 }} />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="apt-comments-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
      ) : (
        <div className="apt-comments-list">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={user?.id ?? null}
              aptId={aptId}
              onDeleted={handleDeleted}
              onReported={handleReported}
            />
          ))}
        </div>
      )}
    </div>
  );
}
