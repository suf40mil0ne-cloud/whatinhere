import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FAQS } from "../data/projects";
import { getAreaShortcuts, getRecentProjects, filterProjects } from "../lib/content";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";
import { MapView } from "../components/MapView";
import { ProjectInfoPanel } from "../components/ProjectInfoPanel";
import { RadiusFilter } from "../components/RadiusFilter";
import { StatusFilter } from "../components/StatusFilter";
import type { ProjectRecord } from "../types/content";

export function HomePage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState<"updated_desc" | "confidence_desc" | "status_asc">("updated_desc");
  const [radius, setRadius] = useState<"1km" | "3km" | "5km" | "bounds">("3km");
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [visibleProjects, setVisibleProjects] = useState<ProjectRecord[]>([]);

  usePageMeta({
    title: "여기 뭐 생겨요? | 내 주변 공사·개발·건축 인허가 지도",
    description:
      "내 주변 공사·개발·건축 인허가 정보를 지도에서 바로 확인하세요. 공식 공공데이터를 우선 사용하고, 출처·기준일·신뢰도를 함께 표시합니다.",
    canonicalPath: "/",
  });

  useJsonLd("ld-home", {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "여기 뭐 생겨요?",
    url: "https://whatsinhere.pages.dev/",
    description: "지도에서 내 주변 공사·개발·건축 인허가 정보를 확인하는 서비스",
  });

  const filtered = useMemo(() => filterProjects({ query, status, area, sort }), [query, status, area, sort]);
  const recent = useMemo(() => getRecentProjects(6), []);
  const areas = useMemo(() => getAreaShortcuts(), []);

  useEffect(() => {
    if (!selectedProject) return;
    const exists = filtered.some((project) => project.id === selectedProject.id);
    if (!exists) {
      setSelectedProject(null);
    }
  }, [filtered, selectedProject]);

  return (
    <div className="page page-home">
      <section className="hero">
        <p className="eyebrow">공공데이터 우선</p>
        <h1>내 주변에 뭐가 생기는지 먼저 보는 지도</h1>
        <p>
          브라우저 현재 위치 또는 기본 좌표를 중심으로 주변 공사·개발·건축 인허가 정보를 마커로 표시합니다.
          마커를 누르면 사업명, 상태, 기준일, 출처, 신뢰도를 확인할 수 있습니다.
        </p>
      </section>

      <section className="source-banner">
        <strong>이 정보는 공공데이터를 기반으로 표시됩니다.</strong>
        <p>국토교통부 건축HUB, 도시계획 개발행위허가정보, 지자체 건축허가·착공 현황을 우선 사용합니다.</p>
      </section>

      <section className="controls-section">
        <div className="search-line">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="지역명/지하철역/주소/사업명 검색"
          />
        </div>
        <div className="filter-stack">
          <div>
            <span className="control-label">상태</span>
            <StatusFilter value={status} onChange={setStatus} />
          </div>
          <div>
            <span className="control-label">반경</span>
            <RadiusFilter value={radius} onChange={setRadius} />
          </div>
          <div className="select-line">
            <label>
              지역
              <select value={area} onChange={(event) => setArea(event.target.value)}>
                <option value="all">전체 지역</option>
                {areas.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              정렬
              <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="updated_desc">최근 검증순</option>
                <option value="confidence_desc">신뢰도 높은순</option>
                <option value="status_asc">상태순</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="map-workspace">
        <div className="map-panel">
          <MapView
            projects={filtered}
            selectedProjectId={selectedProject?.id || null}
            onSelectProject={setSelectedProject}
            onVisibleProjectsChange={setVisibleProjects}
            radiusMode={radius}
          />
        </div>
        <ProjectInfoPanel project={selectedProject} visibleCount={visibleProjects.length} />
      </section>

      <section className="stats-strip">
        <div>
          <strong>{visibleProjects.length}건</strong>
          <span>현재 지도 범위/반경 안에서 표시 중인 데이터</span>
        </div>
        <div>
          <strong>{filtered.length}건</strong>
          <span>검색·필터 조건과 일치한 전체 데이터</span>
        </div>
        <div>
          <strong>출처 기반</strong>
          <span>마커 클릭 전에는 출처 없는 해석 문구를 노출하지 않습니다</span>
        </div>
      </section>

      <section className="content-grid">
        <article>
          <h2>최근 갱신된 프로젝트</h2>
          <div className="recent-grid">
            {recent.map((project) => (
              <Link to={`/project/${project.slug}`} key={project.id} className="recent-card">
                <strong>{project.title}</strong>
                <span>{project.sourceName}</span>
                <p>{project.summary}</p>
              </Link>
            ))}
          </div>
        </article>

        <article>
          <h2>지역별 바로가기</h2>
          <div className="area-shortcuts">
            {areas.map((areaItem) => (
              <Link to={`/area/${areaItem.slug}`} key={areaItem.slug} className="area-card">
                <strong>{areaItem.name}</strong>
                <p>{areaItem.shortDescription}</p>
                <span>{areaItem.count}개 프로젝트 확인</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="text-section">
        <h2>이 사이트는 무엇을 제공하나요?</h2>
        <p>
          지도에서 내 주변 공사·개발·건축 인허가를 먼저 보고, 마커를 눌렀을 때만 상세 정보를 확인하는 구조입니다.
          항상 출처, 기준일, 상태 근거를 함께 보여 주며 출처 없는 단정 문구는 낮은 우선순위로 둡니다.
        </p>
        <h3>데이터 한계와 갱신 방식</h3>
        <p>
          좌표가 없는 공개자료는 지오코딩 또는 후속 보강이 필요합니다. 원천 데이터 공개 시차가 있기 때문에 중요한 의사결정 전에는
          반드시 원문 자료를 다시 확인해 주세요.
        </p>
      </section>

      <section className="faq-preview">
        <h2>자주 묻는 질문</h2>
        <div className="faq-list">
          {FAQS.slice(0, 5).map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
