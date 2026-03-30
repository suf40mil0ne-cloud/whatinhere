import { useEffect, useState } from "react";
import { getCurrentBrowserLocation, DEFAULT_MAP_CENTER, type Coordinates } from "../lib/geolocation";
import type { MapViewport } from "../lib/project-utils";

const SUPPORTED_DATA_BOUNDS = {
  south: 33,
  west: 124,
  north: 39.5,
  east: 132,
};

function isWithinSupportedDataBounds(coords: Coordinates): boolean {
  return (
    coords.lat >= SUPPORTED_DATA_BOUNDS.south &&
    coords.lat <= SUPPORTED_DATA_BOUNDS.north &&
    coords.lng >= SUPPORTED_DATA_BOUNDS.west &&
    coords.lng <= SUPPORTED_DATA_BOUNDS.east
  );
}

export function useMapState(isHomePage: boolean) {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [searchedViewport, setSearchedViewport] = useState<MapViewport | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationRequestId, setLocationRequestId] = useState(0);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Trigger initial geolocation on home page mount
  useEffect(() => {
    if (!isHomePage) return;
    void handleUseCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHomePage]);

  // Seed searchedViewport from the first viewport reported by the map
  useEffect(() => {
    if (!viewport || searchedViewport) return;
    setSearchedViewport(viewport);
  }, [viewport, searchedViewport]);

  async function handleUseCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const coords = await getCurrentBrowserLocation();
      if (isWithinSupportedDataBounds(coords)) {
        setCurrentLocation(coords);
      } else {
        setCurrentLocation(DEFAULT_MAP_CENTER);
        setLocationError("현재 위치 주변에는 준비된 공공데이터가 없어 수도권 기본 위치로 시작합니다.");
      }
      setLocationRequestId((value) => value + 1);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "현재 위치를 가져오지 못했습니다.");
      setCurrentLocation(DEFAULT_MAP_CENTER);
      setLocationRequestId((value) => value + 1);
    } finally {
      setIsLocating(false);
    }
  }

  function handleViewportChange(nextViewport: MapViewport) {
    setViewport(nextViewport);
  }

  function handleSearchThisArea() {
    if (!viewport) return;
    setSearchedViewport(viewport);
  }

  return {
    viewport,
    searchedViewport,
    currentLocation,
    locationRequestId,
    isLocating,
    locationError,
    handleUseCurrentLocation,
    handleViewportChange,
    handleSearchThisArea,
  };
}
