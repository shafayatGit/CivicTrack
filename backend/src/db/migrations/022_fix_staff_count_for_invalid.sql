-- 022: make a false-flagged issue leave the staffer's open workload.
--
-- Migration 021 added issues.is_invalid, and this file re-derives the workload
-- triggers from the new invariant:
--
--     staff.issue_count = COUNT(issues WHERE assigned_staff_id = staff.id
--                                            AND status    <> 'Resolved'
--                                            AND is_invalid = FALSE)
--
-- WITHOUT THIS, a staffer who correctly flags a bogus report as false would keep it
-- on their workload forever, because migration 015/020 only ever key off status and
-- assigned_staff_id. The count would then disagree with every open-issue figure in
-- the app, and "assign to the least-loaded officer" would keep steering work at
-- someone who is already carrying more than their share.
--
-- The four triggers from 015/020 are recreated with the two extra conditions, and two
-- more are added for the is_invalid edge itself, since an issue can now leave and
-- re-enter the open set without its status ever changing. The ERD's single
-- sync_staff_issue_count() is now spread over six one-statement triggers, for the
-- reason 015 documents: the runner sends each file as one conn.query() with
-- multipleStatements, and BEGIN...END bodies were never verified against it.
--
-- ---------------------------------------------------------------------------
-- WHY EACH TRIGGER CARRIES BOTH `OLD.is_invalid = FALSE` AND `NEW.is_invalid = FALSE`
-- ---------------------------------------------------------------------------
-- The three ORIGINAL triggers (1/6, 3/6, 4/6) all credit or debit a staffer for an
-- issue that is counted on one side of the change and counted on the other. Each
-- therefore needs the issue to be eligible on the OLD side and the NEW side. Triggers
-- 5/6 and 6/6 are the exception: they exist precisely to handle the is_invalid edge,
-- so each pins the edge to one direction (FALSE->TRUE, or TRUE->FALSE).
--
-- Mutual exclusivity, which is what makes firing order irrelevant. The three
-- original triggers all require NEW.is_invalid = FALSE, so none of them can fire
-- alongside 5/6 (NEW.is_invalid = TRUE) or 6/6 (OLD.is_invalid = TRUE). Among
-- themselves they overlap only where the overlap is intended: 1/6 and 3/6 both fire
-- on a plain reassign of a still-open, still-valid issue, which is exactly the
-- debit-the-old/credit-the-new pair. 1/6 and 4/6 cannot both fire, because 1/6
-- needs (assigned_staff_id changed OR status became 'Resolved') and 4/6 needs the
-- assignee to be unchanged AND status to have left 'Resolved'.
--
-- The two guards that are easy to leave off, and the bug each one prevents:
--
--   3/6 and 4/6 need OLD.is_invalid = FALSE.
--   Both credit the NEW assignee. If the issue was already invalid on the OLD side,
--   then 6/6 is simultaneously crediting that same assignee for the
--   invalid->valid edge, and the staffer would be credited twice for one issue. The
--   double credit is reachable by reassigning and dismissing a flag in a single
--   UPDATE, which the current endpoints never do — but a trigger contract should not
--   depend on the application never combining two column changes in one statement.
--
-- No FOLLOWS/PRECEDES is needed, for the same reason migration 020 gives: at most
-- one of these triggers can match a given staff row per row change, except for the
-- intended 1/6 + 3/6 reassign pair, which fires on two different staff rows.
--
-- Replay-safe: CREATE TRIGGER has no IF NOT EXISTS on MySQL 8, so each trigger is
-- dropped and recreated, the pattern 015 and 020 use.
--
-- 1/6. UPDATE, decrement. The issue left this staffer, or it reached 'Resolved'.
--      Requires the issue to be valid on both sides, so a flag being raised or
--      lowered on this same row is left to 5/6 and 6/6 rather than counted twice.
DROP TRIGGER IF EXISTS trg_issues_staff_count_decrement;

CREATE TRIGGER trg_issues_staff_count_decrement
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = GREATEST(issue_count - 1, 0)
WHERE id = OLD.assigned_staff_id
  AND OLD.assigned_staff_id IS NOT NULL
  AND OLD.status <> 'Resolved'
  AND OLD.is_invalid = FALSE
  AND NEW.is_invalid = FALSE
  AND (NOT (OLD.assigned_staff_id <=> NEW.assigned_staff_id) OR NEW.status = 'Resolved');

-- 2/6. INSERT, increment: a new issue arriving already assigned, open and valid.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_insert;

CREATE TRIGGER trg_issues_staff_count_on_insert
AFTER INSERT ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND NEW.status <> 'Resolved'
  AND NEW.is_invalid = FALSE;

-- 3/6. UPDATE, increment: a staffer newly picked the issue up. The null-safe
--      comparison means reassigning to the same staffer is not double-counted, and
--      OLD.is_invalid = FALSE stops this crediting an issue that 6/6 is already
--      crediting because its flag was just dismissed.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_update;

CREATE TRIGGER trg_issues_staff_count_on_update
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND NEW.status <> 'Resolved'
  AND OLD.is_invalid = FALSE
  AND NEW.is_invalid = FALSE
  AND NOT (OLD.assigned_staff_id <=> NEW.assigned_staff_id);

-- 4/6. UPDATE, increment on reopen: the issue stayed with the same staffer but
--      stopped being Resolved, so it is open work again. Carries the same
--      OLD.is_invalid = FALSE guard as 3/6 for the same reason.
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
  AND NEW.status <> 'Resolved'
  AND OLD.is_invalid = FALSE
  AND NEW.is_invalid = FALSE;

-- 5/6. UPDATE, decrement on invalidation. NEW in this file. The issue stops being
--      open work the moment it is flagged false, which is a change of neither
--      status nor assignee, so no pre-existing trigger would have noticed it. Debits
--      OLD.assigned_staff_id, and only if that staffer actually held the issue while
--      it was open — an unassigned or already-resolved report has nobody to debit.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_invalidate;

CREATE TRIGGER trg_issues_staff_count_on_invalidate
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = GREATEST(issue_count - 1, 0)
WHERE id = OLD.assigned_staff_id
  AND OLD.assigned_staff_id IS NOT NULL
  AND OLD.status <> 'Resolved'
  AND OLD.is_invalid = FALSE
  AND NEW.is_invalid = TRUE;

-- 6/6. UPDATE, increment when a flag is dismissed. NEW in this file, and the mirror
--      of 5/6: the issue re-enters the open set and belongs to whoever holds it now.
--      NEW.status <> 'Resolved' matters because an admin can dismiss a flag on a
--      report that is already Resolved, and that is not work anyone has to pick up.
DROP TRIGGER IF EXISTS trg_issues_staff_count_on_validate;

CREATE TRIGGER trg_issues_staff_count_on_validate
AFTER UPDATE ON issues
FOR EACH ROW
UPDATE staff
SET issue_count = issue_count + 1
WHERE id = NEW.assigned_staff_id
  AND NEW.assigned_staff_id IS NOT NULL
  AND NEW.status <> 'Resolved'
  AND OLD.is_invalid = TRUE
  AND NEW.is_invalid = FALSE;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- The triggers only maintain the count going forward, so any drift already in the
-- database survives this migration. Recomputing from `issues` is what repairs it, and
-- it is safe to replay: the statement is a full recompute, so running it on every
-- db:migrate is idempotent by construction rather than by a version check this
-- project does not have. `staff` is not referenced in the subquery, so the "can't
-- update a table used by the statement" restriction does not apply.
UPDATE staff s
SET issue_count = (
  SELECT COUNT(*)
  FROM issues i
  WHERE i.assigned_staff_id = s.id
    AND i.status <> 'Resolved'
    AND i.is_invalid = FALSE
);
