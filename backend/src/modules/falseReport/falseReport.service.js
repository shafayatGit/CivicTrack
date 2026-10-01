import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, toPage } from '../../utils/pagination.js';
import { withActor } from '../../utils/withActor.js';
import { disconnectUser } from '../../realtime/hub.js';

// ---------------------------------------------------------------------------
// The admin queue
// ---------------------------------------------------------------------------

// One joined pass. The screen has to answer "which report, filed by whom, judged by
// whom, and what happened next" for every row at once, and the alternative — a
// query per flag for the issue, another for the citizen, another for the officer —
// is the N+1 that makes a moderation queue slow exactly when it matters.
//
// reporter.* is the submitting citizen, read through issues.user_id rather than a
// column on false_reports: migration 021 explains why that column does not exist.
// citizen_is_active rides along so the admin can tell at a glance whether a flag has
// already been acted on, without the table having to decide that for itself.
const QUEUE_SELECT = `
  f.id, f.issue_id, f.reason, f.flagged_by, f.flagged_at, f.status,
  f.actioned_by, f.actioned_at,
  i.title AS issue_title, i.status AS issue_status, i.is_invalid AS issue_is_invalid,
  i.created_at AS issue_created_at,
  c.name AS category_name,
  w.name AS ward_name, w.ward_number,
  reporter.id AS citizen_id,
  reporter.name AS citizen_name,
  reporter.email AS citizen_email,
  reporter.nid AS citizen_nid,
  reporter.is_active AS citizen_is_active,
  reporter.deactivated_at AS citizen_deactivated_at,
  flagger.name AS flagged_by_name,
  actioned.name AS actioned_by_name
`;

const QUEUE_FROM = `
  FROM false_reports f
  JOIN issues i ON i.id = f.issue_id
  JOIN users reporter ON reporter.id = i.user_id
  JOIN categories c ON c.id = i.category_id
  JOIN wards w ON w.id = i.ward_id
  LEFT JOIN staff flagger_staff ON flagger_staff.id = f.flagged_by
  LEFT JOIN users flagger ON flagger.id = flagger_staff.user_id
  LEFT JOIN users actioned ON actioned.id = f.actioned_by
`;

export const listFalseReports = async (query) => {
  const { status, search } = query;
  const paging = toPage(query);

  const where = ['f.status = ?'];
  const args = [status];

  if (search) {
    where.push('(i.title LIKE ? OR reporter.name LIKE ? OR reporter.email LIKE ?)');
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const clause = `WHERE ${where.join(' AND ')}`;

  const [rows] = await db.query(
    `SELECT ${QUEUE_SELECT} ${QUEUE_FROM} ${clause}
     ORDER BY f.flagged_at DESC
     ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total ${QUEUE_FROM} ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

// ---------------------------------------------------------------------------
// Acting on a flag
// ---------------------------------------------------------------------------

// Both actions take the row FOR UPDATE before deciding anything. Two admins on the
// same flag would otherwise both read status = 'pending' and both write a decision,
// and the loser's outcome would be silently overwritten. The lock turns the second
// one into a 409 instead.
const loadFlagForUpdate = async (conn, id) => {
  const [rows] = await conn.query(
    `SELECT f.id, f.issue_id, f.status,
            i.user_id AS citizen_id,
            i.is_invalid AS issue_is_invalid,
            reporter.role AS citizen_role
     FROM false_reports f
     JOIN issues i ON i.id = f.issue_id
     JOIN users reporter ON reporter.id = i.user_id
     WHERE f.id = ?
     FOR UPDATE`,
    [id],
  );

  if (!rows[0]) {
    throw new ApiError(404, 'False report not found');
  }

  return rows[0];
};

const assertPending = (flag) => {
  if (flag.status !== 'pending') {
    throw new ApiError(
      409,
      `This flag has already been ${flag.status === 'upheld' ? 'upheld' : 'dismissed'}`,
    );
  }
};

// Only citizens are subject to deactivation. Any signed-in user can file an issue —
// createIssue is open to every role — so a staff member or an admin who happens to
// have reported something can end up as the submitting citizen on a flag. Letting
// one click ban an admin account, or a colleague the officer is about to work with,
// is not a risk this feature should carry.
const assertCitizen = (flag) => {
  if (flag.citizen_role !== 'citizen') {
    throw new ApiError(
      409,
      'Only a citizen account can be deactivated. This report was filed by a staff or admin account, which is handled by the staff module instead.',
    );
  }
};

// The admin upholds the flag and deactivates the citizen who filed it. From that
// moment: login is refused (auth.service), every protected route is refused
// (middleware/auth.js protect), a live socket is dropped (realtime/hub.js), and
// registering again under the same address is refused (auth.service createUser).
//
// Idempotent on the citizen side: deactivating an already-deactivated account is
// harmless and keeps the timestamp of the original decision, so a second admin who
// clicks the button on a stale page does not overwrite when the ban started.
export const deactivateCitizen = async (id, admin, { note } = {}) => {
  const result = await withActor(admin.id, async (conn) => {
    const flag = await loadFlagForUpdate(conn, id);
    assertPending(flag);
    assertCitizen(flag);

    const now = new Date();

    await conn.query(
      `UPDATE false_reports
       SET status = 'upheld', actioned_by = ?, actioned_at = ?
       WHERE id = ?`,
      [admin.id, now, id],
    );

    // `AND is_active = TRUE` is what makes this idempotent: a repeat click from a
    // stale page updates nothing, leaves COALESCE alone, and is reported below as
    // "the account was already deactivated" rather than as a fresh decision.
    const [deactivated] = await conn.query(
      `UPDATE users
       SET is_active = FALSE,
           deactivated_at = COALESCE(deactivated_at, ?),
           deactivation_reason = ?
       WHERE id = ? AND is_active = TRUE`,
      [now, note ?? 'Confirmed false report', flag.citizen_id],
    );

    return {
      flagId: flag.id,
      citizenId: flag.citizen_id,
      alreadyDeactivated: deactivated.affectedRows === 0,
    };
  });

  // Deliberately after the commit, not inside the transaction: this is a side effect
  // on live connections, and dropping a socket for an account whose flip then rolls
  // back would sign a still-active citizen out for nothing. The REST guard in
  // protect closes the gap either way — it re-reads is_active on every request — so
  // the worst case here is a stale socket that fails its next call, not a ban.
  disconnectUser(result.citizenId);

  return result;
};

// The admin decides the officer was wrong. The flag is closed as dismissed and the
// issue is handed back to the normal workflow: is_invalid, invalid_reason and
// invalid_flagged_at are all cleared in the same statement, so no half-dismissed
// state is reachable.
//
// The second UPDATE also re-enters the issue into the assigned officer's workload,
// which is migration 022's trg_issues_staff_count_on_validate trigger firing on
// exactly this column changing. That is why this has to be a real column write
// rather than a flag-status write only.
export const dismissFlag = async (id, admin) =>
  withActor(admin.id, async (conn) => {
    const flag = await loadFlagForUpdate(conn, id);
    assertPending(flag);

    await conn.query(
      `UPDATE false_reports
       SET status = 'dismissed', actioned_by = ?, actioned_at = ?
       WHERE id = ?`,
      [admin.id, new Date(), id],
    );

    // Guarded on is_invalid so a dismissal cannot clear a flag that a *later* flag
    // re-raised on the same issue. Two officers can flag the same report; dismissing
    // the older one must not un-flag the newer judgement.
    await conn.query(
      `UPDATE issues
       SET is_invalid = FALSE, invalid_reason = NULL, invalid_flagged_at = NULL
       WHERE id = ? AND is_invalid = TRUE
         AND invalid_flagged_at = (SELECT MAX(flagged_at) FROM false_reports WHERE issue_id = ?)`,
      [flag.issue_id, flag.issue_id],
    );

    return { flagId: flag.id, issueId: flag.issue_id };
  });
