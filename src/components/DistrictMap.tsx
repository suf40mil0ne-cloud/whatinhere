import { useEffect, useMemo, useRef, useState } from "react";
import incheonGeoJson from "../data/districts/incheon-emd.json";
import gyeonggiGeoJson from "../data/districts/gyeonggi-emd.json";
import seoulGeoJson from "../data/districts/seoul-emd.json";
import { getKakaoMapKey } from "../lib/env";
import { KakaoSdkLoadError, loadKakaoMapsSdk } from "../lib/kakao";
import type { AptApiResponse, AptRecord, DistrictApiResponse, DistrictRecord } from "../lib/district-types";
import type { Coordinates } from "../lib/geolocation";
import type { MapViewport } from "../lib/project-utils";

interface GeoFeature {
  properties: {
    adm_cd: string;
    adm_nm: string;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface Props {
  currentLocation: Coordinates | null;
  currentLocationRequest: number;
  onViewportChange: (viewport: MapViewport) => void;
  onDistrictsChange: (districts: DistrictRecord[]) => void;
  onSelectDistrict: (district: DistrictRecord) => void;
  selectedDistrictId: string | null;
  onSelectApt: (apt: AptRecord) => void;
  selectedAptId: string | null;
}

const ALL_FEATURES = [
  ...(seoulGeoJson.features as GeoFeature[]),
  ...(gyeonggiGeoJson.features as GeoFeature[]),
  ...(incheonGeoJson.features as GeoFeature[]),
];

function getMapErrorMessage(error: unknown): string {
  if (error instanceof KakaoSdkLoadError && error.code === "MISSING_API_KEY") {
    return "카카오맵 키가 없어 지도를 불러올 수 없습니다.";
  }
  return "지도를 불러오지 못했습니다.";
}

function colorForScore(score: number): string {
  if (score >= 80) return "#2d6a4f";
  if (score >= 60) return "#52b788";
  if (score >= 40) return "#f4a261";
  return "#e76f51";
}

function toLatLngPath(coords: number[][]): any[] {
  return coords.map(([lng, lat]) => new window.kakao.maps.LatLng(lat, lng));
}

async function fetchDistricts(bounds: MapViewport["bounds"]): Promise<DistrictRecord[]> {
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
  const response = await fetch(`/api/districts?bbox=${encodeURIComponent(bbox)}`);
  if (!response.ok) throw new Error(`district api ${response.status}`);
  const payload = await response.json() as DistrictApiResponse;
  return payload.districts;
}

async function fetchApts(bounds: MapViewport["bounds"]): Promise<AptRecord[]> {
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
  const res = await fetch(`/api/apartments?bbox=${encodeURIComponent(bbox)}`);
  if (!res.ok) return [];
  const data = await res.json() as AptApiResponse;
  return data.apts;
}

function aptColor(score: number): string {
  if (score >= 80) return "#2d6a4f";
  if (score >= 60) return "#52b788";
  if (score >= 40) return "#f4a261";
  return "#e76f51";
}

function createAptOverlay(apt: AptRecord, map: kakao.maps.Map, onClick: () => void): any {
  const color = aptColor(apt.scores.value);
  const div = document.createElement("div");
  div.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.4)`;
  div.addEventListener("click", onClick);
  const overlay = new (window.kakao.maps as any).CustomOverlay({
    position: new window.kakao.maps.LatLng(apt.lat!, apt.lng!),
    content: div,
    map,
  });
  return overlay;
}

export function DistrictMap({
  currentLocation,
  currentLocationRequest,
  onViewportChange,
  onDistrictsChange,
  onSelectDistrict,
  selectedDistrictId,
  onSelectApt,
}: Props) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const districtMapRef = useRef<Map<string, DistrictRecord>>(new Map());
  const polygonRefs = useRef<Map<string, any[]>>(new Map());
  const currentLocationMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const aptOverlaysRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(7);

  const features = useMemo(() => ALL_FEATURES, []);

  useEffect(() => {
    const apiKey = getKakaoMapKey();
    loadKakaoMapsSdk(apiKey)
      .then(() => {
        if (!mapElementRef.current || mapRef.current) return;
        const center = currentLocation ?? { lat: 37.5665, lng: 126.978 };
        const map = new window.kakao.maps.Map(mapElementRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level: 7,
        });
        mapRef.current = map;

        const polygons = new Map<string, any[]>();
        for (const feature of features) {
          const groups = feature.geometry.type === "Polygon"
            ? [feature.geometry.coordinates as number[][][]]
            : (feature.geometry.coordinates as number[][][][]);
          const featurePolygons = groups.map((group) => {
            const polygon = new (window.kakao.maps as any).Polygon({
              path: toLatLngPath(group[0]),
              strokeWeight: 1,
              strokeColor: "#6c584c",
              strokeOpacity: 0.55,
              fillColor: "#f0ede7",
              fillOpacity: 0.12,
            });
            window.kakao.maps.event.addListener(polygon, "click", () => {
              const district = districtMapRef.current.get(feature.properties.adm_cd);
              if (district) onSelectDistrict(district);
            });
            return polygon;
          });
          polygons.set(feature.properties.adm_cd, featurePolygons);
        }
        polygonRefs.current = polygons;

        const sync = async () => {
          const bounds = map.getBounds();
          const centerPoint = map.getCenter();
          const level = map.getLevel();
          setZoom(level);
          const viewport = {
            center: { lat: centerPoint.getLat(), lng: centerPoint.getLng() },
            bounds: {
              south: bounds.getSouthWest().getLat(),
              west: bounds.getSouthWest().getLng(),
              north: bounds.getNorthEast().getLat(),
              east: bounds.getNorthEast().getLng(),
            },
            level,
          } satisfies MapViewport;
          onViewportChange(viewport);
          setIsLoading(true);
          try {
            if (level >= 14) {
              // Hide polygons
              for (const shapes of polygonRefs.current.values()) {
                for (const shape of shapes) {
                  shape.setMap(null);
                }
              }
              // Remove existing apt overlays
              for (const overlay of aptOverlaysRef.current) {
                overlay.setMap(null);
              }
              aptOverlaysRef.current = [];
              // Fetch and render apt markers
              const apts = await fetchApts(viewport.bounds);
              const newOverlays: any[] = [];
              for (const apt of apts) {
                if (apt.lat == null || apt.lng == null) continue;
                const overlay = createAptOverlay(apt, map, () => onSelectApt(apt));
                newOverlays.push(overlay);
              }
              aptOverlaysRef.current = newOverlays;
            } else {
              // Remove apt overlays
              for (const overlay of aptOverlaysRef.current) {
                overlay.setMap(null);
              }
              aptOverlaysRef.current = [];
              // Show polygons (existing behavior)
              const districts = await fetchDistricts(viewport.bounds);
              districtMapRef.current = new Map(districts.map((district) => [district.code, district]));
              onDistrictsChange(districts);
              for (const [admCd, shapes] of polygonRefs.current.entries()) {
                const district = districtMapRef.current.get(admCd);
                for (const shape of shapes) {
                  shape.setMap(district ? map : null);
                  shape.setOptions({
                    fillColor: district ? colorForScore(district.scores.overall) : "#f0ede7",
                    fillOpacity: district ? 0.72 : 0.08,
                    strokeWeight: district && admCd === selectedDistrictId ? 3 : 1,
                    strokeColor: district && admCd === selectedDistrictId ? "#1b4332" : "#6c584c",
                  });
                }
              }
            }
          } catch (error) {
            console.error("district-fetch-failed", error);
          } finally {
            setIsLoading(false);
          }
        };

        window.kakao.maps.event.addListener(map, "idle", () => { void sync(); });
        void sync();
        setMapError(null);
      })
      .catch((error) => {
        console.error("district-map-load-failed", error);
        setMapError(getMapErrorMessage(error));
      });
  }, [currentLocation, features, onDistrictsChange, onSelectDistrict, onSelectApt, onViewportChange, selectedDistrictId]);

  useEffect(() => {
    const map = mapRef.current;
    const element = mapElementRef.current;
    if (!map || !element) return;
    const relayout = () => {
      const center = map.getCenter();
      const relayoutMap = map as unknown as { relayout?: () => void };
      relayoutMap.relayout?.();
      map.setCenter(center);
    };
    relayout();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => relayout());
    observer?.observe(element);
    window.addEventListener("resize", relayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", relayout);
    };
  }, [mapError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentLocation) return;
    currentLocationMarkerRef.current?.setMap(null);
    currentLocationMarkerRef.current = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(currentLocation.lat, currentLocation.lng),
      title: "현재 위치",
    });
    map.setCenter(new window.kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
    map.setLevel(6);
  }, [currentLocation, currentLocationRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (zoom >= 14) return;
    for (const [admCd, shapes] of polygonRefs.current.entries()) {
      const district = districtMapRef.current.get(admCd);
      for (const shape of shapes) {
        shape.setOptions({
          strokeWeight: district && admCd === selectedDistrictId ? 3 : 1,
          strokeColor: district && admCd === selectedDistrictId ? "#1b4332" : "#6c584c",
        });
      }
    }
  }, [selectedDistrictId, zoom]);

  if (mapError) {
    return <section className="district-map-fallback">{mapError}</section>;
  }

  return (
    <section className="district-map-shell">
      {isLoading ? <div className="district-map-loading">동네스탯 불러오는 중</div> : null}
      <div ref={mapElementRef} className="district-map-canvas" />
    </section>
  );
}
