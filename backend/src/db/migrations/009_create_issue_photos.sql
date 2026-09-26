-- 009: issue_photos — evidence attached to a report.
--
-- ERD 1.6. ON DELETE CASCADE per the ERD constraint checklist (section 5): photos
-- have no meaning without their parent issue.
--
-- DEVIATION FROM ERD: the ERD annotates photo_url as a "Firebase Storage URL", but
-- nothing in this repository references Firebase. The backend depends on cloudinary
-- and has src/config/cloudinary.js already wired. The column is intentionally
-- provider-agnostic — it stores whatever URL the upload layer returns — so the ERD's
-- comment is simply stale, not a second storage integration.
CREATE TABLE
  IF NOT EXISTS issue_photos (
    id CHAR(36) PRIMARY KEY,
    issue_id CHAR(36) NOT NULL,
    photo_url VARCHAR(500) NOT NULL,
    uploaded_at datetime DEFAULT CURRENT_TIMESTAMP,
    KEY idx_issue_photos_issue (issue_id),
    CONSTRAINT fk_issue_photos_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE
  );
