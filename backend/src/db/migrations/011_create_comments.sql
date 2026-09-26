-- 011: comments — the discussion thread on an issue (ERD 1.8).
--
-- Covers all three audiences named in the ERD: status updates from staff,
-- clarifications from citizens, resolution notes.
--
-- No soft delete / moderation flag exists in the ERD. If reports need to be hidden,
-- that is a new column plus a service-layer decision, not something to infer here.
CREATE TABLE
  IF NOT EXISTS comments (
    id CHAR(36) PRIMARY KEY,
    issue_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    KEY idx_comments_issue (issue_id),
    KEY idx_comments_user (user_id),
    CONSTRAINT fk_comments_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
