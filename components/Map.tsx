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

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY || "";

    (async () => {
      try {
        await loadKakaoSdk(key);
        const kakao = window.kakao;
        const center = new kakao.maps.LatLng(37.6767, 126.7428);

        new kakao.maps.Map(mapRef.current, {
          center,
          level: 6,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Map init failed");
      }
    })();
  }, []);

  return (
    <main style={{ height: "100vh", width: "100%" }}>
      {error ? (
        <div style={{ padding: 12, color: "#b91c1c", background: "#fee2e2" }}>{error}</div>
      ) : null}
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
    </main>
  );
}
