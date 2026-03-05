# whatinhere

"여기 뭐 생겨요?" 정적 `index` 기반 웹앱 저장소입니다.

## 구조

- `index.html`, `app.js`, `styles.css`: 정적 메인 앱(루트 실행용)
- `public/index.html`, `public/app.js`, `public/styles.css`: Firebase Hosting 실제 배포 파일
- `public/about.html`, `public/privacy.html`, `public/contact.html`, `public/disclaimer.html`: 고정 안내 페이지
- `functions/src/index.ts` 및 `functions/src/etl/*`: Nearby/Projects API + 데이터 동기화 함수
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`: Firebase 설정

## 로컬 확인

```bash
npm run serve
```

기본 URL: `http://localhost:8080`

## 배포

```bash
npm run deploy:hosting
```

전체(Firebase Hosting + Functions) 배포:

```bash
npm run deploy
```

## Functions 환경변수

아래 값들을 Functions 환경에 설정하세요.

- `DATA_GO_KR_SERVICE_KEY`
- `KAKAO_REST_API_KEY`
- `DEV_PERMIT_BASE_URL`
- `BUILD_PERMIT_BASE_URL`
