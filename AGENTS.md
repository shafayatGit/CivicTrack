# AGENTS.md

Two independent npm packages — `backend/` (Express + MySQL API) and `frontend/` (Next.js). There is **no root `package.json`** and no workspaces: run every npm command from inside a package directory. No CI, no hooks, no test suite anywhere (`backend`'s `npm test` is a stub that exits 1).

Repo hygiene quirk: `backend/node_modules/` is **committed to git** (~3.3k files) even though `backend/.gitignore` lists it, and `backend/.env.example` is gitignored despite existing on disk. Don't be surprised by them in `git status`, and don't "fix" them inside an unrelated commit.

## Current state

All 12 ERD tables now exist (`migrations 001`–`016`): users, departments, wards, categories, staff, issues, issue_photos, votes, comments, status_history, department_performance, messages — plus the `resolved_issue_summary` view and the audit/workload triggers. But only `auth` and `categories` have backend modules and frontend screens. Frontend routes: `/` (placeholder), `/login`, `/register`, `/admin`, `/admin/categories`, `/admin/categories/create`. `issues`, `votes`, `messages` etc. are schema-only: no service, no route, no UI.

`CivicTrack_ERD_Schema.md` (root) is a PostgreSQL-flavored academic design doc — a lab submission, **not the source of truth**. Read the SQL migrations. Known deliberate divergences from it:
- **Keys**: the ERD specifies `INT` for the lookup tables and PG `UUID` elsewhere; this project uses `CHAR(36)` everywhere, generated in JS via `randomUUID()`.
- **Types**: `JSONB`→`JSON`, `TIMESTAMP`→`datetime`, `CHECK` on role/status → `ENUM`.
- **Auth/storage**: the ERD says Better-Auth and Firebase Storage; the code uses `jsonwebtoken` + `bcrypt` and Cloudinary. Both ERD mentions are stale.
- `users.nid` is `NULLable` here, though the ERD says `NOT NULL` — the register form collects no NID yet.
- `department_performance.overdue_count` exists but is **uncomputable**: the ERD never defines an SLA threshold. Don't surface it as a real metric.


## Backend (`backend/`)

Express 5 + MySQL (`mysql2/promise`), ESM (`"type": "module"`). Every import needs an explicit `.js` extension (`import db from "../../config/db.js"`).

### Commands
- `npm run dev` — nodemon on `src/index.js` (port 8000, or `PORT` from `.env`)
- `npm run db:migrate` — runs all `src/db/migrations/*.sql` in filename order; needs a live MySQL server
- `npm run db:seed:admin` — idempotent; skips if the email already exists
- `npm test` — stub, exits 1. There is no lint or typecheck for this package.

### Migrations
- Idempotent by construction (`CREATE ... IF NOT EXISTS`), no tracking table, so `db:migrate` always replays every file. Schema changes go in a **new** `00N_*.sql` file; editing an existing one will not alter an already-migrated DB.
- `001_*.sql` does `CREATE DATABASE civictrack` + `USE civictrack`; later files have no `USE` and the migrate script connects *without* a `database` option. Never run a single `.sql` file standalone — always via `npm run db:migrate`.
- Filename order is load-bearing, not cosmetic: `staff` must precede `issues` (FK on `assigned_staff_id`), and `departments` must precede `categories` and `staff`. A new file that references a table created later will fail.
- Replay-safe DDL needs care, because there is no version tracking. `ADD COLUMN`/`ADD CONSTRAINT`/`CREATE INDEX` have **no** `IF NOT EXISTS` on MySQL 8, so `003` and `006` wrap them in an `information_schema` check + `PREPARE`/`EXECUTE`, and `015` uses `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`. Follow that pattern instead of plain DDL.
- **Trigger bodies are single statements, never `BEGIN ... END`.** The migrate runner sends each file as one `conn.query()` with `multipleStatements: true`; compound routine bodies depend on how the driver/server split on `;` and that is unverified. That's why the ERD's single `sync_staff_issue_count()` became three one-statement triggers in `015`. Don't introduce a procedure or `BEGIN ... END` trigger without first confirming the runner handles it.
- `015`'s status trigger reads the acting user from the `@civictrack_actor_id` **session variable**. `config/db.js` is a mysql2 pool, so a separate `db.query("SET ...")` and `db.query("UPDATE ...")` can land on different connections and silently record `changed_by = NULL`. Pin one connection with `db.getConnection()`.

### Conventions and gotchas
- Module layout: `src/modules/<name>/` with `*.routes.js`, `*.controller.js`, `*.service.js`, `*.validation.js`. Mount new routers in `src/app.js`.
- `validate(schema)` only touches `req.body` (no query/param validation yet). Controllers are wrapped in `asyncHandler`; services own SQL and throw `ApiError(status, message)`.
- Success envelope is `{ success: true, data }`; errors are `{ success: false, message, details }` where `details` is the raw Zod issue array, which the frontend maps straight onto form fields. Preserve this shape.
- Zod is v4: `z.email()`, not `z.string().email()`. `z.string().min(2, "msg")`.
- `protect` reads a Bearer token **or** the `token` cookie; `adminOnly` checks `req.user.role === "admin"`.
- Roles are `ENUM('citizen','staff','admin')` — `003` fixed the `'user'/'stuff'` typo in `001`. `auth.service.js` sets `"citizen"` explicitly on register, so **do not let new code reintroduce `"user"`**.
- IDs are `CHAR(36)` UUIDs generated in JS via `randomUUID()`, not by MySQL.
- Env via `dotenv/config`. `backend/.env.example` exists locally but is **gitignored**, and it omits `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` required by `db:seed:admin` — also `NODE_ENV` (controls stack traces in `errorHandler`) and `JWT_EXPIRES_IN` (defaults to `7d`).
- The local MySQL on :3306 may be a MariaDB 10.4 build and may be sandboxed (read-only) — confirm you can actually run DDL before promising a migration was verified.

## Frontend (`frontend/`)

Next.js 16.3.5, App Router, JavaScript (no TypeScript), React 19. `@/*` maps to the frontend root (`jsconfig.json`). Config files use `.mjs` (`next.config.mjs`, `eslint.config.mjs`, `postcss.config.mjs`); the package has no `"type": "module"`.

### This Next.js is not the one in your training data
`frontend/AGENTS.md` is generated and **re-written by `next dev`**. Never hand-edit it, and commit its churn alongside your work — reverting it just re-creates the diff. Read `frontend/node_modules/next/dist/docs/` (not visible from the repo root) before writing Next.js code.

### Data layer
`lib/api.js` is the only API client: `apiFetch` prefixes `process.env.NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`), JSON-encodes the body, attaches `Authorization: Bearer`, and returns the parsed `data` field. Add one exported function per endpoint here rather than calling `fetch` from a component.

The JWT is kept in `localStorage` under `civictrack_token` (`getToken`/`setToken`/`clearToken`/`decodeToken`) **even though the backend also sets an httpOnly `token` cookie**. Consequences:
- There is no `middleware.js`; the `/admin` guard is client-side only, in `components/Modules/Admin/AdminLayout.jsx` (`useSyncExternalStore` over the `storage` event, then `router.replace`).
- Anything that fetches protected data must be a `"use client"` component. Pages are `.jsx` (the two boilerplate files `app/layout.js` and `app/page.js` are `.js`).

### UI
- shadcn/ui `base-rhea` style on **`@base-ui/react`, not radix**. Composition uses the base-ui `render` prop — `<Button render={<Link href="/x" />}>`, `<SheetTrigger render={<Button />}>`. Radix's `asChild` appears nowhere in the repo; don't introduce it.
- Add primitives with `npx shadcn` into `components/ui/`. Feature components live in `components/Modules/<Area>/` and are all `"use client"`.
- Forms follow one pattern: local state for values, a parallel `fieldErrors` object, client-side regex checks, then map `ApiRequestError.response.details[].path[0]` onto fields.
- `cn` is re-exported from `lib/utils.js` (the `cn` package).
- Tailwind v4, no `tailwind.config`: theme, `--font-heading`, and `@import "tailwindcss"` live in `app/globals.css`.

### Lint baseline is already red
`npm run lint` (the only check in this repo) fails out of the box with 2 pre-existing `react-hooks/set-state-in-effect` errors in generated code: `components/ui/carousel.jsx:74` and `hooks/use-mobile.js:14`. These are not yours — don't "fix" them to get a green run, and don't assume a failure means your change broke something.
