import { usePageMeta } from "../hooks/usePageMeta";

export function AboutPage() {
  usePageMeta({
    title: "서비스 소개 | 여기 뭐 생겨요?",
    description: "왜 이 서비스를 만들었는지, 누구에게 유용한지, 어떤 운영 원칙으로 정보를 제공하는지 설명합니다.",
    canonicalPath: "/about",
  });

  return (
    <div className="page">
      <h1>서비스 소개</h1>
      <p className="lead">"여기 뭐 생겨요?"는 주변 공사·개발 정보를 이해하기 쉽게 정리해 주는 생활형 정보 서비스입니다.</p>
      <section>
        <h2>왜 만들었나요?</h2>
        <p>
          길을 지나다 공사 현장을 보며 "여기 뭐 생기는 거지?"라고 궁금해하는 순간을 줄이고,
          흩어진 행정 데이터를 사용자 관점으로 묶어 보여주기 위해 만들었습니다.
        </p>
      </section>
      <section>
        <h2>누구에게 유용한가요?</h2>
        <p>
          실거주자, 이사 예정자, 상권 분석 사용자, 지역 변화에 관심 있는 시민에게 유용합니다.
        </p>
      </section>
      <section>
        <h2>운영 원칙</h2>
        <ul>
          <li>추측보다 출처 기반 정보 제공</li>
          <li>단정 표현보다 상태 근거 제시</li>
          <li>사실과 해석(추정)을 분리해 안내</li>
        </ul>
      </section>
    </div>
  );
}
