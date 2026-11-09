# UEMP API: University Education Management Portal

REST API for a role-based university management system. Students register for courses and view approved
results. Lecturers enter and submit scores. Department administrators approve results and manage their
department. The Super Administrator manages the whole institution.

**Live app:** https://uemp-client.vercel.app  ·  **Web client repo:** [uemp-client](https://github.com/davidwale/uemp-client)  ·  **Stack:** Express 5 · TypeScript · Sequelize · PostgreSQL · Zod · Vitest

> UEMP is two apps in two repositories: this API, and the React web client ([uemp-client](https://github.com/davidwale/uemp-client)).
> This README is the main entry point. Technical documentation lives in [`docs/`](docs).

---

## Demo accounts

All demo accounts use the password **`Password123!`**. The login page also has one-click buttons for each role.

| Role | Email | What to try |
|---|---|---|
| Student | `student@uemp.edu.ng` | Adaeze Okonkwo, CSC 200L. Has **not** registered for the current semester yet, so register courses → print the slip → view previous results and CGPA |
| Lecturer | `lecturer@uemp.edu.ng` | Dr. Chinedu Eze: **CSC201** is a draft (enter the remaining scores and submit); **CSC101** was returned with a comment (correct and resubmit) |
| Department Admin | `csc.admin@uemp.edu.ng` | Computer Science. CSC205 is **awaiting approval**; approve or reject it. Manage students, lecturers, courses, allocations, reports |
| Super Admin | `admin@uemp.edu.ng` | Faculties, departments, sessions/semesters, all users, grading scale, university-wide reports and audit log |

Other seeded accounts: `mth.admin@…` and `eee.admin@…` (department admins); lecturers `aisha.bello@`,
`tunde.bakare@`, `emeka.nwosu@`, `fatima.yusuf@`, `segun.afolabi@`; and twelve students
across Computer Science, Mathematics and Electrical Engineering.

The seed contains a completed **2025/2026** session with approved results (so GPAs and CGPAs are real), and the
current **2026/2027 First Semester** with registration open and result sheets in every workflow state.

## Features by role

| Student | Lecturer | Department Admin | Super Admin |
|---|---|---|---|
| Register eligible courses (programme, level, semester; 24-unit cap) | View allocated courses and class lists | Manage students & lecturers in own department | Manage faculties, departments, programmes |
| Drop courses while registration is open | Enter CA (/30) and exam (/70) scores with live grading | Manage courses and offer them to programmes | Create sessions & semesters, open/close registration |
| Printable registration slip | Save drafts, submit for approval | Allocate lecturers to courses | Manage all users, statuses and roles |
| View **approved** results, GPA, CGPA and class of degree | Correct and resubmit returned results | Approve / reject submitted results with comments | Configure the grading scale |
| Update contact details | View approval history | Reopen approved results (reason required) | University-wide reports, result oversight |
| | | Reports (CSV export) and department activity log | Full audit log; view the permission matrix |

## Running locally

You need both apps running. **Prerequisites:** Node.js ≥ 20.11, and PostgreSQL ≥ 14 running locally (e.g.
Postgres.app, or `docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`).

**1. API (this repo)**
```bash
npm install
cp .env.example .env          # adjust DATABASE_URL if needed
npm run db:setup              # creates the database, runs migrations, seeds demo data
npm run dev                   # → http://localhost:4000
```

**2. Web client ([uemp-client](https://github.com/davidwale/uemp-client))**
```bash
npm install
npm run dev                   # → http://localhost:5173 (proxies /api to :4000)
```

Open **http://localhost:5173** and sign in with any demo account.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API in watch mode |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run start:prod` | Migrate, seed if empty, then start (used in deployment) |
| `npm test` | Domain unit tests + API integration tests against PostgreSQL |
| `npm run typecheck` | TypeScript check |
| `npm run db:setup` | Create DB, migrate, seed |
| `npm run db:migrate` / `npm run db:rollback` | Apply / revert migrations |
| `npm run db:seed -- --fresh` | Wipe and re-seed demo data |
| `npm run db:reset` | Drop schema, migrate, seed (blocked in production) |

Tests use a separate database (`TEST_DATABASE_URL`, default `uemp_test`), which the suite creates and migrates
automatically.

## Configuration

`.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://localhost:5432/uemp` | PostgreSQL connection |
| `TEST_DATABASE_URL` | `postgres://localhost:5432/uemp_test` | Test database |
| `DATABASE_SSL` | `false` | Enable TLS for managed Postgres |
| `PORT` | `4000` | API port |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed browser origins (the web client's URL) |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_TIMEOUT_MINUTES` | `12` / `120` | Absolute and idle session lifetime |
| `LOG_LEVEL` | `info` | pino log level |

## Deployment

**API and database: Render** (Blueprint included)
1. Render dashboard → **New → Blueprint** → select this repository.
2. When prompted for `CORS_ORIGINS`, enter the web client's Vercel URL, e.g. `https://uemp-client.vercel.app`.
3. Render creates the `uemp-db` PostgreSQL database and the `uemp-api` web service, and injects the database's
   connection string as `DATABASE_URL`. On every start the service applies pending migrations; it seeds demo
   data only when the database is empty.
4. Check `https://<your-service>.onrender.com/api/health` returns `{"status":"ok"}`.

**Web client: Vercel.** Deploy the [uemp-client](https://github.com/davidwale/uemp-client) repo and point its
`/api/*` rewrite at this service's URL. The browser then sees one origin, so the `HttpOnly` / `SameSite=Lax`
session cookie works without cross-site configuration.

On Render's free plan the service sleeps after a period of inactivity, and the first request afterwards takes
up to a minute while it wakes. Open `/api/health` before a demo.

To host elsewhere: any Node.js host with PostgreSQL works. Build with `npm ci --include=dev && npm run build`,
start with `npm run start:prod`, and set `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL` and `CORS_ORIGINS`.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, the two apps, request lifecycle, result state machine, frontend architecture, testing strategy |
| [docs/DATABASE.md](docs/DATABASE.md) | ER diagram, table relationships, constraints, indexes, grading scale and GPA formula |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentication, sessions, RBAC matrix and scope logic, where each business rule is enforced, audit trail |
| [docs/API.md](docs/API.md) | Endpoint reference with required permissions |

## Grading

Total = CA (max 30) + Exam (max 70). Default scale (configurable by the Super Admin):

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| 70–100 · 5 pts | 60–69 · 4 | 50–59 · 3 | 45–49 · 2 | 40–44 · 1 | 0–39 · 0 |

GPA = Σ(units × grade point) ÷ Σ units. CGPA uses all approved results.

## Design decisions & assumptions

- **Server-side sessions over JWT**, so suspension and logout take effect immediately (see SECURITY.md).
- **Result sheets per course per semester** form the unit of submission and approval, with one state machine:
  `DRAFT → SUBMITTED → APPROVED`, or `SUBMITTED → REJECTED → SUBMITTED`.
- **Approval belongs to the department admin** of the department that owns the course, as the specification says.
  The Super Admin has oversight and can reopen results, but does not approve on a department's behalf.
- **Approved results are immutable** except through an audited reopen with a mandatory reason. Grades are frozen at
  approval, so changing the grading scale never alters published results.
- A course belongs to one department but can be **offered to several programmes** (e.g. a maths course for CS students).
- Students are placed at a level by administrators. Automatic promotion between sessions is out of scope.
- Every rule is enforced by the API (and, where possible, by database constraints). The UI hides what a role cannot
  do only for usability.
