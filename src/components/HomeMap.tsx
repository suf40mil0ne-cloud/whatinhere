import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import type { ProjectData } from "../types/content";
import { loadKakaoMap } from "../utils/loadKakaoMap";

interface Props {
  projects: ProjectData[];
  selectedSlug?: string;
  onSelect: (slug: string) => void;
}

export function HomeMap({ projects, selectedSlug, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null);
  const markerRef = useRef<kakao.maps.Marker[]>([]);

  const center = useMemo(() => {
    if (!projects.length) return { lat: 37.6686, lng: 126.7452 };
    const first = projects.find((p) => p.slug === selectedSlug) || projects[0];
    return { lat: first.lat, lng: first.lng };
  }, [projects, selectedSlug]);

  useEffect(() => {
    loadKakaoMap()
      .then((kakao) => {
        if (!mapRef.current || mapInstanceRef.current) return;
        mapInstanceRef.current = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 5,
        });
      })
      .catch((error) => {
        console.error("map load failed", error);
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

  if (!projects.length) {
    return (
      <div className="empty-result">
        <p>검색 결과가 없습니다.</p>
        <p>추천: <Link to="/area/kintex">킨텍스권</Link>, <Link to="/area/ilsan">일산</Link>, <Link to="/area/gimpo">김포</Link></p>
      </div>
    );
  }

  return <div className="home-map" ref={mapRef} aria-label="공사 개발 지도" />;
}
