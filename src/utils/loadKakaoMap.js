const SDK_SCRIPT_ID = "kakao-maps-sdk";
const FALLBACK_KAKAO_MAP_JS_KEY = "196acd86c9ca7b2a46f77dd0d90f11f1";

let sdkPromise = null;

export function getKakaoMapJsKey() {
  return (
    import.meta.env.VITE_KAKAO_MAP_JS_KEY ||
    import.meta.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    import.meta.env.KAKAO_MAP_JS_KEY ||
    FALLBACK_KAKAO_MAP_JS_KEY
  ).trim();
}

export function loadKakaoMap() {
  const key = getKakaoMapJsKey();

  if (!key) {
    return Promise.reject(new Error("MISSING_KAKAO_KEY"));
  }

  if (window.kakao && window.kakao.maps) {
    return Promise.resolve(window.kakao);
  }

  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = new Promise((resolve, reject) => {
    const onSdkReady = () => {
      if (!window.kakao || !window.kakao.maps) {
        reject(new Error("Failed to load Kakao Maps SDK"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    const existingScript = document.getElementById(SDK_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", onSdkReady, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Kakao Maps SDK")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.async = true;
    script.src =
      "https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=" +
      encodeURIComponent(key);
    script.onload = onSdkReady;
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
