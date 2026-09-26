import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, toPage } from '../../utils/pagination.js';
import { emitToParticipants, emitToUser } from '../../realtime/hub.js';

const MESSAGE_COLUMNS = `
  m.id, m.staff_id, m.admin_id, m.issue_id, m.sender_id,
  m.message_text, m.is_read, m.sent_at,
  u.name AS sender_name, u.role AS sender_role
`;

// A "thread" is not a row. Per migration 014 it is every message sharing the
// (staff_id, admin_id, issue_id) triplet, and issue_id is NULLABLE — NULL means a
// general staff<->admin thread with no issue context. Every thread lookup therefore
// has to use null-safe equality (`<=>`), never `=`, or general threads are silently
// dropped from history and unread counts.
//
// Both foreign keys point at different tables on purpose: staff_id references
// staff(id), while admin_id and sender_id reference users(id). The two are not
// interchangeable and mixing them up is the easiest mistake to make in this module.

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// The JWT carries users.id and role, never staff.id. Resolving the staff row here
// keeps that translation in one place instead of at every call site.
export const getIdentity = async (user) => {
  if (user.role !== 'staff') {
    return { userId: user.id, role: user.role, staffId: null };
  }

  const [rows] = await db.query(
    `SELECT s.id, s.department_id, s.issue_count
     FROM staff s
     WHERE s.user_id = ?`,
    [user.id],
  );

  if (!rows[0]) {
    // Migration 007 notes that "every staff-role user has a staff row" cannot be a
    // DB constraint, so this is the app-layer check it refers to. A staff account
    // with no profile cannot participate in a thread at all.
    throw new ApiError(
      403,
      'This staff account has no staff profile. Ask an admin to complete onboarding.',
    );
  }

  return {
    userId: user.id,
    role: user.role,
    staffId: rows[0].id,
    departmentId: rows[0].department_id,
    issueCount: rows[0].issue_count,
  };
};

// The admin list a staff member needs in order to pick who to talk to.
export const listAdmins = async () => {
  const [rows] = await db.query(
    `SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY name`,
  );
  return rows;
};

// ---------------------------------------------------------------------------
// Thread resolution and authorisation
// ---------------------------------------------------------------------------

// Normalises whatever the caller sent into a canonical thread, then checks the caller
// is actually a participant. The caller's own side is always taken from their
// identity and never from the request body — otherwise a staff member could set
// staffId to a colleague and post into someone else's thread.
export const resolveThread = async (identity, { staffId, adminId, issueId = null }) => {
  const isStaff = identity.role === 'staff';
  const resolvedStaffId = isStaff ? identity.staffId : staffId;
  const resolvedAdminId = isStaff ? adminId : identity.userId;

  if (isStaff && staffId && staffId !== identity.staffId) {
    // Rejected rather than quietly rewritten to the caller's own staffId. Silently
    // coercing is safe but hides a client bug: the sender would believe the message
    // went to a colleague's thread when it went to their own.
    throw new ApiError(403, 'You can only send as yourself');
  }

  if (!isStaff && adminId && adminId !== identity.userId) {
    throw new ApiError(403, 'You can only send as yourself');
  }

  if (!resolvedStaffId) {
    throw new ApiError(400, 'staffId is required when an admin starts a thread');
  }
  if (!resolvedAdminId) {
    throw new ApiError(400, 'adminId is required when a staff member starts a thread');
  }

  const [staffRows] = await db.query(
    'SELECT id, user_id, department_id FROM staff WHERE id = ?',
    [resolvedStaffId],
  );
  if (!staffRows[0]) {
    throw new ApiError(404, 'Staff member not found');
  }

  // Migration 014 flags this as unenforced by the schema: a plain FK cannot inspect
  // the target's role, and the SIGNAL-based trigger it would need requires a
  // BEGIN...END body this project's migrate runner is not verified to support.
  // Validating here is the documented substitute.
  const [adminRows] = await db.query(
    `SELECT id, name FROM users WHERE id = ? AND role = 'admin'`,
    [resolvedAdminId],
  );
  if (!adminRows[0]) {
    throw new ApiError(404, 'Admin not found');
  }

  if (issueId) {
    const [issueRows] = await db.query('SELECT id FROM issues WHERE id = ?', [issueId]);
    if (!issueRows[0]) {
      throw new ApiError(404, 'Issue not found');
    }
  }

  return {
    staffId: resolvedStaffId,
    adminId: resolvedAdminId,
    issueId: issueId || null,
    // messages.staff_id is a staff(id), but every socket room and every user row is
    // keyed on users(id). Carrying the bridge id on the thread means the realtime
    // layer never has to re-query to address the staff member.
    staffUserId: staffRows[0].user_id,
  };
};

// Which rows of `messages` the identity is allowed to see. Used as a fragment by
// every read so the visibility rule exists exactly once.
const visibilityFilter = (identity) =>
  identity.role === 'staff'
    ? 'm.staff_id = ?'
    : 'm.admin_id = ?';

const visibilityArgs = (identity) => [identity.staffId ?? identity.userId];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// One pass over messages using window functions: for each thread take the newest
// row, and carry that thread's message count and the caller's unread count alongside
// it. The previous approach — GROUP BY for the keys, then a second query per thread
// for its last message — was N+1, and the naive self-join on MAX(sent_at) can return
// duplicates because `datetime` has no fractional seconds, so two messages sent in
// the same second tie. ROW_NUMBER() breaks the tie on id and is exact.
//
// PARTITION BY treats NULL issue_id as one group, which is what a general thread is.
export const listThreads = async (identity, { page, limit, offset, issueId }) => {
  const pageArgs = { page, limit, offset };

  const where = [visibilityFilter(identity)];
  const args = visibilityArgs(identity);

  if (issueId) {
    where.push('m.issue_id = ?');
    args.push(issueId);
  }

  const [rows] = await db.query(
    `SELECT * FROM (
       SELECT
         m.id, m.staff_id, m.admin_id, m.issue_id, m.sender_id,
         m.message_text, m.is_read, m.sent_at,
         su.name AS staff_name,
         au.name AS admin_name,
         COUNT(*) OVER (
           PARTITION BY m.staff_id, m.admin_id, m.issue_id
         ) AS message_count,
         -- CAST is required, not cosmetic: SUM(...) OVER (...) comes back from
         -- MariaDB as DECIMAL, which mysql2 serialises as the STRING "1". COUNT
         -- already returns BIGINT, which is why only this one needs it.
         CAST(SUM(CASE WHEN m.is_read = FALSE AND m.sender_id <> ? THEN 1 ELSE 0 END)
           OVER (PARTITION BY m.staff_id, m.admin_id, m.issue_id) AS UNSIGNED) AS unread_count,
         ROW_NUMBER() OVER (
           PARTITION BY m.staff_id, m.admin_id, m.issue_id
           ORDER BY m.sent_at DESC, m.id DESC
         ) AS rn
       FROM messages m
       JOIN staff st ON st.id = m.staff_id
       JOIN users su ON su.id = st.user_id
       JOIN users au ON au.id = m.admin_id
       WHERE ${where.join(' AND ')}
     ) ranked
     WHERE ranked.rn = 1
     ORDER BY ranked.sent_at DESC
     ${limitClause(pageArgs)}`,
    [identity.userId, ...args],
  );

  // The same window query without the rn = 1 filter, restricted to the page just
  // returned, is one query for the total rather than one per thread.
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT ROW_NUMBER() OVER (
         PARTITION BY m.staff_id, m.admin_id, m.issue_id
       ) AS rn
       FROM messages m
       WHERE ${where.join(' AND ')}
     ) ranked
     WHERE ranked.rn = 1`,
    args,
  );

  return {
    items: rows.map(({ rn, ...rest }) => rest),
    pagination: buildMeta(pageArgs, countRows[0].total),
  };
};

export const getThreadMessages = async (identity, thread, query) => {
  const page = toPage(query);

  const [rows] = await db.query(
    `SELECT ${MESSAGE_COLUMNS}
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.staff_id = ? AND m.admin_id = ? AND m.issue_id <=> ?
     ORDER BY m.sent_at DESC, m.id DESC
     ${limitClause(page)}`,
    [thread.staffId, thread.adminId, thread.issueId],
  );

  // Newest-first is right for display but wrong for the unpaginated total, and
  // COUNT(*) over the same predicate keeps the two consistent.
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM messages
     WHERE staff_id = ? AND admin_id = ? AND issue_id <=> ?`,
    [thread.staffId, thread.adminId, thread.issueId],
  );

  // Reversed so the client receives oldest-first and can append without prepending.
  return {
    items: rows.reverse(),
    pagination: buildMeta(page, countRows[0].total),
  };
};

export const getUnreadCount = async (identity) => {
  // is_read = 0 counts only what the OTHER party sent: a message is unread for its
  // recipient, so the sender's own unread copy must not inflate the badge.
  const [rows] = await db.query(
    `SELECT COUNT(*) AS unread
     FROM messages
     WHERE ${identity.role === 'staff' ? 'staff_id' : 'admin_id'} = ?
       AND is_read = FALSE
       AND sender_id <> ?`,
    [identity.staffId ?? identity.userId, identity.userId],
  );

  return { unread: rows[0].unread };
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const sendMessage = async (identity, thread, messageText) => {
  const id = randomUUID();

  await db.query(
    `INSERT INTO messages (id, staff_id, admin_id, issue_id, sender_id, message_text)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, thread.staffId, thread.adminId, thread.issueId, identity.userId, messageText],
  );

  const [rows] = await db.query(
    `SELECT ${MESSAGE_COLUMNS}
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [id],
  );

  const message = rows[0];

  // Delivered over the socket as well, so a client that sent via REST and a client
  // that sent via the socket converge on the same event.
  emitToParticipants(thread, 'message:new', message);
  emitUnreadToParticipants(thread);

  return message;
};

export const markThreadRead = async (identity, thread) => {
  // Guarding on sender_id <> me is what makes is_read mean "the recipient has seen
  // it" rather than "it has been sent".
  const [result] = await db.query(
    `UPDATE messages
     SET is_read = TRUE
     WHERE staff_id = ? AND admin_id = ? AND issue_id <=> ?
       AND is_read = FALSE
       AND sender_id <> ?`,
    [thread.staffId, thread.adminId, thread.issueId, identity.userId],
  );

  if (result.affectedRows) {
    emitToParticipants(thread, 'thread:read', {
      ...thread,
      readBy: identity.userId,
      readAt: new Date().toISOString(),
    });
    emitUnreadToParticipants(thread);
  }

  return { updated: result.affectedRows };
};

// Push the refreshed badge to both sides, addressed by users(id) since that is what
// socket rooms are keyed on. The sender's badge also moved, so they need it even
// though they were just handed the message body.
const emitUnreadToParticipants = (thread) => {
  emitToUser(thread.adminId, 'unread:refresh', { changed: true });
  emitToUser(thread.staffUserId, 'unread:refresh', { changed: true });
};
