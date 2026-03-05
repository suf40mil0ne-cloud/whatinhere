"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    kakao?: any;
  }
}

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!appKey) {
      reject(new Error("NEXT_PUBLIC_KAKAO_MAP_JS_KEY is missing"));
      return;
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve());
      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao?.maps.load(() => resolve());
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  });
}

export default function Map(): JSX.Element {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    const key = (window as Window & { __KAKAO_MAP_JS_KEY__?: string }).__KAKAO_MAP_JS_KEY__ || "";

    (async () => {
      try {
        await loadKakaoSdk(key);
        const kakao = window.kakao;
        const center = new kakao.maps.LatLng(37.6767, 126.7428);

        new kakao.maps.Map(mapRef.current, {
          center,
          level: 6,
        });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Map init failed");
      }
    })();
  }, []);

  return (
    <main style={{ height: "100vh", width: "100%" }}>
      {error ? (
        <div style={{ padding: 12, color: "#b91c1c", background: "#fee2e2", lineHeight: 1.5 }}>
          {error}
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Cloudflare Pages Settings &gt; Environment variables 에
            `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` 또는 `KAKAO_MAP_JS_KEY`를 추가하고
            `Clear build cache + Redeploy` 하세요.
          </div>
        </div>
      ) : null}
      <div ref={mapRef} style={{ height: ready || !error ? "100%" : "calc(100% - 80px)", width: "100%" }} />
    </main>
  );
}
