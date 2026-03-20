import type { ProjectItem } from "../lib/project-types";
import { formatProjectPeriod, getCategoryLabel, getStatusLabel } from "../lib/project-utils";

interface Props {
  project: ProjectItem | null;
  visibleCount: number;
}

export function ProjectPanel({ project, visibleCount }: Props) {
  if (!project) {
    return (
      <aside className="panel-card">
        <p className="panel-kicker">선택된 사업 없음</p>
        <h2>마커를 누르면 상세 정보가 나옵니다.</h2>
        <p className="panel-description">현재 범위에서 확인된 사업 {visibleCount}건</p>
      </aside>
    );
  }

  return (
    <aside className="panel-card">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{getCategoryLabel(project.category)}</p>
          <h2>{project.name}</h2>
        </div>
        <span className={`project-status project-status-${project.status}`}>{getStatusLabel(project.status)}</span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>유형</dt>
          <dd>{getCategoryLabel(project.category)}</dd>
        </div>
        <div>
          <dt>위치</dt>
          <dd>{project.address ?? "미확인"}</dd>
        </div>
        <div>
          <dt>진행상태</dt>
          <dd>{getStatusLabel(project.status)}</dd>
        </div>
        <div>
          <dt>예상 기간</dt>
          <dd>{formatProjectPeriod(project)}</dd>
        </div>
      </dl>
      {project.description ? <p className="panel-description">{project.description}</p> : null}
      <div className="panel-footer">
        <p className="panel-source">{project.sourceName}</p>
        {project.sourceUrl ? (
          <a href={project.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
            출처 링크
          </a>
        ) : null}
      </div>
    </aside>
  );
}
