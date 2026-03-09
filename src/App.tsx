import { useEffect, useMemo, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { MapView } from "./components/MapView";
import { ProjectPanel } from "./components/ProjectPanel";
import { getCurrentBrowserLocation, DEFAULT_MAP_CENTER, type Coordinates } from "./lib/geolocation";
import { MOCK_PROJECTS } from "./lib/mock-projects";
import type { ProjectCategory } from "./lib/project-types";
import {
  areViewportsDifferent,
  filterProjectsByBounds,
  filterProjectsByCategories,
  sortProjectsByDistance,
  type MapViewport,
} from "./lib/project-utils";

const ALL_CATEGORIES: ProjectCategory[] = ["building", "railway", "housing"];

export function App() {
  const [activeCategories, setActiveCategories] = useState<ProjectCategory[]>(ALL_CATEGORIES);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [searchedViewport, setSearchedViewport] = useState<MapViewport | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationRequestId, setLocationRequestId] = useState(0);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    void handleUseCurrentLocation();
  }, []);

  useEffect(() => {
    if (!viewport || searchedViewport) return;
    setSearchedViewport(viewport);
  }, [viewport, searchedViewport]);

  const categoryFilteredProjects = useMemo(
    () => filterProjectsByCategories(MOCK_PROJECTS, activeCategories),
    [activeCategories]
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
      setCurrentLocation(coords);
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

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="hero-kicker">여기 뭐 생겨요?</p>
        <h1>내 주변의 대형 공사·개발사업을 지도에서 확인</h1>
        <p className="hero-copy">
          현재 위치를 중심으로 큰 펜스를 치고 진행 중인 사업만 간단히 보여줍니다.
        </p>
      </section>

      <section className="control-bar">
        <button type="button" className="primary-button" onClick={() => void handleUseCurrentLocation()} disabled={isLocating}>
          {isLocating ? "위치 확인 중..." : "내 위치 사용"}
        </button>
        <CategoryFilter activeCategories={activeCategories} onChange={setActiveCategories} />
        <button
          type="button"
          className="secondary-button"
          onClick={handleSearchThisArea}
          disabled={!viewport || !hasPendingAreaChange}
        >
          이 지역 다시 검색
        </button>
      </section>

      {locationError ? <p className="notice warning">위치 권한이 없어 수도권 기본 위치로 시작합니다. {locationError}</p> : null}

      <section className="content-grid">
        <MapView
          projects={nearbyProjects}
          selectedProjectId={selectedProjectId}
          currentLocation={currentLocation}
          currentLocationRequest={locationRequestId}
          onSelectProject={(project) => setSelectedProjectId(project.id)}
          onViewportChange={handleViewportChange}
        />
        <ProjectPanel project={selectedProject} visibleCount={nearbyProjects.length} />
      </section>

      {nearbyProjects.length === 0 ? (
        <p className="notice empty">이 범위에는 표시할 대형 공사·개발사업이 없습니다. 지도를 이동한 뒤 다시 검색해 보세요.</p>
      ) : (
        <p className="notice">현재 범위에서 {nearbyProjects.length}개 사업을 표시합니다.</p>
      )}
    </main>
  );
}
