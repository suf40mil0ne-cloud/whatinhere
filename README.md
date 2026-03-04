# whatinhere (Firebase MVP)

Firebase Hosting + Firestore + Functions 기반으로 주변 공사/프로젝트를 지도에 표시하는 MVP입니다.

## 구조

- `public/`: 웹 프론트엔드 (Google Maps)
- `functions/`: `nearby` 반경 검색 API
- `firestore.rules`: 읽기 공개, 쓰기 차단(MVP)
- `firestore.indexes.json`: 상태/최신순 인덱스

## 실행 준비

1. `public/index.html`에서 `YOUR_MAPS_API_KEY`를 실제 키로 교체
2. `public/app.js`에서 `YOUR_FUNCTIONS_NEARBY_URL`을 배포 URL로 교체
3. Firestore에 `projects` 컬렉션 문서 추가

## 배포

```bash
firebase login
firebase use --add
firebase deploy
```
