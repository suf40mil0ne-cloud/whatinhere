import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FAQS } from "../data/projects";
import { filterProjects, getAreaShortcuts, getRecentProjects } from "../lib/content";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";
import { HomeMap } from "../components/HomeMap";
import { ProjectCard } from "../components/ProjectCard";

export function HomePage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [area, setArea] = useState("전체");
  const [sort, setSort] = useState<"updated_desc" | "completion_asc" | "area_desc">("updated_desc");
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(undefined);

  usePageMeta({
    title: "여기 뭐 생겨요? | 지도에서 주변 공사·개발 예정 정보를 확인",
    description:
      "지도에서 주변 공사·개발·건축 인허가 정보를 확인하세요. 어떤 사업인지, 현재 단계가 무엇인지, 언제쯤 변화를 체감할지 쉽게 살펴볼 수 있습니다.",
    canonicalPath: "/",
  });

  useJsonLd("ld-home", {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "여기 뭐 생겨요?",
    url: "https://whatsinhere.pages.dev/",
    description: "지도에서 주변 공사·개발 예정 정보를 확인하는 서비스",
  });

  const filtered = useMemo(() => filterProjects({ query, status, area, sort }), [query, status, area, sort]);
  const recent = useMemo(() => getRecentProjects(6), []);
  const areas = useMemo(() => getAreaShortcuts(), []);

  return (
    <div className="page page-home">
      <section className="hero">
        <h1>지도에서 주변 공사·개발 예정 정보를 확인하는 서비스</h1>
        <p>
          "여기 뭐 생겨요", "이 공사 뭐짓는거지", "언제 완공돼요" 같은 궁금증을 해결할 수 있도록,
          지역 개발·건축 인허가 정보를 설명형 콘텐츠로 정리해 제공합니다.
        </p>
      </section>

      <section className="controls-section">
        <div className="search-line">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="지역명/지하철역/주소/사업명 검색 (예: 킨텍스, 고촌, 물류센터)"
          />
        </div>
        <div className="filter-line">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["전체", "예정", "접수", "허가", "착공준비", "착공", "공사중", "사용승인", "준공/완료", "정보부족"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="전체">전체 지역</option>
            {areas.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated_desc">최신 업데이트순</option>
            <option value="completion_asc">완료 시점순</option>
            <option value="area_desc">지역순</option>
          </select>
        </div>
      </section>

      <section className="map-list-grid">
        <div className="map-panel">
          <HomeMap projects={filtered} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
        </div>
        <div className="list-panel">
          <h2>프로젝트 목록</h2>
          {filtered.length === 0 ? (
            <div className="empty-result">
              <p>검색 결과가 없습니다.</p>
              <p>추천 지역: <Link to="/area/kintex">킨텍스권</Link>, <Link to="/area/ilsan">일산</Link>, <Link to="/area/gimpo">김포</Link></p>
            </div>
          ) : (
            filtered.map((project) => <ProjectCard key={project.id} project={project} />)
          )}
        </div>
      </section>

      <section className="content-grid">
        <article>
          <h2>최근 추가 프로젝트</h2>
          <div className="recent-grid">
            {recent.map((project) => (
              <Link to={`/project/${project.slug}`} key={project.id} className="recent-card">
                <strong>{project.title}</strong>
                <span>{project.area} · {project.status}</span>
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
          단순히 지도에 점을 찍는 것이 아니라, 각 프로젝트가 어떤 시설인지, 현재 단계가 무엇인지,
          생활권에 어떤 변화가 생길 수 있는지를 설명형 텍스트로 제공합니다.
        </p>
        <h3>데이터 출처와 업데이트 방식</h3>
        <p>
          공공데이터포털, 지자체 공개자료, 공식 문서, 보도자료를 기반으로 수집·정리하며,
          표기 차이나 시차가 있을 수 있어 중요한 결정 전에는 원문 확인을 권장합니다.
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
