# whatinhere (Firebase MVP)

"여기 뭐 생겨요?"는 Firebase Hosting + Firestore + Functions 기반으로
주변 공사/개발 정보를 지도에서 보여주는 서비스입니다.

## 구조

- `public/`: Leaflet 기반 프론트엔드 및 정책/안내 페이지
- `functions/`: `nearby`, `syncPublicData` API
- `firestore.rules`: 읽기 공개, 쓰기 차단(MVP)
- `firestore.indexes.json`: 조회 인덱스

## 환경 변수 (Functions)

아래 변수는 Firebase Functions 환경에 설정하세요.

- `SYNC_TOKEN`: 수동 동기화 호출 인증 토큰
- `SEOUL_OPEN_API_KEY`: 서울 열린데이터 API 키
- `SEOUL_DATASET_NAME`: 공사 데이터셋명 (기본값 `tbLnOpendataW`)
- `SEOUL_DATASET_MAX_ROWS`: 최대 동기화 건수 (기본값 `1000`)

예시:

```bash
firebase functions:config:set app.sync_token="YOUR_TOKEN"
```

실제 런타임에서 환경변수 주입 방식은 사용하는 배포 방식(Functions v1/v2)에 맞춰 설정하세요.

## 로컬/배포 전 체크

1. `public/index.html`의 애드센스 client ID를 실제 값으로 교체
2. 정책 페이지의 연락처/도메인을 실제 운영 정보로 교체
3. Firestore 인덱스가 필요한 경우 콘솔 안내에 따라 생성

## API

### 1) 주변 조회

`GET /api/nearby?lat=37.56&lng=126.97&radiusKm=2&type=all&status=construction`

- `type`: `all | building | subway | road`

### 2) 공공데이터 동기화

`POST /api/sync-public-data?token=YOUR_SYNC_TOKEN`

- 인증 토큰이 맞으면 공공데이터를 가져와 `projects` 컬렉션에 upsert

## 배포

```bash
firebase login
firebase use --add
firebase deploy
```
