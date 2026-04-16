UPDATE apt_complexes
SET s_scale = CASE
  WHEN total_units IS NULL THEN 50
  ELSE MIN(100, MAX(0, ROUND((total_units - 50) * 100.0 / 950.0, 2)))
END,
    overall_score_adjusted = ROUND(((
  COALESCE(NULLIF(s_transport, 0), 0)
  + COALESCE(NULLIF(s_walk, 0), 0)
  + COALESCE(NULLIF(s_value, 0), 0)
  + COALESCE(NULLIF(s_childcare, 0), 0)
  + COALESCE(NULLIF(s_safety, 0), 0)
) / 5.0) * MIN(1.0, MAX(0.7, 0.7 + (CASE
  WHEN total_units IS NULL THEN 50
  ELSE MIN(100, MAX(0, ROUND((total_units - 50) * 100.0 / 950.0, 2)))
END) / 100.0 * 0.3)), 2);
