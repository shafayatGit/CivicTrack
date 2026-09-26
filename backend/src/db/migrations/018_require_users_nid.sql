-- 018: make users.nid required, as CivicTrack_ERD_Schema.md specifies.
--
-- 003 added the column as NULLable and recorded why: the register endpoint did not
-- collect a National ID, so requiring one would have locked every existing citizen
-- out of their own account. The register form now collects it, so the constraint
-- can finally land — together with the backfill it needs.
--
-- Replay-safe: db:migrate re-runs every file on each invocation, so the backfill is
-- a no-op once no NULLs remain, and MODIFY is inherently idempotent.

-- 1. Backfill before narrowing the column. A NOT NULL ALTER over a NULL aborts under
--    strict mode, which is the mode that protects the data, so this cannot be skipped.
--
--    The placeholder is a readable LEGACY-n rather than a random digit string on
--    purpose: a real National ID is 10, 13, or 17 digits, so a short obviously-fake
--    value can never collide with one a citizen would later type, and it is obvious
--    in the database that the row predates ID collection. The sequence variable makes
--    the values unique, which the uq_users_nid index from 003 requires even though
--    MySQL would otherwise tolerate repeated NULLs.
SET @legacy_nid_seq := 0;

UPDATE users
SET nid = CONCAT('LEGACY-', @legacy_nid_seq := @legacy_nid_seq + 1)
WHERE nid IS NULL;

-- 2. Narrow the column. MODIFY re-states the full definition, so the type and length
--    are repeated deliberately; dropping them would reset the column to the defaults.
ALTER TABLE users MODIFY COLUMN nid VARCHAR(20) NOT NULL;
