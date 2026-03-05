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

function markerSvg(status: string) {
  const fill =
    status === "RECEIVED" ? "#FBBF24" :
    status === "APPROVED" ? "#3B82F6" :
    status === "IN_PROGRESS" ? "#EF4444" :
    status === "COMPLETED" ? "#10B981" : "#6B7280";

  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"36\" height=\"36\" viewBox=\"0 0 24 24\"><path fill=\"${fill}\" d=\"M12 2c-3.866 0-7 3.134-7 7c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z\"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function loadKakaoMap(appKey: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.kakao?.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  });
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [clusterer, setClusterer] = useState<any>(null);
  const [items, setItems] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [filters, setFilters] = useState<{ status?: string; category?: string }>({});

  useEffect(() => {
    (async () => {
      await loadKakaoMap(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY || "");
      const kakao = window.kakao;
      const m = new kakao.maps.Map(mapRef.current, {
        center: new kakao.maps.LatLng(37.6767, 126.7428),
        level: 6,
      });
      const cl = new kakao.maps.MarkerClusterer({ map: m, averageCenter: true, minLevel: 7 });
      setMap(m);
      setClusterer(cl);
    })();
  }, []);

  useEffect(() => {
    if (!map) return;
    const kakao = window.kakao;

    const fetchData = async () => {
      const b = map.getBounds();
      const qs = new URLSearchParams({
        south: String(b.getSouthWest().getLat()),
        west: String(b.getSouthWest().getLng()),
        north: String(b.getNorthEast().getLat()),
        east: String(b.getNorthEast().getLng()),
        level: String(map.getLevel()),
      });
      if (filters.status) qs.set("status", filters.status);
      if (filters.category) qs.set("category", filters.category);

      const res = await fetch(`/api/projects?${qs.toString()}`);
      const json = await res.json();
      setItems(json.items || []);
    };

    fetchData();
    const listener = kakao.maps.event.addListener(map, "idle", fetchData);
    return () => kakao.maps.event.removeListener(listener);
  }, [map, filters]);

  useEffect(() => {
    if (!map || !clusterer) return;
    const kakao = window.kakao;
    clusterer.clear();

    const markers = items
      .filter((p) => p.center)
      .map((p) => {
        const pos = new kakao.maps.LatLng(p.center!.lat, p.center!.lng);
        const marker = new kakao.maps.Marker({
          position: pos,
          image: new kakao.maps.MarkerImage(markerSvg(p.status), new kakao.maps.Size(36, 36), {
            offset: new kakao.maps.Point(18, 36),
          }),
        });
        kakao.maps.event.addListener(marker, "click", () => setSelected(p));
        return marker;
      });

    clusterer.addMarkers(markers);
  }, [items, map, clusterer]);

  return (
    <div className="w-full h-[calc(100vh-0px)] relative">
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 z-10">
        <LayerToggle filters={filters} onChange={setFilters} />
      </div>
      <BottomSheet project={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
