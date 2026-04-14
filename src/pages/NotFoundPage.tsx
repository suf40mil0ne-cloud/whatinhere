/* NO_ADS: 404 페이지 — 광고 게재 불가 */
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="content-page content-page--center">
      <h1 className="content-page__title">404</h1>
      <p>찾을 수 없는 페이지예요.</p>
      <Link to="/" className="btn btn--primary" style={{ marginTop: 16, display: "inline-block" }}>
        홈으로 돌아가기
      </Link>
    </div>
  );
}
