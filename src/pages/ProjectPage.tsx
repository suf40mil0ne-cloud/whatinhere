import { Link, useParams } from "react-router-dom";
import { getProjectBySlug } from "../data/projects";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";

function areaText(v?: number) {
  if (v == null) return "정보 없음";
  return `${Math.round(v).toLocaleString("ko-KR")}㎡`;
}

export function ProjectPage() {
  const { slug = "" } = useParams();
  const project = getProjectBySlug(slug);

  if (!project) {
    return (
      <div className="page">
        <h1>프로젝트를 찾을 수 없습니다</h1>
        <p>링크가 변경되었거나 데이터가 제거되었을 수 있습니다.</p>
        <Link to="/">홈으로 이동</Link>
      </div>
    );
  }

  usePageMeta({
    title: `${project.title} | ${project.area} 개발 상세`,
    description: `${project.area} ${project.title}의 단계, 일정, 생활권 영향, 데이터 출처를 확인하세요.`,
    canonicalPath: `/project/${project.slug}`,
  });

  useJsonLd(`ld-project-${project.slug}`, {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: project.title,
    description: project.summary,
    dateModified: project.updatedAt,
    about: project.mainUse,
  });

  return (
    <div className="page project-page">
      <p className="project-meta-top">{project.area} · {project.category} · 최종 확인일 {project.updatedAt}</p>
      <h1>{project.title}</h1>
      <p className="lead">{project.summary}</p>

      <section>
        <h2>프로젝트 개요</h2>
        <p>{project.description}</p>
      </section>

      <section>
        <h2>위치 및 주변 맥락</h2>
        <p><strong>주소:</strong> {project.address}</p>
        <p>{project.context}</p>
      </section>

      <section>
        <h2>현재 상태</h2>
        <p><strong>대표 상태:</strong> {project.status}</p>
        <p>{project.timelineNote}</p>
      </section>

      <section>
        <h2>예상 일정</h2>
        <ul>
          <li>허가일: {project.permitDate || "정보 없음"}</li>
          <li>착공일: {project.startDate || "정보 없음"}</li>
          <li>사용승인일: {project.approvalDate || "정보 없음"}</li>
          <li>완료 예상: {project.expectedCompletion}</li>
        </ul>
      </section>

      <section>
        <h2>무엇이 생기는가</h2>
        <ul>
          <li>대표 용도: {project.mainUse}</li>
          <li>건축면적: {areaText(project.buildingArea)}</li>
          <li>연면적: {areaText(project.grossFloorArea)}</li>
          <li>지상층수: {project.floorsAbove ?? "정보 없음"}</li>
          <li>지하층수: {project.floorsBelow ?? "정보 없음"}</li>
          <li>세대수: {project.households ?? "정보 없음"}</li>
        </ul>
      </section>

      <section>
        <h2>생활권 영향 / 주변 변화 포인트</h2>
        <p>{project.impact}</p>
      </section>

      <section>
        <h2>데이터 출처</h2>
        <ul>
          {project.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> ({source.type})
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>관련 문서·기사 보기</h2>
        <p>아래 링크에서 공식 발표와 원문 문서를 확인할 수 있습니다.</p>
        <ul>
          {project.sources.map((source) => (
            <li key={`${source.url}-related`}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
