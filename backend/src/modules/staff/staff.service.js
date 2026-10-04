import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, paginationSchema } from '../../utils/pagination.js';
import { withActor } from '../../utils/withActor.js';
import { sendWelcomeEmail } from '../../utils/email.js';

// staff is a 1:1 profile extension of users, so every read has to bridge the two.
// Joining once is the whole point: listing staff without the join means one extra
// query per row.
const SELECT_STAFF = `
  s.id, s.user_id, s.department_id, s.issue_count, s.preferences,
  s.created_at, s.updated_at,
  u.name, u.email, u.phone, u.nid, u.profile_image,
  d.name AS department_name
`;

// issue_count is a denormalised cache maintained by the three triggers in migration
// 015, not a live aggregate — it is trusted here on purpose, because recomputing it
// would mean a second scan of issues on every list request, which is exactly what
// the cache exists to avoid.
const FROM_STAFF = `
  FROM staff s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN departments d ON d.id = s.department_id
`;

const assertEmailAvailable = async (conn, email) => {
  const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length > 0) {
    throw new ApiError(409, 'Email already registered');
  }
};

const assertDepartmentExists = async (conn, departmentId) => {
  const [rows] = await conn.query('SELECT id FROM departments WHERE id = ?', [
    departmentId,
  ]);
  if (!rows[0]) {
    throw new ApiError(404, 'Department not found');
  }
};

// Admin-driven onboarding: creates the users row with role = 'staff' and the staff
// profile in one transaction.
//
// Migration 007 states the "every staff-role user has exactly one staff row"
// invariant is NOT enforced by the database and must be enforced in application
// code. Doing both inserts under one transaction is what makes that true: a failure
// on either side rolls the other back, so a half-created staff account is not a
// reachable state.
//
// The role is hardcoded to 'staff' rather than taken from the body — a caller must
// not be able to mint an admin by posting role: "admin" to this endpoint.
// The plaintext password is the caller's, not generated here, so it is still in scope
// when the welcome mail goes out — but only after the transaction has COMMITTED.
//
// Sending inside withActor would mean holding a pooled connection open across an SMTP
// round trip, and a mail failure would roll the account back. The second part is the
// one that actually matters: this endpoint's retry story is bad either way (a second
// POST hits assertEmailAvailable and 409s), so an account that exists but whose mail
// bounced is recoverable — the admin can see it here and resend — while an account that
// was rolled back looks like nothing happened and the plaintext password is gone.
export const createStaff = async ({ name, email, password, phone, nid, departmentId }) => {
  const staff = await withActor(null, async (conn) => {
    await assertEmailAvailable(conn, email);
    await assertDepartmentExists(conn, departmentId);

    const userId = randomUUID();
    const staffId = randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.query(
      `INSERT INTO users (id, name, email, password, role, phone, nid)
       VALUES (?, ?, ?, ?, 'staff', ?, ?)`,
      // nid is required by createStaffSchema and users.nid is NOT NULL since migration
      // 018, so it is passed through as-is. A `?? null` here would look harmless but
      // would hand MySQL a NOT NULL violation and surface as a 500.
      [userId, name, email, hashedPassword, phone ?? null, nid],
    );

    await conn.query(
      'INSERT INTO staff (id, user_id, department_id) VALUES (?, ?, ?)',
      [staffId, userId, departmentId],
    );

    const [rows] = await conn.query(
      `SELECT ${SELECT_STAFF} ${FROM_STAFF} WHERE s.id = ?`,
      [staffId],
    );

    return rows[0];
  });

  let credentialsEmailed = true;
  try {
    await sendWelcomeEmail({
      to: email,
      name,
      password,
      departmentName: staff.department_name,
      loginUrl: process.env.FRONTEND_URL,
    });
  } catch (error) {
    // Swallowed on purpose, see above: the account exists and the admin is the only
    // person who still has the password, so failing the request would throw both away.
    // credentialsEmailed is what lets the console say so instead of failing silently.
    credentialsEmailed = false;
    console.error(
      `Staff ${staff.id} created but the welcome email to ${email} failed:`,
      error.message,
    );
  }

  return { ...staff, credentialsEmailed };
};

export const listStaff = async (query) => {
  const { page, limit, departmentId, search } = query;
  const paging = { page, limit, offset: (page - 1) * limit };

  const where = [];
  const args = [];

  if (departmentId) {
    where.push('s.department_id = ?');
    args.push(departmentId);
  }

  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    args.push(`%${search}%`, `%${search}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT ${SELECT_STAFF} ${FROM_STAFF} ${clause} ORDER BY u.name ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total ${FROM_STAFF} ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${SELECT_STAFF} ${FROM_STAFF} WHERE s.id = ?`,
    [id],
  );
  return rows[0];
};

export const getStaff = async (id) => {
  const staff = await findById(id);
  if (!staff) {
    throw new ApiError(404, 'Staff member not found');
  }
  return staff;
};

export const updateStaff = async (id, { departmentId, preferences }) => {
  await getStaff(id);

  if (departmentId) {
    const [rows] = await db.query('SELECT id FROM departments WHERE id = ?', [
      departmentId,
    ]);
    if (!rows[0]) {
      throw new ApiError(404, 'Department not found');
    }
  }

  // preferences is a JSON column and MariaDB stores JSON as LONGTEXT, so the value
  // is stringified here and the driver never has to guess. The module boundary is the
  // only place that knows this.
  await db.query(
    `UPDATE staff
     SET department_id = COALESCE(?, department_id),
         preferences   = COALESCE(?, preferences)
     WHERE id = ?`,
    [departmentId ?? null, preferences ? JSON.stringify(preferences) : null, id],
  );

  return getStaff(id);
};

// The least-loaded-first list an admin uses when assigning an issue. Ordered by the
// cached issue_count, so this stays a single indexed pass.
export const listAvailableStaff = async (departmentId) => {
  const [rows] = await db.query(
    `SELECT s.id, s.issue_count, u.name, u.email
     FROM staff s
     JOIN users u ON u.id = s.user_id
     WHERE s.department_id = ?
     ORDER BY s.issue_count ASC, u.name ASC`,
    [departmentId],
  );
  return rows;
};

// Deleting the staff row cascades nothing on users, so the account would be orphaned
// with role = 'staff' and no profile — precisely the broken state migration 007 warns
// about. Both rows are therefore removed together.
export const deleteStaff = async (id) => {
  const staff = await getStaff(id);

  await withActor(null, async (conn) => {
    await conn.query('DELETE FROM staff WHERE id = ?', [id]);
    await conn.query('DELETE FROM users WHERE id = ?', [staff.user_id]);
  });
};
