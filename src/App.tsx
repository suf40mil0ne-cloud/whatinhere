import { useCallback, useMemo, useState } from "react";
import { ApiError, fetchProjectDetail, fetchProjects, searchProjects } from "./api/client";
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

  const toUserError = useCallback((error: unknown, context: string) => {
    if (error instanceof ApiError) {
      if (error.status === 0) {
        return `${context}\n- 원인: API 서버에 연결하지 못했습니다.\n- 확인: Worker(API) 실행 상태 또는 VITE_API_BASE_URL\n- endpoint: ${error.endpoint}`;
      }
      return `${context}\n- HTTP ${error.status}\n- endpoint: ${error.endpoint}\n- detail: ${error.details || "응답 상세 없음"}`;
    }
    if (error instanceof Error) {
      return `${context}\n- 원인: ${error.message}`;
    }
    return `${context}\n- 원인: 알 수 없는 오류`;
  }, []);

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
        setError(
          toUserError(
            e,
            "프로젝트 목록을 불러오지 못했습니다. 일부 데이터가 아직 정리 중일 수 있습니다."
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [status, useType, sort, toUserError]
  );

  const onSelect = useCallback(async (projectId: string) => {
    try {
      const detail = await fetchProjectDetail(projectId);
      setSelected(detail);
    } catch (e) {
      console.error(e);
      setError(toUserError(e, "상세 정보를 불러오는 중 오류가 발생했습니다."));
    }
  }, [toUserError]);

  const onSearch = useCallback(async (q: string) => {
    if (!q) return;
    try {
      const data = await searchProjects(q);
      setProjects(data);
      setSelected(data[0] ?? null);
      setBanner(`${data.length.toLocaleString("ko-KR")}건 검색됨`);
    } catch (e) {
      console.error(e);
      setError(toUserError(e, "검색 중 오류가 발생했습니다."));
    }
  }, [toUserError]);

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
