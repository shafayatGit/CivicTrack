import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, paginationSchema } from '../../utils/pagination.js';
// Shared so the per-department "open" figure cannot drift from staff.issue_count or
// from the dashboard counters, which all narrow on the same two conditions.
import { openIssuePredicate } from '../issue/issue.service.js';

const COLUMNS = 'id, name, contact_email, created_at, updated_at';

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

export const createDepartment = async ({ name, contactEmail }) => {
  await ensureNameAvailable(name);

  const id = randomUUID();
  await db.query(
    'INSERT INTO departments (id, name, contact_email) VALUES (?, ?, ?)',
    [id, name, contactEmail ?? null],
  );

  return getDepartment(id);
};

// The per-department counters the workload and performance screens need, computed in
// one grouped pass rather than a COUNT(*) query per department. LEFT JOIN means a
// department with no issues still appears, with the SUMs coming back NULL and
// COALESCE turning them into 0; COUNT(i.id) ignores the NULL row for the same reason.
export const listDepartments = async (query) => {
  const { page, limit } = paginationSchema.parse(query ?? {});
  const paging = { page, limit, offset: (page - 1) * limit };

  const [rows] = await db.query(
    `SELECT d.id, d.name, d.contact_email, d.created_at, d.updated_at,
     COALESCE(SUM(${openIssuePredicate('i')}), 0) AS open_issues,
     COALESCE(SUM(i.status =  'Resolved'), 0)  AS resolved_issues,
     COALESCE(SUM(i.is_invalid = TRUE), 0)     AS invalid_issues,
     COUNT(i.id)                               AS total_issues
     FROM departments d
     LEFT JOIN issues i ON i.department_id = d.id
     GROUP BY d.id, d.name, d.contact_email, d.created_at, d.updated_at
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

export const updateDepartment = async (id, { name, contactEmail }) => {
  await getDepartment(id);
  await ensureNameAvailable(name, id);

  await db.query(
    'UPDATE departments SET name = ?, contact_email = ? WHERE id = ?',
    [name, contactEmail ?? null, id],
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
