import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentBrowserLocation, DEFAULT_MAP_CENTER, getDistanceKm, type Coordinates } from "../lib/geolocation";
import { getKakaoMapKey } from "../lib/env";
import { KakaoSdkLoadError, loadKakaoMapsSdk } from "../lib/kakao";
import type { ProjectRecord } from "../types/content";
import { CurrentLocationButton } from "./CurrentLocationButton";

interface BoundsState {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

interface ViewportState {
  center: Coordinates;
  bounds: BoundsState;
}

interface Props {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  onSelectProject: (project: ProjectRecord) => void;
  onVisibleProjectsChange: (projects: ProjectRecord[]) => void;
  radiusMode: "1km" | "3km" | "5km" | "bounds";
}

function getFallbackMessage(error: unknown): { title: string; description: string; detail: string | null } {
  if (error instanceof KakaoSdkLoadError) {
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

function getRadiusKm(mode: Props["radiusMode"]): number | null {
  if (mode === "1km") return 1;
  if (mode === "3km") return 3;
  if (mode === "5km") return 5;
  return null;
}

export function MapView({ projects, selectedProjectId, onSelectProject, onVisibleProjectsChange, radiusMode }: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const activeViewportRef = useRef<ViewportState | null>(null);
  const projectMarkersRef = useRef<Array<{ marker: kakao.maps.Marker; project: ProjectRecord }>>([]);
  const currentLocationMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const [mapError, setMapError] = useState<unknown>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>("현재 위치를 확인 중입니다.");
  const [activeViewport, setActiveViewport] = useState<ViewportState | null>(null);
  const [pendingViewport, setPendingViewport] = useState<ViewportState | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [targetCenter, setTargetCenter] = useState<Coordinates>(DEFAULT_MAP_CENTER);

  const visibleProjects = useMemo(() => {
    const viewport = activeViewport;
    if (!viewport) return [];

    const radiusKm = getRadiusKm(radiusMode);

    const next = projects.filter((project) => {
      if (project.lat == null || project.lng == null) return false;

      if (radiusKm != null) {
        return getDistanceKm(viewport.center, { lat: project.lat, lng: project.lng }) <= radiusKm;
      }

      return (
        project.lat >= viewport.bounds.swLat &&
        project.lat <= viewport.bounds.neLat &&
        project.lng >= viewport.bounds.swLng &&
        project.lng <= viewport.bounds.neLng
      );
    });

    return next;
  }, [activeViewport, projects, radiusMode]);

  useEffect(() => {
    onVisibleProjectsChange(visibleProjects);
  }, [onVisibleProjectsChange, visibleProjects]);

  useEffect(() => {
    activeViewportRef.current = activeViewport;
  }, [activeViewport]);

  useEffect(() => {
    const apiKey = getKakaoMapKey();
    loadKakaoMapsSdk(apiKey)
      .then((kakao) => {
        if (!mapElementRef.current || mapRef.current) return;

        mapRef.current = new kakao.maps.Map(mapElementRef.current, {
          center: new kakao.maps.LatLng(targetCenter.lat, targetCenter.lng),
          level: 5,
        });

        kakao.maps.event.addListener(mapRef.current, "idle", () => {
          if (!mapRef.current) return;
          const center = mapRef.current.getCenter();
          const bounds = mapRef.current.getBounds();
          const nextViewport = {
            center: { lat: center.getLat(), lng: center.getLng() },
            bounds: {
              swLat: bounds.getSouthWest().getLat(),
              swLng: bounds.getSouthWest().getLng(),
              neLat: bounds.getNorthEast().getLat(),
              neLng: bounds.getNorthEast().getLng(),
            },
          };

          setPendingViewport(nextViewport);
          setNeedsRefresh((current) => {
            if (!activeViewportRef.current) {
              setActiveViewport(nextViewport);
              return false;
            }
            return hasViewportChanged(activeViewportRef.current, nextViewport);
          });
        });

        setMapError(null);
        setIsMapReady(true);
      })
      .catch((error) => {
        console.error("kakao-map-load-failed", error);
        setMapError(error);
      });
  }, [targetCenter]);

  useEffect(() => {
    getCurrentBrowserLocation()
      .then((coords) => {
        setUserLocation(coords);
        setLocationNotice("현재 위치를 기준으로 주변 공공데이터를 표시하고 있습니다.");
        setTargetCenter(coords);
      })
      .catch(() => {
        setLocationNotice("위치 권한이 없어 기본 위치에서 시작합니다. 지도를 이동해 다시 검색할 수 있습니다.");
        setTargetCenter(DEFAULT_MAP_CENTER);
      });
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(targetCenter.lat, targetCenter.lng));
  }, [targetCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    projectMarkersRef.current.forEach(({ marker }) => marker.setMap(null));
    projectMarkersRef.current = [];

    visibleProjects.forEach((project) => {
      if (project.lat == null || project.lng == null) return;

      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(project.lat, project.lng),
        title: project.title,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        onSelectProject(project);
      });

      projectMarkersRef.current.push({ marker, project });
    });
  }, [visibleProjects, onSelectProject]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps || !userLocation) return;

    currentLocationMarkerRef.current?.setMap(null);
    currentLocationMarkerRef.current = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
      title: "현재 위치",
    });
  }, [userLocation, isMapReady]);

  useEffect(() => {
    const selected = visibleProjects.find((project) => project.id === selectedProjectId);
    const map = mapRef.current;
    if (!selected || !map || selected.lat == null || selected.lng == null || !window.kakao?.maps) return;
    map.panTo(new window.kakao.maps.LatLng(selected.lat, selected.lng));
  }, [selectedProjectId, visibleProjects]);

  function moveTo(coords: Coordinates) {
    setTargetCenter(coords);
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    map.setCenter(new window.kakao.maps.LatLng(coords.lat, coords.lng));
    map.setLevel(5);
  }

  function handleMoveToCurrentLocation() {
    if (userLocation) {
      moveTo(userLocation);
      return;
    }

    getCurrentBrowserLocation()
      .then((coords) => {
        setUserLocation(coords);
        setLocationNotice("현재 위치를 기준으로 지도를 다시 이동했습니다.");
        moveTo(coords);
      })
      .catch((error) => {
        console.error("geolocation-failed", error);
        setLocationNotice("현재 위치를 가져오지 못했습니다. 브라우저 권한을 확인해 주세요.");
      });
  }

  function applySearchHere() {
    if (!pendingViewport) return;
    setActiveViewport(pendingViewport);
    setNeedsRefresh(false);
  }

  if (mapError) {
    const fallback = getFallbackMessage(mapError);
    return (
      <section className="map-fallback" aria-live="polite">
        <strong>{fallback.title}</strong>
        <p>{fallback.description}</p>
        {fallback.detail ? <p className="map-fallback-detail">{fallback.detail}</p> : null}
      </section>
    );
  }

  return (
    <div className="map-stage">
      <div className="map-toolbar">
        <div>
          <strong>내 주변 지도</strong>
          <p>{locationNotice}</p>
        </div>
        <div className="map-toolbar-actions">
          <button type="button" className="map-action-button" onClick={applySearchHere} disabled={!needsRefresh}>
            이 지역 다시 검색
          </button>
          <CurrentLocationButton onClick={handleMoveToCurrentLocation} disabled={!isMapReady} />
        </div>
      </div>
      <div className="map-summary-bar">
        <span>현재 표시 중인 공공데이터 {visibleProjects.length}건</span>
        <span>좌표가 없는 데이터는 지도에서 제외됩니다.</span>
      </div>
      {!isMapReady ? (
        <section className="map-fallback map-loading" aria-live="polite">
          <strong>지도를 준비하고 있습니다.</strong>
          <p>카카오맵과 주변 공공데이터를 불러오는 중입니다.</p>
        </section>
      ) : null}
      <div className="home-map" ref={mapElementRef} aria-label="주변 공사 개발 지도" />
    </div>
  );
}

function hasViewportChanged(current: ViewportState, next: ViewportState): boolean {
  const latDiff = Math.abs(current.center.lat - next.center.lat);
  const lngDiff = Math.abs(current.center.lng - next.center.lng);
  return latDiff > 0.0005 || lngDiff > 0.0005;
}
