import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import bcrypt from 'bcrypt';

const COLUMNS = 'id, name, email, nid, role, phone, is_active, deactivated_at, deactivation_reason, created_at';

// Reverses a deactivation. The counterpart to falseReport.deactivateCitizen, and
// kept in a user module rather than on the flag because re-enabling someone is a
// statement about the account, not about the report that got it banned — and because
// the person who does it has usually been shown the flag, not the reason to change
// their mind.
//
// Clearing deactivated_at and deactivation_reason rather than leaving them is
// deliberate: the columns are the "currently banned" state, not a log. The history of
// what happened lives in false_reports, which is append-only, so nothing is lost by
// making the users row describe only its present.
export const reactivate = async (id) => {
  const [existing] = await db.query(
    'SELECT id, role, is_active FROM users WHERE id = ?',
    [id],
  );

  if (!existing[0]) {
    throw new ApiError(404, 'User not found');
  }

  // Same rule as the deactivation side: this flow is for citizens. A staff or admin
  // account is removed through the staff module or demoted, never banned here, so
  // accepting one would be a sign the caller has the wrong tool.
  if (existing[0].role !== 'citizen') {
    throw new ApiError(
      409,
      'Only a citizen account can be reactivated. Use the staff module for staff accounts.',
    );
  }

  if (existing[0].is_active) {
    throw new ApiError(409, 'This account is already active');
  }

  await db.query(
    `UPDATE users
     SET is_active = TRUE, deactivated_at = NULL, deactivation_reason = NULL
     WHERE id = ?`,
    [id],
  );

  return getUser(id);
};

export const getUser = async (id) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ?`,
    [id],
  );

  if (!rows[0]) {
    throw new ApiError(404, 'User not found');
  }

  return rows[0];
};

// The only two columns this endpoint may write. A literal map in this file, which is
// what makes the SET-list interpolation in updateProfile safe: the identifier comes from
// these keys, never from the request body. Values are always bound parameters.
const WRITABLE_PROFILE_FIELDS = { name: 'name', phone: 'phone' };

// Self-service profile edit, for the signed-in actor only.
//
// The SET list is built from whichever keys the caller actually sent, rather than the
// COALESCE pair staff.updateStaff uses. COALESCE cannot express this endpoint's
// requirement: COALESCE(NULL, phone) evaluates to the column's CURRENT value, so a
// client sending `phone: null` to remove its number would get a silent no-op and a 200.
// Here, an absent key means "leave it alone" and an explicit null means "write NULL",
// which is the distinction a "clear my phone number" button needs.
//
// Only `name` and `phone` are writable — see user.validation.js for why email, nid and
// profile_image are not, which is the more interesting half of this endpoint.
export const updateProfile = async (userId, body) => {
  const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);

  if (!existing[0]) {
    throw new ApiError(404, 'User not found');
  }

  const present = Object.keys(WRITABLE_PROFILE_FIELDS).filter(
    (field) => body[field] !== undefined,
  );

  if (present.length === 0) {
    throw new ApiError(400, 'Provide at least one field to update');
  }

  // Unreachable in practice — updateProfileSchema's refine already rejects an empty
  // object — but the guard is here because without it this would build `SET  WHERE id = ?`
  // and throw a syntax error, which is a far worse thing to hand a caller than a 400.
  const setClause = present
    .map((field) => `${WRITABLE_PROFILE_FIELDS[field]} = ?`)
    .join(', ');

  await db.query(
    `UPDATE users SET ${setClause} WHERE id = ?`,
    [...present.map((field) => body[field]), userId],
  );

  return getUser(userId);
};

// Password change, self-service. Separate from updateProfile rather than a field on it,
// for the reason reactivation is: it proves possession of the current credential, it is
// the one write here that can lock you out, and it deserves its own narrow route and log
// line instead of riding along in a general profile PATCH.
export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const [rows] = await db.query('SELECT id, password FROM users WHERE id = ?', [userId]);
  const user = rows[0];

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Compared unconditionally rather than only when it differs from newPassword, so a
  // policy decision like "you must choose something new" can be added here without
  // anyone having to notice that this function currently allows a no-op change.
  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    // 401, not 400: the request was well-formed, the credential was simply wrong.
    throw new ApiError(401, 'Current password is incorrect');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

  return { success: true };
};

// The caller's own row, for the settings screen.
//
// It exists because the JWT only carries {id, name, email, role} — there is no phone,
// no nid, and no /api/auth/me to ask. Without this, the settings form would open blank
// and "clear my phone" would be indistinguishable from "leave my phone alone", since
// both look like an empty input.
//
// Deliberately the same COLUMNS the admin getUser uses, and therefore still no password
// column. A user reading their own row is not a privilege worth a narrower projection
// than the one the admin already sees.
export const getMyProfile = async (userId) => getUser(userId);
