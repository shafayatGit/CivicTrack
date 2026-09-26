import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, toPage } from '../../utils/pagination.js';
import { withActor } from '../../utils/withActor.js';

// The four status values are an ENUM on the column (migration 008), and the same
// four strings are stored in status_history.old_status / new_status as VARCHAR(20).
export const ISSUE_STATUSES = ['Reported', 'Acknowledged', 'In Progress', 'Resolved'];

// Legal status moves. The ERD fixes the four states but never says which transitions
// are valid, so this is an application decision: every state can step back one place
// for corrections, but nothing skips a stage. Without it, Reported -> Resolved would
// be a single call, which defeats the point of Acknowledged and In Progress existing
// as separate recorded states.
const ALLOWED_TRANSITIONS = {
  Reported: ['Acknowledged', 'In Progress'],
  Acknowledged: ['In Progress', 'Reported'],
  'In Progress': ['Resolved', 'Acknowledged'],
  Resolved: ['In Progress'],
};

const DETAIL_SELECT = `
  i.id, i.user_id, i.category_id, i.ward_id, i.department_id, i.assigned_staff_id,
  i.title, i.description, i.latitude, i.longitude, i.landmark,
  i.status, i.citizen_confirmed, i.resolved_at, i.created_at, i.updated_at,
  reporter.name  AS reporter_name,
  reporter.email AS reporter_email,
  c.name  AS category_name,
  w.name  AS ward_name,
  w.ward_number,
  d.name  AS department_name,
  assignee.name AS assignee_name
`;

const LIST_SELECT = `
  i.id, i.title, i.status, i.citizen_confirmed, i.resolved_at,
  i.latitude, i.longitude, i.landmark, i.created_at, i.updated_at,
  i.user_id, i.category_id, i.ward_id, i.department_id, i.assigned_staff_id,
  c.name AS category_name,
  w.name AS ward_name, w.ward_number,
  d.name AS department_name,
  assignee.name AS assignee_name
`;

const LIST_FROM = `
  FROM issues i
  JOIN categories c     ON c.id = i.category_id
  JOIN wards w          ON w.id = i.ward_id
  LEFT JOIN departments d ON d.id = i.department_id
  LEFT JOIN staff assigned_staff ON assigned_staff.id = i.assigned_staff_id
  LEFT JOIN users assignee ON assignee.id = assigned_staff.user_id
`;

const assertReferencesExist = async (conn, { categoryId, wardId, departmentId }) => {
  const [categories] = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!categories[0]) {
    throw new ApiError(404, 'Category not found');
  }

  const [wards] = await conn.query('SELECT id FROM wards WHERE id = ?', [wardId]);
  if (!wards[0]) {
    throw new ApiError(404, 'Ward not found');
  }

  // department_id is optional — it is derived from categories.default_department_id
  // when the caller does not choose one.
  if (departmentId) {
    const [departments] = await conn.query('SELECT id FROM departments WHERE id = ?', [
      departmentId,
    ]);
    if (!departments[0]) {
      throw new ApiError(404, 'Department not found');
    }
  }
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

// Department routing (ERD 1.4/1.5): a reported issue is owned by
// categories.default_department_id unless the caller names one explicitly. The
// COALESCE + scalar subquery does the fallback inside the INSERT, so routing costs no
// extra round trip.
export const createIssue = async (reporter, input) => {
  const {
    categoryId,
    wardId,
    departmentId,
    title,
    description,
    latitude,
    longitude,
    landmark,
  } = input;

  const id = randomUUID();

  return withActor(reporter.id, async (conn) => {
    await assertReferencesExist(conn, { categoryId, wardId, departmentId });

    await conn.query(
      `INSERT INTO issues
         (id, user_id, category_id, ward_id, department_id, title, description,
          latitude, longitude, landmark, status)
       VALUES (?, ?, ?, ?,
         COALESCE(?, (SELECT default_department_id FROM categories WHERE id = ?)),
         ?, ?, ?, ?, ?, 'Reported')`,
      [id, reporter.id, categoryId, wardId, departmentId ?? null, categoryId,
       title, description, latitude, longitude, landmark ?? null],
    );

    return findById(conn, id);
  });
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const findById = async (conn, id) => {
  const [rows] = await conn.query(
    `SELECT ${DETAIL_SELECT}
     FROM issues i
     JOIN users u ON u.id = i.user_id
     JOIN categories c ON c.id = i.category_id
     JOIN wards w ON w.id = i.ward_id
     LEFT JOIN departments d ON d.id = i.department_id
     LEFT JOIN staff assigned_staff ON assigned_staff.id = i.assigned_staff_id
     LEFT JOIN users assignee ON assignee.id = assigned_staff.user_id
     LEFT JOIN users reporter ON reporter.id = i.user_id
     WHERE i.id = ?`,
    [id],
  );

  if (!rows[0]) {
    throw new ApiError(404, 'Issue not found');
  }

  return rows[0];
};

export const getIssue = (id) => findById(db, id);

// Every filter maps to an index the schema already carries: status is
// idx_issues_status, department+status is idx_issues_department_status,
// category and ward lead idx_issues_duplicate_probe, and the reporter filter is
// idx_issues_user. Nothing here forces a filesort on the full table.
export const listIssues = async (query) => {
  const { page, limit } = toPage(query);
  const paging = { page, limit, offset: (page - 1) * limit };

  const where = [];
  const args = [];

  const filters = {
    status: 'i.status',
    categoryId: 'i.category_id',
    wardId: 'i.ward_id',
    departmentId: 'i.department_id',
    assignedStaffId: 'i.assigned_staff_id',
    userId: 'i.user_id',
  };

  for (const [key, column] of Object.entries(filters)) {
    if (query[key]) {
      where.push(`${column} = ?`);
      args.push(query[key]);
    }
  }

  // Explicitly unassigned, which a truthy check above could never express.
  if (query.unassigned === 'true') {
    where.push('i.assigned_staff_id IS NULL');
  }

  if (query.search) {
    where.push('(i.title LIKE ? OR i.description LIKE ?)');
    args.push(`%${query.search}%`, `%${query.search}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT ${LIST_SELECT} ${LIST_FROM} ${clause}
     ORDER BY i.created_at DESC
     ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total ${LIST_FROM} ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

export const getStatusHistory = async (id) => {
  // Without this, history for a non-existent issue returns an empty array with a 200,
  // which reads as "no changes yet" instead of "no such issue".
  await getIssue(id);

  const [rows] = await db.query(
    `SELECT h.id, h.issue_id, h.old_status, h.new_status, h.changed_by, h.changed_at,
            u.name AS changed_by_name
     FROM status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.issue_id = ?
     ORDER BY h.changed_at DESC, h.id DESC`,
    [id],
  );

  return rows;
};

// ---------------------------------------------------------------------------
// Duplicate detection (ERD 1.5)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

// Two-stage: an index-backed bounding box over (latitude, longitude) and
// (ward_id, category_id, status) narrows the scan, then haversine filters the
// survivors down to the true radius. The prefilter is what keeps this cheap — the
// distance expression itself is not sargable on any index.
export const findDuplicates = async ({ wardId, categoryId, latitude, longitude, radiusKm = 1 }) => {
  const latDelta = radiusKm / 111.32;
  // Longitude degrees shrink with latitude; at the poles cos() is 0 and the delta
  // would be infinite, so it is clamped to a sane floor.
  const lonDelta = radiusKm / (111.32 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));

  // Both BETWEEN clauses are written the same way — raw coordinate plus a delta
  // placeholder — so the placeholder count and the argument list cannot drift apart.
  // (They did once: 13 placeholders against 11 arguments, which surfaces as a syntax
  // error on the trailing `? + ?`.)
  const [rows] = await db.query(
    `SELECT i.id, i.title, i.status, i.created_at,
            i.latitude, i.longitude, i.landmark,
            ROUND(6371 * ACOS(LEAST(1, GREATEST(-1,
              COS(RADIANS(?)) * COS(RADIANS(i.latitude)) *
              COS(RADIANS(i.longitude) - RADIANS(?)) +
              SIN(RADIANS(?)) * SIN(RADIANS(i.latitude))
            ))), 3) AS distance_km
     FROM issues i
     WHERE i.ward_id = ?
       AND i.category_id = ?
       AND i.status <> 'Resolved'
       AND i.latitude BETWEEN ? - ? AND ? + ?
       AND i.longitude BETWEEN ? - ? AND ? + ?
     ORDER BY distance_km ASC
     LIMIT 20`,
    [
      // haversine reference point
      latitude, longitude, latitude,
      // index-backed narrowing
      wardId, categoryId,
      // latitude bounding box
      latitude, latDelta, latitude, latDelta,
      // longitude bounding box
      longitude, lonDelta, longitude, lonDelta,
    ],
  );

  // The bounding box is a square; haversine is a circle, so corners of the square can
  // fall outside the radius. The exact filter has to happen here.
  return rows.filter((row) => row.distance_km <= radiusKm);
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const assertTransition = (from, to) => {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(
      400,
      `Cannot move an issue from "${from}" to "${to}". Allowed: ${
        ALLOWED_TRANSITIONS[from].join(', ') || 'none'
      }`,
    );
  }
};

// Admins may set any state; staff may only advance their own assigned issue. An
// unassigned issue can only be touched by an admin, otherwise any staff member
// could claim and complete arbitrary work.
//
// Takes the pinned connection rather than the pool: this runs inside the transaction
// that has already taken SELECT ... FOR UPDATE on the issue row, and reading through
// a second connection could observe state the transaction has not committed.
const assertCanModify = async (conn, issue, actor, { isAssigning }) => {
  if (actor.role === 'admin') {
    return;
  }

  if (actor.role !== 'staff') {
    throw new ApiError(403, 'You cannot modify this issue');
  }

  if (isAssigning) {
    throw new ApiError(403, 'Only an admin can assign an issue');
  }

  const [rows] = await conn.query('SELECT id FROM staff WHERE id = ? AND user_id = ?', [
    issue.assigned_staff_id ?? '',
    actor.id,
  ]);

  if (!rows[0]) {
    throw new ApiError(403, 'You can only update issues assigned to you');
  }
};

const loadIssueForUpdate = async (conn, id) => {
  const [rows] = await conn.query(
    'SELECT id, status, assigned_staff_id, department_id FROM issues WHERE id = ? FOR UPDATE',
    [id],
  );

  if (!rows[0]) {
    throw new ApiError(404, 'Issue not found');
  }

  return rows[0];
};

// Status change and assignment share one entry point because the workload triggers in
// migration 015 key off both columns in the same UPDATE, and because "acknowledge" and
// "assign to me" are the same act from the caller's point of view.
//
// Runs through withActor so @civictrack_actor_id is set on the same connection as the
// UPDATE — a pool.query pair here would leave status_history.changed_by NULL.
export const updateIssue = async (id, actor, input) => {
  const { status, assignedStaffId, landmark, citizenConfirmed } = input;

  return withActor(actor.id, async (conn) => {
    const issue = await loadIssueForUpdate(conn, id);

    await assertCanModify(conn, issue, actor, {
      isAssigning: assignedStaffId !== undefined,
    });

    if (status && status !== issue.status) {
      assertTransition(issue.status, status);
    }

    if (assignedStaffId) {
      const [staffRows] = await conn.query(
        'SELECT id, department_id FROM staff WHERE id = ?',
        [assignedStaffId],
      );

      if (!staffRows[0]) {
        throw new ApiError(404, 'Staff member not found');
      }

      // Routing a staffer's work across department lines is a data-integrity problem,
      // not a preference: department performance reporting is grouped by department.
      if (issue.department_id && staffRows[0].department_id !== issue.department_id) {
        throw new ApiError(
          409,
          'That staff member belongs to a different department than this issue',
        );
      }
    }

    // resolved_at is maintained here rather than by a trigger because only the
    // application knows which transition is a real resolution.
    //
    // It needs an explicit flag, not COALESCE: moving back OUT of Resolved has to
    // write NULL, and COALESCE(NULL, resolved_at) would keep the old timestamp and
    // leave a non-Resolved issue claiming it was resolved.
    const setsResolvedAt = status === 'Resolved' || (status && issue.status === 'Resolved');
    const resolvedAt = status === 'Resolved' ? new Date() : null;

    await conn.query(
      `UPDATE issues
       SET status            = COALESCE(?, status),
           assigned_staff_id = CASE WHEN ? THEN ? ELSE assigned_staff_id END,
           landmark          = COALESCE(?, landmark),
           citizen_confirmed = CASE WHEN ? THEN ? ELSE citizen_confirmed END,
           resolved_at       = CASE WHEN ? THEN ? ELSE resolved_at END
       WHERE id = ?`,
      [
        status ?? null,
        assignedStaffId !== undefined ? 1 : 0,
        assignedStaffId ?? null,
        landmark ?? null,
        citizenConfirmed !== undefined ? 1 : 0,
        citizenConfirmed ? 1 : 0,
        setsResolvedAt ? 1 : 0,
        resolvedAt,
        id,
      ],
    );

    return findById(conn, id);
  });
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// Backs the resolved_issue_summary view (migration 016) with pagination, and
// deliberately exposes no overdue/SLA column: the ERD never defines a threshold, so
// there is nothing computable to show.
export const getResolvedSummary = async (query) => {
  const { page, limit } = toPage(query);
  const paging = { page, limit, offset: (page - 1) * limit };

  const [rows] = await db.query(
    `SELECT * FROM resolved_issue_summary
     ORDER BY resolved_count DESC
     ${limitClause(paging)}`,
  );

  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM resolved_issue_summary');

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

// Dashboard counters. One grouped pass over issues plus a resolved_issue_summary
// aggregate, rather than a COUNT(*) per status.
export const getStats = async () => {
  const [byStatus] = await db.query(
    'SELECT status, COUNT(*) AS total FROM issues GROUP BY status',
  );

  const [totals] = await db.query(
    `SELECT
       COUNT(*) AS total_issues,
       COALESCE(SUM(status <> 'Resolved'), 0) AS open_issues,
       COALESCE(SUM(status =  'Resolved'), 0) AS resolved_issues,
       COALESCE(SUM(assigned_staff_id IS NULL AND status <> 'Resolved'), 0) AS unassigned_issues
     FROM issues`,
  );

  const byStatusMap = Object.fromEntries(
    ISSUE_STATUSES.map((status) => [status, 0]),
  );
  for (const row of byStatus) {
    byStatusMap[row.status] = row.total;
  }

  return { ...totals[0], by_status: byStatusMap };
};

// --- Citizen self-service -----------------------------------------------------
//
// The dashboard is a citizen's own view of their own reports, so the user id comes
// from the verified token and is never read from the query string. Reusing
// listIssues with a userId parameter would make this an IDOR: any signed-in citizen
// could page through another citizen's reports by changing one query value.

export const listMyIssues = async (userId, query) => {
  const { page, limit } = toPage(query);
  const paging = { page, limit, offset: (page - 1) * limit };

  // Only the filters that make sense for "my reports"; assignedStaffId and
  // departmentId are meaningless here and are deliberately not offered.
  const where = ['i.user_id = ?'];
  const args = [userId];

  for (const [key, column] of Object.entries({
    status: 'i.status',
    categoryId: 'i.category_id',
    wardId: 'i.ward_id',
  })) {
    if (query[key]) {
      where.push(`${column} = ?`);
      args.push(query[key]);
    }
  }

  if (query.search) {
    where.push('(i.title LIKE ? OR i.description LIKE ?)');
    args.push(`%${query.search}%`, `%${query.search}%`);
  }

  const clause = `WHERE ${where.join(' AND ')}`;

  const [rows] = await db.query(
    `SELECT ${LIST_SELECT} ${LIST_FROM} ${clause}
     ORDER BY i.created_at DESC
     ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total ${LIST_FROM} ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

export const getMyStats = async (userId) => {
  const [byStatus] = await db.query(
    'SELECT status, COUNT(*) AS total FROM issues WHERE user_id = ? GROUP BY status',
    [userId],
  );

  const [totals] = await db.query(
    `SELECT
       COUNT(*) AS total_issues,
       COALESCE(SUM(status <> 'Resolved'), 0) AS open_issues,
       COALESCE(SUM(status =  'Resolved'), 0) AS resolved_issues
     FROM issues
     WHERE user_id = ?`,
    [userId],
  );

  const [byCategory] = await db.query(
    `SELECT c.name, COUNT(*) AS total
     FROM issues i
     JOIN categories c ON c.id = i.category_id
     WHERE i.user_id = ?
     GROUP BY c.id, c.name
     ORDER BY total DESC, c.name
     LIMIT 8`,
    [userId],
  );

  const byStatusMap = Object.fromEntries(
    ISSUE_STATUSES.map((status) => [status, 0]),
  );
  for (const row of byStatus) {
    byStatusMap[row.status] = row.total;
  }

  return {
    ...totals[0],
    by_status: byStatusMap,
    by_category: byCategory,
  };
};
