import { useCallback, useMemo, useState } from "react";
import { fetchProjectDetail, fetchProjects, searchProjects } from "./api/client";
import { DetailPanel } from "./components/DetailPanel";
import { Filters } from "./components/Filters";
import { MapView } from "./components/MapView";
import { SearchBox } from "./components/SearchBox";
import type { Project } from "./types/project";

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [status, setStatus] = useState("전체");
  const [useType, setUseType] = useState("전체");
  const [sort, setSort] = useState("permit_desc");

  const onBoundsChanged = useCallback(
    async ({ bbox, zoom }: { bbox: string; zoom: number }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchProjects({ bbox, zoom, status, use: useType, sort });
        if (response.mode === "summary") {
          setProjects([]);
          setSelected(null);
          setBanner(`지도가 넓어 요약만 표시합니다. 총 ${response.total.toLocaleString("ko-KR")}건`);
        } else {
          setProjects(response.projects);
          setSelected(response.projects[0] ?? null);
          setBanner(null);
        }
      } catch (e) {
        console.error(e);
        setError("일부 데이터가 아직 정리 중입니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    },
    [status, useType, sort]
  );

  const onSelect = useCallback(async (projectId: string) => {
    try {
      const detail = await fetchProjectDetail(projectId);
      setSelected(detail);
    } catch (e) {
      console.error(e);
      setError("상세 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }, []);

  const onSearch = useCallback(async (q: string) => {
    if (!q) return;
    try {
      const data = await searchProjects(q);
      setProjects(data);
      setSelected(data[0] ?? null);
      setBanner(`${data.length.toLocaleString("ko-KR")}건 검색됨`);
    } catch (e) {
      console.error(e);
      setError("검색 중 오류가 발생했습니다.");
    }
  }, []);

  const filters = useMemo(
    () => ({
      status,
      useType,
      sort,
    }),
    [status, useType, sort]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>여기 뭐 생겨요?</h1>
        <p>주변 공사·개발·도시계획 정보를 지도에서 확인하세요.</p>
      </header>

      <div className="top-controls">
        <SearchBox onSearch={onSearch} />
        <Filters
          status={filters.status}
          useType={filters.useType}
          sort={filters.sort}
          onChange={(next) => {
            if (next.status) setStatus(next.status);
            if (next.useType) setUseType(next.useType);
            if (next.sort) setSort(next.sort);
          }}
        />
      </div>

      {banner && <div className="banner">{banner}</div>}
      {error && <div className="error-banner">{error}</div>}

      <main className="layout">
        <section className="map-wrap">
          <MapView
            projects={projects}
            onSelect={onSelect}
            onBoundsChanged={onBoundsChanged}
            onMapError={setError}
          />
        </section>
        <DetailPanel project={selected} loading={loading} error={error} />
      </main>
    </div>
  );
}
