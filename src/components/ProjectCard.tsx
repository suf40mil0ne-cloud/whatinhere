import { Link } from "react-router-dom";
import type { ProjectData } from "../types/content";

interface Props {
  project: ProjectData;
}

export function ProjectCard({ project }: Props) {
  return (
    <article className="project-card">
      <p className="project-meta">{project.area} · {project.category}</p>
      <h3>
        <Link to={`/project/${project.slug}`}>{project.title}</Link>
      </h3>
      <p className="project-status">상태: {project.status} · 완료 예상: {project.expectedCompletion}</p>
      <p>{project.summary}</p>
      <p className="project-address">위치: {project.address}</p>
    </article>
  );
}
