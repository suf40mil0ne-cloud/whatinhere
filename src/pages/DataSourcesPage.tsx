import { usePageMeta } from "../hooks/usePageMeta";

export function DataSourcesPage() {
  usePageMeta({
    title: "데이터 출처와 갱신 방식 | 여기 뭐 생겨요?",
    description: "공공데이터·지자체 자료·공식 문서 기반 수집 방식과 데이터 한계, 갱신 주기를 안내합니다.",
    canonicalPath: "/data-sources",
  });

  return (
    <div className="page">
      <h1>데이터 출처와 업데이트 방식</h1>
      <section>
        <h2>활용 데이터</h2>
        <ul>
          <li>국토교통부 도시계획 개발행위허가정보</li>
          <li>전국건축인허가기본정보표준데이터</li>
          <li>건축HUB 건축인허가정보</li>
          <li>지자체 공개 자료 및 공식 공지</li>
        </ul>
      </section>
      <section>
        <h2>갱신 주기</h2>
        <p>정기 수집 + 수동 검수를 병행하며, 소스별 공개 주기에 따라 반영 시차가 발생할 수 있습니다.</p>
      </section>
      <section>
        <h2>데이터 한계</h2>
        <p>
          원천 데이터 표기 오차, 상태 업데이트 지연, 좌표 누락이 있을 수 있습니다. 중요한 의사결정 전에는
          반드시 원문 공고와 담당 기관 자료를 다시 확인해 주세요.
        </p>
      </section>
    </div>
  );
}
