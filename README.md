# 여기 뭐 생겨요? MVP

한국 공공데이터 기반 지도 서비스 MVP입니다.

- 프론트엔드: Vite + React + TypeScript
- 지도: Kakao Maps JavaScript SDK
- 백엔드: Cloudflare Workers + D1
- 데이터 전략: 전국 공통 + 지자체 확장(Source Adapter 패턴)

## 1. 폴더 구조

```text
.
├─ index.html
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  ├─ api/client.ts
│  ├─ components/
│  │  ├─ MapView.tsx
│  │  ├─ SearchBox.tsx
│  │  ├─ Filters.tsx
│  │  └─ DetailPanel.tsx
│  ├─ types/
│  │  ├─ project.ts
│  │  └─ kakao.d.ts
│  └─ utils/
│     ├─ loadKakaoMap.ts
│     └─ humanize.ts
├─ worker/
│  └─ src/
│     ├─ index.ts
│     ├─ api/
│     │  ├─ http.ts
│     │  ├─ projects.ts
│     │  └─ admin.ts
│     ├─ db/
│     │  ├─ schema.sql
│     │  └─ repository.ts
│     ├─ normalize/
│     │  ├─ status.ts
│     │  ├─ address.ts
│     │  ├─ dedupe.ts
│     │  └─ projectBuilder.ts
│     ├─ sources/
│     │  ├─ registry.ts
│     │  ├─ common.ts
│     │  ├─ developmentPermitFetcher.ts
│     │  ├─ buildingBasicFetcher.ts
│     │  ├─ buildingHubFetcher.ts
│     │  └─ localFileParser.ts
│     ├─ services/
│     │  ├─ syncService.ts
│     │  └─ geocode.ts
│     ├─ mock/sampleData.ts
│     ├─ types.ts
│     └─ utils/{hash.ts,id.ts}
├─ wrangler.toml
├─ vite.config.ts
├─ tsconfig.json
├─ .env.example
└─ package.json
```

## 2. 데이터 소스 전략

### 1차 전국 공통 (기본 마커)
- `dev-permit-openapi`
- 국토교통부 도시계획 개발행위허가정보서비스

### 2차 상세 보강
- `building-basic-openapi`
- 전국건축인허가기본정보표준데이터
- `building-hub-openapi`
- 국토교통부 건축HUB 건축인허가정보

### 3차 지자체 보강
- `local-csv-upload`
- 지자체 CSV/XLSX 업로드 어댑터 (MVP는 CSV 즉시 파싱, XLSX는 CSV 변환 권장)

## 3. DB 스키마

D1 스키마: `worker/src/db/schema.sql`

주요 테이블
- `source_registry`
- `raw_ingest`
- `normalized_projects`
- `project_status_history`

## 4. API

- `GET /api/projects?bbox=swLng,swLat,neLng,neLat&zoom=...&status=...&use=...&sort=...`
- `GET /api/projects/:id`
- `GET /api/search?q=...`
- `POST /api/admin/sync/source/:sourceId`
- `POST /api/admin/sync/all`

관리 API는 `ADMIN_TOKEN`이 있으면 `Authorization: Bearer <token>` 필요.

## 5. 핵심 로직

### 상태 정규화
`worker/src/normalize/status.ts`
- 접수 / 허가 / 착공준비 / 착공 / 공사중 / 사용승인 / 준공/완료 / 정보부족

### 중복 병합
`worker/src/normalize/dedupe.ts`
- 주소 유사도
- 허가일 근접
- 용도 유사
- 면적/층수 유사
- 좌표 근접

### 사용자 친화 문구
`src/utils/humanize.ts`
- 행정 용어를 일반 사용자 문장으로 변환
- 사실/추정 문구 분리

## 6. 로컬 실행

```bash
npm install
npm run dev
```

- 프론트: `http://localhost:5173`
- 워커(API): `http://localhost:8787`

## 7. 환경변수

`.env` 또는 Cloudflare 환경변수에 설정

```env
# frontend
VITE_KAKAO_MAP_JS_KEY=...
VITE_API_BASE_URL=

# backend
DATA_GO_KR_SERVICE_KEY=...
KAKAO_REST_API_KEY=...
ADMIN_TOKEN=...
```

Worker 로컬 실행(`wrangler dev`)은 `.dev.vars`를 사용한다.  
빠른 시작:

```bash
cp .dev.vars.example .dev.vars
```

Kakao JS 키 자동 탐색 순서
1. `VITE_KAKAO_MAP_JS_KEY`
2. `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`
3. `KAKAO_MAP_JS_KEY`

## 8. Cloudflare 배포

### Pages (Frontend)
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Env: `VITE_KAKAO_MAP_JS_KEY`, `VITE_API_BASE_URL`

### Workers (API)
- `wrangler.toml`에서 D1 binding 설정
- 배포
```bash
npm run deploy:worker
```

### D1 마이그레이션
```bash
npm run db:migrate
```

## 9. 자주 발생하는 문제

### Kakao SDK 로드 실패
- 도메인 미등록 또는 키 오설정
- Kakao Developers > 플랫폼 > Web 도메인 확인

### 일부 데이터 미표시
- 원천 데이터 필드 불일치/누락
- 보강 소스 동기화 필요: `/api/admin/sync/all`

### 전국 데이터 품질 차이
- MVP는 전국 공통 + 지자체 확장 구조
- 서울/경기/인천 등 권역별 source adapter를 추가해 고도화
