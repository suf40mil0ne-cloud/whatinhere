import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function NotFoundPage() {
  usePageMeta({
    title: "페이지를 찾을 수 없습니다 | 여기 뭐 생겨요?",
    description: "요청하신 페이지가 존재하지 않습니다. 홈에서 다시 탐색해 주세요.",
    canonicalPath: "/404",
  });

  return (
    <div className="page">
      <h1>404</h1>
      <p>요청하신 페이지를 찾을 수 없습니다.</p>
      <Link to="/">홈으로 돌아가기</Link>
    </div>
  );
}
