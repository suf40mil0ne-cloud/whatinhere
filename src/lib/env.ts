function normalizeEnvValue(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null") return null;

  return trimmed;
}

type KakaoKeySource = "VITE_KAKAO_MAP_JS_KEY" | "VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY" | "window.__APP_CONFIG__.KAKAO_MAP_JS_KEY";

interface KakaoKeyResolution {
  key: string | null;
  source: KakaoKeySource | null;
}

export function getKakaoMapKey(): string | null {
  return resolveKakaoMapKey().key;
}

export function resolveKakaoMapKey(): KakaoKeyResolution {
  const sources: Array<[KakaoKeySource, unknown]> = [
    ["VITE_KAKAO_MAP_JS_KEY", import.meta.env.VITE_KAKAO_MAP_JS_KEY],
    ["VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY", import.meta.env.VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY],
    ["window.__APP_CONFIG__.KAKAO_MAP_JS_KEY", window.__APP_CONFIG__?.KAKAO_MAP_JS_KEY],
  ];

  for (const [source, raw] of sources) {
    const key = normalizeEnvValue(raw);
    if (!key) continue;

    if (import.meta.env.DEV) {
      console.info(`[kakao-env] map key source: ${source}`);
    }

    return { key, source };
  }

  if (import.meta.env.DEV) {
    console.info("[kakao-env] map key source: none");
  }

  return { key: null, source: null };
}
