export function AboutPage() {
  return (
    <div className="content-page">
      <h1 className="content-page__title">단지戰 소개</h1>

      <section className="content-page__section content-page__section--hero">
        <h2>⚔️ 단지戰이란?</h2>
        <p>
          <strong>단지戰</strong>은 수도권 아파트 단지를 5가지 생활환경 스탯으로 비교하는 서비스입니다.
          "우리 아파트가 옆 아파트보다 정말 더 나을까?" 라는 질문에서 시작했습니다.
        </p>
        <p>
          교통·산책·가성비·육아·안심 5개 항목을 공공데이터 기반으로 수치화하여,
          두 단지가 스탯 대결을 벌이는 방식으로 결과를 보여줍니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>점수 산정 기준</h2>
        <p>모든 점수는 0~100점 절대 척도로 산출됩니다. (참고용이며 투자 판단 근거로 사용하지 마세요)</p>
        <ul>
          <li>
            <strong>교통 (Transport)</strong>: 지하철역·버스정류장까지의 거리 및 노선 수를 기반으로 산정
          </li>
          <li>
            <strong>산책 (Walk)</strong>: 인근 공원·녹지 면적 및 접근성 기반 산정
          </li>
          <li>
            <strong>가성비 (Value)</strong>: 면적 대비 실거래가 등 부동산 가격 효율성 기반 산정
          </li>
          <li>
            <strong>육아 (Childcare)</strong>: 어린이집·유치원·초등학교 등 육아 인프라 밀도 기반 산정
          </li>
          <li>
            <strong>안심 (Safety)</strong>: 범죄 통계, 소방서·경찰서 접근성 등 기반 산정
          </li>
        </ul>
      </section>

      <section className="content-page__section">
        <h2>데이터 출처</h2>
        <ul>
          <li><strong>공공데이터포털 (data.go.kr)</strong>: 아파트 단지 정보, 실거래가 데이터</li>
          <li><strong>NEIS (교육정보시스템)</strong>: 학교 정보 및 위치 데이터</li>
          <li><strong>카카오 지도 API</strong>: 위치 기반 거리 계산</li>
          <li>기타 공개된 공공 API</li>
        </ul>
        <p>
          데이터는 주기적으로 갱신하려 노력하지만, 공공데이터 특성상 최신 정보와 차이가 있을 수 있습니다.
          모든 점수는 <strong>참고용</strong>입니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>서비스 대상 지역</h2>
        <p>현재 서울특별시, 인천광역시, 경기도 수도권 지역의 아파트 단지를 지원합니다.</p>
      </section>

      <section className="content-page__section">
        <h2>문의</h2>
        <p>서비스 관련 문의, 데이터 오류 제보, 제휴 등은 아래로 연락해 주세요.</p>
        <p>
          <strong>이메일</strong>:{" "}
          <a href="mailto:whatinhere@gmail.com">whatinhere@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
