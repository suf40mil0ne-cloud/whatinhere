import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentBrowserLocation, DEFAULT_MAP_CENTER, getDistanceKm, type Coordinates } from "../lib/geolocation";
import { getKakaoMapKey } from "../lib/env";
import { KakaoSdkLoadError, loadKakaoMapsSdk } from "../lib/kakao";
import type { NearbyConstructionRecord } from "../types/content";
import { CurrentLocationButton } from "./CurrentLocationButton";

const INITIAL_NEARBY_KM = 5;
const CLUSTER_THRESHOLD = 12;

interface BoundsState {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

interface ViewportState {
  center: Coordinates;
  bounds: BoundsState;
  level: number;
}

interface MarkerPoint {
  id: string;
  title: string;
  lat: number;
  lng: number;
  projects: NearbyConstructionRecord[];
  kind: "project" | "cluster";
}

interface Props {
  projects: NearbyConstructionRecord[];
  selectedProjectId: string | null;
  onSelectProject: (project: NearbyConstructionRecord) => void;
  onVisibleProjectsChange: (projects: NearbyConstructionRecord[]) => void;
  isDataLoading: boolean;
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

export function MapView({ projects, selectedProjectId, onSelectProject, onVisibleProjectsChange, isDataLoading }: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const activeViewportRef = useRef<ViewportState | null>(null);
  const markerRefs = useRef<kakao.maps.Marker[]>([]);
  const currentLocationMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const [mapError, setMapError] = useState<unknown>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationNotice, setLocationNotice] = useState("현재 위치를 확인 중입니다.");
  const [activeViewport, setActiveViewport] = useState<ViewportState | null>(null);
  const [pendingViewport, setPendingViewport] = useState<ViewportState | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [targetCenter, setTargetCenter] = useState<Coordinates>(DEFAULT_MAP_CENTER);

  const visibleProjects = useMemo(() => {
    if (!activeViewport) return [];
    return projects.filter((project) => {
      if (project.lat == null || project.lng == null) return false;
      const inBounds =
        project.lat >= activeViewport.bounds.swLat &&
        project.lat <= activeViewport.bounds.neLat &&
        project.lng >= activeViewport.bounds.swLng &&
        project.lng <= activeViewport.bounds.neLng;

      if (!inBounds) return false;
      return getDistanceKm(activeViewport.center, { lat: project.lat, lng: project.lng }) <= INITIAL_NEARBY_KM;
    });
  }, [activeViewport, projects]);

  const markerPoints = useMemo(() => {
    if (!activeViewport) return [];
    if (visibleProjects.length <= CLUSTER_THRESHOLD) {
      return visibleProjects.map<MarkerPoint>((project) => ({
        id: project.id,
        title: project.title,
        lat: project.lat!,
        lng: project.lng!,
        projects: [project],
        kind: "project",
      }));
    }

    const cellSize = activeViewport.level >= 6 ? 0.02 : 0.01;
    const grouped = new Map<string, MarkerPoint>();

    visibleProjects.forEach((project) => {
      if (project.lat == null || project.lng == null) return;
      const key = `${Math.round(project.lat / cellSize)}:${Math.round(project.lng / cellSize)}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          id: `cluster-${key}`,
          title: project.title,
          lat: project.lat,
          lng: project.lng,
          projects: [project],
          kind: "project",
        });
        return;
      }

      existing.projects.push(project);
      existing.kind = "cluster";
      existing.title = `${existing.projects.length}건`;
      existing.lat = average(existing.projects.map((item) => item.lat || 0));
      existing.lng = average(existing.projects.map((item) => item.lng || 0));
    });

    return [...grouped.values()];
  }, [activeViewport, visibleProjects]);

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
            level: mapRef.current.getLevel(),
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
        setLocationNotice("현재 위치 기준으로 주변 공사 정보를 표시합니다.");
        setTargetCenter(coords);
      })
      .catch(() => {
        setLocationNotice("위치 권한이 없어 수도권 기본 위치에서 시작합니다.");
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

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];

    markerPoints.forEach((point) => {
      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(point.lat, point.lng),
        title: point.kind === "cluster" ? `주변 공사 ${point.projects.length}건` : point.title,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        if (point.kind === "cluster") {
          map.setLevel(Math.max(2, map.getLevel() - 1));
          map.setCenter(new window.kakao.maps.LatLng(point.lat, point.lng));
          return;
        }
        onSelectProject(point.projects[0]);
      });

      markerRefs.current.push(marker);
    });
  }, [markerPoints, onSelectProject]);

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
    if (!mapRef.current || !window.kakao?.maps) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(coords.lat, coords.lng));
    mapRef.current.setLevel(5);
  }

  function handleMoveToCurrentLocation() {
    if (userLocation) {
      moveTo(userLocation);
      return;
    }

    getCurrentBrowserLocation()
      .then((coords) => {
        setUserLocation(coords);
        setLocationNotice("현재 위치로 다시 이동했습니다.");
        moveTo(coords);
      })
      .catch(() => {
        setLocationNotice("현재 위치를 가져오지 못했습니다. 브라우저 권한을 확인해 주세요.");
      });
  }

  function handleSearchThisArea() {
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
          <strong>내 주변 공사 지도</strong>
          <p>{locationNotice}</p>
        </div>
        <div className="map-toolbar-actions">
          <button type="button" className="map-action-button" onClick={handleSearchThisArea} disabled={!needsRefresh}>
            이 지역 다시 보기
          </button>
          <CurrentLocationButton onClick={handleMoveToCurrentLocation} disabled={!isMapReady} />
        </div>
      </div>
      <div className="map-summary-bar">
        <span>주변 공사 정보 {visibleProjects.length}건</span>
        <span>수도권 공공데이터 캐시 기준</span>
      </div>
      {!isMapReady || isDataLoading ? (
        <section className="map-fallback map-loading" aria-live="polite">
          <strong>지도를 준비하고 있습니다.</strong>
          <p>현재 위치와 수도권 공공데이터를 불러오는 중입니다.</p>
          <div className="map-skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : null}
      {isMapReady && !isDataLoading && visibleProjects.length === 0 ? (
        <section className="map-empty-state" aria-live="polite">
          이 주변에서 현재 표시 가능한 공사 정보가 없습니다.
        </section>
      ) : null}
      <div className="home-map" ref={mapElementRef} aria-label="내 주변 공사 지도" />
    </div>
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasViewportChanged(current: ViewportState, next: ViewportState): boolean {
  const latDiff = Math.abs(current.center.lat - next.center.lat);
  const lngDiff = Math.abs(current.center.lng - next.center.lng);
  return latDiff > 0.0005 || lngDiff > 0.0005 || current.level !== next.level;
}
