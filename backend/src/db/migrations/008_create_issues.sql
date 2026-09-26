-- 008: issues — the core entity.
--
-- ERD 1.5. Key type deviates from the ERD (see 004: CHAR(36) UUID, not INT/UUID PG).
--
-- Two distinct routing concepts, kept distinct on purpose (ERD 1.5):
--   department_id    — which department OWNS the issue. Defaults from
--                      categories.default_department_id at insert time.
--   assigned_staff_id — which individual is ACTIVELY WORKING it, NULL until someone
--                      picks it up. A staffed issue may have no department yet and a
--                      routed issue may have no assignee.
--
-- DEVIATION FROM ERD: status is an ENUM rather than VARCHAR(20) + CHECK. The ERD uses
-- CHECK; 001_create_users.sql already chose ENUM for users.role, and ENUM gives the
-- same guarantee while matching house style. The four values are identical.
--
-- DEVIATION FROM ERD: citizen_confirmed is NOT NULL DEFAULT FALSE. The ERD leaves it
-- nullable, which would make every read have to handle NULL as "not confirmed".
--
-- DEVIATION FROM ERD: updated_at is added. The ERD does not list it, but every
-- other table in this schema has it and issues are the one row type that mutates
-- most (status, assignment, resolution).
CREATE TABLE
  IF NOT EXISTS issues (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    category_id CHAR(36) NOT NULL,
    ward_id CHAR(36) NOT NULL,
    department_id CHAR(36) DEFAULT NULL,
    assigned_staff_id CHAR(36) DEFAULT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    landmark VARCHAR(150) DEFAULT NULL,
    status ENUM ('Reported', 'Acknowledged', 'In Progress', 'Resolved')
      NOT NULL DEFAULT 'Reported',
    citizen_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at datetime DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- ON DELETE choices follow the ERD constraint checklist (section 5):
    --   reporter          CASCADE  — a deleted user's reports go with them
    --   category/ward/dept RESTRICT — lookup tables are never deleted out from under
    --                                 issues that reference them
    --   assigned_staff_id SET NULL  — ERD section 5 is explicit: a departing staff
    --                                 member's issues fall back to unassigned rather
    --                                 than blocking the staff deletion
    CONSTRAINT fk_issues_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_issues_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
    CONSTRAINT fk_issues_ward FOREIGN KEY (ward_id) REFERENCES wards (id) ON DELETE RESTRICT,
    CONSTRAINT fk_issues_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_issues_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES staff (id) ON DELETE SET NULL,
    KEY idx_issues_user (user_id),
    KEY idx_issues_status (status),
    KEY idx_issues_department_status (department_id, status),
    -- Supports the query-time duplicate check (ERD 1.5: ward + category + proximity).
    -- The category/ward/status narrowing is index-backed; the final distance filter
    -- still scans the surviving rows in application code, so keep the prefilter tight.
    KEY idx_issues_duplicate_probe (ward_id, category_id, status),
    -- Supports the bounding-box pass of the same proximity check. This is a plain
    -- composite index, not SPATIAL: a SPATIAL index would need NOT NULL geometry
    -- columns and a POINT SRID, which is a larger change than this migration.
    KEY idx_issues_coordinates (latitude, longitude)
  );

-- No duplicate_of column, by design (ERD 1.5): duplicate detection is a query-time
-- check rather than a stored link, which keeps this table simple at the cost of not
-- retaining a permanent record of which reports were flagged as duplicates.
