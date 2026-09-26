-- 015: triggers that maintain the denormalised counters and the audit trail.
--
-- IDEMPOTENCY: CREATE TRIGGER has no IF NOT EXISTS on MySQL 8 (MariaDB does have it),
-- so each trigger is dropped and recreated. That is replay-safe and portable.
--
-- WHY EVERY BODY IS A SINGLE STATEMENT: this project runs each migration file as one
-- conn.query() with multipleStatements: true. Compound BEGIN...END trigger bodies
-- depend on how the driver and server split statements on `;`, and that could not be
-- verified here (no writable database available), so nothing below uses BEGIN...END
-- or contains an internal semicolon. The cost is that the ERD's single
-- sync_staff_issue_count() trigger is split into three one-statement triggers
-- (decrement, insert-increment, update-increment) that together reproduce exactly its
-- logic. Re-merge into one compound trigger only after confirming the runner handles
-- compound bodies.
--
-- Multiple triggers on the same table and event is fine on both engines; they are
-- independent, so no FOLLOWS/PRECEDES ordering is required.

-- ---------------------------------------------------------------------------
-- Audit trail: issues.status -> status_history (ERD 1.9, ERD 3.1)
-- ---------------------------------------------------------------------------
-- Writes a row only when status actually changed, matching the ERD's
-- IF NEW.status IS DISTINCT FROM OLD.status guard. IS DISTINCT FROM is PostgreSQL;
-- <=> is the null-safe equality operator in MySQL/MariaDB.
--
-- !! POOL HAZARD — READ BEFORE USING !!
-- changed_by comes from the @civictrack_actor_id session variable, which the ERD
-- calls "a transient column or session variable" and which is the only option here
-- (issues has no updated_by column). Session variables belong to a CONNECTION, and
-- src/config/db.js exposes a mysql2 POOL. Two separate pool.query() calls can land on
-- two different connections, so this sequence does NOT work:
--
--     await db.query("SET @civictrack_actor_id = ?", [id]);   // connection A
--     await db.query("UPDATE issues SET status = ? ...");     // connection B — var unset
--
-- The variable must be set and the UPDATE issued on one pinned connection:
--
--     const conn = await db.getConnection();
--     try {
--       await conn.query("SET @civictrack_actor_id = ?", [id]);
--       await conn.query("UPDATE issues SET status = ? WHERE id = ?", [status, issueId]);
--     } finally {
--       conn.release();
--     }
--
-- If it is left unset, changed_by is NULL — which the column permits — and the status
-- change is still recorded, just anonymously. Set to a non-existent user id and the
-- FK will reject the UPDATE, so this fails loudly rather than silently mis-attributing.
DROP TRIGGER IF EXISTS trg_issues_log_status_change;

CREATE TRIGGER trg_issues_log_status_change
AFTER UPDATE ON issues
FOR EACH ROW
INSERT INTO status_history (id, issue_id, old_status, new_status, changed_by, changed_at)
SELECT UUID(), NEW.id, OLD.status, NEW.status, @civictrack_actor_id, CURRENT_TIMESTAMP
FROM DUAL
WHERE NOT (NEW.status <=> OLD.status);

-- ---------------------------------------------------------------------------
-- Workload counter: issues.assigned_staff_id -> staff.issue_count (ERD 1.11)
-- ---------------------------------------------------------------------------
-- staff.issue_count is a deliberate denormalised cache (ERD section 4) so the
-- assignment dashboard and "assign to the least-loaded staff member" do not rescan
-- issues on every read. It is only correct if these three triggers stay in step with
-- the issues table.
--
-- The CHECK (issue_count >= 0) added in 007 is the backstop: GREATEST() clamps at
-- zero so a miscount can never drive the column negative, and the CHECK would reject
-- the write if it somehow did.

-- 1/3. UPDATE, decrement: the issue left this staffer, or it reached 'Resolved'.
--      Guards on OLD being a real staffer, so unassignment does not touch NULL.
DROP TRIGGER IF EXISTS trg_issues_staff_count_decrement;

CREATE TRIGGER trg_issues_staff_count_decrement
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = GREATEST(issue_count - 1, 0)
WHERE id = OLD.assigned_staff_id
  AND OLD.assigned_staff_id IS NOT NULL
  AND (NOT (OLD.assigned_staff_id <=> NEW.assigned_staff_id) OR NEW.status = 'Resolved');

-- 2/3. INSERT, increment: a new issue arriving already assigned and not resolved.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_insert;

CREATE TRIGGER trg_issues_staff_count_on_insert
AFTER INSERT ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND NEW.status <> 'Resolved';

-- 3/3. UPDATE, increment: a staffer newly picked the issue up. The null-safe
--      comparison means reassigning to the same staffer is not double-counted.
--      Combined with trigger 1, reassignment moves one unit from old to new.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_update;

CREATE TRIGGER trg_issues_staff_count_on_update
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND NEW.status <> 'Resolved'
  AND NOT (OLD.assigned_staff_id <=> NEW.assigned_staff_id);
