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
    title: `${area.name} 주변 공사·개발 지도 | 여기 뭐 생겨요?`,
    description: `${area.name} 지역의 건축허가, 착공, 사용승인, 개발행위허가 정보를 출처와 기준일 중심으로 확인하세요.`,
    canonicalPath: `/area/${area.slug}`,
  });

  useJsonLd(`ld-area-${area.slug}`, {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${area.name} 공사·개발 정보`,
    about: area.regionalContext,
  });

  return (
    <div className="page">
      <h1>{area.name} 지역 공사·개발 정보</h1>
      <p className="lead">{area.shortDescription}</p>
      <section className="text-section">
        <h2>이 지역 맥락</h2>
        <p>{area.regionalContext}</p>
        <h2>왜 이 지역을 봐야 하나?</h2>
        <p>{area.whyImportant}</p>
      </section>

      <section>
        <h2>공공데이터로 확인된 프로젝트</h2>
        <p className="section-description">
          아래 카드는 사업명, 상태 근거, 기준일, 출처 중심으로 정리했습니다. 공사중 여부는 착공일/사용승인일 조합으로 판단합니다.
        </p>
        <div className="list-panel area-list">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
