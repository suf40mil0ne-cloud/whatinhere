import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function SiteLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, authChecked, isAuthenticated, startKakaoLogin, logout } = useAuth();

  useEffect(() => {
    console.info("[auth-ui] header render state", {
      authChecked,
      isAuthenticated,
      hasUser: Boolean(user),
      path: location.pathname,
    });
  }, [authChecked, isAuthenticated, location.pathname, user]);

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  }

  async function handleLogout() {
    await logout();
    if (window.location.pathname !== "/") {
      window.location.assign("/");
    }
  }

  return (
    <div className="site-layout">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand-link">
            <span className="brand-mark">⚔️</span>
            <span className="brand-name">단지戰</span>
          </Link>

          <nav className="top-nav" aria-label="상단 탐색">
            <Link to="/" className={`top-nav__link ${location.pathname === "/" || isActive("/battle") ? "top-nav__link--active" : ""}`}>
              대결 ⚔️
            </Link>
            <Link to="/ranking" className={`top-nav__link ${isActive("/ranking") ? "top-nav__link--active" : ""}`}>
              랭킹 🏆
            </Link>
            <Link to="/my-apt" className={`top-nav__link ${isActive("/my-apt") ? "top-nav__link--active" : ""}`}>
              내 단지 🏠
            </Link>
            <Link to="/trend" className={`top-nav__link ${isActive("/trend") ? "top-nav__link--active" : ""}`}>
              트렌드 🔥
            </Link>
            <Link to="/comments" className={`top-nav__link ${isActive("/comments") ? "top-nav__link--active" : ""}`}>
              논쟁 💬
            </Link>
          </nav>

          <div className="site-header__auth">
            {!authChecked ? null : isAuthenticated && user ? (
              <div className="auth-user">
                {user.profileImg && (
                  <img src={user.profileImg} alt={user.nickname} className="auth-user__img" />
                )}
                <span className="auth-user__name">{user.nickname}</span>
                <button className="btn btn--ghost" onClick={() => void handleLogout()}>로그아웃</button>
              </div>
            ) : (
              <button className="btn btn--kakao" onClick={() => startKakaoLogin()}>
                카카오 로그인
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <nav className="site-footer__nav" aria-label="푸터 탐색">
            <Link to="/about" className="site-footer__link">서비스 소개</Link>
            <Link to="/privacy" className="site-footer__link">개인정보처리방침</Link>
            <Link to="/terms" className="site-footer__link">이용약관</Link>
          </nav>
          <p className="site-footer__copy">
            © 2025 단지戰 · 모든 점수는 참고용입니다 · 데이터 출처: 공공데이터포털, NEIS
          </p>
        </div>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="하단 탐색">
        <Link to="/" className={`mobile-bottom-nav__item ${location.pathname === "/" || isActive("/battle") ? "mobile-bottom-nav__item--active" : ""}`}>
          <span className="mobile-bottom-nav__icon">⚔️</span>
          <span className="mobile-bottom-nav__label">대결</span>
        </Link>
        <Link to="/ranking" className={`mobile-bottom-nav__item ${isActive("/ranking") ? "mobile-bottom-nav__item--active" : ""}`}>
          <span className="mobile-bottom-nav__icon">🏆</span>
          <span className="mobile-bottom-nav__label">랭킹</span>
        </Link>
        <Link to="/my-apt" className={`mobile-bottom-nav__item ${isActive("/my-apt") ? "mobile-bottom-nav__item--active" : ""}`}>
          <span className="mobile-bottom-nav__icon">🏠</span>
          <span className="mobile-bottom-nav__label">내 단지</span>
        </Link>
        <Link to="/trend" className={`mobile-bottom-nav__item ${isActive("/trend") ? "mobile-bottom-nav__item--active" : ""}`}>
          <span className="mobile-bottom-nav__icon">🔥</span>
          <span className="mobile-bottom-nav__label">트렌드</span>
        </Link>
        <Link to="/comments" className={`mobile-bottom-nav__item ${isActive("/comments") ? "mobile-bottom-nav__item--active" : ""}`}>
          <span className="mobile-bottom-nav__icon">💬</span>
          <span className="mobile-bottom-nav__label">논쟁</span>
        </Link>
      </nav>
    </div>
  );
}
