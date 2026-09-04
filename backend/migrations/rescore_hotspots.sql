UPDATE hotspots
SET risk_score = ROUND(LEAST(100, GREATEST(0,
  (
    CASE classification
      WHEN 'Industrial Fire / Accident' THEN 0.90
      WHEN 'Wildfire / Forest Fire'     THEN 0.60
      WHEN 'Industrial Thermal Source'  THEN 0.35
      WHEN 'Mining Thermal Activity'    THEN 0.30
      WHEN 'Gas Flare'                  THEN 0.25
      WHEN 'Agricultural Burning'       THEN 0.20
      ELSE 0.05
    END * 0.45
    + LEAST(1.0, LN(1.0 + COALESCE(frp, 0)) / LN(51.0)) * 0.25
    + COALESCE(class_confidence, 0.5) * 0.20
    + 0.075
  ) * 100
)::numeric, 1)
WHERE classification IS NOT NULL
  AND classification <> 'False Positive';

SELECT
  COUNT(*) FILTER (WHERE risk_score >= 76) AS critical,
  COUNT(*) FILTER (WHERE risk_score >= 56 AND risk_score < 76) AS high,
  COUNT(*) FILTER (WHERE risk_score >= 31 AND risk_score < 56) AS moderate,
  COUNT(*) FILTER (WHERE risk_score < 31)  AS low,
  ROUND(MIN(risk_score)::numeric,1)        AS min_score,
  ROUND(MAX(risk_score)::numeric,1)        AS max_score
FROM hotspots
WHERE classification IS NOT NULL;
