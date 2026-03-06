declare global {
  interface Window {
    kakao?: any;
    __APP_CONFIG__?: {
      KAKAO_MAP_JS_KEY?: string;
    };
  }

  namespace kakao.maps {
    class Map {
      constructor(container: HTMLElement, options: Record<string, unknown>);
      getBounds(): LatLngBounds;
      getCenter(): LatLng;
      getLevel(): number;
      panTo(latLng: LatLng): void;
      setCenter(latLng: LatLng): void;
      setLevel(level: number): void;
    }

    class Marker {
      constructor(options: Record<string, unknown>);
      setMap(map: Map | null): void;
    }

    class CustomOverlay {
      constructor(options: Record<string, unknown>);
      setMap(map: Map | null): void;
    }

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    namespace event {
      function addListener(target: unknown, type: string, handler: () => void): void;
    }

    function load(callback: () => void): void;
  }
}

export {};
