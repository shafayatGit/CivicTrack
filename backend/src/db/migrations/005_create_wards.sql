-- 005: wards — geographic scope for an issue, and half of the duplicate-detection key.
--
-- ERD 1.3. Key type deviates from the ERD (see 004: CHAR(36) UUID, not INT).
-- ward_number is UNIQUE per the ERD constraint checklist; name is not, since ward
-- numbering (not display name) is the stable public identifier.
CREATE TABLE
  IF NOT EXISTS wards (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    ward_number VARCHAR(20) NOT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wards_ward_number (ward_number)
  );
