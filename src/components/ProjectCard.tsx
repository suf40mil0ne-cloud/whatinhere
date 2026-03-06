import { Link } from "react-router-dom";
import type { NearbyConstructionRecord } from "../types/content";

interface Props {
  project: NearbyConstructionRecord;
}

export function ProjectCard({ project }: Props) {
  return (
    <article className="project-card">
      <p className="project-meta">{project.sido} {project.sigungu} · {project.sourceName}</p>
      <h3>
        <Link to={`/project/${project.slug}`}>{project.title}</Link>
      </h3>
      <p className="project-status">{project.statusText} · 기준일 {project.verifiedAt || project.updatedAt || "미확인"}</p>
      <p>{project.summary || "출처 기반 핵심 일정 정보 정리 중"}</p>
      <p className="project-address">위치: {project.address || "미확인"}</p>
    </article>
  );
}
