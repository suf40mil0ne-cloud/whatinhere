-- Migration: s_scale 및 overall_score_adjusted 컬럼 추가
-- 기존 D1 데이터베이스에 한 번만 실행하세요.
-- 신규 배포(schema.sql 초기화)에는 불필요합니다.

ALTER TABLE apt_complexes ADD COLUMN s_scale REAL;
ALTER TABLE apt_complexes ADD COLUMN overall_score_adjusted REAL;
