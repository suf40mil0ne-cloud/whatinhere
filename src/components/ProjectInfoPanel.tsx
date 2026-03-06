import { Link } from "react-router-dom";
import type { NearbyConstructionRecord } from "../types/content";

interface Props {
  project: NearbyConstructionRecord | null;
  visibleCount: number;
}

function renderDate(value: string | null): string {
  return value || "미확인";
}

function renderConfidence(project: NearbyConstructionRecord): string {
  return project.confidenceLabel === "high" ? "높음" : project.confidenceLabel === "medium" ? "보통" : "낮음";
}

export function ProjectInfoPanel({ project, visibleCount }: Props) {
  if (!project) {
    return (
      <aside className="info-panel empty">
        <strong>선택된 마커가 없습니다.</strong>
        <p>지도에서 마커를 누르면 사업명, 상태, 출처, 기준일이 표시됩니다.</p>
        <p>현재 범위에서 확인된 공공데이터 {visibleCount}건</p>
      </aside>
    );
  }

  return (
    <aside className="info-panel">
      <p className="eyebrow">{project.sido} {project.sigungu} · {project.sourceName}</p>
      <h2>{project.title}</h2>
      <div className="status-row">
        <span className={`status-pill status-${project.status}`}>{project.statusText}</span>
        <span className={`confidence-badge confidence-${project.confidenceLabel}`}>신뢰도 {renderConfidence(project)}</span>
      </div>
      <p className="fact-summary">{project.summary || "출처 기반 요약 정보가 아직 정리되지 않았습니다."}</p>

      <dl className="fact-grid">
        <div>
          <dt>위치</dt>
          <dd>{project.address || "미확인"}</dd>
        </div>
        <div>
          <dt>허가일</dt>
          <dd>{renderDate(project.permitDate)}</dd>
        </div>
        <div>
          <dt>착공일</dt>
          <dd>{renderDate(project.startDate)}</dd>
        </div>
        <div>
          <dt>사용승인일</dt>
          <dd>{renderDate(project.approvalDate)}</dd>
        </div>
        <div>
          <dt>용도</dt>
          <dd>{project.buildingUse || project.mainPurpose || "미확인"}</dd>
        </div>
        <div>
          <dt>사업 구분</dt>
          <dd>{project.category || "미확인"}</dd>
        </div>
        <div>
          <dt>상태 근거</dt>
          <dd>{project.statusReason || "미확인"}</dd>
        </div>
        <div>
          <dt>기준일</dt>
          <dd>{project.verifiedAt || project.updatedAt || "미확인"}</dd>
        </div>
      </dl>

      <section className="panel-section">
        <h3>한 줄 안내</h3>
        <p>{project.description || "원문 기준 사실 위주로 표시합니다."}</p>
      </section>

      <section className="panel-section">
        <h3>출처</h3>
        <p>{project.sourceName}</p>
        {project.sourceUrl ? (
          <p>
            <a href={project.sourceUrl} target="_blank" rel="noreferrer">
              원문 바로가기
            </a>
          </p>
        ) : null}
      </section>

      <div className="panel-actions">
        <Link to={`/project/${project.slug}`}>프로젝트 상세 보기</Link>
      </div>
    </aside>
  );
}
