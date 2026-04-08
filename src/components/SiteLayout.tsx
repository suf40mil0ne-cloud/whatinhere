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
            <Link to="/map" className={`top-nav__link ${isActive("/map") ? "top-nav__link--active" : ""}`}>
              지도
            </Link>
            <Link to="/ranking" className={`top-nav__link ${isActive("/ranking") ? "top-nav__link--active" : ""}`}>
              랭킹
            </Link>
            <Link to="/hot" className={`top-nav__link ${isActive("/hot") ? "top-nav__link--active" : ""}`}>
              HOT 🔥
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
    </div>
  );
}
