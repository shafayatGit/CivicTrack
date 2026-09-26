-- 016: reporting view over resolved issues (ERD 3.2).
--
-- CREATE OR REPLACE VIEW is supported by both MySQL 8 and MariaDB 10.4, so this file
-- is replay-safe as written.
--
-- The only translation from the ERD's version is the resolution-hours average. The ERD
-- uses PostgreSQL's EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600, which
-- subtracts two timestamps into an interval and pulls out epoch seconds. MySQL and
-- MariaDB have no interval type, so TIMESTAMPDIFF(SECOND, created_at, resolved_at)
-- replaces it. The / 3600.0 casts to a decimal — without it MySQL does integer
-- division and every average collapses to 0.
--
-- Only rows with status = 'Resolved' are included, so this view is not a substitute
-- for issue counts by status. Grouped by category and ward, which is the cut the ERD
-- specifies.
--
-- DEVIATION FROM ERD: no overdue/SLA column. The ERD does not define a threshold, so
-- there is nothing to filter on here either. See the gap noted in 013.
CREATE OR REPLACE VIEW resolved_issue_summary AS
SELECT
  c.name AS category,
  w.name AS ward,
  COUNT(*) AS resolved_count,
  AVG(TIMESTAMPDIFF(SECOND, i.created_at, i.resolved_at) / 3600.0) AS avg_resolution_hours
FROM issues i
JOIN categories c ON i.category_id = c.id
JOIN wards w ON i.ward_id = w.id
WHERE i.status = 'Resolved'
GROUP BY c.name, w.name;
