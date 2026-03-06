import { useEffect, useRef } from "react";
import type { Project } from "../types/project";
import { loadKakaoMap } from "../utils/loadKakaoMap";

type BoundsPayload = { bbox: string; zoom: number };

interface Props {
  projects: Project[];
  onSelect: (projectId: string) => void;
  onBoundsChanged: (payload: BoundsPayload) => void;
  onMapError: (message: string) => void;
}

interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  count: number;
  projectId?: string;
}

function clusterProjects(projects: Project[], zoom: number): ClusterPoint[] {
  const valid = projects.filter((p) => p.lat !== null && p.lng !== null);
  // 충분히 확대된 경우 개별 마커를 그대로 보여준다.
  if (zoom >= 9) {
    return valid.map((p) => ({
      id: p.project_id,
      lat: p.lat as number,
      lng: p.lng as number,
      count: 1,
      projectId: p.project_id,
    }));
  }

  // 축척이 작을수록 큰 격자를 사용해 화면 혼잡을 줄인다.
  const cell = zoom <= 6 ? 0.04 : 0.02;
  const grouped = new Map<string, ClusterPoint>();

  valid.forEach((p) => {
    const lat = p.lat as number;
    const lng = p.lng as number;
    const key = `${Math.round(lat / cell)}:${Math.round(lng / cell)}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { id: key, lat, lng, count: 1, projectId: p.project_id });
      return;
    }

    existing.lat = (existing.lat * existing.count + lat) / (existing.count + 1);
    existing.lng = (existing.lng * existing.count + lng) / (existing.count + 1);
    existing.count += 1;
    existing.projectId = undefined;
  });

  return [...grouped.values()];
}

export function MapView({ projects, onSelect, onBoundsChanged, onMapError }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<kakao.maps.Map | null>(null);
  const overlays = useRef<Array<kakao.maps.Marker | kakao.maps.CustomOverlay>>([]);
  const boundsHandlerRef = useRef(onBoundsChanged);

  useEffect(() => {
    boundsHandlerRef.current = onBoundsChanged;
  }, [onBoundsChanged]);

  useEffect(() => {
    let active = true;

    loadKakaoMap()
      .then((kakao) => {
        if (!active || !mapRef.current || mapInstance.current) return;

        mapInstance.current = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(37.6686, 126.7452),
          level: 5,
        });

        kakao.maps.event.addListener(mapInstance.current, "idle", () => {
          const bounds = mapInstance.current?.getBounds();
          const level = mapInstance.current?.getLevel() ?? 5;
          if (!bounds) return;

          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          // 지도 이동/확대가 끝난 시점의 bounds만 서버 조회에 사용한다.
          boundsHandlerRef.current({
            bbox: `${sw.getLng()},${sw.getLat()},${ne.getLng()},${ne.getLat()}`,
            zoom: 14 - level,
          });
        });
      })
      .catch((error) => {
        console.error(error);
        const reason = error instanceof Error ? error.message : "알 수 없는 오류";
        onMapError(
          `카카오맵을 불러오지 못했습니다.\n- 원인: ${reason}\n- 확인: VITE_KAKAO_MAP_JS_KEY / Kakao Developers 도메인 등록`
        );
      });

    return () => {
      active = false;
    };
  }, [onMapError]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !window.kakao?.maps) return;

    overlays.current.forEach((m) => {
      if ("setMap" in m) m.setMap(null);
    });
    overlays.current = [];

    const level = 14 - map.getLevel();
    const points = clusterProjects(projects, level);

    points.forEach((point) => {
      // count=1이면 일반 마커, 그 외에는 사용자 정의 클러스터 오버레이를 사용한다.
      if (point.count === 1 && point.projectId) {
        const marker = new window.kakao.maps.Marker({
          map,
          position: new window.kakao.maps.LatLng(point.lat, point.lng),
        });
        window.kakao.maps.event.addListener(marker, "click", () => onSelect(point.projectId!));
        overlays.current.push(marker);
        return;
      }

      const content = `<div class="cluster-marker">${point.count}</div>`;
      const overlay = new window.kakao.maps.CustomOverlay({
        map,
        position: new window.kakao.maps.LatLng(point.lat, point.lng),
        content,
        yAnchor: 0.5,
      });
      overlays.current.push(overlay);
    });
  }, [projects, onSelect]);

  return <div id="map" ref={mapRef} className="map" />;
}
