import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, toPage } from '../../utils/pagination.js';

// A public thread. The read shape deliberately joins users to pick up an avatar-ish
// initial and the account role, because "is this an official reply or a passer-by" is
// the single most useful thing a reader can know — and it is NOT taken from
// author_name, which an anonymous visitor chooses freely and could set to "City Hall".
//
// role is null for an anonymous commenter and is never derived from client input. The
// staff badge on an official reply is therefore unforgeable, which is the whole point of
// showing it.
const LIST_SELECT = `
  c.id, c.issue_id, c.comment_text, c.created_at,
  c.is_hidden, c.author_name,
  c.hidden_reason, c.hidden_at,
  u.role AS author_role,
  u.id AS author_user_id,
  h.name AS hidden_by_name
`;

const LIST_FROM = `
  FROM comments c
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN users h ON h.id = c.hidden_by
`;

export const listComments = async (query) => {
  const { issueId, includeHidden } = query;
  const paging = toPage(query);

  const [issue] = await db.query('SELECT id FROM issues WHERE id = ?', [issueId]);
  if (!issue[0]) {
    throw new ApiError(404, 'Issue not found');
  }

  // Hidden comments are excluded for everyone except an admin who asked for them, and
  // they are filtered in SQL rather than after the fact so the page cannot leak a
  // hidden comment by counting toward its limit.
  const where = ['c.issue_id = ?'];
  const args = [issueId];

  if (!includeHidden) {
    where.push('c.is_hidden = FALSE');
  }

  const clause = `WHERE ${where.join(' AND ')}`;

  const [rows] = await db.query(
    `SELECT ${LIST_SELECT} ${LIST_FROM} ${clause}
     ORDER BY c.created_at ASC, c.id ASC
     ${limitClause(paging)}`,
    args,
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total ${LIST_FROM} ${clause}`,
    args,
  );

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

export const createComment = async (issueId, author, { commentText, authorName }) => {
  const [issue] = await db.query('SELECT id FROM issues WHERE id = ?', [issueId]);
  if (!issue[0]) {
    throw new ApiError(404, 'Issue not found');
  }

  // The stored name is the account's own when signed in — the request's authorName is
  // ignored entirely, so a signed-in user cannot post under a different name. Read from
  // the row rather than the JWT's name claim, which is a snapshot from login and would
  // go stale if the account was renamed since.
  let storedName;

  if (author.userId) {
    const [account] = await db.query('SELECT name FROM users WHERE id = ?', [
      author.userId,
    ]);

    if (!account[0]) {
      throw new ApiError(401, 'This account no longer exists');
    }

    storedName = account[0].name;
  } else {
    storedName = (authorName?.trim() || 'Anonymous').slice(0, 80);
  }

  const id = randomUUID();

  await db.query(
    `INSERT INTO comments (id, issue_id, user_id, author_name, comment_text)
     VALUES (?, ?, ?, ?, ?)`,
    [id, issueId, author.userId, storedName, commentText],
  );

  const [rows] = await db.query(
    `SELECT ${LIST_SELECT} ${LIST_FROM} WHERE c.id = ?`,
    [id],
  );

  return rows[0];
};

// ---------------------------------------------------------------------------
// Moderation (admin only — enforced by the route, not here)
// ---------------------------------------------------------------------------

export const hideComment = async (commentId, admin, reason) => {
  const [existing] = await db.query(
    'SELECT id, is_hidden FROM comments WHERE id = ?',
    [commentId],
  );

  if (!existing[0]) {
    throw new ApiError(404, 'Comment not found');
  }

  if (existing[0].is_hidden) {
    // Idempotent, and it does not overwrite the original moderator's reason — the same
    // reasoning as deactivateCitizen, where a second click from a stale page must not
    // rewrite the audit trail.
    return { id: commentId, isHidden: true, alreadyHidden: true };
  }

  await db.query(
    `UPDATE comments
     SET is_hidden = TRUE, hidden_reason = ?, hidden_by = ?, hidden_at = ?
     WHERE id = ?`,
    [reason ?? null, admin.id, new Date(), commentId],
  );

  return { id: commentId, isHidden: true, alreadyHidden: false };
};

export const restoreComment = async (commentId) => {
  const [existing] = await db.query(
    'SELECT id, is_hidden FROM comments WHERE id = ?',
    [commentId],
  );

  if (!existing[0]) {
    throw new ApiError(404, 'Comment not found');
  }

  await db.query(
    `UPDATE comments
     SET is_hidden = FALSE, hidden_reason = NULL, hidden_by = NULL, hidden_at = NULL
     WHERE id = ?`,
    [commentId],
  );

  return { id: commentId, isHidden: false };
};

// A hard delete, for content that must not persist at all. Separate from hide so that
// the reversible action is the default and the irreversible one is a deliberate second
// step, and so the audit columns above are only ever destroyed on request.
export const deleteComment = async (commentId) => {
  const [result] = await db.query('DELETE FROM comments WHERE id = ?', [commentId]);

  if (!result.affectedRows) {
    throw new ApiError(404, 'Comment not found');
  }

  return { id: commentId, deleted: true };
};

// A hidden comment is replaced with a placeholder in the public thread rather than
// vanishing, so a reader can see that something was removed instead of wondering
// whether the conversation is unreliable.
export const presentComment = (row) => ({
  id: row.id,
  issue_id: row.issue_id,
  comment_text: row.comment_text,
  created_at: row.created_at,
  author_name: row.author_name,
  author_role: row.author_role ?? null,
  is_author_registered: Boolean(row.author_user_id),
  is_hidden: Boolean(row.is_hidden),
  hidden_reason: row.is_hidden ? (row.hidden_reason ?? null) : null,
  hidden_by_name: row.is_hidden ? (row.hidden_by_name ?? null) : null,
  hidden_at: row.is_hidden ? (row.hidden_at ?? null) : null,
});
