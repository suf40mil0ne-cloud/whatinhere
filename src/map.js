import { getKakaoMapJsKey, loadKakaoMap } from "./utils/loadKakaoMap";

const DEFAULT_CENTER = { lat: 37.6686, lng: 126.7452 };
const DEFAULT_LEVEL = 5;

function showGlobalError(errorContainer, lines) {
  if (!errorContainer) return;
  errorContainer.innerHTML = lines.map((line) => `<p>${line}</p>`).join("");
  errorContainer.classList.remove("hidden");
}

function hideGlobalError(errorContainer) {
  if (!errorContainer) return;
  errorContainer.textContent = "";
  errorContainer.classList.add("hidden");
}

function renderProjectDetail(detailContainer, project) {
  if (!detailContainer) return;

  if (!project) {
    detailContainer.className = "project-detail empty";
    detailContainer.textContent = "표시할 데이터가 없습니다.";
    return;
  }

  const hasLink = Boolean(project.link);
  detailContainer.className = "project-detail";
  detailContainer.innerHTML = `
    <div class="item"><span>사업명</span><strong>${project.name || "정보 없음"}</strong></div>
    <div class="item"><span>위치명</span><strong>${project.location || "정보 없음"}</strong></div>
    <div class="item"><span>상태</span><strong>${project.status || "정보 없음"}</strong></div>
    <div class="item"><span>준공예정일</span><strong>${project.completionDate || "정보 없음"}</strong></div>
    <div class="item item-description"><span>설명</span><p>${project.description || "정보 없음"}</p></div>
    <a class="link-button ${hasLink ? "" : "hidden"}" href="${hasLink ? project.link : "#"}" target="_blank" rel="noreferrer noopener">
      관련 링크 보기
    </a>
  `;
}

function createMap(mapContainer) {
  return new window.kakao.maps.Map(mapContainer, {
    center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
    level: DEFAULT_LEVEL,
  });
}

function addMarkers(map, projects, detailContainer) {
  if (!Array.isArray(projects) || projects.length === 0) {
    renderProjectDetail(detailContainer, null);
    return;
  }

  projects.forEach((project) => {
    if (typeof project.lat !== "number" || typeof project.lng !== "number") return;

    const marker = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(project.lat, project.lng),
      title: project.name || "개발사업",
    });

    window.kakao.maps.event.addListener(marker, "click", () => {
      renderProjectDetail(detailContainer, project);
      map.panTo(new window.kakao.maps.LatLng(project.lat, project.lng));
    });
  });

  renderProjectDetail(detailContainer, projects[0]);
}

export async function initMapApp({ mapContainer, detailContainer, errorContainer, projects }) {
  if (!mapContainer) return;

  const key = getKakaoMapJsKey();
  hideGlobalError(errorContainer);

  if (!key) {
    console.error("카카오 JavaScript 키가 설정되지 않았습니다.");
    showGlobalError(errorContainer, [
      "카카오 JavaScript 키가 설정되지 않았습니다.",
      "Cloudflare Pages Settings → Environment Variables 에",
      "VITE_KAKAO_MAP_JS_KEY 를 추가하세요.",
    ]);
    renderProjectDetail(detailContainer, null);
    return;
  }

  try {
    await loadKakaoMap();
    const map = createMap(mapContainer);
    addMarkers(map, projects, detailContainer);
  } catch (error) {
    console.error("Kakao map init error:", error);
    showGlobalError(errorContainer, [
      "카카오맵을 불러오지 못했습니다.",
      "Cloudflare Pages 환경변수와 Kakao Developers 도메인 등록을 확인하세요.",
    ]);
    renderProjectDetail(detailContainer, null);
  }
}
