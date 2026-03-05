let map;
let userMarker = null;
let markers = [];
let wheelHandlerBound = false;
let wheelGestureActive = false;
let wheelGestureTimer = null;
const APP_BUILD = "2026-03-05-static-1";
const defaultCenter = { lat: 37.6686, lng: 126.7440 };
const defaultZoom = 14;

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
    statusText: "착공(2025-10-23), 2028년 준공 목표",
    address: "경기 고양시 일산서구 킨텍스로 217-60 인근(제1전시장 주차장·제2전시장 서측 부지)",
    lat: 37.6679,
    lng: 126.7454,
    startDate: "2025-10-23",
    endDateEst: "2028-12-31",
    endDateEstText: "2028-12-31",
    source: "curated-public:kintex3",
    sourceLinks: [
      { title: "공공데이터포털 - 경기도_KINTEX 시설 현황", url: "https://www.data.go.kr/data/15075693/fileData.do" },
      { title: "산업통상자원부 - 킨텍스 제3전시장 착공식", url: "https://www.motie.go.kr/kor/article/ATCL3f49a5a8c/73488/view?mno=&pageIndex=1&rowPageCnt=10&searchCondition=1&searchKeyword=%ED%82%A8%ED%85%8D%EC%8A%A4" },
      { title: "킨텍스 공식 - 제3전시장", url: "https://www.kintex.com/web/ko/html/company/exhibitionHall3.do" },
    ],
  },
];

document.addEventListener("DOMContentLoaded", initMap);

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false,
  }).setView([defaultCenter.lat, defaultCenter.lng], defaultZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  setupDiscreteWheelZoom();

  document.getElementById("btnRefresh").addEventListener("click", fetchNearby);
  document.getElementById("btnLocate").addEventListener("click", () => locateMe(true));
  document.getElementById("typeFilter").addEventListener("change", fetchNearby);

  locateMe(false);
}

function setupDiscreteWheelZoom() {
  if (wheelHandlerBound) return;
  wheelHandlerBound = true;

  map.scrollWheelZoom.disable();
  const container = map.getContainer();
  container.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!wheelGestureActive) {
        wheelGestureActive = true;
        if (ev.deltaY < 0) map.zoomIn(1, { animate: false });
        else if (ev.deltaY > 0) map.zoomOut(1, { animate: false });
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
      map.setView([lat, lng], 15);
      if (alsoFetch) fetchNearby();
      else fetchNearby();
    },
    () => {
      map.setView([defaultCenter.lat, defaultCenter.lng], defaultZoom);
      fetchNearby();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function setUserLocation(lat, lng) {
  const p = [lat, lng];
  if (!userMarker) {
    userMarker = L.circleMarker(p, {
      radius: 8,
      color: "#0c4a6e",
      fillColor: "#0c4a6e",
      fillOpacity: 0.75,
    });
    userMarker.bindTooltip("내 위치");
    userMarker.addTo(map);
  } else {
    userMarker.setLatLng(p);
  }
}

async function fetchNearby() {
  clearMarkers();

  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radiusKm = Number(document.getElementById("radius").value || 2);
  const type = document.getElementById("typeFilter").value || "all";

  setLoading(true);

  try {
    const data = await fetchNearbyWithFallback({ lat, lng, radiusKm, type });
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
    setSyncInfoError("공공데이터 API 연결 오류로 핵심 프로젝트(킨텍스 제3전시장)를 우선 표시합니다.");
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
      if (!contentType.includes("application/json")) {
        throw new Error(`Non-JSON response (${endpoint})`);
      }

      return await resp.json();
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("No nearby API endpoint available");
}

function renderMarkers(items) {
  items.forEach((it) => {
    const markerColor = markerColorForType(it.type);
    const m = L.circleMarker([it.lat, it.lng], {
      radius: 7,
      color: markerColor,
      fillColor: markerColor,
      fillOpacity: 0.78,
    }).addTo(map);

    m.on("click", () => renderDetail(it));
    markers.push(m);
  });
}

function renderList(items) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="item"><div class="name">주변 공사 정보가 없습니다</div><div class="meta">반경/유형을 바꿔보세요.</div></div>';
    return;
  }

  items.forEach((it) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="name">${escapeHtml(it.name)}</div>
      <div class="type-badge type-${escapeAttr(it.type || "building")}">${escapeHtml(typeLabel(it.type))}</div>
      <div class="meta">예정 준공: ${escapeHtml(it.endDateEstText || it.endDateEst || "정보없음")}</div>
      <div class="dist">거리 ${it.distanceKm}km</div>
    `;
    el.addEventListener("click", () => {
      map.setView([it.lat, it.lng], Math.max(map.getZoom(), 16));
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
    el.textContent = `현재 반경 내 데이터가 없어 최신 동기화 시각을 표시할 수 없습니다. (build ${APP_BUILD})`;
    return;
  }

  const dates = items
    .map((it) => toDateSafe(it.sourceFetchedAt) || toDateSafe(it.updatedAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  if (!dates.length) {
    el.textContent = `공공데이터 동기화 시각 정보가 아직 없습니다. (build ${APP_BUILD})`;
    return;
  }

  el.textContent = `공공데이터 기준 최근 동기화: ${dates[0].toLocaleString("ko-KR")} (build ${APP_BUILD})`;
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
  markers.forEach((m) => m.remove());
  markers = [];
}

function markerColorForType(type) {
  if (type === "subway") return "#065f46";
  if (type === "road") return "#92400e";
  return "#1d4ed8";
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

function setSyncInfoError(msg) {
  const el = document.getElementById("syncInfo");
  el.textContent = msg;
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

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("`", "&#096;");
}
