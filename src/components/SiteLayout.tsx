import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchMe, logout, startKakaoLogin } from "../lib/auth";
import type { AuthUser } from "../lib/auth";

// 단지戰: 대결⚔️ · 랭킹 · HOT🔥 네비게이션 포함
export function SiteLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .finally(() => setUserLoading(false));
  }, [location.pathname]);

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + "/");
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
            <Link to="/" className={`top-nav__link ${location.pathname === "/" ? "top-nav__link--active" : ""}`}>
              지도
            </Link>
            <Link to="/battle" className={`top-nav__link ${isActive("/battle") ? "top-nav__link--active" : ""}`}>
              대결 ⚔️
            </Link>
            <Link to="/ranking" className={`top-nav__link ${isActive("/ranking") ? "top-nav__link--active" : ""}`}>
              랭킹
            </Link>
            <Link to="/hot" className={`top-nav__link ${isActive("/hot") ? "top-nav__link--active" : ""}`}>
              HOT 🔥
            </Link>
          </nav>

          <div className="site-header__auth">
            {userLoading ? null : user ? (
              <div className="auth-user">
                {user.profileImg && (
                  <img src={user.profileImg} alt={user.nickname} className="auth-user__img" />
                )}
                <span className="auth-user__name">{user.nickname}</span>
                <button className="btn btn--ghost" onClick={logout}>로그아웃</button>
              </div>
            ) : (
              <button className="btn btn--kakao" onClick={startKakaoLogin}>
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
