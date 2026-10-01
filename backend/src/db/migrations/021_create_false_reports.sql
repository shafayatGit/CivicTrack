-- 021: false-report moderation queue, and citizen deactivation.
--
-- THE WORKFLOW THIS SERVES: a citizen reports an issue, an admin assigns it to a
-- staff member, and the staff member verifies it on the ground. A staff member who
-- finds the report bogus flags it instead of working it. That flag lands in the
-- false_reports queue below, where an admin decides whether the *citizen* is
-- responsible for the abuse — and can deactivate the account, which blocks login
-- and new reports from then on.
--
-- WHY is_invalid IS A COLUMN AND NOT A FIFTH STATUS. The obvious alternative is
-- ENUM('Reported','Acknowledged','In Progress','Resolved','Invalid'). A separate
-- flag was chosen deliberately: the status machine records *workflow progress* and
-- is mirrored in two places (issue.service.js ALLOWED_TRANSITIONS and
-- frontend/lib/issue-status.js), while this flag records a *moderation verdict*
-- that is orthogonal to progress. A staff member can flag a report as false
-- whether it is still Reported or already In Progress, so it is not a stage the
-- issue passes through. It also keeps the ERD's four-state machine intact.
--
-- THE INVARIANT THIS CHANGES, which matters more than the columns:
--     staff.issue_count = COUNT(issues WHERE assigned_staff_id = staff.id
--                                            AND status <> 'Resolved'
--                                            AND is_invalid = FALSE)
-- A false-flagged issue is not open work, so it must leave the count. Migration
-- 022 rewrites the four workload triggers in 015/020 to that end and re-runs the
-- backfill. Everything that counts "open" elsewhere in the app (issue.service.js
-- getStats/getMyStats, department.service.js) uses the same two conditions.
--
-- NO user_id COLUMN HERE. The submitting citizen is issues.user_id, and the queue
-- joins to it. Copying it in would be a second source of truth that could drift
-- from the issue it describes; the join is already indexed through the FK.
--
-- APPEND-ONLY, NOT ONE ROW PER ISSUE. A flag can be dismissed and the same issue
-- re-flagged later, and that second judgement is evidence in its own right — the
-- same reasoning migration 012 gives for keeping status_history rather than
-- overwriting it. The queue therefore filters status = 'pending', and the current
-- verdict for an issue is the row issues.is_invalid reflects.
--
-- ON DELETE CHOICES:
--   issue       CASCADE   — the moderation record has no meaning without the issue
--   flagged_by  RESTRICT  — a staff member who judged a report false is part of the
--                           record. Deleting them is refused (the error handler
--                           renders that as 409) rather than orphaning the verdict.
--                           Note this makes staff.delete refuse to remove any staffer
--                           who has ever flagged an issue; deactivate them instead.
--   actioned_by SET NULL  — matches status_history.changed_by (migration 012): the
--                           audit trail outlives the admin who acted on it.
--
-- Replay-safe: db:migrate re-runs every file on each invocation. ADD COLUMN has no
-- IF NOT EXISTS on MySQL 8, so the column groups go through an information_schema
-- guard exactly as 003 and 019 do. The guard watches the first column of each group
-- because the statement either adds all of them or none of them.
SET @ddl := 'ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role,
  ADD COLUMN deactivated_at datetime NULL DEFAULT NULL AFTER is_active,
  ADD COLUMN deactivation_reason VARCHAR(255) NULL DEFAULT NULL AFTER deactivated_at';

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'is_active'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- is_active is NOT NULL DEFAULT TRUE, so every existing citizen and staff account
-- stays active. Deactivation is opt-in, never a migration side effect.
SET @ddl := 'ALTER TABLE issues
  ADD COLUMN is_invalid BOOLEAN NOT NULL DEFAULT FALSE AFTER status,
  ADD COLUMN invalid_reason VARCHAR(255) NULL DEFAULT NULL AFTER is_invalid,
  ADD COLUMN invalid_flagged_at datetime NULL DEFAULT NULL AFTER invalid_reason';

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'issues'
      AND COLUMN_NAME = 'is_invalid'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE
  IF NOT EXISTS false_reports (
    id CHAR(36) PRIMARY KEY,
    issue_id CHAR(36) NOT NULL,
    -- The staffer's own words. NOT NULL and bounded: a moderation verdict with no
    -- stated reason is not reviewable, and the admin is deciding about a person's
    -- account on the strength of it.
    reason VARCHAR(255) NOT NULL,
    -- staff.id, not users.id: the judgement belongs to the officer who made it on
    -- the ground, and staff rows are what the rest of the app calls an assignee.
    flagged_by CHAR(36) NOT NULL,
    flagged_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- 'pending'  waiting on an admin decision
    -- 'upheld'   the flag was correct; the citizen was (or already had been)
    --            deactivated by deactivateCitizen
    -- 'dismissed' the officer was wrong; issues.is_invalid is cleared and the
    --            issue returns to the normal workflow
    status ENUM ('pending', 'upheld', 'dismissed') NOT NULL DEFAULT 'pending',
    actioned_by CHAR(36) DEFAULT NULL,
    actioned_at datetime DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- The queue is always "pending flags, newest first", so status leads the index
    -- and flagged_at is the sort key it can satisfy without a filesort.
    KEY idx_false_reports_status (status, flagged_at),
    KEY idx_false_reports_issue (issue_id),
    CONSTRAINT fk_false_reports_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_false_reports_flagged_by FOREIGN KEY (flagged_by) REFERENCES staff (id) ON DELETE RESTRICT,
    CONSTRAINT fk_false_reports_actioned_by FOREIGN KEY (actioned_by) REFERENCES users (id) ON DELETE SET NULL
  );
