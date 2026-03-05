(function () {
  const KAKAO_MAP_JS_KEY = "196acd86c9ca7b2a46f77dd0d90f11f1";
  const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_JS_KEY}&autoload=false`;

  function ensureKakaoSdk() {
    return new Promise((resolve, reject) => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => resolve(window.kakao));
        return;
      }

      const existing = document.getElementById("kakao-maps-sdk");
      if (existing) {
        existing.addEventListener("load", () => window.kakao.maps.load(() => resolve(window.kakao)), { once: true });
        existing.addEventListener("error", () => reject(new Error("Kakao Maps SDK script load error")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "kakao-maps-sdk";
      script.async = true;
      script.src = KAKAO_SDK_URL;
      script.onload = () => {
        if (!window.kakao || !window.kakao.maps) {
          reject(new Error("Kakao Maps SDK unavailable"));
          return;
        }
        window.kakao.maps.load(() => resolve(window.kakao));
      };
      script.onerror = () => reject(new Error("Kakao Maps SDK script load error"));
      document.head.appendChild(script);
    });
  }

  function createMap(containerId, lat, lng, level) {
    const container = document.getElementById(containerId);
    return new window.kakao.maps.Map(container, {
      center: new window.kakao.maps.LatLng(lat, lng),
      level,
    });
  }

  function createMarker(map, lat, lng, title) {
    return new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(lat, lng),
      title: title || "",
    });
  }

  function setCenter(map, lat, lng) {
    map.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }

  function addMarkerClick(marker, handler) {
    window.kakao.maps.event.addListener(marker, "click", handler);
  }

  window.MapRuntime = {
    ensureKakaoSdk,
    createMap,
    createMarker,
    setCenter,
    addMarkerClick,
  };
})();
