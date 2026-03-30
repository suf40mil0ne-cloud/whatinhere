import { useEffect, useMemo, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { ContentPage } from "./components/ContentPage";
import { Footer } from "./components/Footer";
import { MapView } from "./components/MapView";
import { ProjectPanel } from "./components/ProjectPanel";
import { useMapState } from "./hooks/useMapState";
import { useProjects } from "./hooks/useProjects";
import { useSeoMeta } from "./hooks/useSeoMeta";
import type { ProjectCategory } from "./lib/project-types";
import { areViewportsDifferent, filterProjectsByBounds, filterProjectsByCategories, sortProjectsByDistance } from "./lib/project-utils";

const ALL_CATEGORIES: ProjectCategory[] = ["public_construction", "railway", "housing", "urban_plan", "road", "environment"];

export function App() {
  const { pathname } = useSeoMeta();
  const isHomePage = pathname === "/";

  const { projects, dataNotice } = useProjects(isHomePage);
  const {
    viewport,
    searchedViewport,
    currentLocation,
    locationRequestId,
    isLocating,
    locationError,
    handleUseCurrentLocation,
    handleViewportChange,
    handleSearchThisArea,
  } = useMapState(isHomePage);

  const [activeCategories, setActiveCategories] = useState<ProjectCategory[]>(ALL_CATEGORIES);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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
    if (!exists) setSelectedProjectId(null);
  }, [nearbyProjects, selectedProjectId]);

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
        <section className="content-page">
          <ContentPage pathname={pathname} />
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="site-header site-header-navonly">
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
            <div className="hero-intro">
              <a href="/" className="brand-link hero-brand-link">
                <span className="brand-mark">◎</span>
                <span>여기 뭐 생겨요?</span>
              </a>
              <h1>내 주변 공사·개발사업을 한눈에 확인</h1>
              <p className="hero-copy">공공데이터 기반 주요 사업만 지도에서 빠르게 확인할 수 있습니다.</p>
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
              <h2>공사·개발사업 레이더</h2>
            </div>
            <div className="sidebar-meta">
              <span className="status-pill">공공데이터 기준</span>
              <span className="count-pill">{nearbyProjects.length}건</span>
            </div>
          </section>

          <section className="control-bar">
            <CategoryFilter activeCategories={activeCategories} onChange={setActiveCategories} />
          </section>

          <section className="sidebar-summary">
            <p className="notice">{dataNotice}</p>
            {locationError ? <p className="notice warning">위치 권한이 없어 수도권 기본 위치로 시작합니다. {locationError}</p> : null}
          </section>

          <ProjectPanel project={selectedProject} visibleCount={nearbyProjects.length} />

          {nearbyProjects.length === 0 ? (
            <p className="notice empty">이 범위에는 표시할 대형 공사·개발사업이 없습니다. 지도를 이동한 뒤 다시 검색해 보세요.</p>
          ) : null}
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
