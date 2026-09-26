-- 010: votes — issue upvotes, one per user.
--
-- ERD 1.7. UNIQUE(issue_id, user_id) is the whole point of this table: it makes
-- one-vote-per-user a database guarantee rather than an application convention, so
-- two concurrent requests cannot both insert. Expect duplicate-key errors to surface
-- as a 409 in the service layer.
--
-- uq_votes_issue_user also serves as the lookup index for "votes on this issue", so
-- there is deliberately no separate index on issue_id. idx_votes_user exists for
-- "which issues has this user voted on".
CREATE TABLE
  IF NOT EXISTS votes (
    id CHAR(36) PRIMARY KEY,
    issue_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at datetime DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_votes_issue_user (issue_id, user_id),
    KEY idx_votes_user (user_id),
    CONSTRAINT fk_votes_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
    CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
