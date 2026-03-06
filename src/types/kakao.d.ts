declare global {
  interface Window {
    kakao?: any;
  }

  namespace kakao.maps {
    class Map {
      constructor(container: HTMLElement, options: Record<string, unknown>);
      getBounds(): LatLngBounds;
      getLevel(): number;
      setCenter(latLng: LatLng): void;
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
