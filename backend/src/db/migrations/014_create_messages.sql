-- 014: messages — staff <-> admin chat.
--
-- ERD 1.12. One table instead of Conversations + Messages: a "thread" is not a row,
-- it is every message sharing the same (staff_id, admin_id, issue_id) triplet.
--
-- That design has one direct consequence for indexing. Because many rows legitimately
-- share the triplet — that is what makes them one thread — the key is INDEXED, not
-- UNIQUE. Every "load this conversation" and "list my threads" query filters or groups
-- on that triplet directly, with no thread row to key off.
--
-- issue_id is nullable on purpose: NULL means a general staff<->admin thread with no
-- issue context. Any lookup must therefore use null-safe equality
-- (`issue_id <=> ?`), not `=`, or general threads are silently dropped.
--
-- UNENFORCED: admin_id must reference a role = 'admin' user. A plain FK cannot
-- inspect the target's role, and the SIGNAL-based trigger the ERD calls for needs a
-- BEGIN...END body this migration runner is not verified to support. Validate in the
-- service layer for now. See the note at the end of 007.
CREATE TABLE
  IF NOT EXISTS messages (
    id CHAR(36) PRIMARY KEY,
    staff_id CHAR(36) NOT NULL,
    admin_id CHAR(36) NOT NULL,
    issue_id CHAR(36) DEFAULT NULL,
    sender_id CHAR(36) NOT NULL,
    message_text TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at datetime DEFAULT CURRENT_TIMESTAMP,
    -- The thread key, in the ERD's order (ERD 1.12).
    KEY idx_messages_thread (staff_id, admin_id, issue_id, sent_at),
    -- Unread badge queries: "what is waiting for me". Not in the ERD, added because
    -- ERD 6 makes is_read the driver of that badge.
    KEY idx_messages_recipient_unread (admin_id, is_read),
    KEY idx_messages_issue (issue_id),
    CONSTRAINT fk_messages_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
  );
