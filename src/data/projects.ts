import type { AreaInfo, FaqItem, ProjectData } from "../types/content";

export const LAST_UPDATED = "2026-03-06";

export const AREAS: AreaInfo[] = [
  {
    slug: "ilsan",
    name: "일산",
    shortDescription: "킨텍스 확장과 장항지구 개발이 동시에 진행되는 서북부 거점입니다.",
    regionalContext:
      "일산은 대규모 전시·업무 기능과 주거 생활권이 맞물린 지역으로, 도로·철도·복합시설 개발이 생활 동선에 직접 영향을 줍니다.",
    whyImportant:
      "전시장 확장, 역세권 고밀 개발, 공원·도로 재정비가 동시에 진행되기 때문에 교통 혼잡, 상권 재편, 주거 선호 변화가 함께 나타날 가능성이 큽니다.",
  },
  {
    slug: "gimpo",
    name: "김포",
    shortDescription: "신도시 인구 유입에 맞춰 교통·물류·주거 인프라가 빠르게 확장되는 지역입니다.",
    regionalContext:
      "김포는 검단·고촌·풍무 생활권과 연계된 광역 통근 수요가 높아 도로·철도 및 복합물류 프로젝트 비중이 큽니다.",
    whyImportant:
      "출퇴근 동선과 주거 선택에 영향을 주는 교통·물류·주택 공급 프로젝트가 많아, 착공·준공 시점 정보가 실거주 판단에 중요합니다.",
  },
  {
    slug: "kintex",
    name: "킨텍스권",
    shortDescription: "전시산업 중심으로 상업·숙박·교통 프로젝트가 결합되는 특화권역입니다.",
    regionalContext:
      "킨텍스권은 대규모 방문객 흐름에 대응하기 위해 전시장, 환승, 숙박·업무시설이 연동되어 계획되는 특징이 있습니다.",
    whyImportant:
      "이 권역의 개발 일정은 주변 교통량, 행사 수용력, 상업 임대 수요에 직접 반영되므로 일정과 단계 변화 확인이 필요합니다.",
  },
];

export const PROJECTS: ProjectData[] = [
  {
    id: "p1",
    slug: "kintex-exhibition-hall-3",
    title: "킨텍스 제3전시장 건립",
    area: "일산",
    areaSlug: "kintex",
    address: "경기 고양시 일산서구 킨텍스로 217-60 일원",
    lat: 37.6679,
    lng: 126.7454,
    category: "전시·문화시설",
    status: "공사중",
    expectedCompletion: "2028년 하반기 목표",
    permitDate: "2025-06-13",
    startDate: "2025-10-23",
    mainUse: "문화집회시설(전시장)",
    buildingArea: 45900,
    grossFloorArea: 178000,
    floorsAbove: 4,
    floorsBelow: 1,
    summary:
      "전시장 확충으로 대형 국제행사 수용력을 높이는 프로젝트입니다. 현재 착공이 확인되어 공사 단계로 판단됩니다.",
    description:
      "기존 전시장 포화 문제를 해소하기 위해 추가 전시동과 지원시설을 확보하는 사업입니다. 행사 성수기 분산 운영과 동시 개최 규모 확대를 목표로 하며, 주변 교통·주차 운영 체계도 함께 조정될 가능성이 있습니다.",
    context:
      "주변에는 대형 상업시설과 숙박시설이 밀집해 있어 전시장 확장이 지역 소비 패턴과 행사 방문객 체류 시간에 영향을 줄 수 있습니다.",
    impact:
      "완공 이후에는 전시 일정 증가로 평일·주말 유동인구가 확대될 수 있으며, 인근 도로 정체 시간대가 재편될 수 있습니다.",
    timelineNote:
      "현재는 착공 이력이 확인된 상태이며, 실제 공정률과 준공 시점은 발주처 공지로 최종 확인이 필요합니다.",
    sources: [
      {
        label: "킨텍스 제3전시장 안내",
        url: "https://www.kintex.com/web/ko/html/company/exhibitionHall3.do",
        type: "공식문서",
      },
      {
        label: "산업통상자원부 착공식 보도자료",
        url: "https://www.motie.go.kr",
        type: "보도자료",
      },
    ],
    updatedAt: "2026-03-05",
  },
  {
    id: "p2",
    slug: "jangan-complex-office",
    title: "장항지구 복합업무시설 신축",
    area: "일산",
    areaSlug: "ilsan",
    address: "경기 고양시 일산동구 장항동 1234",
    lat: 37.6618,
    lng: 126.7672,
    category: "업무시설",
    status: "허가",
    expectedCompletion: "2028년 상반기 예상",
    permitDate: "2026-01-10",
    mainUse: "업무시설",
    grossFloorArea: 42000,
    floorsAbove: 15,
    floorsBelow: 3,
    summary:
      "허가 단계의 오피스 중심 개발로, 실제 착공 여부는 후속 행정 이력 확인이 필요합니다.",
    description:
      "장항지구 내 업무 수요 대응을 위한 중대형 오피스 프로젝트입니다. 초기 계획상 상업 연계 동선과 공개공지 구성 가능성이 언급되며, 업무시설 유입에 따른 주변 점심·퇴근 시간대 상권 변화가 예상됩니다.",
    context:
      "해당 구역은 상업·주거 기능이 혼재되어 있어 단일 업무시설 신설도 주변 임대료와 보행 흐름에 영향을 줄 수 있습니다.",
    impact:
      "착공 후에는 공사 차량 유입이 증가할 수 있고, 준공 이후에는 주간 유동인구 증가가 인근 생활편의 업종 수요를 자극할 수 있습니다.",
    timelineNote:
      "현재 공개 자료 기준으로 허가 상태이며, 착공일 정보가 업데이트될 때 공사중 여부를 확정할 수 있습니다.",
    sources: [{ label: "건축인허가 기본정보", url: "https://www.data.go.kr", type: "공공데이터" }],
    updatedAt: "2026-03-03",
  },
  {
    id: "p3",
    slug: "daehwa-station-mixed-use",
    title: "대화역 일대 복합개발",
    area: "킨텍스권",
    areaSlug: "kintex",
    address: "경기 고양시 일산서구 대화동 2200 일원",
    lat: 37.6762,
    lng: 126.7475,
    category: "복합개발",
    status: "착공준비",
    expectedCompletion: "2029년 예정",
    permitDate: "2026-02-14",
    mainUse: "업무·상업·근린생활 복합",
    grossFloorArea: 89000,
    floorsAbove: 22,
    floorsBelow: 4,
    summary:
      "환승 거점 인근의 복합개발로 계획은 진행 중이며, 본격 착공 전 준비 단계로 분류됩니다.",
    description:
      "역세권 연계형으로 업무·상업·생활편의 기능을 결합한 프로젝트입니다. 통행량 흡수와 체류형 상권 조성을 동시에 겨냥하며, 보행 연결축 정비와 교차로 처리 개선 계획이 함께 검토되고 있습니다.",
    context:
      "대화역 주변은 행사·출퇴근 수요가 겹치는 구간이라 복합개발의 개장 시점이 교통 체감도에 큰 영향을 줄 수 있습니다.",
    impact:
      "중장기적으로는 역 주변 도보권 체류시간 증가와 상권 중심축 이동이 예상됩니다.",
    timelineNote:
      "착공일이 확정되면 공사 단계 판단이 가능하며, 현재는 허가 이후 사전 준비 단계 정보가 중심입니다.",
    sources: [{ label: "지자체 도시계획 공고", url: "https://www.goyang.go.kr", type: "지자체" }],
    updatedAt: "2026-03-01",
  },
  {
    id: "p4",
    slug: "kintex-gtx-transfer-center",
    title: "킨텍스 GTX 환승센터 개선",
    area: "킨텍스권",
    areaSlug: "kintex",
    address: "경기 고양시 일산서구 대화동 환승구역",
    lat: 37.6661,
    lng: 126.7483,
    category: "교통시설",
    status: "예정",
    expectedCompletion: "2027년 말 목표",
    mainUse: "환승지원시설",
    summary:
      "광역철도 환승 동선 개선 목적의 교통 프로젝트로, 사업 초기 단계 정보가 공개된 상태입니다.",
    description:
      "환승 대기 공간과 보행 연결 동선을 재정비해 혼잡을 줄이는 것을 목표로 합니다. 대규모 행사일과 출퇴근 혼잡이 겹칠 때 이동 효율을 높이는 방향으로 설계 검토가 이뤄지는 것으로 보입니다.",
    context:
      "이 구간은 전시장 방문객과 통근 수요가 동시에 몰려 병목 체감이 큰 편입니다.",
    impact:
      "완료 시 환승 대기시간 단축, 보행 분산 효과가 기대되나 실제 효과는 운영 방식에 따라 달라질 수 있습니다.",
    timelineNote:
      "현재는 예정 단계로, 허가·착공 정보가 추가될 때 일정 신뢰도가 높아집니다.",
    sources: [{ label: "고양시 교통계획 자료", url: "https://www.goyang.go.kr", type: "지자체" }],
    updatedAt: "2026-02-26",
  },
  {
    id: "p5",
    slug: "ilsan-seobu-road-upgrade",
    title: "일산 서부권 도로 입체화",
    area: "일산",
    areaSlug: "ilsan",
    address: "경기 고양시 일산서구 대화동~덕이동 구간",
    lat: 37.6852,
    lng: 126.7441,
    category: "도로·교량",
    status: "착공",
    expectedCompletion: "2028년 예정",
    permitDate: "2025-12-20",
    startDate: "2026-02-01",
    mainUse: "도로시설",
    summary:
      "병목 구간 입체화 공사로, 착공 이력이 확인되어 공사 초기 단계로 보는 것이 타당합니다.",
    description:
      "상습 정체 구간을 대상으로 교차 구조를 개선하는 프로젝트입니다. 출퇴근 혼잡 완화가 1차 목적이며, 공사 기간에는 우회 동선 안내가 중요합니다.",
    context:
      "주거지역과 상업지역을 연결하는 생활도로 성격이 강해 공사 중 체감 영향이 큽니다.",
    impact:
      "단기적으로는 통행 불편이 증가할 수 있으나, 완료 시 통행 시간 절감 가능성이 있습니다.",
    timelineNote:
      "착공 이후 세부 공정 일정은 발주처 공지와 현장 안내를 병행 확인해야 합니다.",
    sources: [{ label: "도로개선 사업 공지", url: "https://www.goyang.go.kr", type: "지자체" }],
    updatedAt: "2026-03-04",
  },
  {
    id: "p6",
    slug: "juneung-public-rental-housing",
    title: "주엽 공공임대주택 공급",
    area: "일산",
    areaSlug: "ilsan",
    address: "경기 고양시 일산서구 주엽동 999",
    lat: 37.6701,
    lng: 126.7602,
    category: "주거",
    status: "허가",
    expectedCompletion: "2029년 상반기 예정",
    permitDate: "2026-01-29",
    mainUse: "공동주택",
    grossFloorArea: 76000,
    floorsAbove: 20,
    floorsBelow: 2,
    households: 690,
    summary:
      "공공임대 중심 주택공급 계획으로 허가 단계가 확인됩니다.",
    description:
      "청년·신혼부부 수요를 반영한 임대주택 공급 프로젝트입니다. 생활SOC 연계가 주요 쟁점으로, 학교·보육·대중교통 접근성과 함께 검토됩니다.",
    context:
      "주엽 생활권은 기존 주거밀도가 높아 신규 공급이 지역 인구 구조에 의미 있는 변화를 줄 수 있습니다.",
    impact:
      "입주 시점에는 생활편의시설 수요가 증가하고, 인근 대중교통 혼잡 시간대가 바뀔 가능성이 있습니다.",
    timelineNote:
      "착공·사용승인 일정은 추후 공개 자료 업데이트가 필요합니다.",
    sources: [{ label: "공공주택 사업 정보", url: "https://www.data.go.kr", type: "공공데이터" }],
    updatedAt: "2026-03-02",
  },
  {
    id: "p7",
    slug: "gimpo-hangang2-station-area",
    title: "김포한강2 역세권 복합개발",
    area: "김포",
    areaSlug: "gimpo",
    address: "경기 김포시 마산동 역세권 예정지",
    lat: 37.6425,
    lng: 126.6318,
    category: "복합개발",
    status: "예정",
    expectedCompletion: "2030년 이후 단계적",
    mainUse: "주거·상업 복합",
    summary:
      "신규 교통축과 결합된 장기 복합개발로, 초기 계획 단계 정보가 중심입니다.",
    description:
      "주거 공급과 상업 기능을 함께 계획해 자족형 생활권을 형성하려는 사업입니다. 아직 초기 단계라 세부 블록별 일정은 유동적이며, 발표 자료를 주기적으로 확인해야 합니다.",
    context:
      "김포는 통근 수요가 높은 도시라 역세권 공급 계획이 실제 생활권 선택에 큰 영향을 미칩니다.",
    impact:
      "완공 시점에는 지역 상권 중심축이 이동할 수 있으며, 교통수요 재분배가 나타날 가능성이 큽니다.",
    timelineNote:
      "허가·착공 단계 자료가 누적되기 전까지는 예정 수준으로 이해하는 것이 안전합니다.",
    sources: [{ label: "김포시 개발 계획", url: "https://www.gimpo.go.kr", type: "지자체" }],
    updatedAt: "2026-02-25",
  },
  {
    id: "p8",
    slug: "gimpo-logistics-center-gocheon",
    title: "고촌 복합물류센터 신설",
    area: "김포",
    areaSlug: "gimpo",
    address: "경기 김포시 고촌읍 향산리 산업부지",
    lat: 37.6008,
    lng: 126.7651,
    category: "물류시설",
    status: "착공준비",
    expectedCompletion: "2027년 하반기 예상",
    permitDate: "2025-11-18",
    mainUse: "물류창고시설",
    grossFloorArea: 54000,
    floorsAbove: 6,
    floorsBelow: 1,
    summary:
      "도심 배송 수요 대응용 물류시설로, 허가 이후 착공 준비 단계로 보입니다.",
    description:
      "고촌 IC 접근성을 활용한 도시형 물류거점 계획입니다. 물류차량 동선과 소음·교통 영향 관리가 핵심 이슈로, 운영계획 공개 여부가 중요합니다.",
    context:
      "인근은 주거·상업·산업 기능이 혼재해 있어 물류시설 입지는 주민 체감도 차이가 큽니다.",
    impact:
      "준공 후 배송 효율 향상 기대가 있으나, 시간대별 차량 흐름 관리는 별도 모니터링이 필요합니다.",
    timelineNote:
      "착공 신고가 확인되면 공사중 단계로 상태를 상향 반영할 수 있습니다.",
    sources: [{ label: "건축허가 공개자료", url: "https://www.data.go.kr", type: "공공데이터" }],
    updatedAt: "2026-03-01",
  },
  {
    id: "p9",
    slug: "gimpo-pungmu-medical-facility",
    title: "풍무 생활권 종합의료시설 증축",
    area: "김포",
    areaSlug: "gimpo",
    address: "경기 김포시 풍무동 888",
    lat: 37.6143,
    lng: 126.7244,
    category: "의료시설",
    status: "공사중",
    expectedCompletion: "2027년 2분기 목표",
    permitDate: "2025-09-05",
    startDate: "2026-01-08",
    mainUse: "의료시설",
    grossFloorArea: 23000,
    floorsAbove: 10,
    floorsBelow: 2,
    summary:
      "의료서비스 확충을 위한 증축 공사로, 착공 이력이 확인되어 공사중으로 판단됩니다.",
    description:
      "응급·외래 수요 증가에 대응하기 위해 병상과 진료 공간을 확장하는 프로젝트입니다. 공사 기간 중에는 주차 동선과 일부 진료동 접근 방식이 임시 조정될 수 있습니다.",
    context:
      "풍무 생활권은 신규 주거 유입으로 의료 수요가 꾸준히 증가하는 구간입니다.",
    impact:
      "완료 후에는 진료 대기 분산 효과가 기대되며, 지역 내 의료 접근성이 개선될 가능성이 있습니다.",
    timelineNote:
      "사용승인일이 확정되기 전까지는 예정 준공시점을 참고해야 합니다.",
    sources: [{ label: "지자체 건축행정 공개", url: "https://www.gimpo.go.kr", type: "지자체" }],
    updatedAt: "2026-03-04",
  },
  {
    id: "p10",
    slug: "kintex-hotel-complex",
    title: "킨텍스권 숙박·컨벤션 복합시설",
    area: "킨텍스권",
    areaSlug: "kintex",
    address: "경기 고양시 일산서구 킨텍스 인접 상업용지",
    lat: 37.6688,
    lng: 126.7428,
    category: "숙박·상업",
    status: "허가",
    expectedCompletion: "2028년 예상",
    permitDate: "2026-02-03",
    mainUse: "관광숙박시설",
    grossFloorArea: 51000,
    floorsAbove: 18,
    floorsBelow: 4,
    summary:
      "전시장 수요 대응형 숙박·회의 복합시설로, 현재 허가 단계가 확인됩니다.",
    description:
      "행사 방문객 체류를 겨냥한 숙박·회의 공간 결합 프로젝트입니다. 행사 시즌 객실 수요 분산과 야간 상권 활성화가 주요 기대 효과로 제시됩니다.",
    context:
      "킨텍스권은 행사 일정에 따라 숙박 수요 변동이 큰 지역이라 공급 확장이 체감도가 높습니다.",
    impact:
      "준공 시 대형 행사 기간 체류 인프라가 개선될 수 있고, 인근 상업시설 매출 구조에 변화가 생길 수 있습니다.",
    timelineNote:
      "착공 공시 이후 공정 정보가 확정되며, 현재는 허가 이후 절차 진행 단계입니다.",
    sources: [{ label: "관광숙박 인허가 자료", url: "https://www.data.go.kr", type: "공공데이터" }],
    updatedAt: "2026-02-28",
  },
  {
    id: "p11",
    slug: "ilsan-lakepark-waterfront-renewal",
    title: "일산호수공원 수변 재정비",
    area: "일산",
    areaSlug: "ilsan",
    address: "경기 고양시 일산동구 장항동 호수공원권역",
    lat: 37.6573,
    lng: 126.7669,
    category: "공원·공공시설",
    status: "착공",
    expectedCompletion: "2027년 상반기",
    permitDate: "2025-10-11",
    startDate: "2026-02-15",
    mainUse: "공원시설",
    summary:
      "보행·조경·수변시설 개선 공사로 착공 단계 정보가 확인됩니다.",
    description:
      "노후 보행 동선, 야간 조명, 수변 편의시설을 정비하는 공공 프로젝트입니다. 생활형 이용 빈도가 높은 공간이라 공사 구간 안내와 단계별 개방 일정이 중요합니다.",
    context:
      "호수공원은 가족 단위 이용이 많은 생활시설로, 공사 진행 방식에 따라 체감 불편이 크게 달라질 수 있습니다.",
    impact:
      "완료 후 체류 편의성 개선이 기대되며, 주말 유동인구 흐름이 일부 재분배될 수 있습니다.",
    timelineNote:
      "공사 구간이 순환 개방될 가능성이 있어 현장 안내와 공식 공지를 함께 확인해야 합니다.",
    sources: [{ label: "공원 재정비 사업 안내", url: "https://www.goyang.go.kr", type: "지자체" }],
    updatedAt: "2026-03-05",
  },
  {
    id: "p12",
    slug: "gimpo-new-school-facility",
    title: "김포 북부권 학교복합시설 신설",
    area: "김포",
    areaSlug: "gimpo",
    address: "경기 김포시 통진읍 공공시설 예정부지",
    lat: 37.6972,
    lng: 126.5903,
    category: "교육·공공시설",
    status: "접수",
    expectedCompletion: "계획 수립 단계",
    mainUse: "교육연구시설",
    summary:
      "학교복합시설 계획이 접수 단계로 확인되며, 허가 전 검토 정보가 중심입니다.",
    description:
      "교육시설과 주민 이용 공공공간을 결합한 복합시설 제안 사업입니다. 인구 유입 대비 교육 인프라 확충 필요성이 배경으로 제시되며, 구체 규모는 추후 확정될 가능성이 큽니다.",
    context:
      "북부권은 생활SOC 밀도가 상대적으로 낮아 공공시설 공급 이슈에 대한 관심이 큰 지역입니다.",
    impact:
      "실제 추진 시 교육·돌봄 접근성이 개선될 수 있으나, 현재는 계획 접수 단계이므로 확정 정보와 구분해 해석해야 합니다.",
    timelineNote:
      "허가·착공 단계로 전환되기 전까지는 계획 단계 정보로만 참고하는 것이 적절합니다.",
    sources: [{ label: "지자체 공공시설 계획 공고", url: "https://www.gimpo.go.kr", type: "지자체" }],
    updatedAt: "2026-02-27",
  },
];

export const FAQS: FaqItem[] = [
  {
    q: "정보는 어디서 오나요?",
    a: "국토교통부·공공데이터포털·지자체 공개자료·공식 보도자료를 우선 활용합니다.",
  },
  {
    q: "정확도는 100%인가요?",
    a: "아닙니다. 원천 데이터 갱신 시차와 표기 오차가 있을 수 있어 최종 판단 전 원문 확인이 필요합니다.",
  },
  {
    q: "언제 업데이트되나요?",
    a: "정기 배치와 수동 검수를 병행합니다. 페이지 하단의 최종 업데이트 일자를 함께 확인하세요.",
  },
  {
    q: "광고가 붙나요?",
    a: "광고는 기본 비활성화되어 있으며, 서비스 품질과 콘텐츠 완성도를 우선합니다.",
  },
  {
    q: "제보할 수 있나요?",
    a: "가능합니다. 문의 페이지를 통해 지역/사업명/근거 링크를 보내주시면 검토 후 반영합니다.",
  },
];

export function getProjectBySlug(slug: string): ProjectData | undefined {
  return PROJECTS.find((item) => item.slug === slug);
}

export function getAreaBySlug(slug: string): AreaInfo | undefined {
  return AREAS.find((item) => item.slug === slug);
}

export function getProjectsByArea(areaSlug: string): ProjectData[] {
  return PROJECTS.filter((item) => item.areaSlug === areaSlug);
}
