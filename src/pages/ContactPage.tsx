import { usePageMeta } from "../hooks/usePageMeta";

export function ContactPage() {
  usePageMeta({
    title: "문의하기 | 여기 뭐 생겨요?",
    description: "오류 제보, 데이터 제안, 협업 문의를 접수합니다.",
    canonicalPath: "/contact",
  });

  return (
    <div className="page">
      <h1>문의하기</h1>
      <p>오류 제보, 신규 프로젝트 제안, 데이터 소스 제휴 문의를 받습니다.</p>
      <ul>
        <li>이메일: contact@whatsinhere.pages.dev</li>
        <li>제보 시 포함 정보: 지역, 사업명, 근거 링크, 확인일</li>
        <li>처리 안내: 접수 후 검토 결과를 순차적으로 반영합니다.</li>
      </ul>
    </div>
  );
}
