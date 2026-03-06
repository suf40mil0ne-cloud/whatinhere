import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { LAST_UPDATED } from "../data/projects";

function isAdsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_ADSENSE === "true";
}

function maybeInjectAdsScript() {
  if (!isAdsEnabled()) return;
  if (document.querySelector("script[data-adsense='enabled']")) return;

  const script = document.createElement("script");
  script.async = true;
  script.setAttribute("data-adsense", "enabled");
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
  document.head.appendChild(script);
}

export function SiteLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    maybeInjectAdsScript();
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">여기 뭐 생겨요?</Link>
          <nav>
            <NavLink to="/about">서비스 소개</NavLink>
            <NavLink to="/data-sources">데이터 출처</NavLink>
            <NavLink to="/faq">FAQ</NavLink>
            <NavLink to="/contact">문의</NavLink>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="footer-links">
          <Link to="/about">About</Link>
          <Link to="/privacy">개인정보처리방침</Link>
          <Link to="/terms">이용약관</Link>
          <Link to="/contact">문의하기</Link>
          <Link to="/data-sources">데이터 출처</Link>
          <Link to="/disclaimer">면책 고지</Link>
        </div>
        <p>최종 업데이트: {LAST_UPDATED}</p>
      </footer>
    </div>
  );
}
