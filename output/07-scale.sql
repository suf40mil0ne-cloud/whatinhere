UPDATE apt_complexes
SET s_scale = CASE
  WHEN total_units IS NULL THEN 50
  ELSE MIN(100, MAX(0, ROUND((total_units - 50) * 100.0 / 950.0, 2)))
END,
    overall_score_adjusted = ROUND(((
  COALESCE(s_transport, 0)
  + COALESCE(s_walk, 0)
  + COALESCE(s_value, 0)
  + COALESCE(s_childcare, 0)
  + COALESCE(s_safety, 0)
) / NULLIF(
  (CASE WHEN s_transport IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN s_walk IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN s_value IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN s_childcare IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN s_safety IS NOT NULL THEN 1 ELSE 0 END),
0)) * MIN(1.0, MAX(0.7, 0.7 + (CASE
  WHEN total_units IS NULL THEN 50
  ELSE MIN(100, MAX(0, ROUND((total_units - 50) * 100.0 / 950.0, 2)))
END) / 100.0 * 0.3)), 2);
