-- 020: make staff.issue_count survive a reopen, and stop it being debited for
--      issues the staffer never held.
--
-- THE BUG (reported as "a staff member is assigned one issue but the admin
-- dashboard shows 0"): the three triggers in 015 are not symmetric. The decrement
-- fires on `NEW.status = 'Resolved'`, but nothing fires when a resolved issue is
-- reopened. issue.service.js allows `Resolved: ['In Progress']` as a first-class
-- correction, so the moment a resolved issue is reopened the staffer permanently
-- loses one unit of workload and never gets it back. Resolving and reopening an
-- issue once is enough to take the count to 0 while the issue sits open and
-- assigned, which is exactly what happened to the staff row in this database.
--
-- A second, quieter defect in the same trigger set: the decrement fires on ANY
-- change of assigned_staff_id, including reassigning an issue that is ALREADY
-- Resolved. The old staffer was debited for an issue that had already been
-- removed from their count when it was resolved. GREATEST(..., 0) hid this
-- whenever the staffer's count was already 0, which is why it went unnoticed.
--
-- THE INVARIANT, which is the definition the rest of the codebase already uses
-- (department.service.js:49, issue.service.js:249/435/509 all count
-- `status <> 'Resolved'` as open):
--
--     staff.issue_count = COUNT(issues WHERE assigned_staff_id = staff.id
--                                            AND status <> 'Resolved')
--
-- Deriving each trigger from that invariant, with A = OLD.assigned_staff_id and
-- B = NEW.assigned_staff_id, gives exactly four cases on UPDATE:
--
--   A = B, open -> Resolved    debit  A   (the issue stops being open work)
--   A = B, Resolved -> open    credit A   <- this file adds it
--   A <> B                     debit A if A held it, credit B if B now holds it
--
-- and the debit's "if A held it" test is `OLD.status <> 'Resolved'` <- and this
-- file adds it. The credit for B stays with the existing trigger 3/3.
--
-- Replay-safe: CREATE TRIGGER has no IF NOT EXISTS on MySQL 8, so each trigger is
-- dropped and recreated, the same pattern 015 uses.
--
-- Single-statement bodies, no BEGIN...END and no internal semicolon, for the
-- reason 015 documents: the runner sends each file as one conn.query() with
-- multipleStatements, and compound bodies were never verified against it.
--
-- No FOLLOWS/PRECEDES is needed. Within one row change at most one of these
-- triggers can match a given staff row — the reopen trigger additionally requires
-- `A <=> B`, which is the one case where the reassign and close branches are both
-- false — so the order MariaDB fires them in cannot change the result.

-- 1/4. UPDATE, decrement. Recreated with the OLD.status guard: A is only debited
--      for an issue that was actually counted against it, i.e. one that was still
--      open while assigned to A.
DROP TRIGGER IF EXISTS trg_issues_staff_count_decrement;

CREATE TRIGGER trg_issues_staff_count_decrement
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = GREATEST(issue_count - 1, 0)
WHERE id = OLD.assigned_staff_id
  AND OLD.assigned_staff_id IS NOT NULL
  AND OLD.status <> 'Resolved'
  AND (NOT (OLD.assigned_staff_id <=> NEW.assigned_staff_id) OR NEW.status = 'Resolved');

-- 2/4. UPDATE, increment: the issue stayed with the same staffer but stopped being
--      Resolved, so it is open work again. The null-safe equality keeps this off
--      the reassign-and-reopen path, where trigger 3/4 below already credits B.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_reopen;

CREATE TRIGGER trg_issues_staff_count_on_reopen
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND OLD.assigned_staff_id <=> NEW.assigned_staff_id
  AND OLD.status = 'Resolved'
  AND NEW.status <> 'Resolved';

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- The triggers only maintain the count going forward, so the drift already in the
-- database survives this migration. Recomputing from `issues` is what repairs it,
-- and it is safe to replay: the statement is a full recompute, so running it on
-- every db:migrate is idempotent by construction rather than by a version check
-- this project does not have. staff is small and the subquery is index-backed on
-- issues.assigned_staff_id, so the cost is not worth a guard.
--
-- No trigger is involved, and `staff` is not referenced in the subquery, so the
-- "can't update a table used by the statement" restriction does not apply.
UPDATE staff s
SET issue_count = (
  SELECT COUNT(*)
  FROM issues i
  WHERE i.assigned_staff_id = s.id
    AND i.status <> 'Resolved'
);
