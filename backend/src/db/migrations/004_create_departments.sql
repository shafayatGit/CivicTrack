-- 004: departments — the unit that "owns" an issue for routing and reporting.
--
-- ERD 1.2. Key type deviates from the ERD: the ERD specifies INT here, but this
-- project standardised on CHAR(36) UUIDs generated in JS (randomUUID) for every
-- primary key, matching 001_create_users.sql and 002_create_categories.sql.
--
-- DEVIATION FROM ERD: no UNIQUE on name. The ERD's constraint checklist (section 5)
-- lists exactly which columns are UNIQUE and departments.name is not among them, so
-- duplicate department names are currently permitted. Add uq_departments_name here
-- if that turns out to be unwanted.
CREATE TABLE
  IF NOT EXISTS departments (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) DEFAULT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );
