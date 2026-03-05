let map;
let userMarker = null;
let markers = [];
let wheelHandlerBound = false;
let wheelGestureActive = false;
let wheelGestureTimer = null;

const defaultCenter = { lat: 37.6686, lng: 126.7440 };
const defaultLevel = 5;

const KAKAO_MAP_JS_KEY = "YOUR_KAKAO_JS_KEY";
const FUNCTIONS_NEARBY_URL_CANDIDATES = [
  "/api/nearby",
  "https://us-central1-whatinhere.cloudfunctions.net/nearby",
  "https://asia-northeast3-whatinhere.cloudfunctions.net/nearby",
];

const TYPE_LABELS = {
  all: "전체",
  building: "건물",
  subway: "지하철/철도",
  road: "도로/교량",
};

const HIGHLIGHT_PROJECTS = [
  {
    id: "highlight-kintex-hall3",
    name: "킨텍스 제3전시장 건립공사",
    type: "building",
    status: "construction",
    address: "경기 고양시 일산서구 킨텍스로 217-60 인근(제1전시장 주차장·제2전시장 서측 부지)",
    lat: 37.6679,
    lng: 126.7454,
    startDate: "2025-10-23",
    endDateEst: "2028-12-31",
    endDateEstText: "2028-12-31",
    source: "curated-public:kintex3",
  },
];

document.addEventListener("DOMContentLoaded", initMap);

function loadKakaoMap() {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => resolve());
      return;
    }

    const key = window.KAKAO_MAP_JS_KEY || KAKAO_MAP_JS_KEY;
    if (!key || key.includes("YOUR_")) {
      reject(new Error("Kakao JavaScript 키가 설정되지 않았습니다."));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("Kakao Maps SDK 로딩 실패"));
    document.head.appendChild(script);
  });
}

async function initMap() {
  try {
    await loadKakaoMap();
  } catch (e) {
    renderError(String(e.message || e));
    return;
  }

  const center = new window.kakao.maps.LatLng(defaultCenter.lat, defaultCenter.lng);
  map = new window.kakao.maps.Map(document.getElementById("map"), {
    center,
    level: defaultLevel,
  });

  map.setZoomable(false);
  setupDiscreteWheelZoom();

  document.getElementById("btnRefresh").addEventListener("click", fetchNearby);
  document.getElementById("btnLocate").addEventListener("click", () => locateMe(true));
  document.getElementById("typeFilter").addEventListener("change", fetchNearby);

  locateMe(false);
}

function setupDiscreteWheelZoom() {
  if (wheelHandlerBound) return;
  wheelHandlerBound = true;

  const container = document.getElementById("map");
  container.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!map) return;

      if (!wheelGestureActive) {
        wheelGestureActive = true;
        const current = map.getLevel();
        const next = ev.deltaY < 0 ? Math.max(1, current - 1) : Math.min(14, current + 1);
        map.setLevel(next, { animate: false });
      }

      if (wheelGestureTimer) clearTimeout(wheelGestureTimer);
      wheelGestureTimer = setTimeout(() => {
        wheelGestureActive = false;
      }, 450);
    },
    { passive: false }
  );
}

function locateMe(alsoFetch) {
  if (!navigator.geolocation) {
    if (alsoFetch) fetchNearby();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setUserLocation(lat, lng);
      map.setCenter(new window.kakao.maps.LatLng(lat, lng));
      map.setLevel(4);
      fetchNearby();
    },
    () => {
      map.setCenter(new window.kakao.maps.LatLng(defaultCenter.lat, defaultCenter.lng));
      map.setLevel(defaultLevel);
      fetchNearby();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function setUserLocation(lat, lng) {
  const p = new window.kakao.maps.LatLng(lat, lng);
  if (!userMarker) {
    userMarker = new window.kakao.maps.Marker({
      position: p,
      title: "내 위치",
    });
    userMarker.setMap(map);
  } else {
    userMarker.setPosition(p);
  }
}

async function fetchNearby() {
  clearMarkers();

  const center = map.getCenter();
  const lat = center.getLat();
  const lng = center.getLng();
  const radiusKm = Number(document.getElementById("radius").value || 2);

  setLoading(true);

  try {
    const data = await fetchNearbyWithFallback({ lat, lng, radiusKm, type: "all" });
    const items = mergeHighlightProjects(data.items || [], { lat, lng });
    renderList(items);
    renderMarkers(items);
    renderSyncInfo(items);
  } catch (e) {
    console.error(e);
    const fallbackItems = mergeHighlightProjects([], { lat, lng });
    renderList(fallbackItems);
    renderMarkers(fallbackItems);
    renderDetail(fallbackItems[0]);
    setSyncInfoError("API 연결 오류로 핵심 프로젝트를 우선 표시합니다.");
  } finally {
    setLoading(false);
  }
}

async function fetchNearbyWithFallback({ lat, lng, radiusKm, type }) {
  let lastError = null;

  for (const endpoint of FUNCTIONS_NEARBY_URL_CANDIDATES) {
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lng", String(lng));
      url.searchParams.set("radiusKm", String(radiusKm));
      url.searchParams.set("status", "construction");
      url.searchParams.set("type", type);

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`API error: ${resp.status} (${endpoint})`);

      const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) throw new Error(`Non-JSON response (${endpoint})`);

      return await resp.json();
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("No nearby API endpoint available");
}

function renderMarkers(items) {
  items.forEach((it) => {
    const marker = new window.kakao.maps.Marker({
      position: new window.kakao.maps.LatLng(it.lat, it.lng),
      title: it.name,
    });
    marker.setMap(map);

    window.kakao.maps.event.addListener(marker, "click", () => renderDetail(it));
    markers.push(marker);
  });
}

function renderList(items) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="item"><div class="name">주변 공사 정보가 없습니다</div><div class="meta">반경/위치를 바꿔보세요.</div></div>';
    return;
  }

  items.forEach((it) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="name">${escapeHtml(it.name)}</div>
      <div class="meta">준공(예정): ${escapeHtml(it.endDateEstText || it.endDateEst || "정보없음")}</div>
      <div class="dist">거리 ${it.distanceKm}km</div>
    `;
    el.addEventListener("click", () => {
      map.setCenter(new window.kakao.maps.LatLng(it.lat, it.lng));
      map.setLevel(Math.min(map.getLevel(), 3));
      renderDetail(it);
    });
    list.appendChild(el);
  });

  renderDetail(items[0]);
}

function renderDetail(it) {
  const detail = document.getElementById("detail");
  detail.classList.remove("empty");
  detail.innerHTML = `
    <div class="detail-title">${escapeHtml(it.name)}</div>
    <div class="detail-grid">
      <div><b>유형</b>: ${escapeHtml(typeLabel(it.type))}</div>
      <div><b>착공</b>: ${escapeHtml(it.startDate || "정보없음")}</div>
      <div><b>준공(예정)</b>: ${escapeHtml(it.endDateEstText || it.endDateEst || "정보없음")}</div>
    </div>
  `;
}

function renderSyncInfo(items) {
  const el = document.getElementById("syncInfo");
  if (!items.length) {
    el.textContent = "현재 반경 내 데이터가 없습니다.";
    return;
  }

  const dates = items
    .map((it) => toDateSafe(it.sourceFetchedAt) || toDateSafe(it.updatedAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  if (!dates.length) {
    el.textContent = "동기화 시각 정보가 아직 없습니다.";
    return;
  }

  el.textContent = `최근 동기화: ${dates[0].toLocaleString("ko-KR")}`;
}

function setSyncInfoError(msg) {
  const el = document.getElementById("syncInfo");
  el.textContent = msg;
}

function renderError(msg) {
  const detail = document.getElementById("detail");
  detail.classList.add("empty");
  detail.innerHTML = `에러: ${escapeHtml(msg)}`;
}

function setLoading(isLoading) {
  const btn = document.getElementById("btnRefresh");
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "조회 중..." : "주변 조회";
}

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

function mergeHighlightProjects(items, { lat, lng }) {
  const merged = [...items];
  const keys = new Set(items.map((it) => `${it.name}|${it.lat}|${it.lng}`));

  HIGHLIGHT_PROJECTS.forEach((p) => {
    const key = `${p.name}|${p.lat}|${p.lng}`;
    if (keys.has(key)) return;

    const dist = distanceKm(lat, lng, p.lat, p.lng);
    merged.push({
      ...p,
      distanceKm: Math.round(dist * 100) / 100,
    });
    keys.add(key);
  });

  merged.sort((a, b) => a.distanceKm - b.distanceKm);
  return merged;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function typeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.building;
}

function toDateSafe(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && typeof v._seconds === "number") {
    return new Date(v._seconds * 1000);
  }
  if (typeof v === "object" && typeof v.seconds === "number") {
    return new Date(v.seconds * 1000);
  }
  return null;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
