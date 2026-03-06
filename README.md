# 여기 뭐 생겨요? (초기 버전)

카카오맵 기반으로 주변 공사/개발/도시계획 샘플 정보를 보여주는 정적 웹사이트입니다.

## 1) 로컬 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 Vite 안내 주소(기본 `http://localhost:5173`)로 접속합니다.

## 2) .env 파일 작성 예시

프로젝트 루트에 `.env` 파일을 생성하고 아래 둘 중 하나를 설정하세요.

```env
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=여기에_카카오_JS_키
# 또는
KAKAO_MAP_JS_KEY=여기에_카카오_JS_키
```

## 3) Cloudflare Pages 배포 방법

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`
  - 또는 `KAKAO_MAP_JS_KEY`

배포 후 키 변경 시 `Clear build cache` 후 재배포를 권장합니다.

## 4) Kakao Developers Web 도메인 등록이 필요한 이유

Kakao Maps JavaScript SDK는 등록된 웹 도메인에서만 정상 호출됩니다.
도메인이 등록되지 않으면 SDK 로드가 실패할 수 있습니다.

Kakao Developers > 내 애플리케이션 > 플랫폼 > Web 에 아래 도메인을 등록하세요.
- `https://whatsinhere.pages.dev`
- 커스텀 도메인 사용 시 해당 도메인도 추가

## 5) 자주 발생하는 오류와 해결법

### Failed to load Kakao Maps SDK
- 원인: 도메인 미등록, 키 오입력, 서비스 비활성화
- 해결: Kakao Developers의 Web 도메인/서비스 상태 확인, 키 재확인

### JavaScript 키 누락
- 증상: `카카오 JavaScript 키가 설정되지 않았습니다.`
- 해결: Cloudflare Pages 또는 `.env`에 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` 또는 `KAKAO_MAP_JS_KEY` 설정

### 등록되지 않은 도메인
- 원인: 배포 도메인이 Kakao 플랫폼에 없음
- 해결: 플랫폼 > Web 도메인에 정확한 배포 URL 등록

### dist 폴더 배포 문제
- 원인: Build command/output directory 오설정
- 해결:
  - Build command: `npm run build`
  - Build output directory: `dist`

## 프로젝트 구조

```text
.
├─ index.html
├─ src/
│  ├─ main.js
│  ├─ map.js
│  ├─ data.js
│  └─ style.css
├─ .env.example
├─ package.json
└─ .gitignore
```
