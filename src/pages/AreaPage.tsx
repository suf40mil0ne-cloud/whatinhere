import { Link, useParams } from "react-router-dom";
import { getAreaBySlug, getProjectsByArea } from "../data/projects";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";
import { ProjectCard } from "../components/ProjectCard";

export function AreaPage() {
  const { areaSlug = "" } = useParams();
  const area = getAreaBySlug(areaSlug);
  const projects = getProjectsByArea(areaSlug);

  if (!area) {
    return (
      <div className="page">
        <h1>지역을 찾을 수 없습니다</h1>
        <p>요청하신 지역 페이지가 존재하지 않습니다. 홈에서 다시 탐색해 주세요.</p>
        <Link to="/">홈으로 이동</Link>
      </div>
    );
  }

  usePageMeta({
    title: `${area.name} 개발·공사 정보 | 여기 뭐 생겨요?`,
    description: `${area.name} 지역에서 진행 중/예정 프로젝트를 단계·일정·생활권 영향과 함께 확인하세요.`,
    canonicalPath: `/area/${area.slug}`,
  });

  useJsonLd(`ld-area-${area.slug}`, {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${area.name} 개발 프로젝트`,
    about: area.regionalContext,
  });

  return (
    <div className="page">
      <h1>{area.name} 지역 개발·공사 정보</h1>
      <p className="lead">{area.shortDescription}</p>
      <section className="text-section">
        <h2>이 지역 맥락</h2>
        <p>{area.regionalContext}</p>
        <h2>이 지역에서 왜 중요한가?</h2>
        <p>{area.whyImportant}</p>
      </section>

      <section>
        <h2>진행 중/예정 프로젝트</h2>
        <div className="list-panel area-list">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
