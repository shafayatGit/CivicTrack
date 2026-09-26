-- 013: department_performance — historical performance snapshots.
--
-- ERD 1.10. A physical table rather than a view, deliberately: a view would only
-- ever reflect the current moment, and the whole point is answering "how did Roads
-- do last month versus this month".
--
-- Nothing populates this table yet. Per ERD 3.3 the snapshot is produced either by a
-- scheduled job or by a trigger on issues transitioning to 'Resolved', and this
-- project has no scheduler and no job runner. A stored procedure was considered and
-- skipped: it needs a BEGIN...END body, and this project's migrate runner sends
-- each file as one multi-statement query, which is not verified to support compound
-- routine bodies. Revisit with a real scheduler rather than bolting a cron onto the
-- migration path.
--
-- ON CONFLICT (department_id, period_start, period_end) DO UPDATE in ERD 3.3 becomes
-- ON DUPLICATE KEY UPDATE here, keyed on uq_department_performance_window, so
-- re-running a snapshot for the same window is idempotent.
--
-- KNOWN GAP: overdue_count exists per the ERD but nothing can compute it — "SLA
-- threshold" appears exactly once in the whole ERD, in this column's own description,
-- and no threshold value or definition is given anywhere. It will sit at 0 until an
-- SLA is defined. Do not report it as a real metric before then.
CREATE TABLE
  IF NOT EXISTS department_performance (
    id CHAR(36) PRIMARY KEY,
    department_id CHAR(36) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    resolved_count INT NOT NULL DEFAULT 0,
    open_count INT NOT NULL DEFAULT 0,
    overdue_count INT NOT NULL DEFAULT 0,
    avg_resolution_hours DECIMAL(8,2) DEFAULT NULL,
    calculated_at datetime DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_department_performance_window (department_id, period_start, period_end),
    KEY idx_department_performance_period (period_start),
    CONSTRAINT fk_department_performance_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE
  );
