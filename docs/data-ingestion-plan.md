# 공사정보 수집 실행안 (건축 인허가/착공 중심)

## 목표
- 지도에 "공사중" 프로젝트를 안정적으로 표시
- 주소만 있는 인허가/착공 데이터도 지오코딩 후 표시
- 대형 프로젝트(예: 킨텍스 제3전시장)는 누락 방지용 큐레이션 병행

## 1순위 데이터 소스 (핵심)
- 국토교통부_건축HUB_건축인허가정보 서비스  
  https://www.data.go.kr/data/15136267/openapi.do
- 국토교통부_건축HUB_건축물대장정보 서비스  
  https://www.data.go.kr/data/15134735/openapi.do
- 국토교통부_건축HUB_주택인허가정보 서비스  
  https://www.data.go.kr/data/15136560/openapi.do

## 위치 변환(주소 -> 좌표)
- 국토교통부_지오코더 API(브이월드)  
  https://www.data.go.kr/data/15101106/openapi.do
- 카카오 로컬 API(보조)
  https://developers.kakao.com/docs/latest/ko/local/dev-guide

## 대형 프로젝트 보강
- 경기도_KINTEX 시설 현황(공공데이터)  
  https://www.data.go.kr/data/15075693/fileData.do
- 산업부 착공 보도자료(킨텍스 제3전시장)  
  https://www.motie.go.kr/kor/article/ATCL3f49a5a8c/73488/view
- 킨텍스 공식 안내  
  https://www.kintex.com/web/ko/html/company/exhibitionHall3.do

## 현재 코드 반영 상태
- 다중 API 소스 수집: `functions/index.js`
- 주소 지오코딩 + geocache 저장: `functions/index.js`
- 공사중 판정(상태/기간): `functions/index.js`
- 킨텍스 제3전시장 보강(백엔드+프론트): `functions/index.js`, `public/app.js`

## 운영 체크리스트
1. `SEOUL_OPEN_API_KEY`, `SEOUL_DATASET_NAMES`, `PUBLIC_DATA_SOURCES_JSON` 설정
2. `VWORLD_API_KEY` 또는 `KAKAO_REST_API_KEY` 설정
3. `firebase deploy --project whatinhere --only hosting,functions`
4. `POST /api/sync-public-data?token=...&dryRun=1` 결과 확인
5. `POST /api/sync-public-data?token=...` 실행 후 지도 확인

