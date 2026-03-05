# whatinhere (Firebase MVP)

"여기 뭐 생겨요?"는 Firebase Hosting + Firestore + Functions 기반으로
주변 공사/개발 정보를 지도에서 보여주는 서비스입니다.

## 구조

- `public/`: Leaflet 기반 프론트엔드 및 정책/안내 페이지
- `functions/`: `nearby`, `syncPublicData`, `syncPublicDataDaily` API/배치
- `firestore.rules`: 읽기 공개, 쓰기 차단(MVP)
- `firestore.indexes.json`: 조회 인덱스

## 환경 변수 (Functions)

아래 변수는 Firebase Functions 환경에 설정하세요.

- `SYNC_TOKEN`: 수동 동기화 호출 인증 토큰
- `SEOUL_OPEN_API_KEY`: 서울 열린데이터 API 키
- `SEOUL_DATASET_NAMES`: 서울 데이터셋명 목록(쉼표 구분)
- `SEOUL_DATASET_MAX_ROWS`: 소스별 최대 동기화 건수 (기본값 `1000`)
- `PUBLIC_DATA_SOURCES_JSON`: 추가 공공데이터 JSON 소스 목록
- `VWORLD_API_KEY`: 브이월드 지오코딩 키(주소 -> 좌표)
- `KAKAO_REST_API_KEY`: 카카오 로컬 REST 키(지오코딩 보조)
- `GEOCODER_PROVIDER_ORDER`: 지오코더 우선순위(기본 `vworld,kakao`)
- `REBUILD_TILES_ON_SYNC`: 동기화 후 타일캐시 재빌드 여부 (`true|false`)

`syncPublicDataDaily`는 `Asia/Seoul` 기준 매일 03:30에 자동 실행됩니다.

## 추천 수집 방안 (공사 진행중 데이터)

데이터가 비어 있지 않게 하려면 단일 소스가 아닌 다중 소스를 쓰는 것이 안전합니다.

1. 서울 열린데이터: 좌표 포함 공사/개발 관련 데이터셋 1개 이상
2. data.go.kr OpenAPI(JSON): `_type=json`으로 조회 가능한 공사/인허가/기반시설 진행 정보
3. 동기화 시 서버에서 `진행상태 + 기간(착공~준공예정)`를 결합해 `status=construction`만 저장
4. 핵심 대형 프로젝트(예: 킨텍스 제3전시장)는 큐레이션 데이터로 보강해 누락을 방지
5. `nearby` 응답에도 킨텍스 제3전시장 보강 데이터가 포함되어 지도에서 즉시 확인 가능

실행안 문서: `docs/data-ingestion-plan.md`

## `PUBLIC_DATA_SOURCES_JSON` 예시

```json
[
  {
    "name": "datago:metro-construction",
    "url": "https://api.example.go.kr/getConstructionList?serviceKey=YOUR_KEY&pageNo=1&numOfRows=1000&_type=json",
    "rowPaths": ["response.body.items.item"],
    "linkTemplate": "https://api.example.go.kr/detail?prjId={PRJ_ID}"
  },
  {
    "name": "datago:road-work",
    "url": "https://api.example.go.kr/getRoadWork?serviceKey=YOUR_KEY&pageNo=1&numOfRows=1000&_type=json",
    "rowPaths": ["response.body.items.item", "items"]
  }
]
```

빠른 적용:

```bash
cd /home/user/whatinhere
PUBLIC_JSON_MINIFIED=$(tr -d '\n' < public-data-sources.sample.json)
firebase functions:config:set app.public_data_sources_json="$PUBLIC_JSON_MINIFIED"
```

`public-data-sources.sample.json`에서 각 `url`을 실제 data.go.kr 엔드포인트로 교체한 뒤 적용하세요.

## API

### 1) 주변 조회

`GET /api/nearby?lat=37.56&lng=126.97&radiusKm=2&type=all&status=construction`

- `type`: `all | building | subway | road`

### 2) 공공데이터 동기화 (수동)

`POST /api/sync-public-data?token=YOUR_SYNC_TOKEN`

선택 파라미터:
- `source`: 특정 소스만 동기화 (`source` 이름 정확히 일치)
- `dryRun=1`: 저장 없이 수집/필터링 결과 리포트 확인

예시:

```bash
curl -X POST "https://<YOUR_DOMAIN>/api/sync-public-data?token=YOUR_SYNC_TOKEN"
curl -X POST "https://<YOUR_DOMAIN>/api/sync-public-data?token=YOUR_SYNC_TOKEN&dryRun=1"
```

### 3) 지도 프로젝트 조회 (tiles_cache 기반)

`GET /api/projects?south=...&west=...&north=...&east=...&level=6&status=IN_PROGRESS&category=공공`

### 4) 프로젝트 상세 조회

`GET /api/project-detail?id=<projectId>`

### 5) 타일 캐시 수동 재구축

`POST /api/rebuild-tiles-cache?token=YOUR_SYNC_TOKEN&limit=6000`

## 배포

```bash
firebase login
firebase use --add
firebase deploy
```
