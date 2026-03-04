let map;
let userMarker = null;
let markers = [];
const defaultCenter = { lat: 37.6686, lng: 126.7440 };
const defaultZoom = 14;

// TODO: set your deployed function URL.
// Example: https://asia-northeast3-<PROJECT_ID>.cloudfunctions.net/nearby
const FUNCTIONS_NEARBY_URL = "YOUR_FUNCTIONS_NEARBY_URL";

window.initMap = function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: defaultCenter,
    zoom: defaultZoom,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  document.getElementById("btnRefresh").addEventListener("click", fetchNearby);
  document.getElementById("btnLocate").addEventListener("click", () => locateMe(true));

  locateMe(false);
};

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
      map.setCenter({ lat, lng });
      map.setZoom(15);
      if (alsoFetch) fetchNearby();
      else fetchNearby();
    },
    () => {
      map.setCenter(defaultCenter);
      map.setZoom(defaultZoom);
      fetchNearby();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function setUserLocation(lat, lng) {
  const p = { lat, lng };
  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: p,
      map,
      title: "내 위치",
    });
  } else {
    userMarker.setPosition(p);
  }
}

async function fetchNearby() {
  clearMarkers();

  const center = map.getCenter();
  const lat = center.lat();
  const lng = center.lng();
  const radiusKm = Number(document.getElementById("radius").value || 2);

  setLoading(true);

  try {
    if (!FUNCTIONS_NEARBY_URL || FUNCTIONS_NEARBY_URL.includes("YOUR_")) {
      throw new Error("FUNCTIONS_NEARBY_URL을 설정하세요.");
    }

    const url = new URL(FUNCTIONS_NEARBY_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
    url.searchParams.set("radiusKm", String(radiusKm));
    url.searchParams.set("status", "construction");

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);

    const data = await resp.json();
    renderList(data.items || []);
    renderMarkers(data.items || []);
  } catch (e) {
    console.error(e);
    renderError(String(e.message || e));
  } finally {
    setLoading(false);
  }
}

function renderMarkers(items) {
  items.forEach((it) => {
    const m = new google.maps.Marker({
      position: { lat: it.lat, lng: it.lng },
      map,
      title: it.name,
    });

    m.addListener("click", () => renderDetail(it));
    markers.push(m);
  });
}

function renderList(items) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<div class="item"><div class="name">주변 공사 정보가 없습니다</div><div class="meta">반경/지역을 바꿔보세요.</div></div>';
    return;
  }

  items.forEach((it) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="name">${escapeHtml(it.name)}</div>
      <div class="meta">${escapeHtml(it.endDateEstText || it.endDateEst || "")}</div>
      <div class="dist">거리 ${it.distanceKm}km</div>
    `;
    el.addEventListener("click", () => {
      map.panTo({ lat: it.lat, lng: it.lng });
      map.setZoom(Math.max(map.getZoom(), 16));
      renderDetail(it);
    });
    list.appendChild(el);
  });

  renderDetail(items[0]);
}

function renderDetail(it) {
  const detail = document.getElementById("detail");
  const links = (it.sourceLinks || [])
    .map(
      (l) =>
        `<li><a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.title || l.url)}</a></li>`
    )
    .join("");

  detail.classList.remove("empty");
  detail.innerHTML = `
    <div style="font-weight:800; font-size:16px; margin-bottom:6px;">${escapeHtml(it.name)}</div>
    <div style="color:#444; margin-bottom:6px;">${escapeHtml(it.address || "")}</div>
    <div style="margin-bottom:10px;">
      <div><b>상태</b>: ${escapeHtml(it.status || "")}</div>
      <div><b>완공예정</b>: ${escapeHtml(it.endDateEstText || it.endDateEst || "정보없음")}</div>
      ${it.startDate ? `<div><b>착공/시작</b>: ${escapeHtml(it.startDate)}</div>` : ""}
      <div><b>거리</b>: ${it.distanceKm}km</div>
    </div>
    ${links ? `<div style="font-weight:700; margin-bottom:6px;">관련 링크</div><ul>${links}</ul>` : '<div style="color:#666;">관련 링크가 없습니다.</div>'}
  `;
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
