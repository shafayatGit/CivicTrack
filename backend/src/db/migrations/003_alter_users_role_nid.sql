-- 003: correct the users.role enum and add the National ID column.
--
-- 001_create_users.sql shipped ENUM('user','stuff','admin'). 'stuff' was a typo
-- for 'staff', and 'user' does not match the role model in CivicTrack_ERD_Schema.md
-- ('citizen','staff','admin'). Both are corrected here rather than by editing 001,
-- because db:migrate replays every file and an already-migrated database would not
-- pick up an edit to a file it has already run.
--
-- Every statement below is replay-safe: db:migrate re-runs all migrations on every
-- invocation, so nothing here may error on the second pass.

-- 1. Normalise legacy role values BEFORE narrowing the enum, otherwise rows holding
--    'user' would either be coerced to '' (non-strict) or abort the ALTER (strict).
--    'stuff' maps to 'citizen' rather than 'staff' on purpose: silently granting the
--    elevated role is the wrong default, and no legitimate row can hold 'stuff'.
--    The information_schema guard makes this a no-op once the new enum is in place,
--    because comparing an ENUM column against a value it no longer lists is unsafe.
SET @users_role_column_type := (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
);

SET @stmt := IF(
  @users_role_column_type LIKE '%stuff%',
  "UPDATE users SET role = 'citizen' WHERE role IN ('user', 'stuff')",
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- MODIFY is inherently idempotent, so no guard is needed here.
ALTER TABLE users
  MODIFY COLUMN role ENUM('citizen', 'staff', 'admin') NOT NULL DEFAULT 'citizen';

-- 2. users.nid — National ID, used for citizen verification to limit spam reports.
--
-- DEVIATION FROM ERD: the ERD marks nid NOT NULL, but POST /api/auth/register does
-- not collect a National ID, so the column is NULLable here. Making it NOT NULL is a
-- separate migration that must land together with a register form that collects it,
-- plus a backfill for existing rows.
--
-- The column and its index are added separately because ADD COLUMN IF NOT EXISTS
-- (MariaDB only) and CREATE UNIQUE INDEX IF NOT EXISTS are not available on MySQL 8.
-- The information_schema guards keep this portable and replay-safe on both.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'nid'
  ),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN nid VARCHAR(20) NULL DEFAULT NULL AFTER email'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- NULLs do not collide in a MySQL/MariaDB UNIQUE index, so leaving nid unset for
-- existing users is safe while several users share no National ID.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'uq_users_nid'
  ),
  'SELECT 1',
  'CREATE UNIQUE INDEX uq_users_nid ON users (nid)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
