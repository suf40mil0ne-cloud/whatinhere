"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import LayerToggle from "./LayerToggle";
import BottomSheet from "./BottomSheet";

declare global {
  interface Window {
    kakao: any;
  }
}

type Filters = {
  status?: string;
  category?: string;
};

function loadKakaoMap(appKey: string): Promise<void> {
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  });
}

function markerSvg(status: string): string {
  const fill =
    status === "RECEIVED"
      ? "#FBBF24"
      : status === "APPROVED"
        ? "#3B82F6"
        : status === "IN_PROGRESS"
          ? "#EF4444"
          : status === "COMPLETED"
            ? "#10B981"
            : "#6B7280";

  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"36\" height=\"36\" viewBox=\"0 0 24 24\"><path fill=\"${fill}\" d=\"M12 2c-3.866 0-7 3.134-7 7c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z\"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [clusterer, setClusterer] = useState<any>(null);
  const [items, setItems] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY || "";

    (async () => {
      try {
        await loadKakaoMap(key);
        const kakao = window.kakao;

        const mapInstance = new kakao.maps.Map(mapContainerRef.current, {
          center: new kakao.maps.LatLng(37.6767, 126.7428),
          level: 6,
        });

        const markerClusterer = new kakao.maps.MarkerClusterer({
          map: mapInstance,
          averageCenter: true,
          minLevel: 7,
        });

        setMap(mapInstance);
        setClusterer(markerClusterer);
      } catch (e) {
        setError(e instanceof Error ? e.message : "map init failed");
      }
    })();
  }, []);

  useEffect(() => {
    if (!map) return;
    const kakao = window.kakao;

    const fetchProjects = async () => {
      const bounds = map.getBounds();
      const south = bounds.getSouthWest().getLat();
      const west = bounds.getSouthWest().getLng();
      const north = bounds.getNorthEast().getLat();
      const east = bounds.getNorthEast().getLng();
      const level = map.getLevel();

      const qs = new URLSearchParams({
        south: String(south),
        west: String(west),
        north: String(north),
        east: String(east),
        level: String(level),
      });

      if (filters.status) qs.set("status", filters.status);
      if (filters.category) qs.set("category", filters.category);

      const res = await fetch(`/api/projects?${qs.toString()}`);
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    };

    fetchProjects();
    const listener = kakao.maps.event.addListener(map, "idle", fetchProjects);

    return () => {
      kakao.maps.event.removeListener(listener);
    };
  }, [map, filters]);

  useEffect(() => {
    if (!map || !clusterer) return;

    const kakao = window.kakao;
    clusterer.clear();

    const markers = items
      .filter((item) => item.center && Number.isFinite(item.center.lat) && Number.isFinite(item.center.lng))
      .map((item) => {
        const position = new kakao.maps.LatLng(item.center!.lat, item.center!.lng);
        const markerImage = new kakao.maps.MarkerImage(markerSvg(item.status), new kakao.maps.Size(36, 36), {
          offset: new kakao.maps.Point(18, 36),
        });

        const marker = new kakao.maps.Marker({ position, image: markerImage });
        kakao.maps.event.addListener(marker, "click", () => setSelected(item));
        return marker;
      });

    clusterer.addMarkers(markers);
  }, [map, clusterer, items]);

  return (
    <div className="relative h-screen w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 z-10">
        <LayerToggle filters={filters} onChange={setFilters} />
      </div>

      {error ? (
        <div className="absolute left-3 top-24 z-20 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow">
          {error}
        </div>
      ) : null}

      <BottomSheet project={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
