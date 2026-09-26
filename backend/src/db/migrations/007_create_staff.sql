-- 007: staff — a 1:1 profile extension of users where role = 'staff'.
--
-- ERD 1.11. Splitting staff-only columns (department, workload, preferences) off
-- users means citizen and admin rows do not carry columns that are meaningless for
-- them — the 3NF argument in ERD section 4.
--
-- This table is created BEFORE issues (008) because issues.assigned_staff_id
-- references it. Filename order is the only thing enforcing that.
--
-- preferences is JSON rather than the ERD's JSONB: JSONB is a PostgreSQL type.
-- MySQL 8 has native JSON; MariaDB 10.4 accepts JSON as a LONGTEXT alias, so the
-- single spelling works on both.
CREATE TABLE
  IF NOT EXISTS staff (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    department_id CHAR(36) NOT NULL,
    issue_count INT NOT NULL DEFAULT 0,
    preferences JSON DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_staff_user (user_id),
    KEY idx_staff_department (department_id),
    KEY idx_staff_workload (department_id, issue_count),
    CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT,
    CONSTRAINT chk_staff_issue_count CHECK (issue_count >= 0)
  );

-- NOT ENFORCED BY THE DATABASE, and deliberately so: the ERD (1.1) asks that every
-- staff-role user have a matching staff row and that non-staff users do not. A
-- trigger cannot do this, because at INSERT time the row has no department_id yet,
-- which is mandatory on this table. This must be enforced in application code when
-- the staff-onboarding flow is built.
--
-- Also unenforced: messages.admin_id must reference a role = 'admin' user (ERD 1.12).
-- A plain FK cannot inspect the target's role, and the SIGNAL-based check needs a
-- BEGIN...END trigger body, which this project's single-connection, multi-statement
-- migrate runner is not verified to support. Validate that in the service layer for
-- now and add the trigger once compound bodies are confirmed working.
