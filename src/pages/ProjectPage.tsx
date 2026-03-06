import { Link, useParams } from "react-router-dom";
import { getProjectBySlug } from "../data/projects";
import { useJsonLd, usePageMeta } from "../hooks/usePageMeta";
import { getDisplayStatus } from "../lib/project-status";

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

  const displayStatus = getDisplayStatus(project);

  usePageMeta({
    title: `${project.title} | ${project.region2 || project.region1 || "지역"} 공사·개발 상세`,
    description: `${project.title}의 상태, 허가·착공·사용승인 기준일, 출처, 신뢰도를 확인하세요.`,
    canonicalPath: `/project/${project.slug}`,
  });

  useJsonLd(`ld-project-${project.slug}`, {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: project.title,
    description: project.summary,
    dateModified: project.verifiedAt || project.updatedAt,
    about: project.mainPurpose || project.buildingUse,
  });

  return (
    <div className="page project-page">
      <p className="project-meta-top">
        {project.region1} {project.region2} {project.region3} · {project.sourceName} · 최종 확인일 {project.verifiedAt || project.updatedAt || "미확인"}
      </p>
      <h1>{project.title}</h1>
      <p className="lead">{project.summary}</p>

      <section>
        <h2>프로젝트 개요</h2>
        <p>{project.description || "공식 공개자료 기준 사실 위주로 정리된 사업입니다."}</p>
      </section>

      <section>
        <h2>위치 및 주변 맥락</h2>
        <p><strong>주소:</strong> {project.address || "미확인"}</p>
        <p><strong>좌표:</strong> {project.lat != null && project.lng != null ? `${project.lat}, ${project.lng}` : "미확인"}</p>
      </section>

      <section>
        <h2>현재 상태</h2>
        <p><strong>대표 표시:</strong> {displayStatus.label}</p>
        <p><strong>내부 표준 상태:</strong> {project.status}</p>
        <p><strong>상태 근거:</strong> {project.statusReason || "핵심 일정 정보 부족"}</p>
      </section>

      <section>
        <h2>확인된 일정</h2>
        <ul>
          <li>허가일: {project.permitDate || "미확인"}</li>
          <li>착공일: {project.startDate || "미확인"}</li>
          <li>사용승인일: {project.approvalDate || "미확인"}</li>
          <li>기준일: {project.verifiedAt || project.updatedAt || "미확인"}</li>
        </ul>
      </section>

      <section>
        <h2>무엇이 생기는가</h2>
        <ul>
          <li>건축물 용도: {project.buildingUse || "미확인"}</li>
          <li>대표 목적: {project.mainPurpose || "미확인"}</li>
          <li>사업 구분: {project.category || "미확인"}</li>
        </ul>
      </section>

      <section>
        <h2>생활권 영향 / 주변 변화 포인트</h2>
        <p>
          이 페이지에서는 원문에 없는 완공 예측을 단정하지 않습니다. 대신 허가·착공·사용승인 일정과 사업 용도를 바탕으로
          사용자가 직접 지역 변화를 해석할 수 있도록 사실 필드와 출처를 우선 제공합니다.
        </p>
      </section>

      <section>
        <h2>데이터 출처</h2>
        <ul>
          <li>대표 출처: {project.sourceName}</li>
          <li>원본 레코드 ID: {project.sourceRecordId || "미확인"}</li>
          <li>신뢰도: {project.confidenceLabel} ({Math.round(project.confidenceScore * 100)}점)</li>
          <li>검증 시각: {project.verifiedAt || "미확인"}</li>
        </ul>
        {project.sourceUrl ? (
          <p>
            <a href={project.sourceUrl} target="_blank" rel="noreferrer">원문 링크 보기</a>
          </p>
        ) : null}
      </section>

      <section>
        <h2>관련 공식 자료</h2>
        <ul>
          {project.supportingSources.length > 0 ? (
            project.supportingSources.map((source) => (
              <li key={`${source.label}-${source.url}`}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> ({source.type})
              </li>
            ))
          ) : (
            <li>현재 등록된 추가 출처가 없습니다.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
