import { usePageMeta } from "../hooks/usePageMeta";

export function TermsPage() {
  usePageMeta({
    title: "이용약관 | 여기 뭐 생겨요?",
    description: "서비스 이용 조건, 책임 제한, 콘텐츠 이용 범위에 대한 약관입니다.",
    canonicalPath: "/terms",
  });

  return (
    <div className="page">
      <h1>이용약관</h1>
      <p>본 서비스는 공공·공식 데이터를 기반으로 정보를 제공합니다.</p>
      <h2>서비스 성격</h2>
      <p>정보 제공 서비스이며, 투자·법률·행정 의사결정의 최종 근거는 원문 자료입니다.</p>
      <h2>콘텐츠 이용</h2>
      <p>출처를 명시한 범위에서 인용이 가능하며, 무단 복제·자동 수집·재배포는 제한될 수 있습니다.</p>
      <h2>책임 제한</h2>
      <p>데이터 시차 및 원천 오류로 인한 손해에 대해 서비스 제공자는 법령 범위 내에서 책임을 제한합니다.</p>
    </div>
  );
}
