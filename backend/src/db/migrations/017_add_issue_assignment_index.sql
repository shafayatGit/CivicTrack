-- 017: index for issue assignment queries.
--
-- WHY: EXPLAIN on the unassigned-issue queue came back as
--     type=ALL, key=NULL   (a full table scan plus a filesort)
-- with no index on issues.assigned_staff_id in migration 008. The admin triage
-- screen is "show me what nobody is working on, newest first", which is the single
-- most-used query in the app, and it was the one query scanning every row.
--
-- The column is also the target of the join in every issue list, where the
-- assigned-staff filter was equally unindexed.
--
-- (assigned_staff_id, created_at) rather than assigned_staff_id alone: the queue is
-- always "filter by assignment, ORDER BY created_at DESC". Carrying created_at as the
-- trailing key lets InnoDB satisfy the filter and the sort from the same index, which
-- removes the filesort as well as the scan. A single-column index would fix the scan
-- and leave the sort.
--
-- IS NULL is usable on a composite index in both MySQL 8 and MariaDB, which is the
-- whole point for the unassigned case.
--
-- IDEMPOTENT: CREATE INDEX has no IF NOT EXISTS on MySQL 8, and db:migrate replays
-- every file on every run. Guarded through information_schema + PREPARE/EXECUTE, the
-- same pattern as 003 and 006. No BEGIN...END anywhere — see the note in 015.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'issues'
      AND INDEX_NAME = 'idx_issues_assignment'
  ),
  'SELECT 1',
  'CREATE INDEX idx_issues_assignment ON issues (assigned_staff_id, created_at)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
