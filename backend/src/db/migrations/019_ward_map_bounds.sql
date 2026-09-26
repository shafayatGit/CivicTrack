-- 019: give wards a map bounding box so a dropped pin can resolve to a ward.
--
-- The report form used to ask for a ward from a dropdown and coordinates typed by
-- hand, which meant the two could contradict each other: a citizen could drop a pin
-- in Dhanmondi while the form said Mirpur, and the duplicate scan — which is scoped
-- to ward_id — would then look in the wrong place and report no duplicates.
--
-- Bounds are a rectangle rather than a polygon because that is what a bounding box
-- can answer exactly and cheaply on both sides of the app, and a hand-entered ward
-- boundary is approximate anyway. All four are NULLable: a ward with no bounds simply
-- does not participate in auto-selection, and the dropdown stays authoritative.
--
-- Replay-safe: db:migrate re-runs every file, and ADD COLUMN has no IF NOT EXISTS on
-- MySQL 8, so each column is added through an information_schema guard.

SET @ddl := 'ALTER TABLE wards
  ADD COLUMN min_latitude DECIMAL(10,7) NULL DEFAULT NULL AFTER ward_number,
  ADD COLUMN min_longitude DECIMAL(10,7) NULL DEFAULT NULL AFTER min_latitude,
  ADD COLUMN max_latitude DECIMAL(10,7) NULL DEFAULT NULL AFTER min_longitude,
  ADD COLUMN max_longitude DECIMAL(10,7) NULL DEFAULT NULL AFTER max_latitude';

-- The guard is on min_latitude only, because the four columns are always added
-- together by the single ALTER above. A partial application is not reachable: the
-- statement either runs whole or not at all.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wards'
      AND COLUMN_NAME = 'min_latitude'
  ),
  'SELECT 1',
  @ddl
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The corners are the auto-selection hot path: every report drop runs one range
-- scan per ward, and without this the table is scanned in full each time.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wards'
      AND INDEX_NAME = 'idx_wards_bounds'
  ),
  'SELECT 1',
  'CREATE INDEX idx_wards_bounds ON wards (min_latitude, max_latitude, min_longitude, max_longitude)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
