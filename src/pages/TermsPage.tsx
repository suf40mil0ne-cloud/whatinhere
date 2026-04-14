export function TermsPage() {
  return (
    <div className="content-page">
      <h1 className="content-page__title">이용약관</h1>
      <p className="content-page__updated">최종 수정일: 2025년 1월 1일</p>

      <section className="content-page__section">
        <h2>1. 서비스 소개</h2>
        <p>
          단지戰은 수도권 아파트 단지를 교통·산책·가성비·육아·안심 5개 스탯으로 비교하는 서비스입니다.
          공공데이터를 기반으로 산출된 점수를 통해 단지 간 대결을 제공합니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>2. 서비스 이용</h2>
        <ul>
          <li>서비스는 만 14세 이상 누구나 이용할 수 있습니다.</li>
          <li>카카오 로그인은 댓글 작성 등 일부 기능에 필요하며, 비로그인 상태에서도 기본 기능을 이용할 수 있습니다.</li>
          <li>서비스의 콘텐츠를 허락 없이 상업적으로 이용하거나 크롤링하는 행위는 금지됩니다.</li>
        </ul>
      </section>

      <section className="content-page__section">
        <h2>3. 데이터 출처 및 정확성 면책</h2>
        <p>
          본 서비스에서 제공하는 단지 점수는 공공데이터포털(data.go.kr), NEIS 등 공공 API에서
          수집한 데이터를 기반으로 자체 알고리즘으로 산출한 결과입니다.
        </p>
        <ul>
          <li>점수는 참고용 정보로만 활용하시고, 실제 부동산 거래·투자 결정에 사용하지 마세요.</li>
          <li>공공데이터의 오류, 갱신 지연 등으로 인한 점수 오차가 있을 수 있습니다.</li>
          <li>서비스는 데이터 정확성을 보증하지 않으며, 이용자의 판단에 따른 결과에 대해 책임을 지지 않습니다.</li>
        </ul>
      </section>

      <section className="content-page__section">
        <h2>4. 점수는 참고용</h2>
        <p>
          단지戰의 모든 점수(교통·산책·가성비·육아·안심 및 종합 점수)는
          <strong> 순수 참고 목적</strong>으로만 제공됩니다.
          부동산 가격 예측, 투자 권유, 학군 보장 등과는 무관합니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>5. 서비스 변경 및 중단</h2>
        <p>
          운영자는 필요에 따라 서비스의 내용을 변경하거나 중단할 수 있습니다.
          중요한 변경 사항은 서비스 내 공지를 통해 안내합니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>6. 준거법</h2>
        <p>본 약관은 대한민국 법령에 따라 해석됩니다.</p>
      </section>

      <section className="content-page__section">
        <h2>7. 문의</h2>
        <p>
          서비스 이용 관련 문의:{" "}
          <a href="mailto:whatinhere@gmail.com">whatinhere@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
