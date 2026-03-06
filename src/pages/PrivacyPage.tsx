import { usePageMeta } from "../hooks/usePageMeta";

export function PrivacyPage() {
  usePageMeta({
    title: "개인정보처리방침 | 여기 뭐 생겨요?",
    description: "개인정보 수집 항목, 처리 목적, 보관 기간, 이용자 권리 등을 안내합니다.",
    canonicalPath: "/privacy",
  });

  return (
    <div className="page">
      <h1>개인정보처리방침</h1>
      <p>본 서비스는 최소한의 운영 로그만 처리하며, 법령에 따른 개인정보 보호 원칙을 준수합니다.</p>
      <h2>수집 항목</h2>
      <p>문의 시 사용자가 직접 제공한 연락 정보(이메일 등)를 수집할 수 있습니다.</p>
      <h2>이용 목적</h2>
      <p>문의 응대, 서비스 개선, 오기 제보 검토를 위해 사용합니다.</p>
      <h2>보관 기간</h2>
      <p>목적 달성 후 지체 없이 파기하며, 관계 법령상 보관 의무가 있는 경우 해당 기간 동안 보관합니다.</p>
    </div>
  );
}
