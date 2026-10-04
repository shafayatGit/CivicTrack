-- 024: give departments a resolution target, which is what makes overdue_count real.
--
-- 013 created department_performance with an overdue_count column and noted that
-- nothing could compute it, because "SLA threshold" appears exactly once in the ERD —
-- in that column's own description — with no threshold value anywhere. This migration
-- closes that gap by putting the threshold somewhere a value can live.
--
-- Per-department rather than one global constant, because the targets are not
-- interchangeable: a streetlight outage and a collapsed road are not the same job, and
-- a single number would let a department look compliant on a category it has no
-- capability to speed up. An admin sets each department's own target.
--
-- NULLABLE, and that is the load-bearing choice. NULL means "no target set", and the
-- snapshot then records overdue_count as NULL rather than 0. That is deliberately not
-- the same as zero: a department with no target has not met one, and reporting 0
-- overdue would read as a perfect score for a measurement never taken. The column in
-- 013 is NOT NULL DEFAULT 0, so it is widened here to allow NULL — a department that
-- has opted out of the metric must be able to say so in the data.
--
-- 72 hours (3 days) is the seeded default: a value in the ERD's spirit for civic
-- reporting, applied to every existing department so a fresh database produces a
-- populated report rather than a wall of NULLs.
--
-- Replay-safe: db:migrate re-runs every file, and ADD COLUMN / MODIFY COLUMN have no
-- IF NOT EXISTS on MySQL 8, so both go through an information_schema guard.

SET @ddl := 'ALTER TABLE departments
  ADD COLUMN resolution_target_hours INT NULL DEFAULT 72 AFTER contact_email';

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'departments'
      AND COLUMN_NAME = 'resolution_target_hours'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- A target of zero or negative hours is not a target — it would mark every issue
-- overdue the moment it was filed, which is a number no one should be shown as
-- performance. CHECK is the right tool because it makes the bad value unwritable at
-- the storage layer rather than only at the API edge, and 1 is the smallest value that
-- still means "a real period of time".
SET @ddl := 'ALTER TABLE departments
  ADD CONSTRAINT chk_departments_resolution_target CHECK (resolution_target_hours IS NULL OR resolution_target_hours >= 1)';

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'departments'
      AND CONSTRAINT_NAME = 'chk_departments_resolution_target'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- overdue_count becomes nullable. See the header note: 0 means "measured, nothing
-- overdue", NULL means "no target set, not measured", and collapsing the two is exactly
-- the lie 013 warned against.
SET @ddl := 'ALTER TABLE department_performance
  MODIFY COLUMN overdue_count INT NULL DEFAULT NULL';

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'department_performance'
      AND COLUMN_NAME = 'overdue_count'
      AND IS_NULLABLE = 'YES'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;