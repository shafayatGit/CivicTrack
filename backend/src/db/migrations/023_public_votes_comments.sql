-- 023: public votes and comments — anonymous participation, and comment moderation.
--
-- Migrations 010/011 made both tables strictly account-bound: user_id CHAR(36) NOT
-- NULL with an FK to users. That is what forces an open vote/comment endpoint to
-- drop those constraints, and it is the whole reason this file exists.
--
-- WHAT ANONYMOUS MEANS HERE, PRECISELY
-- ------------------------------------
-- A visitor without an account is identified by `voter_token`: a 64-char random
-- value in an httpOnly cookie, minted on first use. The service derives an identity
-- key from it and that key — not the raw cookie — is what lands in the column, so a
-- stolen database read cannot be replayed as votes by anyone who saw a token.
--
-- This is a speed bump, not identity. Clearing cookies, switching browser, or
-- switching network all yield another vote. The honest framing is one vote per
-- *browser*, not one per *person*; anything stronger needs an account, which is
-- exactly why a signed-in vote still records user_id. Do not describe this as
-- duplicate-vote prevention for the public in the UI.
--
-- WHY TWO UNIQUE KEYS AND NOT ONE
-- -------------------------------
-- MySQL has no filtered/partial indexes, so "unique per issue for signed-in users,
-- and unique per issue per token for anonymous ones" cannot be expressed as one
-- constraint. Two keys is the standard workaround, and it is only correct because
-- of a MySQL quirk this file depends on: NULLs are considered DISTINCT in a UNIQUE
-- index, so a signed-in row (voter_token NULL) never collides with another signed-in
-- row on the token key, and an anonymous row (user_id NULL) never collides on the
-- user key. Verified on MariaDB 10.4 — see the probe in the module docs.
--
-- Consequences that fall out of that quirk, both deliberate:
--   - The same anonymous browser voting twice inserts a second row only if it also
--     changed token, which it cannot; uq_votes_issue_token catches the real case.
--   - A signed-in user who also has an anonymous token cannot be double-counted,
--     because the service picks ONE identity (user_id when present, else token) and
--     never writes both columns for the same row.
--
-- The FK to users stays on user_id and is now nullable, so a deleted account takes
-- its signed-in votes with it (ON DELETE CASCADE) while anonymous votes are
-- untouched by any account lifecycle at all.
--
-- Replay-safe: ADD COLUMN / DROP KEY / ADD KEY have no IF NOT EXISTS on MySQL 8, so
-- the column and index changes go through information_schema checks + PREPARE. See
-- the repo's AGENTS.md "Migrations" section.

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------

-- user_id becomes nullable so an anonymous vote has no account to point at.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votes'
        AND COLUMN_NAME = 'user_id' AND IS_NULLABLE = 'NO'
    ),
    'ALTER TABLE votes MODIFY COLUMN user_id CHAR(36) NULL',
    'DO 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The identity column for anonymous voters. CHAR(64) because it stores a hex SHA-256,
-- not the cookie value itself.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votes'
        AND COLUMN_NAME = 'voter_token'
    ),
    'DO 0',
    'ALTER TABLE votes ADD COLUMN voter_token CHAR(64) NULL AFTER user_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- A CHECK that encodes the real invariant — a vote has an account OR a token, never
-- neither and never both. MariaDB 10.2+ and MySQL 8 both enforce CHECK, so a bug in
-- the service cannot write a row that belongs to nobody.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_votes_identity'
    ),
    'DO 0',
    'ALTER TABLE votes ADD CONSTRAINT chk_votes_identity
       CHECK (user_id IS NOT NULL OR voter_token IS NOT NULL)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Anonymous uniqueness. Relies on NULLs being distinct, per the header note.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'votes'
        AND INDEX_NAME = 'uq_votes_issue_token'
    ),
    'DO 0',
    'ALTER TABLE votes ADD UNIQUE KEY uq_votes_issue_token (issue_id, voter_token)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'user_id' AND IS_NULLABLE = 'NO'
    ),
    'ALTER TABLE comments MODIFY COLUMN user_id CHAR(36) NULL',
    'DO 0'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- What to call the author in the UI. For a signed-in commenter the service stores
-- their real name; for an anonymous one it stores whatever display name they chose,
-- or 'Anonymous' when they chose not to. Denormalised on purpose: the thread must
-- still read correctly after an account is deleted, and a deleted user would
-- otherwise leave a nameless gap in a public conversation.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'author_name'
    ),
    'DO 0',
    'ALTER TABLE comments ADD COLUMN author_name VARCHAR(80) NULL AFTER user_id'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Same identity CHECK as votes: a comment is attributable to an account, a name, or
-- both. 'Anonymous' is stored as a name, so author_name can never be NULL in
-- practice — the NOT NULL default keeps a direct-SQL writer from producing a gap.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'author_name' AND IS_NULLABLE = 'NO'
    ),
    'DO 0',
    'ALTER TABLE comments MODIFY COLUMN author_name VARCHAR(80) NOT NULL DEFAULT ''Anonymous'''
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Moderation, not deletion. Hiding keeps the moderation trail (who hid it, when, and
-- why) which a hard DELETE destroys, and it lets a mistaken takedown be reversed —
-- the same reasoning that made false_reports append-only. A hard delete is still
-- available to an admin through the route, for content that must not persist at all.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'is_hidden'
    ),
    'DO 0',
    'ALTER TABLE comments ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE AFTER author_name'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'hidden_reason'
    ),
    'DO 0',
    'ALTER TABLE comments ADD COLUMN hidden_reason VARCHAR(255) NULL AFTER is_hidden'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SET NULL, not RESTRICT: deleting the admin who hid a comment must not delete the
-- comment, or a routine account cleanup would silently un-moderate public content.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'hidden_by'
    ),
    'DO 0',
    'ALTER TABLE comments ADD COLUMN hidden_by CHAR(36) NULL AFTER hidden_reason,
      ADD CONSTRAINT fk_comments_hidden_by FOREIGN KEY (hidden_by)
        REFERENCES users (id) ON DELETE SET NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND COLUMN_NAME = 'hidden_at'
    ),
    'DO 0',
    'ALTER TABLE comments ADD COLUMN hidden_at datetime NULL AFTER hidden_by'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The public thread reads unhidden comments newest-last, so this composite index
-- serves the WHERE + ORDER BY without a filesort on a growing table.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments'
        AND INDEX_NAME = 'idx_comments_issue_visible'
    ),
    'DO 0',
    'ALTER TABLE comments ADD KEY idx_comments_issue_visible (issue_id, is_hidden, created_at)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
