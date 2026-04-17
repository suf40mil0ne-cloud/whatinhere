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

-- 읍면동 스탯
CREATE TABLE IF NOT EXISTS district_scores (
  code         TEXT PRIMARY KEY,
  sido         TEXT NOT NULL,
  sigungu      TEXT NOT NULL,
  dong         TEXT NOT NULL,
  center_lat   REAL,
  center_lng   REAL,
  households   INTEGER,
  population   INTEGER,
  s_transport  INTEGER,
  s_walk       INTEGER,
  s_value      INTEGER,
  s_childcare  INTEGER,
  s_safety     INTEGER,
  s_overall    INTEGER,
  raw_transport TEXT,
  raw_walk      TEXT,
  raw_value     TEXT,
  raw_childcare TEXT,
  raw_safety    TEXT,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_district_scores_bbox ON district_scores(center_lat, center_lng);
CREATE INDEX IF NOT EXISTS idx_district_scores_sigungu ON district_scores(sigungu);

-- 아파트 단지
CREATE TABLE IF NOT EXISTS apt_complexes (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  address          TEXT,
  lat              REAL,
  lng              REAL,
  district_code    TEXT,
  built_year       INTEGER,
  total_units      INTEGER,
  avg_price_per_m2       INTEGER,
  s_transport            INTEGER,
  s_walk                 INTEGER,
  s_value                INTEGER,
  s_childcare            INTEGER,
  s_safety               INTEGER,
  s_scale                REAL,
  overall_score_adjusted REAL,
  updated_at             TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apt_complexes_bbox ON apt_complexes(lat, lng);
CREATE INDEX IF NOT EXISTS idx_apt_complexes_district ON apt_complexes(district_code);

-- 단지 댓글
CREATE TABLE IF NOT EXISTS apt_comments (
  id         TEXT PRIMARY KEY,
  apt_id     TEXT NOT NULL,
  category   TEXT,
  comment    TEXT NOT NULL,
  user_score INTEGER,
  likes      INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (apt_id) REFERENCES apt_complexes(id)
);

CREATE INDEX IF NOT EXISTS idx_apt_comments_apt ON apt_comments(apt_id);

-- 유저 투표 (읍면동)
CREATE TABLE IF NOT EXISTS user_votes (
  id            TEXT PRIMARY KEY,
  district_code TEXT NOT NULL,
  category      TEXT NOT NULL CHECK(category IN ('transport','walk','value','childcare','safety')),
  score         INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_votes_district ON user_votes(district_code);

-- 기본 source seed
INSERT OR IGNORE INTO source_registry (
  source_id, source_name, source_type, provider, endpoint_or_url, refresh_cycle, parser_type, enabled
) VALUES
  ('dev-permit-openapi', '국토교통부 도시계획 개발행위허가정보서비스', 'openapi', '공공데이터포털', 'https://apis.data.go.kr/1613000/UrbanPlanDevelopmentPermitService', 'daily', 'json', 1),
  ('building-basic-openapi', '전국건축인허가기본정보표준데이터', 'openapi', '공공데이터포털', 'https://apis.data.go.kr/1741000/StanBuildngPrmisnInfoService', 'daily', 'json', 1),
  ('building-hub-openapi', '국토교통부 건축HUB 건축인허가정보', 'openapi', '국토교통부', 'https://apis.data.go.kr/1613000/ArchHubBuildingPermitService', 'daily', 'json', 1),
  ('local-csv-upload', '지자체 파일데이터 업로드', 'file', '지자체', 'file://local-upload', 'manual', 'csv/xlsx', 1),
  ('arch-pms-hub', '국토교통부 건축인허가 기본정보 (ArchPmsHub)', 'openapi', '공공데이터포털', 'https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo', 'daily', 'json', 1);

-- 유저
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  nickname    TEXT NOT NULL,
  profile_img TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 세션
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 대결
CREATE TABLE IF NOT EXISTS battles (
  id         TEXT PRIMARY KEY,
  apt_a_id   TEXT NOT NULL,
  apt_b_id   TEXT NOT NULL,
  apt_a_name TEXT NOT NULL,
  apt_b_name TEXT NOT NULL,
  winner     TEXT,
  score_a    TEXT NOT NULL,
  score_b    TEXT NOT NULL,
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_battles_apt_a ON battles(apt_a_id);
CREATE INDEX IF NOT EXISTS idx_battles_apt_b ON battles(apt_b_id);

-- 배틀 댓글
CREATE TABLE IF NOT EXISTS battle_comments (
  id         TEXT PRIMARY KEY,
  battle_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  comment    TEXT NOT NULL,
  likes      INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_battle_comments_battle ON battle_comments(battle_id);

-- 댓글 좋아요 (중복 방지)
CREATE TABLE IF NOT EXISTS comment_likes (
  user_id    TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);

-- 딴지
CREATE TABLE IF NOT EXISTS battle_disputes (
  id         TEXT PRIMARY KEY,
  battle_id  TEXT NOT NULL,
  user_id    TEXT,
  category   TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disputes_battle ON battle_disputes(battle_id);
