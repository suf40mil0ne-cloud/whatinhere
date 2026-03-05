# whatinhere

"여기 뭐 생겨요?" Firebase Studio MVP 저장소입니다.

## Firebase Studio 구조

- `app/page.tsx`
- `app/api/projects/route.ts`
- `app/api/projects/[id]/route.ts`
- `components/MapView.tsx`
- `components/BottomSheet.tsx`
- `components/LayerToggle.tsx`
- `lib/types.ts`

- `functions/src/index.ts`
- `functions/src/shared/http.ts`
- `functions/src/shared/firestore.ts`
- `functions/src/etl/normalize.ts`
- `functions/src/etl/geocode.ts`
- `functions/src/etl/dedup.ts`
- `functions/src/etl/devPermit.ts`
- `functions/src/etl/buildPermit.ts`
- `functions/src/etl/grid.ts`
- `functions/src/etl/tilesCache.ts`

- `firestore.rules`
- `firestore.indexes.json`

## .env.local 예시 (Next.js)

실제 값은 각자 발급한 키로 입력하세요.

```bash
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=YOUR_KAKAO_JS_KEY

NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

## Functions 환경변수

아래 값들을 Functions 환경에 설정하세요.

- `DATA_GO_KR_SERVICE_KEY`
- `KAKAO_REST_API_KEY`
- `DEV_PERMIT_BASE_URL`
- `BUILD_PERMIT_BASE_URL`

## Firestore 규칙/인덱스

- `projects` + `projects/{id}/events`: read 허용, write 금지
- `tiles_cache`: read 허용, write 금지
- `records`: read/write 금지

인덱스는 아래 쿼리 조합을 포함합니다.

- `projects(status ASC, last_updated_at DESC)`
- `projects(category ASC, last_updated_at DESC)`
- `projects(status ASC, category ASC, last_updated_at DESC)`
- `records(projectId ASC, issued_at DESC)`

## 배포 참고

```bash
firebase deploy --project whatinhere --only hosting
```

Cloudflare Pages를 사용 중이면 `main` 브랜치 푸시로 자동 배포되도록 설정합니다.

## Cloudflare Pages (Next.js) 설정

현재 저장소에는 Next.js App Router 코드가 포함되어 있습니다.
Cloudflare Pages에서 이 코드를 배포하려면 프로젝트 설정에서 다음을 사용하세요.

- Framework preset: `Next.js`
- Build command: `npm run build`
- Build output directory: `.next`

필수 환경변수(Cloudflare Pages > Settings > Environment variables):

- `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
