import { useEffect, useMemo, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { Footer } from "./components/Footer";
import { MapView } from "./components/MapView";
import { ProjectPanel } from "./components/ProjectPanel";
import { getCurrentBrowserLocation, DEFAULT_MAP_CENTER, type Coordinates } from "./lib/geolocation";
import { MOCK_PROJECTS } from "./lib/mock-projects";
import type { ProjectCategory, ProjectItem } from "./lib/project-types";
import {
  areViewportsDifferent,
  filterProjectsByBounds,
  filterProjectsByCategories,
  sortProjectsByDistance,
  type MapViewport,
} from "./lib/project-utils";

const ALL_CATEGORIES: ProjectCategory[] = ["public_construction", "railway", "housing", "urban_plan", "road", "environment"];
const SITE_URL = "https://whatsinhere.pages.dev";
const SUPPORTED_DATA_BOUNDS = {
  south: 33,
  west: 124,
  north: 39.5,
  east: 132,
};

type RouteKey = "/" | "/about" | "/contact" | "/privacy" | "/terms";

interface PageMeta {
  title: string;
  description: string;
}

const PAGE_META: Record<RouteKey, PageMeta> = {
  "/": {
    title: "여기 뭐 생겨요? | 내 주변 대형 공사·개발사업 지도",
    description: "내 주변의 대형 공사·개발사업을 지도에서 확인하세요. 공공데이터를 바탕으로 주요 사업만 간단히 보여줍니다.",
  },
  "/about": {
    title: "About | 여기 뭐 생겨요?",
    description: "여기 뭐 생겨요?는 내 주변 공사·개발 정보를 공공데이터 기반으로 시각화하는 지도 서비스입니다.",
  },
  "/contact": {
    title: "Contact | 여기 뭐 생겨요?",
    description: "서비스 문의와 데이터 오류 제보를 위한 연락 방법을 확인하세요.",
  },
  "/privacy": {
    title: "Privacy | 여기 뭐 생겨요?",
    description: "쿠키, 광고, 제3자 사업자 사용 가능성, 문의 방법을 포함한 개인정보처리방침입니다.",
  },
  "/terms": {
    title: "Terms | 여기 뭐 생겨요?",
    description: "서비스 이용 시 적용되는 기본 이용 안내와 책임 한계를 확인하세요.",
  },
};

function normalizePathname(pathname: string): RouteKey {
  if (pathname === "/about") return "/about";
  if (pathname === "/contact") return "/contact";
  if (pathname === "/privacy") return "/privacy";
  if (pathname === "/terms") return "/terms";
  return "/";
}

function ensureMetaTag(selector: string, attributes: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function ensureCanonicalLink(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }

  element.href = href;
}

function isWithinSupportedDataBounds(coords: Coordinates): boolean {
  return (
    coords.lat >= SUPPORTED_DATA_BOUNDS.south &&
    coords.lat <= SUPPORTED_DATA_BOUNDS.north &&
    coords.lng >= SUPPORTED_DATA_BOUNDS.west &&
    coords.lng <= SUPPORTED_DATA_BOUNDS.east
  );
}

export function App() {
  const [pathname, setPathname] = useState<RouteKey>(() => normalizePathname(window.location.pathname));
  const [projects, setProjects] = useState<ProjectItem[]>(MOCK_PROJECTS);
  const [activeCategories, setActiveCategories] = useState<ProjectCategory[]>(ALL_CATEGORIES);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [searchedViewport, setSearchedViewport] = useState<MapViewport | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationRequestId, setLocationRequestId] = useState(0);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState("공공데이터 기반 정적 파일을 불러오는 중입니다.");
  const isHomePage = pathname === "/";

  useEffect(() => {
    const handlePopState = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const meta = PAGE_META[pathname];
    const canonicalUrl = `${SITE_URL}${pathname === "/" ? "" : pathname}`;

    document.title = meta.title;
    ensureMetaTag('meta[name="description"]', { name: "description" }, meta.description);
    ensureMetaTag('meta[property="og:title"]', { property: "og:title" }, meta.title);
    ensureMetaTag('meta[property="og:description"]', { property: "og:description" }, meta.description);
    ensureMetaTag('meta[property="og:type"]', { property: "og:type" }, "website");
    ensureMetaTag('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    ensureCanonicalLink(canonicalUrl);
  }, [pathname]);

  useEffect(() => {
    if (!isHomePage) return;
    void handleUseCurrentLocation();
  }, [isHomePage]);

  useEffect(() => {
    if (!isHomePage) return;

    let isMounted = true;

    loadProjects()
      .then((items) => {
        if (!isMounted) return;
        setProjects(items);
        setDataNotice("본 서비스는 공공데이터를 바탕으로 주요 공사·개발 정보를 시각화합니다.");
      })
      .catch((error) => {
        console.error("projects-json-load-failed", error);
        if (!isMounted) return;
        setProjects(MOCK_PROJECTS);
        setDataNotice("정적 데이터 파일을 불러오지 못해 내장 공공데이터 샘플로 표시합니다.");
      });

    return () => {
      isMounted = false;
    };
  }, [isHomePage]);

  useEffect(() => {
    if (!viewport || searchedViewport) return;
    setSearchedViewport(viewport);
  }, [viewport, searchedViewport]);

  const categoryFilteredProjects = useMemo(
    () => filterProjectsByCategories(projects, activeCategories),
    [activeCategories, projects]
  );

  const nearbyProjects = useMemo(() => {
    const sourceViewport = searchedViewport ?? viewport;
    if (!sourceViewport) return categoryFilteredProjects;

    return sortProjectsByDistance(
      filterProjectsByBounds(categoryFilteredProjects, sourceViewport.bounds),
      sourceViewport.center
    );
  }, [categoryFilteredProjects, searchedViewport, viewport]);

  const selectedProject = nearbyProjects.find((project) => project.id === selectedProjectId) ?? null;
  const hasPendingAreaChange =
    Boolean(viewport) && Boolean(searchedViewport) && areViewportsDifferent(viewport, searchedViewport);

  useEffect(() => {
    if (!selectedProjectId) return;
    const exists = nearbyProjects.some((project) => project.id === selectedProjectId);
    if (!exists) {
      setSelectedProjectId(null);
    }
  }, [nearbyProjects, selectedProjectId]);

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

  if (!isHomePage) {
    return (
      <main className="app-shell">
        <header className="site-header">
          <div className="brand-block">
            <a href="/" className="brand-link">
              <span className="brand-mark">◎</span>
              <span>여기 뭐 생겨요?</span>
            </a>
            <p className="header-copy">내 주변의 대형 공사·개발사업을 지도에서 확인</p>
          </div>
          <nav className="top-nav" aria-label="상단 탐색">
            <a href="/">Explore</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </nav>
        </header>
        <section className="content-page">{renderContentPage(pathname)}</section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="brand-block">
          <a href="/" className="brand-link">
            <span className="brand-mark">◎</span>
            <span>여기 뭐 생겨요?</span>
          </a>
          <p className="header-copy">내 주변 대형 공사·개발사업 지도</p>
        </div>
        <nav className="top-nav" aria-label="상단 탐색">
          <a href="/" className="top-nav-active">
            Explore
          </a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
      </header>

      <section className="home-layout">
        <section className="map-stage">
          <section className="hero hero-overlay">
            <div>
              <p className="hero-kicker">지도 보기</p>
              <h1>내 주변에서 지금 진행 중인 공사와 개발사업</h1>
              <p className="hero-copy">
                공공데이터를 바탕으로 주요 공사·개발 정보를 시각화합니다. 실제 현장 상황과 시점 차이가 있을 수 있습니다.
              </p>
            </div>
          </section>

          <div className="map-actions">
            <button type="button" className="icon-button primary-icon-button" onClick={() => void handleUseCurrentLocation()} disabled={isLocating}>
              <span className="button-symbol">◎</span>
              <span>{isLocating ? "위치 확인 중..." : "내 위치 사용"}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={handleSearchThisArea}
              disabled={!viewport || !hasPendingAreaChange}
            >
              <span className="button-symbol">↺</span>
              <span>이 지역 다시 검색</span>
            </button>
          </div>

          <MapView
            projects={nearbyProjects}
            selectedProjectId={selectedProjectId}
            currentLocation={currentLocation}
            currentLocationRequest={locationRequestId}
            onSelectProject={(project) => setSelectedProjectId(project.id)}
            onViewportChange={handleViewportChange}
          />
        </section>

        <aside className="sidebar-shell">
          <section className="sidebar-head">
            <div>
              <p className="panel-kicker">여기 뭐 생겨요?</p>
              <h2>공사·개발사업 레저</h2>
            </div>
            <div className="sidebar-meta">
              <span className="status-pill">Live Updates</span>
              <span className="count-pill">{nearbyProjects.length}건</span>
            </div>
          </section>

          <section className="control-bar">
            <CategoryFilter activeCategories={activeCategories} onChange={setActiveCategories} />
          </section>

          {locationError ? <p className="notice warning">위치 권한이 없어 수도권 기본 위치로 시작합니다. {locationError}</p> : null}
          <p className="notice">{dataNotice}</p>

          <ProjectPanel project={selectedProject} visibleCount={nearbyProjects.length} />

          {nearbyProjects.length === 0 ? (
            <p className="notice empty">이 범위에는 표시할 대형 공사·개발사업이 없습니다. 지도를 이동한 뒤 다시 검색해 보세요.</p>
          ) : (
            <p className="notice">현재 범위에서 {nearbyProjects.length}개 사업을 표시합니다.</p>
          )}
        </aside>
      </section>

      <Footer />
      <nav className="bottom-nav" aria-label="하단 탐색">
        <a href="/" className="bottom-nav-item bottom-nav-item-active">
          <span>지도</span>
        </a>
        <a href="/about" className="bottom-nav-item">
          <span>소개</span>
        </a>
        <a href="/contact" className="bottom-nav-item">
          <span>문의</span>
        </a>
        <a href="/privacy" className="bottom-nav-item">
          <span>정책</span>
        </a>
      </nav>
    </main>
  );
}

async function loadProjects(): Promise<ProjectItem[]> {
  const candidates = ["/data/projects.generated.json", "/data/projects.json"];

  for (const url of candidates) {
    const response = await fetch(url);
    if (!response.ok) continue;
    return (await response.json()) as ProjectItem[];
  }

  throw new Error("Failed to load generated or fallback project data.");
}

function renderContentPage(pathname: RouteKey) {
  if (pathname === "/about") {
    return (
      <>
        <p className="page-kicker">About</p>
        <h1>서비스 소개</h1>
        <p>
          여기 뭐 생겨요?는 내 주변 공사·개발 정보를 지도에서 쉽게 확인할 수 있도록 돕는 서비스입니다.
          공공데이터를 바탕으로 대형 신축, 철도, 택지개발 같은 주요 사업만 추려 시각화합니다.
        </p>
        <p>
          본 서비스는 공공데이터를 바탕으로 주요 공사·개발 정보를 시각화합니다. 실제 현장 상황과 시점 차이가 있을 수 있으며,
          공개 시점과 현장 반영 시점 사이에 오차가 생길 수 있습니다.
        </p>
      </>
    );
  }

  if (pathname === "/contact") {
    return (
      <>
        <p className="page-kicker">Contact</p>
        <h1>문의하기</h1>
        <p>서비스 이용 문의, 데이터 오류 제보, 잘못된 위치 정보 수정 요청은 아래 이메일로 보내실 수 있습니다.</p>
        <p>
          이메일: <a href="mailto:contact@example.com">contact@example.com</a>
        </p>
        <p>데이터 출처별 반영 시차가 있을 수 있으므로, 제보 시 사업명과 위치를 함께 보내주시면 확인에 도움이 됩니다.</p>
      </>
    );
  }

  if (pathname === "/privacy") {
    return (
      <>
        <p className="page-kicker">Privacy</p>
        <h1>개인정보처리방침</h1>
        <p>
          여기 뭐 생겨요?는 서비스 운영 과정에서 접속 기록, 브라우저 정보, 기기 정보, 쿠키 사용 여부 같은 일반적인 웹 로그 정보를
          수집하거나 처리할 수 있습니다. 위치 권한은 사용자가 허용한 경우에만 브라우저를 통해 사용되며, 서비스 화면 표시 목적에 한해 활용됩니다.
        </p>
        <p>
          본 서비스는 사이트 이용 편의와 성능 측정, 기본 보안 처리를 위해 쿠키 또는 유사 기술을 사용할 수 있습니다. 사용자는 브라우저 설정을
          통해 쿠키 저장을 제한하거나 삭제할 수 있습니다.
        </p>
        <p>
          또한 Google을 포함한 제3자 광고 사업자가 쿠키를 사용할 수 있습니다. Google 광고 쿠키는 사용자 관심사 기반 광고 제공,
          광고 측정, 심사 및 서비스 운영을 위해 활용될 수 있습니다. 사용자는 Google 광고 설정 또는 브라우저 설정을 통해 관련 쿠키 사용을
          제어할 수 있습니다.
        </p>
        <p>
          광고, 분석 또는 외부 출처 링크 제공 과정에서 제3자 서비스가 자체 정책에 따라 데이터를 처리할 수 있으며, 이에 대해서는 각 사업자의
          정책이 적용됩니다.
        </p>
        <p>
          개인정보 및 쿠키 처리와 관련한 문의는 <a href="mailto:contact@example.com">contact@example.com</a>으로 보내실 수 있습니다.
        </p>
        <p>본 방침은 정책, 서비스 구조, 법령 변경에 따라 수정될 수 있으며, 변경 시 이 페이지를 통해 고지합니다.</p>
      </>
    );
  }

  return (
    <>
      <p className="page-kicker">Terms</p>
      <h1>이용안내</h1>
      <p>본 서비스는 공공데이터를 바탕으로 주변 공사·개발사업 정보를 참고용으로 제공합니다.</p>
      <p>
        서비스에 표시되는 사업 정보는 공개 자료를 기준으로 정리되며, 실제 현장 상황과 차이가 있을 수 있습니다. 최종 의사결정이 필요한 경우
        원문 출처와 관계 기관 자료를 함께 확인하시기 바랍니다.
      </p>
      <p>
        서비스 운영자는 정보 지연, 누락, 외부 데이터 변경으로 인해 발생하는 손해에 대해 책임을 지지 않습니다. 서비스 구조와 제공 내용은 사전
        고지 없이 변경될 수 있습니다.
      </p>
    </>
  );
}
