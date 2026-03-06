-- Source registry: source adapter 메타데이터
CREATE TABLE IF NOT EXISTS source_registry (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  endpoint_or_url TEXT NOT NULL,
  refresh_cycle TEXT,
  parser_type TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 원천 데이터 보관 (raw)
CREATE TABLE IF NOT EXISTS raw_ingest (
  raw_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  raw_hash TEXT NOT NULL,
  source_record_id TEXT,
  FOREIGN KEY (source_id) REFERENCES source_registry(source_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_source ON raw_ingest(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_hash ON raw_ingest(raw_hash);

-- 사용자에게 보여주는 정규화 프로젝트
CREATE TABLE IF NOT EXISTS normalized_projects (
  project_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 0,
  address_road TEXT,
  address_jibun TEXT,
  lat REAL,
  lng REAL,
  permit_type TEXT,
  main_use TEXT,
  sub_use TEXT,
  permit_date TEXT,
  start_date TEXT,
  approval_date TEXT,
  status_normalized TEXT NOT NULL,
  building_area REAL,
  gross_floor_area REAL,
  floors_above INTEGER,
  floors_below INTEGER,
  households INTEGER,
  contractor TEXT,
  designer TEXT,
  supervisor TEXT,
  local_government TEXT,
  source_count INTEGER NOT NULL DEFAULT 1,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_bbox ON normalized_projects(lat, lng);
CREATE INDEX IF NOT EXISTS idx_projects_status ON normalized_projects(status_normalized);
CREATE INDEX IF NOT EXISTS idx_projects_main_use ON normalized_projects(main_use);

-- 상태 이력
CREATE TABLE IF NOT EXISTS project_status_history (
  history_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  raw_status TEXT,
  normalized_status TEXT NOT NULL,
  status_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES normalized_projects(project_id),
  FOREIGN KEY (source_id) REFERENCES source_registry(source_id)
);

CREATE INDEX IF NOT EXISTS idx_history_project ON project_status_history(project_id);

-- 기본 source seed
INSERT OR IGNORE INTO source_registry (
  source_id, source_name, source_type, provider, endpoint_or_url, refresh_cycle, parser_type, enabled
) VALUES
  ('dev-permit-openapi', '국토교통부 도시계획 개발행위허가정보서비스', 'openapi', '공공데이터포털', 'https://apis.data.go.kr/1613000/UrbanPlanDevelopmentPermitService', 'daily', 'json', 1),
  ('building-basic-openapi', '전국건축인허가기본정보표준데이터', 'openapi', '공공데이터포털', 'https://apis.data.go.kr/1741000/StanBuildngPrmisnInfoService', 'daily', 'json', 1),
  ('building-hub-openapi', '국토교통부 건축HUB 건축인허가정보', 'openapi', '국토교통부', 'https://apis.data.go.kr/1613000/ArchHubBuildingPermitService', 'daily', 'json', 1),
  ('local-csv-upload', '지자체 파일데이터 업로드', 'file', '지자체', 'file://local-upload', 'manual', 'csv/xlsx', 1);
