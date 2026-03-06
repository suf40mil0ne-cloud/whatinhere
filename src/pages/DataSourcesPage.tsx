import { SOURCE_CONNECTORS } from "../data/projects";
import { usePageMeta } from "../hooks/usePageMeta";

export function DataSourcesPage() {
  usePageMeta({
    title: "데이터 출처와 갱신 방식 | 여기 뭐 생겨요?",
    description: "공공데이터·지자체 자료 기반 수집 구조, 정규화 규칙, 데이터 한계를 안내합니다.",
    canonicalPath: "/data-sources",
  });

  return (
    <div className="page">
      <h1>데이터 출처와 업데이트 방식</h1>
      <section>
        <h2>활용 데이터 우선순위</h2>
        <ol>
          <li>국토교통부 건축HUB 건축인허가정보</li>
          <li>국토교통부 도시계획 개발행위허가정보</li>
          <li>지자체 건축허가 / 착공 / 사용승인 현황 파일데이터</li>
          <li>공식 문서 및 지자체 공지</li>
        </ol>
      </section>
      <section>
        <h2>현재 연결 구조</h2>
        <ul>
          {SOURCE_CONNECTORS.map((connector) => (
            <li key={connector}>{connector}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>정규화 규칙</h2>
        <ul>
          <li>날짜는 YYYY-MM-DD로 통일합니다.</li>
          <li>주소는 공백과 표기 흔들림을 정리한 뒤 지오코딩 캐시와 매칭합니다.</li>
          <li>상태는 허가 / 착공 / 사용승인 / 미확인 중심으로 정규화합니다.</li>
          <li>착공일은 확인됐지만 사용승인일이 없을 때만 UI에서 공사중 추정으로 표시합니다.</li>
        </ul>
      </section>
      <section>
        <h2>데이터 한계</h2>
        <p>
          원천 데이터 공개 시차, 좌표 누락, 지자체별 파일 구조 차이로 인해 일부 지역은 지도 표시가 제한될 수 있습니다.
          이 경우 검색 후보로만 남기거나 후속 지오코딩 보강 대상으로 분리합니다.
        </p>
      </section>
    </div>
  );
}
