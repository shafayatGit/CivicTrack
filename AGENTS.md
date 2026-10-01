# AGENTS.md

Two independent npm packages — `backend/` (Express 5 + MySQL) and `frontend/` (Next.js). There is **no root `package.json`** and no workspaces: run every npm command from inside a package directory. No CI, no hooks, no test framework anywhere (`backend`'s `npm test` is a stub that exits 1). `npm run lint` in `frontend/` is the only check in the repo, and it currently passes clean.

Repo hygiene quirks, all verified: `backend/node_modules/` is **committed** (3355 files) even though `backend/.gitignore` lists it; `backend/.env` and `backend/.env.example` are **untracked**, so a fresh clone has no env template at all and no seed credentials. Don't "fix" any of these inside an unrelated commit.

## Current state

All 12 ERD tables plus the `resolved_issue_summary` view exist (`migrations 001`–`023`), and the local MariaDB is fully migrated with all 7 triggers present. Twelve backend modules are built: `auth`, `category`, `department`, `ward`, `staff`, `issue`, `issuePhoto`, `message`, `falseReport`, `user`, `vote`, `comment`. There are no schema-only tables left, but `vote` and `comment` are the only two that are **publicly reachable with no account** — see Public participation.

`CivicTrack_ERD_Schema.md` (root) is a PostgreSQL-flavored academic design doc — a lab submission, **not the source of truth**. Read the SQL migrations. Deliberate divergences:
- **Keys**: ERD says `INT` for lookups and PG `UUID` elsewhere; the project uses `CHAR(36)` everywhere, generated in JS via `randomUUID()`.
- **Types**: `JSONB`→`JSON`, `TIMESTAMP`→`datetime`, `CHECK` on role/status → `ENUM`.
- **Auth/storage**: ERD says Better-Auth + Firebase Storage; the code uses `jsonwebtoken` + `bcrypt` and Cloudinary. Both mentions are stale.
- `users.nid` **is** `NOT NULL` (migration `018`) and the register form does collect it — the ERD is now the accurate one here.
- `department_performance.overdue_count` exists but is **uncomputable**: the ERD never defines an SLA threshold. Don't surface it as a real metric.

## Backend (`backend/`)

ESM (`"type": "module"`), so every import needs an explicit `.js` extension (`import db from "../../config/db.js"`). `src/config/db.js` is a mysql2 **pool** (limit 10) — this drives several rules below.

### Commands
- `npm run dev` — nodemon on `src/index.js` (port 8000, or `PORT` from `.env`). `index.js` wraps `app` in a bare `http.createServer` because socket.io needs the upgrade handler, which `app.listen()` cannot provide.
- `npm run db:migrate` — runs all `src/db/migrations/*.sql` in filename order
- `npm run db:seed:admin` — idempotent; skips if the email exists; throws if `ADMIN_*` is unset
- `npm test` — stub, exits 1. No lint or typecheck for this package.

### The one rule that bites hardest: attribute writes through `withActor`
Migration `015`'s status-audit trigger reads the acting user from the `@civictrack_actor_id` **session variable**, and session variables belong to a *connection*. Because `db.js` is a pool, a bare `db.query("SET ...")` followed by `db.query("UPDATE ...")` can land on two different connections and silently record `changed_by = NULL` — the change is still logged, just anonymously, and nothing errors.

**Use `withActor(actorId, async (conn) => {...})` from `src/utils/withActor.js` for any write that must be attributable.** It pins one connection via `db.getConnection()`, opens a transaction, sets the variable, and hands you `conn` so you cannot escape onto the pool mid-transaction. `issue.createIssue`/`updateIssue` and `staff.createStaff` all go through it. Pass the pinned `conn` to any helper that reads state the transaction has not committed (see `assertCanModify` and `loadIssueForUpdate` in `issue.service.js`, which take `conn` for exactly this reason and use `SELECT ... FOR UPDATE`).

### Validation
- `validate(schema)` (default export) parses **`req.body`**.
- `validateQuery(schema)` parses the query string into **`req.validatedQuery`**, *not* `req.query` — Express 5 makes `req.query` a getter-only property, so it cannot be reassigned. Controllers read `req.validatedQuery`; the default export kept its body-only signature so the older category routes are untouched.
- Zod is v4: `z.email()`, `z.uuid('msg')`, `z.string({ error: 'msg' })`, and `z.coerce.number()`. Prefer **`.nullish()` over `.nullable()`** in update schemas — `.nullable()` still makes the key *required* in Zod v4, so a status-only `PUT` would be rejected for a missing `assignedStaffId`.
- Shared schemas live in `utils/`, not in a module: `utils/pagination.js` (`paginationSchema`, `toPage`, `buildMeta`, `limitClause`) and `utils/nid.js` (`nidSchema`, 10/13/17 digits).

### Other gotchas
- **`users.nid` is NOT NULL.** Every path that inserts a `users` row must use `nidSchema` from `utils/nid.js`; staff onboarding drifted to a looser check that accepted a missing `nid` and surfaced the violation as a 500. Never `?? null` an nid.
- **`limitClause` interpolates `LIMIT`/`OFFSET`** because MySQL cannot bind them. That is only safe because `paginationSchema` coerces both to integers in a checked range (`limit` max 100). Don't build a paginated list without going through `toPage`.
- **Roles are `ENUM('citizen','staff','admin')`.** `auth.service.js` hardcodes `"citizen"` on register and `staff.service.js` hardcodes `'staff'` on onboarding, so a caller cannot mint an admin by posting a `role` field. Don't reintroduce `"user"` (the typo `003` fixed).
- `protect` reads a Bearer token **or** the `token` cookie. `requireRole(...roles)` returns `[protect, allowRoles]` as an array, so a route cannot apply the guards out of order. It also re-reads `users.is_active` on every request, which is what makes deactivation take effect on a live session rather than at next login.
- **Declare static path segments before `/:id`.** `issue.routes.js` and `staff.routes.js` both carry comments explaining that `/duplicates`, `/mine`, and `/available` would otherwise be swallowed by the id route and parsed as a UUID.
- Response envelope: `{ success: true, data }`, with list endpoints adding a sibling **`pagination`** key. Errors are `{ success: false, message, details }` where `details` is the raw Zod issue array, which the frontend maps straight onto form fields. `errorHandler` translates mysql2 codes (`ER_DUP_ENTRY`→409, `ER_ROW_IS_REFERENCED_2`→409, `ER_NO_REFERENCED_ROW_2`→400) and drops the stack when `NODE_ENV=production`.
- `issue.resolved_at` is maintained in the **service**, not a trigger — only the app knows which transition is a real resolution, and leaving `Resolved` must write `NULL`, which `COALESCE` cannot express.
- Routing: `issues.department_id` falls back to `categories.default_department_id` via `COALESCE` + scalar subquery inside the INSERT. Assigning a staffer from a different department is a 409.
- Photos: `canManageIssuePhotos` (not `adminOnly`) is the write guard — admins always, the reporting citizen only while status is still `Reported`. It reads `req.body.issueId`, so on the multipart route it must run **after** multer.
- `messages` is a **staff↔admin channel only**; `ALLOWED_ROLES` is enforced both on the socket handshake and via `requireRole('staff','admin')`.

### Moderation: flagging false reports and deactivation
Deliberately **not** a fifth issue status. `is_invalid` is a parallel flag, because a false report is a judgement *about* a report while `status` is the report's own progress, and the two move independently (an invalid issue can also be resolved, and an admin can reverse the verdict at any time).
- Staff file a flag on `POST /api/issues/:id/invalid` (staff-only, assigned officer only, 10–255 char reason). Admin assigns the officer and staff already advance the status, so flagging is the missing fourth step.
- `false_reports` is **append-only**. One row per flag, `status` `pending → upheld | dismissed`, never edited. `actioned_by` is `ON DELETE SET NULL` so deleting an admin must not erase the audit trail; `flagged_by` is `RESTRICT` for the same reason in the other direction.
- **Upholding is the only path that touches `users`**, and it only ever deactivates a `citizen` — a staff or admin target is a 409, not a silent no-op. `deactivateCitizen` runs through `withActor` and then calls `disconnectUser` from the hub, so the target's live socket is dropped by the same request that flips the flag.
- **Dismissing is what restores the workload.** The `is_invalid` clearing in `dismissFlag` is guarded on the flag's `flagged_at` still matching `MAX(flagged_at)` for that issue, so an out-of-order dismissal cannot clear a *newer* flag. This is the one place the app and the `022` triggers must agree.
- Deactivation is enforced in four places, and all four are needed: `protect` (live session), `auth.service` login, same-email re-registration, and the socket handshake. Dropping any one leaves a way back in.
- Reactivation is deliberately a **separate route** (`POST /api/users/:id/reactivate`) rather than a `PATCH` of the user, because it clears `deactivated_at`/`deactivation_reason` and re-enables login — a narrow, auditable action instead of a general user editor.

### Public participation: votes and comments
`GET /api/issues/:id`, `/:id/status-history`, `/api/issue-photos/issue/:issueId`, `/:id/vote`, and `/:id/comments` are reachable **with no account**. This is the one place the app serves an anonymous reader, and it changes several defaults.
- **`optionalAuth` never refuses a request.** It verifies a token when one is present and attaches `req.user` only if that account is still active; absent, expired, malformed, and deactivated all fall through as anonymous. It is not a weaker `protect` — do not use it to guard a write that must be attributable. `comment.service` never runs through `withActor`, and its `hidden_by` audit column is an explicit parameter rather than a session variable, so it is unaffected by the pool problem above.
- **Reads went public, writes did not.** The two `issuePhoto` GET routes use `optionalAuth`; upload, by-URL add, and delete all still run `protect` + `canManageIssuePhotos`. A photo is usually the whole point of a report, so a public report with a blank photo panel is not worth the privacy win.
- **`reporter_email` was deleted from the detail payload outright**, not conditionally blanked for anonymous callers. The row is public; the column is simply not selected.
- **Anonymous votes are per-browser, not per-person.** `resolveVoter` mints a 64-char random `ct_voter` cookie (httpOnly, `SameSite=Lax`, secure in production, 30 days) and stores its **SHA-256** hash in `votes.voter_token`. A signed-in voter keys off `user_id` instead and the cookie is left alone, so signing in does not discard an anonymous vote — the two live as separate rows and a browser that voted before signing in can hold both. `uq_votes_issue_user` and `uq_votes_issue_token` are both unique and `votes` has a CHECK that at least one identity is present, so an anonymous vote can never be attributed and an account vote can never be duplicated.
- **Comment identity is authoritative, never client-supplied.** A signed-in poster's `author_name` comes from `users.name` and their `author_name` body field is ignored outright; `author_role` is read from `users.role` via the join and is `null` for a guest. That is what stops someone typing "City Hall" and rendering as an official reply — the badge is unforgeable.
- **Hiding is reversible, deleting is not, and the two are separate routes** (`POST /api/moderation/comments/:id/hide`, `/restore`, `DELETE /:id`) on a router that is `protect` + `adminOnly` at the top. `hideComment` is idempotent and deliberately does **not** overwrite an existing `hidden_reason`, so a second click from a stale page cannot rewrite the audit trail — same reasoning as `deactivateCitizen`. Hidden rows are filtered in **SQL**, not after the fact, so a hidden comment cannot leak by occupying a page slot; `includeHidden` is honoured only for an admin and is silently ignored for everyone else rather than erroring.
- **Only residents may participate — `staff` and `admin` are excluded from both writes.** `assertCanParticipate` (`utils/participation.js`) is called at the top of `vote.controller.toggleVote` and `comment.controller.createComment` and throws 403. The rule is about the *person*, not the post: an official is not a resident, and one extra vote or an "Official" comment on a report they are also handling would corrupt the signal the layer exists to measure. **Reads are untouched for every role**, and so is admin moderation — hiding and deleting other people's comments stays open, because that is an official duty rather than participation. `toggleVote` asserts *before* `resolveVoter` deliberately: a refused request must not leave a staffer's browser holding a `ct_voter` cookie it was never allowed to use. `frontend/lib/participation.js` mirrors the role list so the UI offers no control that would 403 — **the two files must change together**.
- Known limit, and it is not fixable here: the same endpoints accept anonymous callers, so a determined staffer can drop their token and post as a guest. What the rule buys is that the app never *records* an official vote or comment.
- `rateLimit` (`src/utils/rateLimit.js`) is an **in-process fixed window keyed on IP + User-Agent** — votes 20/min, comments 5/min. It is per-instance and dies with the process, so it does not hold across a restart or across replicas, and rotating the User-Agent walks straight past it. Treat it as a speed bump against a script, not as abuse control; anything stronger needs a shared store. Because the window is process-local, **restart `src/index.js` before rerunning probes** or the previous run's counters will 429 the next one.
- **Both nested routers must pass `Router({ mergeParams: true })`.** The issue id arrives in the *mount* path, and an Express 5 router does not inherit params from where it is mounted. Without it `req.params` is `{}` and every vote and comment request fails with "Issue not found" — a 404 that looks like a data problem rather than a wiring one.

### Realtime
`socket.io`, path `/socket.io`. `src/realtime/hub.js` holds the server reference and the room-name scheme and **deliberately imports nothing from `src/modules`** — that is what breaks the emit↔handle import cycle (services import the hub's emitters; the socket layer imports the services). Keep it inert; don't import a module from the hub. Rooms are `user:<userId>` and `thread:<staff>:<admin>:<issue|general>`, where `general` is a sentinel for a NULL `issue_id`. Socket payloads go through the **same Zod schemas as REST** — that is what stops a socket client persisting an empty `message_text`. Handlers always ack with `{ ok: true, data }` or `{ ok: false, error: { message, statusCode } }`; the client rejects rather than throws.

### Migrations
- No version-tracking table, so `db:migrate` **replays every file on every run** and must be idempotent. Verified: a second full replay against the migrated DB is clean. Schema changes therefore go in a **new** `00N_*.sql`; editing an existing one will not alter an already-migrated DB.
- `001_*.sql` does `CREATE DATABASE civictrack` + `USE civictrack`; later files have no `USE` and `db/migrate.js` connects *without* a `database` option (it only reads `DB_HOST`/`DB_USER`/`DB_PASSWORD`). Never run a single `.sql` file standalone — always via `npm run db:migrate`.
- Filename order is load-bearing: `staff` must precede `issues` (FK on `assigned_staff_id`), and `departments` must precede `categories` and `staff`.
- `ADD COLUMN` / `ADD CONSTRAINT` / `CREATE INDEX` / `CREATE TRIGGER` have **no** `IF NOT EXISTS` on MySQL 8, so replay-safe DDL goes through an `information_schema` check + `PREPARE`/`EXECUTE` (`003`, `006`, `017`, `019`) or `DROP ... IF EXISTS` + `CREATE` (`015`, `020`). `MODIFY COLUMN` and full-table `UPDATE` backfills are naturally idempotent (`018`, `020`). Follow one of those patterns instead of plain DDL.
- **Trigger bodies are single statements — never `BEGIN ... END`, and no internal `;`.** The runner sends each file as one `conn.query()` with `multipleStatements: true`, and compound bodies depend on how the driver/server split statements, which was never verified. That is why the ERD's single `sync_staff_issue_count()` is split across `015` (3 triggers) and `020` (4). Don't introduce a procedure or compound trigger without first confirming the runner handles it.
- The workload triggers are the fragile part. `staff.issue_count` is a denormalised cache with the invariant `COUNT(issues WHERE assigned_staff_id = staff.id AND status <> 'Resolved' AND is_invalid = FALSE)` — the rest of the codebase matches it via the exported `openIssuePredicate(alias)` in `issue.service.js` (`department.service.js`, the issue stats, the duplicate detector). `020` exists because `015` was asymmetric (nothing fired on reopen); `022` re-derived all four count triggers from the `is_invalid` clause. If you touch status transitions, assignment, or the invalid flag, re-derive the triggers from that invariant and re-run the backfill.

## Frontend (`frontend/`)

Next.js 16.3.5, App Router, **JavaScript (no TypeScript)**, React 19. `@/*` maps to the frontend root (`jsconfig.json`). Config files use `.mjs`; the package has no `"type": "module"`.

### This Next.js is not the one in your training data
`frontend/AGENTS.md` is generated and **re-written by `next dev`**. Never hand-edit it; commit its churn alongside your work or reverting it just re-creates the diff. Read `frontend/node_modules/next/dist/docs/` (not visible from the repo root) before writing Next.js code. Note `frontend/CLAUDE.md` is just `@AGENTS.md`, so it points at that generated block, not at project instructions.

### Auth: two tokens, no middleware
The JWT lives in `localStorage` under `civictrack_token` **and** in an httpOnly `token` cookie set by `auth.controller.js`. There is **no `middleware.js`**, so every guard is client-side:
- `AuthProvider` (`components/Modules/Auth/AuthProvider.jsx`) is the single source of truth, via `useSyncExternalStore` over both the `storage` event and a custom `AUTH_CHANGE_EVENT` that `setToken`/`clearToken` dispatch in-tab (the `storage` event alone only fires in *other* tabs). It exposes `session`, `hydrated`, `isAdmin`/`isStaff`/`isCitizen`, `signOut`.
- `hydrated` distinguishes "not signed in" from "localStorage not read yet" — always gate on it, or a signed-in visitor sees the signed-out markup flash during SSR. `AdminLayout` renders a spinner until `hydrated`; `PortalLayout` only requires *any* session.
- The `useSyncExternalStore` snapshot **must be a string** (`getToken()`), never a fresh object, or it re-renders forever.
- There is no `/api/auth/me`. The session is decoded from the JWT, which signs `{ id, name, email, role }` — the subject is a custom `id` claim, not `sub`, and `getSession()` falls back to `payload.sub ?? payload.id`. A token with no `role` is treated as `citizen`, never admin.
- Anything fetching protected data must be a `"use client"` component. Pages are `.jsx` except the two boilerplate `app/layout.js` and `app/page.js`.

### Data layer
`lib/api.js` is the only API client — add one exported function per endpoint rather than calling `fetch` from a component.
- **`apiFetch` returns the whole envelope**, not `data`: call sites use `response.data` and `response.pagination`. (It prefixes `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:8000`, and attaches `Authorization: Bearer`.)
- `FormData` bodies are passed through untouched — forcing a `Content-Type` strips the multipart boundary and multer rejects the stream.
- Query strings are built with the local `withQuery` helper, which drops `undefined`/`null`/`""`.
- Data fetching goes through `hooks/use-resource.js` and `hooks/use-crud-resource.js`. `useResource` **derives** `loading` by comparing the key that produced the current result with the wanted key, rather than `setState`-ing at the top of the effect — that makes it impossible to render one query's data under another's key. The `load` function must be `useCallback`-memoised, and `resourceKey` uses `JSON.stringify`, so build key objects with a **fixed key order**.
- Role-gated nav lives in one place: `lib/navigation.js` (`PORTAL_NAV`, `ADMIN_NAV`, `landingPathFor`). Add a route there, not in a layout.
- `lib/socket.js` keeps one socket per tab and **disconnects it whenever the stored token changes** — a socket authenticates once at connect, so without that check a sign-out/sign-in as another user keeps sending as the first one. Pass `auth` as a *function* so reconnects re-read the token.
- `lib/issue-status.js` **duplicates** `ISSUE_STATUSES` and `ALLOWED_TRANSITIONS` from `backend/src/modules/issue/issue.service.js`. The server rejects anything else, so a change on either side needs the matching edit.
- `apiFetch` sets `credentials: "include"` because the anonymous vote cookie is set by the API origin, not by Next. Without it the cookie never arrives and every anonymous visitor would get a fresh identity per request, so a vote would never look "already voted". Anything else sending cookies cross-origin needs the same, and the backend must answer with `Access-Control-Allow-Credentials`.

### Route groups
`app/admin/**` is the admin console (guarded by `AdminLayout` for `role === "admin"`); `app/(app)/**` is the signed-in portal shell (`PortalLayout`, any role) holding `/dashboard`, `/issues`, `/report`, `/messages`; `app/(public)/**` is the no-account shell and holds only `/issues/[id]`. `/login` and `/register` sit outside all three. `navigation.js` is what keeps the two gated shells consistent.
- **`/issues` and `/issues/[id]` are in different groups on purpose.** The list is still login-only even though the detail is public, so a public page is reached from a direct link or a share, not by browsing a list of other residents' reports. Moving a route to `(public)` is the *only* way to opt out of the redirect — there is no allowlist inside `PortalLayout`, so a new page cannot accidentally become public by forgetting a guard.
- Both shells render through `SiteShell`, so the chrome cannot drift. `SiteHeader` already handles a null session (Sign in / Get started instead of the user menu), which is what makes it safe to share with a visitor who has never signed in.
- `IssueDetail` is one component serving both worlds. It gates management UI on `session` and already null-checks `issue.user_id`, so a signed-out render shows read-only content — but its *subrequests* must be public too, or `loadIssue` rejects and the page falls into its error state. `GET /:id/status-history` and both photo GETs are `optionalAuth` for that reason. Any new panel needs the same check, not just the top-level route: a panel with its own resource that 401s renders a red error inline rather than breaking the page, which is a quieter bug.
- Comment moderation for admins lives **inside the public thread** (`IssueComments` passes `includeHidden=true` when `isAdmin`) rather than in a separate admin screen, so there is no need for a second list query to keep the two in sync. The `useCrudResource` key includes `isAdmin`, because the same page holds a different result once the session resolves.
- `IssueVoteButton` and `IssueComments` hide their write controls from staff and admin, and both gate that decision on `hydrated`. `session` is null during SSR, so rendering the form and hiding it a frame later is a hydration mismatch and a visible flicker for every official. The vote button reserves its space with an `invisible` placeholder for the same reason. A withheld control is rendered as a sentence saying why, not a disabled button — an official reading it should be told the rule, not left retrying a greyed-out control.

### UI
- shadcn/ui `base-rhea` style on **`@base-ui/react`, not radix**. Composition uses the base-ui `render` prop — `<Button render={<Link href="/x" />}>` (or `<SheetTrigger render={<Button />}>`). Radix's `asChild` appears nowhere in the repo; don't introduce it.
- Add primitives with `npx shadcn` into `components/ui/`. Feature components live in `components/Modules/<Area>/` and are all `"use client"`.
- Forms follow one pattern: local state, a parallel `fieldErrors` object, client-side regex checks, then map `error.response.details[].path[0]` from `ApiRequestError` onto fields.
- `cn` is re-exported from `lib/utils.js`. Tailwind v4, no `tailwind.config` — theme, `--font-heading` and `@import "tailwindcss"` live in `app/globals.css`.
- `next.config.mjs` allows `res.cloudinary.com` in `images.remotePatterns` because `issue_photos` stores a provider-agnostic URL filled with a Cloudinary `secure_url`. Removing it makes `next/image` throw on every stored photo.
- Maps are `leaflet` / `react-leaflet`. Wards got optional bounding boxes in migration `019`; `lib/geo.js` distinguishes "this ward has no bounds" from "the point is outside them" — don't collapse those two, an unmapped ward is normal and the dropdown stays authoritative.

### Env
Backend env is read via `dotenv/config`; the frontend only uses `NEXT_PUBLIC_API_BASE_URL`. Cloudinary vars are required by the photo upload route, which returns a 503 with a clear message when they are missing rather than a 500 from the SDK.
