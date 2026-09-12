# AGENTS.md

Monorepo with two independent npm packages: `backend/` (Express + MySQL REST API) and `frontend/` (Next.js). No root workspace scripts or root README; run npm commands from within each package directory. No CI, no tests anywhere.

## Backend (`backend/`)

Express 5 + MySQL (mysql2/promise), ESM (`"type": "module"`). All imports must use explicit `.js` extensions (e.g. `import db from "../../config/db.js"`). Env comes from `backend/.env` via `dotenv/config`; copy `.env.example` to create it.

### Commands
- `npm run dev` — nodemon on `src/index.js` (port 8000)
- `npm run db:migrate` — applies SQL migrations; requires a running MySQL server
- `npm run db:seed:admin` — seeds an admin user
- `npm test` — is a stub that exits 1; there is no test suite

### Migrations (`backend/src/db/migrations/`)
- Plain `.sql` files run in filename-sorted order, picked up automatically under `00N_*.sql`.
- All migrations are idempotent (`CREATE ... IF NOT EXISTS`); there is no tracking table, so `db:migrate` always re-runs them all.
- `001_*.sql` contains `CREATE DATABASE civictrack` + `USE civictrack`; later files have no `USE` and only work when run through the migrate script (single connection). Don't run individual `.sql` files standalone.

### Gotchas
- `db:seed:admin` requires `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` in `backend/.env` — these are NOT in `.env.example`.
- Zod is v4: use `z.email()` (and `z.string().min(...)`), not the v3-style `z.string().email()`.
- Layered module pattern in `src/modules/<name>/`: `*.routes.js`, `*.controller.js`, `*.service.js`, `*.validation.js`. `validate` middleware validates `req.body` only. Controllers are wrapped in `asyncHandler`; `protect` accepts a Bearer token or the `token` cookie. Register new routes in `src/app.js`.

## Frontend (`frontend/`)

Next.js 16, App Router, JavaScript (no TypeScript). `@/*` paths map to the frontend root via `jsconfig.json`. Scripts: `npm run dev` (port 3000), `npm run build`, `npm run start`, `npm run lint` (eslint, no test command).

### Next.js version warning
The `frontend/AGENTS.md` is auto-generated and re-written by `next dev` — do not hand-edit it, commit any changes to it with your work, and if a diff looks odd check `node_modules/next/dist/server/lib/generate-agent-files.js`. This Next.js version differs from training data; read the bundled docs in `node_modules/next/dist/docs/` before writing Next.js code.

### UI conventions
- shadcn/ui in `base-rhea` style but backed by `@base-ui/react` (not radix). Add components with `npx shadcn` into `components/ui/`.
- `cn` is re-exported from `lib/utils.js` (the `cn` npm package).
- Tailwind v4: no `tailwind.config`; theme and `@import "tailwindcss"` live in `app/globals.css`.
- The `app/` directory is still boilerplate; there is no API client wiring yet.