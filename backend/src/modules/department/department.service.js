import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, paginationSchema, toPage } from '../../utils/pagination.js';
// Shared so the per-department "open" figure cannot drift from staff.issue_count or
// from the dashboard counters, which all narrow on the same two conditions.
import { openIssuePredicate } from '../issue/issue.service.js';
import { MAX_WINDOW_DAYS } from '../../utils/performance.js';

const COLUMNS =
  'id, name, contact_email, resolution_target_hours, created_at, updated_at';

// Migration 004 deliberately omits UNIQUE on departments.name, following the ERD's
// constraint checklist, so duplicate names are permitted at the schema level. The
// service enforces uniqueness anyway: routing issues by "the" WPD is meaningless if
// two rows share the name, and the check is a single indexed-by-nothing lookup that
// only runs on writes.
const findByName = async (name, exceptId = null) => {
  const [rows] = await db.query(
    'SELECT id FROM departments WHERE name = ? AND id <> ?',
    [name, exceptId ?? ''],
  );
  return rows[0];
};

const ensureNameAvailable = async (name, exceptId = null) => {
  if (await findByName(name, exceptId)) {
    throw new ApiError(409, 'Department name already exists');
  }
};

export const createDepartment = async ({ name, contactEmail, resolutionTargetHours }) => {
  await ensureNameAvailable(name);

  const id = randomUUID();
  await db.query(
    `INSERT INTO departments (id, name, contact_email, resolution_target_hours)
     VALUES (?, ?, ?, ?)`,
    // A missing key and an explicit null both land as NULL ("no target set"). The
    // validation schema rejects 0 and negatives, because MariaDB reports a CHECK
    // violation under an error code the handler cannot map — see 024.
    [id, name, contactEmail ?? null, resolutionTargetHours ?? null],
  );

  return getDepartment(id);
};

// The per-department counters the workload and performance screens need, computed in
// one grouped pass rather than a COUNT(*) query per department. LEFT JOIN means a
// department with no issues still appears, with the SUMs coming back NULL and
// COALESCE turning them into 0; COUNT(i.id) ignores the NULL row for the same reason.
// performance_target_hours is exposed on the list because the workload screen shows a
// department's target beside its open count — a backlog number means nothing without
// the number it is measured against.
export const listDepartments = async (query) => {
  const { page, limit } = paginationSchema.parse(query ?? {});
  const paging = { page, limit, offset: (page - 1) * limit };

  const [rows] = await db.query(
    `SELECT d.id, d.name, d.contact_email, d.resolution_target_hours,
     d.created_at, d.updated_at,
     COALESCE(SUM(${openIssuePredicate('i')}), 0) AS open_issues,
     COALESCE(SUM(i.status =  'Resolved'), 0)  AS resolved_issues,
     COALESCE(SUM(i.is_invalid = TRUE), 0)     AS invalid_issues,
     COUNT(i.id)                               AS total_issues
     FROM departments d
     LEFT JOIN issues i ON i.department_id = d.id
     GROUP BY d.id, d.name, d.contact_email, d.resolution_target_hours,
              d.created_at, d.updated_at
     ORDER BY d.name
     ${limitClause(paging)}`,
  );

  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM departments');

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM departments WHERE id = ?`,
    [id],
  );
  return rows[0];
};

export const getDepartment = async (id) => {
  const department = await findById(id);

  if (!department) {
    throw new ApiError(404, 'Department not found');
  }

  return department;
};

// The only columns a department write may touch, as a literal map in this file. This is
// what makes the SET-list interpolation below safe: the identifier always comes from
// these keys, never from the request body. Values are bound parameters.
const WRITABLE_DEPARTMENT_FIELDS = {
  name: 'name',
  contactEmail: 'contact_email',
  resolutionTargetHours: 'resolution_target_hours',
};

// One statement whose SET list is built from the keys the caller actually sent.
//
// The alternative — COALESCE(?, col) per column, which is what staff.updateStaff does —
// cannot express this endpoint's contract. COALESCE(NULL, col) evaluates to the column's
// CURRENT value, so `resolutionTargetHours: null` would be a silent no-op on a column
// where null is a meaningful value: "this department has no target, do not measure it".
//
// So the rule here is by key presence, not by value:
//   key absent  -> the column is left out of the SET list entirely (unchanged)
//   key null    -> the column IS in the list, bound to NULL (explicitly cleared)
//   key value   -> the column IS in the list, bound to that value
export const updateDepartment = async (id, body) => {
  const { name } = body;
  await getDepartment(id);
  await ensureNameAvailable(name, id);

  const present = Object.keys(WRITABLE_DEPARTMENT_FIELDS).filter(
    (field) => body[field] !== undefined,
  );

  if (present.length === 0) {
    throw new ApiError(400, 'Provide at least one field to update');
  }

  const setClause = present
    .map((field) => `${WRITABLE_DEPARTMENT_FIELDS[field]} = ?`)
    .join(', ');

  await db.query(
    `UPDATE departments SET ${setClause} WHERE id = ?`,
    [...present.map((field) => body[field]), id],
  );

  return getDepartment(id);
};

export const deleteDepartment = async (id) => {
  await getDepartment(id);

  // Three tables point at departments with ON DELETE RESTRICT
  // (issues.department_id, categories.default_department_id is SET NULL,
  // staff.department_id, department_performance cascades). Saying which one is
  // blocking is far more useful than the raw ER_ROW_IS_REFERENCED_2 the error
  // handler would otherwise surface.
  const [staffRows] = await db.query(
    'SELECT COUNT(*) AS total FROM staff WHERE department_id = ?',
    [id],
  );
  if (staffRows[0].total > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${staffRows[0].total} staff member(s) belong to this department`,
    );
  }

  const [issueRows] = await db.query(
    'SELECT COUNT(*) AS total FROM issues WHERE department_id = ?',
    [id],
  );
  if (issueRows[0].total > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${issueRows[0].total} issue(s) are owned by this department`,
    );
  }

  const [categoryRows] = await db.query(
    'SELECT name FROM categories WHERE default_department_id = ? LIMIT 5',
    [id],
  );
  if (categoryRows.length > 0) {
    throw new ApiError(
      409,
      `Cannot delete: still the default department for ${categoryRows
        .map((row) => row.name)
        .join(', ')}`,
    );
  }

  const [result] = await db.query('DELETE FROM departments WHERE id = ?', [id]);
  if (!result.affectedRows) {
    throw new ApiError(404, 'Department not found');
  }
};

// ---------------------------------------------------------------------------
// Performance snapshots
// ---------------------------------------------------------------------------
// Migration 013 created department_performance and deliberately left it empty: the
// project has no scheduler and no job runner, and its own header says to revisit with a
// real scheduler rather than bolt a cron onto the migration path. That is still true,
// so nothing here runs on a timer. What changes is that the snapshot is now a
// first-class, idempotent operation an admin triggers, instead of a note in a comment —
// which is what makes the table reachable at all.
//
// WHY A COHORT (created-in-window) RATHER THAN A PERIOD (resolved-in-window)
// The ERD's column comment says "issues resolved within the window", but the SQL it
// actually specifies in 3.3 filters on i.created_at BETWEEN start AND end. Those are
// different measurements. This follows the SQL, because that is the concrete part of
// the ERD, and because a cohort is the more stable of the two: what became of the
// issues that ARRIVED in a window does not change when the report is re-run, whereas
// "resolved during March" changes meaning as more resolutions land and can only be
// answered for a closed window by trusting that a snapshot was taken back then. If
// period-by-resolution was the intent, this is the one place that has to change.
//
// Two deliberate departures from the ERD's example query, both to stop it lying:
//
//  1. Half-open date bounds. ERD 3.3 writes created_at BETWEEN :start AND :end, but
//     created_at is a DATETIME and the period bounds are DATE, so the upper bound
//     coerces to midnight and every issue filed during the final day is dropped.
//     `>= start AND < end + 1 DAY` keeps the last day.
//
//  2. overdue_count against the window's own end, not NOW(). Judging a closed March
//     window in June would otherwise penalise March for April, and re-running the
//     report would change history. LEAST(DATE_ADD(end, 1 DAY), NOW()) is the window's
//     end for a window that has closed and NOW() for one still running, so a historical
//     snapshot is stable while the live one still moves.
const SNAPSHOT_AGGREGATES = `
  SELECT
    d.id AS department_id,
    COALESCE(SUM(i.status = 'Resolved'), 0)  AS resolved_count,
    COALESCE(SUM(i.status <> 'Resolved'), 0) AS open_count,
    CASE
      WHEN d.resolution_target_hours IS NULL THEN NULL
      ELSE COALESCE(SUM(
        i.status <> 'Resolved'
        AND TIMESTAMPDIFF(HOUR, i.created_at, LEAST(DATE_ADD(?, INTERVAL 1 DAY), NOW()))
            > d.resolution_target_hours
      ), 0)
    END AS overdue_count,
    AVG(
      CASE WHEN i.status = 'Resolved'
        THEN TIMESTAMPDIFF(SECOND, i.created_at, i.resolved_at) / 3600.0
      END
    ) AS avg_resolution_hours
  FROM departments d
  LEFT JOIN issues i
    ON i.department_id = d.id
   AND i.created_at >= ?
   AND i.created_at <  DATE_ADD(?, INTERVAL 1 DAY)
   AND i.is_invalid = FALSE
  GROUP BY d.id, d.name, d.resolution_target_hours
`;

// The bind order has to match the placeholders in SNAPSHOT_AGGREGATES exactly:
// the LEAST() in the overdue CASE, then the window's lower bound, then its upper.
const snapshotArgs = (periodStart, periodEnd) => [periodEnd, periodStart, periodEnd];

// Upsert keyed on uq_department_performance_window (migration 013), so re-running the
// same window overwrites that window's numbers instead of accumulating contradictory
// rows. VALUES() is the MySQL/MariaDB form of the ERD's `EXCLUDED.` — verified working
// against MariaDB 11.8 rather than assumed; the newer row-alias syntax is not supported
// for INSERT ... SELECT on MariaDB.
//
// calculated_at is left to its DEFAULT CURRENT_TIMESTAMP so it records when the row was
// last written, which is what makes a re-run visible instead of silently looking fresh.
const SNAPSHOT_UPSERT = `
  INSERT INTO department_performance
    (id, department_id, period_start, period_end,
     resolved_count, open_count, overdue_count, avg_resolution_hours)
  SELECT UUID(), department_id, ?, ?, resolved_count, open_count, overdue_count,
         avg_resolution_hours
  FROM (
${SNAPSHOT_AGGREGATES}
  ) AS computed
  ON DUPLICATE KEY UPDATE
    resolved_count       = VALUES(resolved_count),
    open_count           = VALUES(open_count),
    overdue_count        = VALUES(overdue_count),
    avg_resolution_hours = VALUES(avg_resolution_hours),
    calculated_at        = CURRENT_TIMESTAMP
`;

// LEFT JOIN from departments means a department with no issues in the window still gets
// a row — zeros for the counts, NULL for the average, and NULL overdue if it has no
// target. A department missing from the report would be indistinguishable from one that
// was deleted.
// Returns just the rows it wrote, not the {items, pagination} envelope listPerformance
// produces: this is a write, and the caller wants the generated snapshots so it can
// report what was measured and what was not.
export const buildPerformanceSnapshot = async ({ periodStart, periodEnd }) => {
  await db.query(SNAPSHOT_UPSERT, [
    periodStart,
    periodEnd,
    ...snapshotArgs(periodStart, periodEnd),
  ]);

  // Read back the rows just written, keyed on the EXACT window. Going through
  // listPerformance here would use its overlap filter and could return snapshots from a
  // different window that happens to intersect this one — so a caller asking for June
  // could be handed a row from a previously generated March-to-June range.
  const [rows] = await db.query(
    `SELECT ${PERFORMANCE_COLUMNS}
     FROM department_performance p
     JOIN departments d ON d.id = p.department_id
     WHERE p.period_start = ? AND p.period_end = ?
     ORDER BY d.name`,
    [periodStart, periodEnd],
  );

  return rows;
};

const PERFORMANCE_COLUMNS = `
  p.id, p.department_id,
  DATE_FORMAT(p.period_start, '%Y-%m-%d') AS period_start,
  DATE_FORMAT(p.period_end, '%Y-%m-%d') AS period_end,
  p.resolved_count, p.open_count, p.overdue_count,
  p.avg_resolution_hours, p.calculated_at,
  d.name AS department_name, d.resolution_target_hours
`;

// A DATE column comes back from mysql2 as a JS Date pinned to LOCAL midnight, which
// JSON-serialises through toISOString() as the previous day once the offset is applied —
// 2026-10-01 in UTC+6 is written as 2026-09-30T18:00:00.000Z. Formatting in SQL returns
// the calendar label the column actually stores, so there is no Date object and no
// timezone left to get wrong. A window is a calendar range, not an instant, so it should
// never be a timestamp.

// Stored snapshots, newest window first. Reads the table rather than recomputing, which
// is the whole reason 013 made it a physical table instead of a view: a closed window's
// numbers must not move when it is read.
export const listPerformance = async ({ page, limit, periodStart, periodEnd, departmentId }) => {
  const paging = toPage({ page, limit });

  const where = [];
  const args = [];

  if (periodStart && periodEnd) {
    // Exact match, NOT an overlap test. uq_department_performance_window is
    // (department_id, period_start, period_end), so the database already guarantees one row
    // per department per window — but only within a single window. An overlap filter
    // (period_end >= start AND period_start <= end) matches every stored window that
    // intersects the range, so a Sept→Oct request returns the September rows AND the
    // October rows and every department appears twice. The read has to pin one window for
    // the uniqueness guarantee to mean anything, which is the same reason
    // buildPerformanceSnapshot reads its rows back by equality rather than going through
    // here.
    where.push('p.period_start = ? AND p.period_end = ?');
    args.push(periodStart, periodEnd);
  } else {
    // One bound only is a browse ("everything from September onwards"), so a department
    // legitimately appearing once per stored window is the expected answer here. This
    // branch is not what the admin report uses.
    if (periodStart) {
      where.push('p.period_end >= ?');
      args.push(periodStart);
    }
    if (periodEnd) {
      where.push('p.period_start <= ?');
      args.push(periodEnd);
    }
  }
  if (departmentId) {
    where.push('p.department_id = ?');
    args.push(departmentId);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT ${PERFORMANCE_COLUMNS}
     FROM department_performance p
     JOIN departments d ON d.id = p.department_id
     ${clause}
     ORDER BY p.period_end DESC, d.name ASC
     ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM department_performance p ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

// The windows that actually exist, newest first. Reads pin a single window exactly, so a
// request for a range nobody has generated comes back empty — correct, but a dead end on
// its own. This lets the admin report surface the stored windows as one-click options
// instead of making them guess a range that happens to match.
export const listPerformanceWindows = async () => {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(period_start, '%Y-%m-%d') AS periodStart,
            DATE_FORMAT(period_end, '%Y-%m-%d') AS periodEnd,
            COUNT(*) AS departmentCount
     FROM department_performance
     GROUP BY period_start, period_end
     ORDER BY period_end DESC, period_start DESC
     LIMIT 24`,
  );

  return rows;
};

// Every snapshot for one department, oldest first — the shape a trend chart needs.
// Ordered ascending here where listPerformance orders descending, because a chart that
// plots its series right-to-left is a bug, not a style choice.
export const getDepartmentTrend = async (departmentId, limit = 12) => {
  const [department] = await db.query('SELECT id, name FROM departments WHERE id = ?', [
    departmentId,
  ]);

  if (!department[0]) {
    throw new ApiError(404, 'Department not found');
  }

  const [rows] = await db.query(
    `SELECT ${PERFORMANCE_COLUMNS}
     FROM department_performance p
     JOIN departments d ON d.id = p.department_id
     WHERE p.department_id = ?
     ORDER BY p.period_end DESC
     LIMIT ${Number(limit)}`,
    [departmentId],
  );

  return { department: department[0], periods: rows.reverse() };
};

// Defaults a partially-specified window to the current calendar month, and is the single
// place that knows what "this month" means.
//
// Returns plain YYYY-MM-DD strings rather than Date objects on purpose: these are
// compared against DATE columns and interpolated into the half-open bounds above, and a
// JS Date would arrive at the driver as a local-timezone timestamp whose behaviour
// depends on the machine's TZ. Strings have no timezone.
//
// The month boundary is read from the database rather than from the clock so that the
// window agrees with the timestamps MySQL stored. Deriving it from JS `new Date()`
// would put a month boundary in the app's timezone and a window boundary in the
// server's, which silently disagrees for anyone outside UTC.
export const resolvePeriod = async ({ periodStart, periodEnd } = {}) => {
  if (periodStart && periodEnd) {
    return { periodStart, periodEnd };
  }

  const [rows] = await db.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01') AS month_start,
            DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`,
  );

  const { month_start: monthStart, today } = rows[0];

  return {
    periodStart: periodStart ?? monthStart,
    // A window ending today would omit anything filed later the same day, and would
    // make two runs an hour apart report different windows for the same request. The
    // current month therefore runs to its last day, not to today.
    periodEnd: periodEnd ?? lastDayOf(monthStart),
  };
};

const lastDayOf = (monthStart) => {
  const [year, month] = monthStart.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

// Guards the two things a caller can get wrong that would otherwise be a slow query
// rather than an error: an inverted window, and one wide enough to scan every issue
// row for every department.
export const assertWindowIsSane = ({ periodStart, periodEnd }) => {
  if (periodStart > periodEnd) {
    throw new ApiError(400, 'Period start must be on or before period end');
  }

  const days =
    (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) /
    86_400_000;

  if (days + 1 > MAX_WINDOW_DAYS) {
    throw new ApiError(
      400,
      `Window is ${days + 1} days; the maximum is ${MAX_WINDOW_DAYS}`,
    );
  }
};
