let sdkPromise: Promise<typeof window.kakao> | null = null;

function resolveKakaoKey(): string {
  // 다양한 배포 환경에서 사용할 수 있도록 key 이름을 순차적으로 탐색한다.
  return (
    import.meta.env.VITE_KAKAO_MAP_JS_KEY ||
    import.meta.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    import.meta.env.KAKAO_MAP_JS_KEY ||
    ""
  ).trim();
}

export function getKakaoKeyOrThrow(): string {
  const key = resolveKakaoKey();
  if (!key) {
    throw new Error(
      "카카오 JavaScript 키가 설정되지 않았습니다. Cloudflare Pages Settings → Environment Variables 에 VITE_KAKAO_MAP_JS_KEY 를 추가하세요."
    );
  }
  return key;
}

export function loadKakaoMap(): Promise<typeof window.kakao> {
  const key = getKakaoKeyOrThrow();

  // 이미 SDK가 로드되어 있으면 즉시 재사용한다.
  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }
  // 동시 다발적인 로드 요청을 하나의 Promise로 합쳐 중복 삽입을 방지한다.
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("kakao-maps-sdk") as HTMLScriptElement | null;

    const onReady = () => {
      // script load 이벤트가 와도 kakao 객체가 없을 수 있어 이중 검증한다.
      if (!window.kakao?.maps) {
        reject(new Error("Failed to load Kakao Maps SDK"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Kakao Maps SDK")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = "kakao-maps-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(key)}`;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
