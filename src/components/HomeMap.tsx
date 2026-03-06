import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData } from "../types/content";
import { getKakaoMapKey } from "../lib/env";
import { KakaoSdkLoadError, loadKakaoMapsSdk } from "../lib/kakao";

interface Props {
  projects: ProjectData[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
}

function toMapFallbackMessage(error: unknown): { title: string; description: string; detail: string | null } {
  if (error instanceof KakaoSdkLoadError) {
    if (error.code === "MISSING_API_KEY") {
      return {
        title: "지도를 불러오지 못했습니다.",
        description: "카카오맵 API 키가 설정되지 않았거나 SDK 로드에 실패했습니다.",
        detail: import.meta.env.DEV
          ? "개발 환경 확인: VITE_KAKAO_MAP_JS_KEY 또는 VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY 값을 설정하세요."
          : null,
      };
    }

    return {
      title: "지도를 불러오지 못했습니다.",
      description: "카카오맵 API 키가 설정되지 않았거나 SDK 로드에 실패했습니다.",
      detail: import.meta.env.DEV ? error.message : null,
    };
  }

  return {
    title: "지도를 불러오지 못했습니다.",
    description: "카카오맵 API 키가 설정되지 않았거나 SDK 로드에 실패했습니다.",
    detail: import.meta.env.DEV && error instanceof Error ? error.message : null,
  };
}

export function HomeMap({ projects, selectedSlug, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null);
  const markerRef = useRef<kakao.maps.Marker[]>([]);
  const [mapError, setMapError] = useState<unknown>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const center = useMemo(() => {
    if (!projects.length) return { lat: 37.6686, lng: 126.7452 };
    const first = projects.find((p) => p.slug === selectedSlug) || projects[0];
    return { lat: first.lat, lng: first.lng };
  }, [projects, selectedSlug]);

  useEffect(() => {
    const apiKey = getKakaoMapKey();

    loadKakaoMapsSdk(apiKey)
      .then((kakao) => {
        if (!mapRef.current || mapInstanceRef.current) return;
        mapInstanceRef.current = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 5,
        });
        setMapError(null);
        setIsMapReady(true);
      })
      .catch((error) => {
        console.error("kakao-map-load-failed", error);
        setMapError(error);
        setIsMapReady(false);
      });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;

    markerRef.current.forEach((marker) => marker.setMap(null));
    markerRef.current = [];

    projects.forEach((project) => {
      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(project.lat, project.lng),
        title: project.title,
      });

      const content = `
        <div class="map-tooltip">
          <strong>${project.title}</strong>
          <p>${project.status} · ${project.expectedCompletion}</p>
          <a href="/project/${project.slug}">상세 보기</a>
        </div>
      `;
      const overlay = new window.kakao.maps.CustomOverlay({
        content,
        position: new window.kakao.maps.LatLng(project.lat, project.lng),
        yAnchor: 1.5,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        onSelect(project.slug);
        overlay.setMap(map);
      });

      markerRef.current.push(marker);
    });

    map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [projects, center.lat, center.lng, onSelect]);

  if (mapError) {
    const fallback = toMapFallbackMessage(mapError);

    return (
      <section className="map-fallback" aria-live="polite">
        <strong>{fallback.title}</strong>
        <p>{fallback.description}</p>
        {fallback.detail ? <p className="map-fallback-detail">{fallback.detail}</p> : null}
      </section>
    );
  }

  if (!projects.length) {
    return (
      <div className="empty-result">
        <p>검색 결과가 없습니다.</p>
        <p>추천 지역에서 최근 추가 프로젝트를 먼저 살펴보세요.</p>
      </div>
    );
  }

  return (
    <div className="home-map-shell">
      {!isMapReady ? (
        <section className="map-fallback map-loading" aria-live="polite">
          <strong>지도를 준비하고 있습니다.</strong>
          <p>주변 공사·개발 위치를 불러오는 중입니다.</p>
        </section>
      ) : null}
      <div className="home-map" ref={mapRef} aria-label="공사 개발 지도" />
    </div>
  );
}
