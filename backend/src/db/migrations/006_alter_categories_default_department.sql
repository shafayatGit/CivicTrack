-- 006: auto-routing hook on categories.
--
-- ERD 1.4 specifies categories.default_department_id, which is what lets a freshly
-- reported issue be routed to the right department without a human choosing one.
-- ERD 1.5 notes this is why Categories is split out of Issues in the first place
-- (issue -> category -> default department would otherwise be a transitive
-- dependency). It is the missing half of the 3NF argument in ERD section 4.
--
-- Requires 004_create_departments.sql to have run (filename order guarantees it).
-- Guarded because ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS on either
-- MySQL 8 or MariaDB, and db:migrate replays this file on every run.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'categories'
      AND COLUMN_NAME = 'default_department_id'
  ),
  'SELECT 1',
  'ALTER TABLE categories ADD COLUMN default_department_id CHAR(36) NULL DEFAULT NULL AFTER name'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ON DELETE SET NULL: removing a department must not delete the categories that
-- default to it, it should only unroute them and let an admin reassign.
SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'categories'
      AND CONSTRAINT_NAME = 'fk_categories_default_department'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE categories ADD CONSTRAINT fk_categories_default_department FOREIGN KEY (default_department_id) REFERENCES departments (id) ON DELETE SET NULL'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'categories'
      AND INDEX_NAME = 'idx_categories_default_department'
  ),
  'SELECT 1',
  'CREATE INDEX idx_categories_default_department ON categories (default_department_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
