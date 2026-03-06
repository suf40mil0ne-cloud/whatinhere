const SDK_SCRIPT_ID = "kakao-maps-sdk";
const SDK_TIMEOUT_MS = 10_000;

export class KakaoSdkLoadError extends Error {
  code: "MISSING_API_KEY" | "SCRIPT_LOAD_FAILED" | "TIMEOUT" | "KAKAO_UNAVAILABLE" | "KAKAO_MAPS_UNAVAILABLE";

  constructor(
    code: "MISSING_API_KEY" | "SCRIPT_LOAD_FAILED" | "TIMEOUT" | "KAKAO_UNAVAILABLE" | "KAKAO_MAPS_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "KakaoSdkLoadError";
    this.code = code;
  }
}

let sdkPromise: Promise<typeof window.kakao> | null = null;

function resolveLoadedKakao(resolve: (value: typeof window.kakao) => void, reject: (reason?: unknown) => void) {
  if (!window.kakao) {
    reject(new KakaoSdkLoadError("KAKAO_UNAVAILABLE", "Kakao SDK script loaded but window.kakao is missing."));
    return;
  }

  if (!window.kakao.maps) {
    reject(new KakaoSdkLoadError("KAKAO_MAPS_UNAVAILABLE", "Kakao SDK script loaded but window.kakao.maps is missing."));
    return;
  }

  window.kakao.maps.load(() => resolve(window.kakao));
}

export function loadKakaoMapsSdk(apiKey: string | null): Promise<typeof window.kakao> {
  if (!apiKey) {
    return Promise.reject(
      new KakaoSdkLoadError(
        "MISSING_API_KEY",
        "Missing Kakao Maps API key. Expected VITE_KAKAO_MAP_JS_KEY or VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY."
      )
    );
  }

  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<typeof window.kakao>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new KakaoSdkLoadError("TIMEOUT", "Timed out while loading Kakao Maps SDK."));
    }, SDK_TIMEOUT_MS);

    const safeResolve = (value: typeof window.kakao) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const safeReject = (reason: unknown) => {
      window.clearTimeout(timeoutId);
      reject(reason);
    };

    const existingScript = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolveLoadedKakao(safeResolve, safeReject), { once: true });
      existingScript.addEventListener(
        "error",
        () => safeReject(new KakaoSdkLoadError("SCRIPT_LOAD_FAILED", "Failed to load Kakao Maps SDK script.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolveLoadedKakao(safeResolve, safeReject);
    script.onerror = () => {
      safeReject(new KakaoSdkLoadError("SCRIPT_LOAD_FAILED", "Failed to load Kakao Maps SDK script."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
