export function PrivacyPage() {
  return (
    <div className="content-page">
      <h1 className="content-page__title">개인정보처리방침</h1>
      <p className="content-page__updated">최종 수정일: 2025년 1월 1일</p>

      <section className="content-page__section">
        <h2>1. 수집하는 정보</h2>
        <p>단지戰(이하 "서비스")은 서비스 제공을 위해 아래 정보를 수집합니다.</p>
        <ul>
          <li><strong>검색어</strong>: 단지 검색 시 입력한 지역명 및 단지명</li>
          <li><strong>대결 기록</strong>: 생성된 단지 대결의 ID, 참여 단지, 결과</li>
          <li><strong>방문 로그</strong>: 페이지 접속 기록, 조회수 등 서비스 이용 통계</li>
          <li><strong>카카오 계정 정보</strong>: 카카오 로그인 이용 시 닉네임, 프로필 이미지 (이메일 미수집)</li>
          <li><strong>내 단지 설정</strong>: 브라우저 로컬스토리지에 사용자가 직접 저장하는 단지 ID 및 이름</li>
        </ul>
      </section>

      <section className="content-page__section">
        <h2>2. 제3자 API 및 서비스 이용</h2>
        <p>서비스는 데이터 제공을 위해 아래 외부 API 및 서비스를 사용합니다.</p>
        <ul>
          <li><strong>공공데이터포털 (data.go.kr)</strong>: 아파트 단지 기본 정보, 부동산 실거래가 등 공공 데이터</li>
          <li><strong>NEIS (교육정보시스템)</strong>: 학교 위치 및 학군 정보</li>
          <li><strong>카카오 API</strong>: 카카오 로그인(OAuth 2.0) 및 지도 서비스</li>
          <li><strong>Google AdSense</strong>: 광고 서비스 제공 목적으로 사용 예정이며, Google의 쿠키 및 개인정보처리방침이 함께 적용됩니다.</li>
        </ul>
        <p>각 서비스의 개인정보처리방침은 해당 서비스의 정책을 따릅니다.</p>
      </section>

      <section className="content-page__section">
        <h2>3. 구글 애드센스 사용 안내</h2>
        <p>
          본 서비스는 Google AdSense를 통해 광고를 게재할 예정입니다.
          Google은 사용자의 관심사에 맞는 광고를 제공하기 위해 쿠키를 사용할 수 있습니다.
          Google의 광고 쿠키 사용을 원하지 않으시면{" "}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
            Google 광고 설정 페이지
          </a>
          에서 비활성화하실 수 있습니다.
        </p>
      </section>

      <section className="content-page__section">
        <h2>4. 정보의 보유 및 이용 기간</h2>
        <ul>
          <li>대결 기록: 서비스 제공 기간 동안 보관</li>
          <li>카카오 계정 정보: 로그아웃 또는 회원탈퇴 시 즉시 삭제</li>
          <li>로컬스토리지 데이터: 사용자가 직접 브라우저에서 삭제 가능</li>
        </ul>
      </section>

      <section className="content-page__section">
        <h2>5. 개인정보의 제3자 제공</h2>
        <p>서비스는 사용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 의한 요청이 있는 경우는 예외로 합니다.</p>
      </section>

      <section className="content-page__section">
        <h2>6. 문의</h2>
        <p>개인정보 관련 문의는 아래 이메일로 연락해 주세요.</p>
        <p>
          <strong>이메일</strong>:{" "}
          <a href="mailto:whatinhere@gmail.com">whatinhere@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
