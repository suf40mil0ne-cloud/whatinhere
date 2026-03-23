import { useEffect, useRef, useState } from "react";
import { getKakaoMapKey } from "../lib/env";
import { type Coordinates } from "../lib/geolocation";
import { KakaoSdkLoadError, loadKakaoMapsSdk } from "../lib/kakao";
import type { ProjectItem } from "../lib/project-types";
import { formatProjectPeriod, getCategoryLabel, getStatusLabel, type MapViewport } from "../lib/project-utils";

interface Props {
  projects: ProjectItem[];
  selectedProjectId: string | null;
  currentLocation: Coordinates | null;
  currentLocationRequest: number;
  onSelectProject: (project: ProjectItem) => void;
  onViewportChange: (viewport: MapViewport) => void;
}

function getMapErrorMessage(error: unknown): string {
  if (error instanceof KakaoSdkLoadError && error.code === "MISSING_API_KEY") {
    return "카카오맵 키가 없어 목록 모드로 표시합니다.";
  }

  return "지도를 불러오지 못했습니다. 목록 모드로 표시합니다.";
}

export function MapView({
  projects,
  selectedProjectId,
  currentLocation,
  currentLocationRequest,
  onSelectProject,
  onViewportChange,
}: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerRefs = useRef<kakao.maps.Marker[]>([]);
  const currentLocationMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const lastPannedProjectIdRef = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = getKakaoMapKey();

    loadKakaoMapsSdk(apiKey)
      .then((kakao) => {
        if (!mapElementRef.current || mapRef.current) return;

        const center = currentLocation ?? { lat: 37.5665, lng: 126.978 };
        const map = new kakao.maps.Map(mapElementRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 6,
        });

        mapRef.current = map;
        kakao.maps.event.addListener(map, "idle", () => {
          const bounds = map.getBounds();
          const centerPoint = map.getCenter();
          onViewportChange({
            center: { lat: centerPoint.getLat(), lng: centerPoint.getLng() },
            bounds: {
              south: bounds.getSouthWest().getLat(),
              west: bounds.getSouthWest().getLng(),
              north: bounds.getNorthEast().getLat(),
              east: bounds.getNorthEast().getLng(),
            },
            level: map.getLevel(),
          });
        });

        setMapError(null);
      })
      .catch((error) => {
        console.error("map-load-failed", error);
        setMapError(getMapErrorMessage(error));
      });
  }, [currentLocation, onViewportChange]);

  useEffect(() => {
    const map = mapRef.current;
    const element = mapElementRef.current;
    if (!map || !element || !window.kakao?.maps) return;

    let frameId = 0;
    const relayout = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const center = map.getCenter();
        map.relayout();
        map.setCenter(center);
      });
    };

    relayout();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => relayout());
    resizeObserver?.observe(element);
    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", relayout);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", relayout);
      window.removeEventListener("orientationchange", relayout);
    };
  }, [mapError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];

    projects.forEach((project) => {
      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(project.latitude, project.longitude),
        title: project.name,
      });

      window.kakao.maps.event.addListener(marker, "click", () => onSelectProject(project));
      markerRefs.current.push(marker);
    });
  }, [onSelectProject, projects]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps || !currentLocation) return;

    currentLocationMarkerRef.current?.setMap(null);
    currentLocationMarkerRef.current = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(currentLocation.lat, currentLocation.lng),
      title: "현재 위치",
    });
  }, [currentLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps || !currentLocation) return;

    map.setCenter(new window.kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
    map.setLevel(6);
  }, [currentLocation, currentLocationRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (!selectedProjectId) {
      lastPannedProjectIdRef.current = null;
      return;
    }

    if (lastPannedProjectIdRef.current === selectedProjectId) {
      return;
    }

    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    if (!selectedProject) return;

    map.panTo(new window.kakao.maps.LatLng(selectedProject.latitude, selectedProject.longitude));
    lastPannedProjectIdRef.current = selectedProjectId;
  }, [projects, selectedProjectId]);

  if (mapError) {
    return (
      <section className="map-card">
        <div className="map-fallback">
          <strong>{mapError}</strong>
          <p>마커 대신 현재 범위의 프로젝트 목록을 확인할 수 있습니다.</p>
        </div>
        <div className="fallback-list">
          {projects.map((project) => (
            <button key={project.id} type="button" className="fallback-item" onClick={() => onSelectProject(project)}>
              <strong>{project.name}</strong>
              <span>
                {getCategoryLabel(project.category)} · {getStatusLabel(project.status)}
              </span>
              <span>{formatProjectPeriod(project)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="map-card">
      <div ref={mapElementRef} className="map-canvas" />
    </section>
  );
}
