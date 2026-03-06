import { usePageMeta } from "../hooks/usePageMeta";

export function AboutPage() {
  usePageMeta({
    title: "서비스 소개 | 여기 뭐 생겨요?",
    description: "이 서비스가 왜 현재 위치 중심 지도와 출처 기반 공공데이터를 우선하는지 설명합니다.",
    canonicalPath: "/about",
  });

  return (
    <div className="page">
      <h1>서비스 소개</h1>
      <p className="lead">"여기 뭐 생겨요?"는 내 주변 공사·개발 정보를 지도에서 먼저 보고, 마커를 눌러 출처 기반 사실을 확인하는 서비스입니다.</p>
      <section>
        <h2>왜 이렇게 바꿨나요?</h2>
        <p>
          사용자는 긴 목록보다 먼저 자기 주변에서 무슨 일이 벌어지는지 보고 싶어합니다.
          그래서 첫 화면을 지도 중심으로 바꾸고, 상세 정보는 선택된 마커에 대해서만 보여 주도록 개편했습니다.
        </p>
      </section>
      <section>
        <h2>누구에게 유용한가요?</h2>
        <p>
          실거주자, 이사 예정자, 상권 분석 사용자, 지역 변화에 민감한 시민에게 유용합니다. 특히 허가와 착공의 차이를 구분해 보고 싶은 사용자에게 적합합니다.
        </p>
      </section>
      <section>
        <h2>운영 원칙</h2>
        <ul>
          <li>추측보다 출처 기반 정보 제공</li>
          <li>원문에 없는 완공 예측은 단정하지 않음</li>
          <li>사실, 파생 상태, 설명 문장을 분리해 관리</li>
        </ul>
      </section>
    </div>
  );
}
