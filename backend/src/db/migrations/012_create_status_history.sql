-- 012: status_history — the append-only audit trail for issue status.
--
-- ERD 1.9. This is the normalised source of truth for workflow state; issues.status
-- is the deliberately denormalised "current state" column that exists only so
-- filtering is fast (ERD section 4). Do not treat issues.status as the record of
-- what happened — this table is.
--
-- Rows are written by trg_issues_log_status_change in 015, not by application code.
-- See that file for the required session-variable convention.
--
-- changed_by is ON DELETE SET NULL: the audit trail must outlive the account that
-- produced it. The same reasoning the ERD gives for issues.assigned_staff_id.
CREATE TABLE
  IF NOT EXISTS status_history (
    id CHAR(36) PRIMARY KEY,
    issue_id CHAR(36) NOT NULL,
    old_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    changed_by CHAR(36) DEFAULT NULL,
    changed_at datetime DEFAULT CURRENT_TIMESTAMP,
    KEY idx_status_history_issue (issue_id),
    KEY idx_status_history_changed_at (changed_at),
    CONSTRAINT fk_status_history_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_status_history_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
  );
