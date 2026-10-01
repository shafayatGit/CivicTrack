import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';

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
