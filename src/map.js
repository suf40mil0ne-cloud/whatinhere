const DEFAULT_CENTER = { lat: 37.6686, lng: 126.7452 };
const DEFAULT_LEVEL = 5;
const SDK_SCRIPT_ID = "kakao-maps-sdk";

function getKakaoJsKey() {
  return (
    import.meta.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    import.meta.env.KAKAO_MAP_JS_KEY ||
    ""
  ).trim();
}

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

function resolveExistingSdkPromise() {
  if (window.__kakaoSdkPromise) {
    return window.__kakaoSdkPromise;
  }
  return null;
}

function loadKakaoSdk(key) {
  const existingPromise = resolveExistingSdkPromise();
  if (existingPromise) return existingPromise;

  window.__kakaoSdkPromise = new Promise((resolve, reject) => {
    if (!key) {
      reject(new Error("MISSING_KAKAO_KEY"));
      return;
    }

    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => resolve(window.kakao));
      return;
    }

    const existingScript = document.getElementById(SDK_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => {
          if (!window.kakao || !window.kakao.maps) {
            reject(new Error("KAKAO_SDK_UNAVAILABLE"));
            return;
          }
          window.kakao.maps.load(() => resolve(window.kakao));
        },
        { once: true }
      );
      existingScript.addEventListener(
        "error",
        () => reject(new Error("KAKAO_SDK_LOAD_FAILED")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      key
    )}&autoload=false`;

    script.onload = () => {
      if (!window.kakao || !window.kakao.maps) {
        reject(new Error("KAKAO_SDK_UNAVAILABLE"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    script.onerror = () => reject(new Error("KAKAO_SDK_LOAD_FAILED"));
    document.head.appendChild(script);
  })
    .catch((err) => {
      window.__kakaoSdkPromise = null;
      throw err;
    });

  return window.__kakaoSdkPromise;
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

  const key = getKakaoJsKey();
  hideGlobalError(errorContainer);

  if (!key) {
    const message = "카카오 JavaScript 키가 설정되지 않았습니다.";
    console.error(message);
    showGlobalError(errorContainer, [message]);
    renderProjectDetail(detailContainer, null);
    return;
  }

  try {
    await loadKakaoSdk(key);
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
