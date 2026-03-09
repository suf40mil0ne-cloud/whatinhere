export function Footer() {
  return (
    <footer className="site-footer">
      <p className="footer-copy">
        공공데이터를 바탕으로 주요 공사·개발 정보를 정리합니다. 실제 현장 상황과 시점 차이가 있을 수 있습니다.
      </p>
      <nav className="footer-nav" aria-label="신뢰 정보">
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    </footer>
  );
}
