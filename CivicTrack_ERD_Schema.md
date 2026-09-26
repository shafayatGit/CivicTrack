# CivicTrack — Database Schema Documentation

CSE 3522 | Database Management Systems Laboratory

This document defines the relational schema for CivicTrack, normalized to 3NF, along with the entities, relationships, constraints, and advanced database features (triggers, views) referenced in the project proposal.

---

## 1. Entities and Attributes

### 1.1 Users

Holds all three actor types on the platform: citizens who report issues, staff who work issues, and admins who oversee the system. A single table keeps authentication (Better-Auth, JWT, bcrypt) simple. Staff-specific operational data (department, workload, preferences) lives in the `Staff` extension table (1.11), not here — keeping `Users` a clean, role-agnostic identity table.

| Column     | Type         | Constraints                                           | Notes                                                                                                         |
| ---------- | ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| id         | UUID         | PK                                                    |                                                                                                               |
| name       | VARCHAR(100) | NOT NULL                                              |                                                                                                               |
| email      | VARCHAR(150) | UNIQUE, NOT NULL                                      | login identifier                                                                                              |
| password   | VARCHAR(255) | NOT NULL                                              | bcrypt hash                                                                                                   |
| nid        | VARCHAR(20)  | UNIQUE, NOT NULL                                      | National ID — used for citizen account verification per the risk-mitigation plan (prevents spam/fake reports) |
| role       | VARCHAR(10)  | NOT NULL, CHECK (role IN ('citizen','staff','admin')) |                                                                                                               |
| created_at | TIMESTAMP    | NOT NULL, DEFAULT now()                               |                                                                                                               |

**Role semantics:**

- `citizen` — reports issues, votes, comments, confirms resolution.
- `staff` — has exactly one matching row in `Staff` (1:1), which holds their department, live workload, and preferences.
- `admin` — system-wide oversight; can reassign issues across departments/staff and moderate reports. No extension table needed unless admin-specific settings come up later.

A trigger or application-level check should enforce that every `staff`-role user has a corresponding `Staff` row (and that non-staff users don't).

### 1.2 Departments

| Column        | Type         | Constraints |
| ------------- | ------------ | ----------- |
| id            | INT          | PK          |
| name          | VARCHAR(100) | NOT NULL    |
| contact_email | VARCHAR(150) | NULLABLE    |

### 1.3 Wards

| Column      | Type         | Constraints      |
| ----------- | ------------ | ---------------- |
| id          | INT          | PK               |
| name        | VARCHAR(100) | NOT NULL         |
| ward_number | VARCHAR(20)  | UNIQUE, NOT NULL |

### 1.4 Categories

Six fixed values per scope: pothole, streetlight, garbage, water leakage, road damage, fallen tree.

| Column                | Type        | Constraints         |
| --------------------- | ----------- | ------------------- | ----------------------------------------------------------- |
| id                    | INT         | PK                  |
| name                  | VARCHAR(50) | UNIQUE, NOT NULL    |
| default_department_id | INT         | FK → Departments.id | auto-routes a new issue to the right department by category |

### 1.5 Issues

The core entity. Duplicate detection (ward + category + proximity matching) is handled as a query-time check when a new issue is submitted, rather than a stored `duplicate_of` link — keeps the table simpler, at the cost of not having a permanent record of which reports were flagged as duplicates. If your team wants that audit trail back, it's a one-column addition.

| Column            | Type         | Constraints                                                                                          | Notes                                                                                                                                                |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                | UUID         | PK                                                                                                   |                                                                                                                                                      |
| user_id           | UUID         | FK → Users.id, NOT NULL                                                                              | reporter (citizen)                                                                                                                                   |
| category_id       | INT          | FK → Categories.id, NOT NULL                                                                         |                                                                                                                                                      |
| ward_id           | INT          | FK → Wards.id, NOT NULL                                                                              |                                                                                                                                                      |
| department_id     | INT          | FK → Departments.id, NULLABLE                                                                        | which department owns this issue; defaults from category                                                                                             |
| assigned_staff_id | UUID         | FK → Staff.id, NULLABLE                                                                              | which specific staff member is actively working it — distinct from `department_id`; an issue can be routed to a department before anyone picks it up |
| title             | VARCHAR(150) | NOT NULL                                                                                             |                                                                                                                                                      |
| description       | TEXT         | NOT NULL                                                                                             |                                                                                                                                                      |
| latitude          | DECIMAL(9,6) | NOT NULL                                                                                             | validated against city boundary at the application layer                                                                                             |
| longitude         | DECIMAL(9,6) | NOT NULL                                                                                             |                                                                                                                                                      |
| landmark          | VARCHAR(150) | NULLABLE                                                                                             | alt. to map-pin entry                                                                                                                                |
| status            | VARCHAR(20)  | NOT NULL, DEFAULT 'Reported', CHECK (status IN ('Reported','Acknowledged','In Progress','Resolved')) | current status, denormalized for fast filtering                                                                                                      |
| citizen_confirmed | BOOLEAN      | DEFAULT false                                                                                        | citizen confirms the fix actually happened                                                                                                           |
| created_at        | TIMESTAMP    | NOT NULL, DEFAULT now()                                                                              |                                                                                                                                                      |
| resolved_at       | TIMESTAMP    | NULLABLE                                                                                             |                                                                                                                                                      |

### 1.6 Issue_Photos

| Column      | Type         | Constraints                     |
| ----------- | ------------ | ------------------------------- |
| id          | UUID         | PK                              |
| issue_id    | UUID         | FK → Issues.id, NOT NULL        |
| photo_url   | VARCHAR(500) | NOT NULL — Firebase Storage URL |
| uploaded_at | TIMESTAMP    | NOT NULL, DEFAULT now()         |

### 1.7 Votes

| Column     | Type      | Constraints              |
| ---------- | --------- | ------------------------ |
| id         | UUID      | PK                       |
| issue_id   | UUID      | FK → Issues.id, NOT NULL |
| user_id    | UUID      | FK → Users.id, NOT NULL  |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now()  |

`UNIQUE(issue_id, user_id)` — enforces one-vote-per-user at the database level.

### 1.8 Comments

Citizen and staff discussion thread on an issue (status updates, clarifications, resolution notes).

| Column       | Type      | Constraints              |
| ------------ | --------- | ------------------------ |
| id           | UUID      | PK                       |
| issue_id     | UUID      | FK → Issues.id, NOT NULL |
| user_id      | UUID      | FK → Users.id, NOT NULL  |
| comment_text | TEXT      | NOT NULL                 |
| created_at   | TIMESTAMP | NOT NULL, DEFAULT now()  |

### 1.9 Status_History

Audit trail, populated automatically by a database trigger rather than application code.

| Column     | Type        | Constraints              |
| ---------- | ----------- | ------------------------ | ------------------------------- |
| id         | UUID        | PK                       |
| issue_id   | UUID        | FK → Issues.id, NOT NULL |
| old_status | VARCHAR(20) | NOT NULL                 |
| new_status | VARCHAR(20) | NOT NULL                 |
| changed_by | UUID        | FK → Users.id, NULLABLE  | staff/admin who made the change |
| changed_at | TIMESTAMP   | NOT NULL, DEFAULT now()  |

### 1.10 Department_Performance

Stores department-level performance metrics as a physical table rather than a computed view, so historical snapshots persist over time (e.g. "how did Roads perform last month vs this month") instead of only reflecting the current moment. Populate it on a schedule (nightly cron / scheduled job) or via a trigger that recalculates on each `Issues.status` change into `'Resolved'`.

| Column               | Type         | Constraints                   | Notes                                                   |
| -------------------- | ------------ | ----------------------------- | ------------------------------------------------------- |
| id                   | UUID         | PK                            |                                                         |
| department_id        | INT          | FK → Departments.id, NOT NULL |                                                         |
| period_start         | DATE         | NOT NULL                      | start of the reporting window (e.g. first of the month) |
| period_end           | DATE         | NOT NULL                      | end of the reporting window                             |
| resolved_count       | INT          | NOT NULL, DEFAULT 0           | issues resolved within the window                       |
| open_count           | INT          | NOT NULL, DEFAULT 0           | issues still open at window end                         |
| overdue_count        | INT          | NOT NULL, DEFAULT 0           | open issues past an SLA threshold                       |
| avg_resolution_hours | DECIMAL(8,2) | NULLABLE                      | average time-to-resolution within the window            |
| calculated_at        | TIMESTAMP    | NOT NULL, DEFAULT now()       | when this snapshot was generated                        |

`UNIQUE(department_id, period_start, period_end)` — prevents duplicate snapshots for the same department and window.

### 1.11 Staff

Profile extension for `Users` where `role = 'staff'` — a 1:1 relationship. Separating this out (rather than bolting more nullable columns onto `Users`) keeps staff-only data — department, current workload, preferences — off every citizen and admin row.

| Column        | Type      | Constraints                     | Notes                                                                                                                                                       |
| ------------- | --------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | UUID      | PK                              |                                                                                                                                                             |
| user_id       | UUID      | FK → Users.id, UNIQUE, NOT NULL | 1:1 — one Staff row per staff-role user                                                                                                                     |
| department_id | INT       | FK → Departments.id, NOT NULL   | which department this staff member belongs to                                                                                                               |
| issue_count   | INT       | NOT NULL, DEFAULT 0             | count of issues currently assigned to them with status not in `('Resolved')` — a live workload counter                                                      |
| preferences   | JSONB     | NULLABLE                        | flexible staff settings, e.g. `{"notify_email": true, "notify_sms": false, "preferred_categories": ["pothole","streetlight"], "max_concurrent_issues": 10}` |
| created_at    | TIMESTAMP | NOT NULL, DEFAULT now()         |                                                                                                                                                             |

`issue_count` is a cached/denormalized counter, not computed live on every read — keep it in sync with a trigger (below) whenever `Issues.assigned_staff_id` or `Issues.status` changes, so dashboards and assignment logic (e.g. "assign to the least-loaded staff member") stay fast without re-scanning `Issues` each time.

```sql
CREATE OR REPLACE FUNCTION sync_staff_issue_count() RETURNS TRIGGER AS $$
BEGIN
  -- issue moved off a staff member, or was resolved
  IF (TG_OP = 'UPDATE' AND OLD.assigned_staff_id IS NOT NULL
      AND (OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id
           OR NEW.status = 'Resolved')) THEN
    UPDATE staff SET issue_count = issue_count - 1 WHERE id = OLD.assigned_staff_id;
  END IF;

  -- issue newly assigned to a staff member (and not already resolved)
  IF (NEW.assigned_staff_id IS NOT NULL
      AND NEW.status != 'Resolved'
      AND (TG_OP = 'INSERT' OR OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id)) THEN
    UPDATE staff SET issue_count = issue_count + 1 WHERE id = NEW.assigned_staff_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_staff_issue_count
AFTER INSERT OR UPDATE ON issues
FOR EACH ROW
EXECUTE FUNCTION sync_staff_issue_count();
```

### 1.12 Messages

Single table for staff↔admin chat — merges what would otherwise be separate `Conversations` + `Messages` tables. A "thread" isn't its own row; it's just every message sharing the same `(staff_id, admin_id, issue_id)` combination. Backs the real-time messaging feature — see Section 6 for the WebSocket delivery flow.

| Column       | Type      | Constraints              | Notes                                                                                                                                  |
| ------------ | --------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| id           | UUID      | PK                       |                                                                                                                                        |
| staff_id     | UUID      | FK → Staff.id, NOT NULL  | staff side of the thread                                                                                                               |
| admin_id     | UUID      | FK → Users.id, NOT NULL  | admin side of the thread — must reference a `role = 'admin'` user, enforced via trigger since a plain FK can't check the target's role |
| issue_id     | UUID      | FK → Issues.id, NULLABLE | optional context; NULL for a general staff↔admin thread                                                                                |
| sender_id    | UUID      | FK → Users.id, NOT NULL  | whichever of `staff_id`/`admin_id` sent this message                                                                                   |
| message_text | TEXT      | NOT NULL                 |                                                                                                                                        |
| is_read      | BOOLEAN   | NOT NULL, DEFAULT false  | for unread-message badges                                                                                                              |
| sent_at      | TIMESTAMP | NOT NULL, DEFAULT now()  |                                                                                                                                        |

`INDEX(staff_id, admin_id, issue_id, sent_at)` — since there's no separate thread row to key off, every "load this conversation" or "list my threads" query filters/groups on this triplet directly, so it needs to be indexed rather than uniquely constrained (many rows legitimately share the same triplet — that's what makes them one thread).

**What you gave up by merging:** thread-level metadata (e.g. "archived," "muted," "created_at" for the thread itself) has nowhere to live except being re-derived from the messages (e.g. `MIN(sent_at)` as thread start). And listing a staff member's conversation list now requires `SELECT DISTINCT staff_id, admin_id, issue_id ...` instead of a direct row scan — fine at your project's scale, but worth knowing if the app ever needs to show "5 active threads" cheaply at larger scale.

---

## 2. Relationships Summary

| Relationship                         | Cardinality                                  |
| ------------------------------------ | -------------------------------------------- |
| Users (citizen) → Issues             | 1 : N (reports)                              |
| Users → Votes                        | 1 : N (casts)                                |
| Users → Comments                     | 1 : N (writes)                               |
| Users (staff/admin) → Status_History | 1 : N (changed_by)                           |
| Users (staff role) → Staff           | 1 : 1 (profile)                              |
| Users (admin role) → Messages        | 1 : N (admin side of a thread)               |
| Users → Messages                     | 1 : N (sender_id)                            |
| Departments → Staff                  | 1 : N (employs)                              |
| Departments → Issues                 | 1 : N (routed to)                            |
| Departments → Categories             | 1 : N (default routing)                      |
| Wards → Issues                       | 1 : N (located in)                           |
| Categories → Issues                  | 1 : N (classified as)                        |
| Staff → Issues                       | 1 : N (assigned_staff_id — actively working) |
| Staff → Messages                     | 1 : N (staff side of a thread)               |
| Issues → Issue_Photos                | 1 : N                                        |
| Issues → Votes                       | 1 : N                                        |
| Issues → Comments                    | 1 : N                                        |
| Issues → Status_History              | 1 : N                                        |
| Issues → Messages                    | 1 : N (optional issue context)               |
| Departments → Department_Performance | 1 : N (snapshots over time)                  |

---

## 3. Advanced Database Features

### 3.1 Trigger — auto-log status changes

```sql
CREATE OR REPLACE FUNCTION log_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO status_history (id, issue_id, old_status, new_status, changed_by, changed_at)
    VALUES (gen_random_uuid(), NEW.id, OLD.status, NEW.status, NEW.updated_by, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_status_change
AFTER UPDATE ON issues
FOR EACH ROW
EXECUTE FUNCTION log_status_change();
```

_(`NEW.updated_by` assumes the application sets a transient column or session variable identifying the acting staff/admin — adjust to your update path.)_

### 3.2 View — resolved-issue summary

```sql
CREATE VIEW resolved_issue_summary AS
SELECT c.name AS category, w.name AS ward,
       COUNT(*) AS resolved_count,
       AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600) AS avg_resolution_hours
FROM issues i
JOIN categories c ON i.category_id = c.id
JOIN wards w ON i.ward_id = w.id
WHERE i.status = 'Resolved'
GROUP BY c.name, w.name;
```

### 3.3 Department performance snapshot (table, not view)

Department performance is now tracked in the physical `Department_Performance` table (Section 1.10) so history persists across periods. Populate it with a scheduled job (or a trigger on `Issues` transitioning to `'Resolved'`) running a query like:

```sql
INSERT INTO department_performance
  (id, department_id, period_start, period_end, resolved_count, open_count, avg_resolution_hours, calculated_at)
SELECT gen_random_uuid(), d.id, :period_start, :period_end,
       COUNT(*) FILTER (WHERE i.status = 'Resolved'),
       COUNT(*) FILTER (WHERE i.status != 'Resolved'),
       AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600)
         FILTER (WHERE i.status = 'Resolved'),
       now()
FROM departments d
LEFT JOIN issues i ON i.department_id = d.id
  AND i.created_at BETWEEN :period_start AND :period_end
GROUP BY d.id
ON CONFLICT (department_id, period_start, period_end) DO UPDATE
  SET resolved_count = EXCLUDED.resolved_count,
      open_count = EXCLUDED.open_count,
      avg_resolution_hours = EXCLUDED.avg_resolution_hours,
      calculated_at = EXCLUDED.calculated_at;
```

---

## 4. Normalization Notes (3NF)

- `Categories`, `Wards`, and `Departments` are separated from `Issues` to remove transitive dependencies (e.g. issue → category → default department).
- `Users` now holds only identity/auth data; staff-specific fields (department, workload, preferences) moved to a `Staff` extension table (1:1 on `role = 'staff'`). This replaces the earlier nullable-`department_id`-on-`Users` compromise with a cleaner split — no more columns that are meaningless for 2 of 3 roles.
- `Issues.status` is kept as a denormalized "current state" column for query performance, with `Status_History` as the normalized, append-only source of truth — a deliberate, common exception to strict normalization for workflow-state tables.
- `Staff.issue_count` is likewise a deliberately denormalized cache (see 1.11's trigger) — normalized-strict would mean computing `COUNT(*) FROM issues WHERE assigned_staff_id = ...` on every read, which doesn't scale for an assignment dashboard checked constantly.
- `Votes` and `Comments` each carry their own surrogate PK plus the `(issue_id, user_id)` pair; `Votes` additionally enforces `UNIQUE(issue_id, user_id)`.

## 5. Key Constraints Checklist

- `UNIQUE`: `Users.email`, `Users.nid`, `Wards.ward_number`, `Categories.name`, `Votes(issue_id, user_id)`, `Staff.user_id`
- `INDEX`: `Messages(staff_id, admin_id, issue_id, sent_at)` — thread lookups
- `CHECK`: `Users.role IN ('citizen','staff','admin')`, `Issues.status IN (...)`
- `FK` with `ON DELETE` policy to decide per relationship (e.g. `ON DELETE CASCADE` for `Issue_Photos`/`Votes`/`Comments`/`Messages` when their parent is deleted; `ON DELETE RESTRICT` for lookup tables like `Categories`/`Wards`/`Departments`; `Issues.assigned_staff_id` should probably be `ON DELETE SET NULL` so a departing staff member's issues fall back to unassigned rather than blocking deletion)

## 6. Real-Time Messaging Architecture (WebSocket)

The chat feature has two layers that are easy to conflate — keep them separate in your implementation:

**Persistence layer (HTTP/DB):** `Messages` is the source of truth — one table, no separate thread row. A sent message is always written here via a normal API call before anything else happens (`staff_id`, `admin_id`, `issue_id`, `sender_id`, `message_text`) — this guarantees no message is lost if a WebSocket connection drops mid-send, and it's what powers loading chat history when a thread is reopened (`SELECT ... WHERE staff_id = ? AND admin_id = ? AND issue_id IS NOT DISTINCT FROM ? ORDER BY sent_at`).

**Delivery layer (WebSocket):** A WebSocket server (e.g. `ws` or `Socket.io` alongside your existing Express app) keeps a live map of `user_id → open socket connection(s)` for whoever is currently online. Suggested flow:

1. Client connects and authenticates the socket using the same JWT session from Better-Auth; server registers `user_id → socket`.
2. Client sends a message → server writes it to `Messages` (persistence layer above) → server looks up the _other_ participant's `user_id` in the connection map and, if they're online, emits the message to their socket directly. If they're offline, the message just waits in the DB until they next fetch the thread (and `is_read` stays `false`, which is what drives an unread badge).
3. Typing indicators / read receipts can be ephemeral socket-only events (no DB write needed) — only the message content itself needs to persist.

This keeps the WebSocket layer purely for low-latency delivery to whoever's currently online, while the database stays the durable record — so nothing in the chat depends on a socket connection staying alive.
