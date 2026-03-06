import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FAQS, PROJECTS, loadMetroProjectsFromCache } from "../data/projects";
import { getAreaShortcuts, getRecentProjects } from "../lib/content";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";
import { MapView } from "../components/MapView";
import { ProjectInfoPanel } from "../components/ProjectInfoPanel";
import type { NearbyConstructionRecord } from "../types/content";

export function HomePage() {
  const [projects, setProjects] = useState<NearbyConstructionRecord[]>(PROJECTS);
  const [selectedProject, setSelectedProject] = useState<NearbyConstructionRecord | null>(null);
  const [visibleProjects, setVisibleProjects] = useState<NearbyConstructionRecord[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [dataNotice, setDataNotice] = useState("수도권 공공데이터 캐시를 불러오는 중입니다.");

  usePageMeta({
    title: "여기 뭐 생겨요? | 내 주변 공사 정보를 지도에서 확인",
    description: "지금 위치를 기준으로 주변 공사·개발 정보를 바로 보여드립니다. 공공데이터 출처, 기준일, 상태 근거를 함께 확인하세요.",
    canonicalPath: "/",
  });

  useJsonLd("ld-home", {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "여기 뭐 생겨요?",
    url: "https://whatsinhere.pages.dev/",
    description: "현재 위치를 기준으로 주변 공사·개발 정보를 보여주는 지도 서비스",
  });

  useEffect(() => {
    let mounted = true;
    setIsLoadingProjects(true);

    loadMetroProjectsFromCache()
      .then((records) => {
        if (!mounted) return;
        setProjects(records);
        setDataNotice("수도권 공공데이터 기준 주변 공사 정보를 표시합니다.");
      })
      .catch((error) => {
        console.error("metro-project-cache-load-failed", error);
        if (!mounted) return;
        setProjects(PROJECTS);
        setDataNotice("캐시 로딩에 실패해 내장 수도권 데이터로 표시합니다.");
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingProjects(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    const exists = projects.some((project) => project.id === selectedProject.id);
    if (!exists) {
      setSelectedProject(null);
    }
  }, [projects, selectedProject]);

  const recent = useMemo(() => getRecentProjects(6), []);
  const areas = useMemo(() => getAreaShortcuts(), []);

  return (
    <div className="page page-home">
      <section className="hero">
        <p className="eyebrow">현재 위치 기준</p>
        <h1>내 주변 공사 정보를 지도에서 확인하세요.</h1>
        <p>앱을 열면 바로 현재 위치를 기준으로 주변에 뭐가 생기는지 보여드립니다.</p>
      </section>

      <section className="source-banner">
        <strong>공공데이터를 우선 사용합니다.</strong>
        <p>{dataNotice}</p>
      </section>

      <section className="map-workspace">
        <div className="map-panel">
          <MapView
            projects={projects}
            selectedProjectId={selectedProject?.id || null}
            onSelectProject={setSelectedProject}
            onVisibleProjectsChange={setVisibleProjects}
            isDataLoading={isLoadingProjects}
          />
        </div>
        <ProjectInfoPanel project={selectedProject} visibleCount={visibleProjects.length} />
      </section>

      <section className="text-section">
        <h2>서비스 설명</h2>
        <p>
          이 서비스는 검색 포털이 아니라 내 주변 공사 정보 지도입니다. 위치 권한이 있으면 현재 위치를 중심으로,
          없으면 수도권 기본 좌표를 기준으로 공사·개발 마커를 바로 보여줍니다.
        </p>
        <h3>데이터 출처와 기준일</h3>
        <p>
          마커를 누르면 사업명, 위치, 상태, 일정, 출처, 기준일을 확인할 수 있습니다. 공사중 여부는 착공일과 사용승인일 조합으로만 표시합니다.
        </p>
      </section>

      <section className="content-grid">
        <article>
          <h2>수도권 데이터 범위</h2>
          <div className="area-shortcuts">
            {areas.map((areaItem) => (
              <Link to={`/area/${areaItem.slug}`} key={areaItem.slug} className="area-card">
                <strong>{areaItem.name}</strong>
                <p>{areaItem.shortDescription}</p>
                <span>{areaItem.count}개 레코드</span>
              </Link>
            ))}
          </div>
        </article>

        <article>
          <h2>최근 검증된 공사 정보</h2>
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
