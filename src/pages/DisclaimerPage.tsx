import { usePageMeta } from "../hooks/usePageMeta";

export function DisclaimerPage() {
  usePageMeta({
    title: "면책 고지 및 출처 정책 | 여기 뭐 생겨요?",
    description: "정보 해석 범위, 출처 확인 원칙, 저작권·출처 정책을 안내합니다.",
    canonicalPath: "/disclaimer",
  });

  return (
    <div className="page">
      <h1>면책 고지 / 출처 정책</h1>
      <p>
        본 서비스의 정보는 공공데이터와 공식 문서를 기반으로 재구성한 참고 정보입니다. 실제 행정 상태는
        기관 공고가 우선이며, 최신성 차이가 존재할 수 있습니다.
      </p>
      <h2>출처 정책</h2>
      <p>프로젝트 상세 페이지에서 출처 링크를 제공하며, 출처가 불명확한 단정 정보는 게시하지 않습니다.</p>
      <h2>저작권 정책</h2>
      <p>원문 데이터의 권리는 각 제공 기관에 있으며, 서비스 내 편집 요약물은 서비스 운영 원칙을 따릅니다.</p>
    </div>
  );
}
