# Security & Permission Logic

## 1. Authentication & session management

| Aspect | Implementation |
|---|---|
| Password storage | bcrypt, cost factor 12 (`src/lib/password.ts`) |
| Password policy | ≥ 8 characters, at least one letter and one number (validated server-side) |
| Session model | **Server-side sessions.** On login the server generates a 256-bit random token, stores only its **SHA-256 hash** in `sessions`, and sends the raw token in a cookie. |
| Cookie | `uemp_sid`: `HttpOnly` (unreadable by JS, so XSS can't steal it), `Secure` in production, `SameSite=Lax`, 12-hour max age |
| Expiry | Absolute lifetime (12 h) **and** idle timeout (2 h), both configurable via env |
| Revocation | Logout, suspension/deactivation, admin password reset and self password change all revoke sessions **immediately**. Every request re-checks that the session exists, isn't revoked or expired, and that the user is still `ACTIVE`. |
| Brute force | Login rate-limited to 10 attempts / 15 min per IP + email (IPv6-aware). A general API limit also applies. |
| Account enumeration | Unknown email and wrong password return the **same** message; bcrypt runs against a dummy hash for unknown emails so response timing is identical. Account status is only revealed after the password is proven correct. |

**Why not JWT?** Stateless JWTs can't be revoked before they expire. For an academic records system,
"suspend this account *now*" and "log out everywhere" are hard requirements, so server-side sessions
are the safer default. The cost is one indexed lookup per request.

## 2. Role-based access control (two layers)

Every protected request passes through:

```
authenticate  →  authorize(permission)  →  service-layer scope check  →  DB constraints
  (who are you)    (may your ROLE do this)  (may you do it to THIS record)  (last line of defence)
```

### Layer 1: Role → permission matrix
`src/rbac/permissions.ts` is the single source of truth. It is also exposed read-only to the Super
Admin under **Settings → Role-based access control**.

| Permission | Student | Lecturer | Dept Admin | Super Admin |
|---|:-:|:-:|:-:|:-:|
| Register own courses / view own results | ✅ | | | |
| Enter & submit results | | ✅ | | |
| View results / class lists | | ✅ (own courses) | ✅ (own dept) | ✅ |
| **Approve / reject results** | | | ✅ (own dept) | |
| Reopen approved results | | | ✅ (own dept) | ✅ |
| Manage students & lecturers | | | ✅ (own dept) | ✅ |
| Manage courses, programmes, allocations | | | ✅ (own dept) | ✅ |
| Manage faculties, departments, sessions/semesters | | | | ✅ |
| Change user status / roles | | | | ✅ |
| Reports | | | ✅ (own dept) | ✅ |
| Audit log | | | ✅ (own dept) | ✅ |
| Grading scale | | | | ✅ |

Permissions are deliberately **code-defined** rather than editable at runtime. A change to "who can
approve results" should go through code review, not a settings screen. The Super Admin manages *who
holds which role*.

### Layer 2: Record-level scope
Implemented in `src/rbac/scope.ts` and in each service:

- **Department Admin**: every read and write is pinned to `actor.departmentId`. List endpoints ignore any
  `departmentId` filter they send, and single-record operations call `assertDepartmentScope`.
  They can only see and manage `STUDENT` and `LECTURER` accounts.
- **Lecturer**: results can only be read or written for a course with a `course_allocations` row
  linking that lecturer, course and semester.
- **Student**: every student endpoint derives the student ID from the session, never from input.
  `PATCH /profile` uses a `.strict()` schema, so attempts to send `level`, `matricNumber`, etc. are rejected.

The frontend hides links a role can't use, but **only for usability**. Every rule above is enforced by
the API and covered by tests (`tests/rbac.test.ts`).

## 3. Business rules: where each is enforced

| # | Rule | Service enforcement | DB backstop | Test |
|---|---|---|---|---|
| 1 | Students register only courses for their programme, level and semester | `registrations.service › findEligibleCourses` | - | `workflows.test` |
| 2 | No duplicate registration in a semester | duplicate check + row lock | unique index | `workflows.test` |
| 3 | Lecturers enter results only for allocated courses | `results.service › saveEntries` | - | `rbac.test` |
| 4 | Results must be submitted before approval | state machine (`SUBMITTED` required) | - | `workflows.test` |
| 5 | Only the course's department admin approves | `capabilities().canReview` | no-self-review CHECK | `rbac.test` |
| 6 | Students see only approved results | `getStudentResults` filters `status = 'APPROVED'` | - | `workflows.test` |
| 7 | Super Admin has university-wide access | scope helpers bypass for `SUPER_ADMIN` | - | `rbac.test` |
| 8 | Every submission/approval/rejection/modification is traceable | `audit()` inside the same transaction | append-only table | `workflows.test` |

Additional safeguards:
- Submitted and approved sheets are **locked**. Editing requires the department to reject the sheet,
  or an authorised **reopen** (Dept Admin or Super Admin, with a mandatory reason).
- Lecturers can't submit while any student is missing a score.
- Students can't register for a course whose results are already submitted, and can't drop a course
  once a result exists for it.
- A 24-unit cap per semester is checked inside a transaction that **row-locks the student**, so a double
  click or two browser tabs can't race past it.
- Draft scores are hidden from everyone except the lecturer until submission.

## 4. Audit trail

`audit_logs` is append-only (the application never updates or deletes rows). Each record stores the actor,
their role at the time, action, entity, department, IP address and a JSON `metadata` payload.
For result edits that payload contains a **before/after diff per student**. Audit rows are written
**inside the same database transaction** as the change they describe, so an action can't succeed without
its audit record, and vice versa.

## 5. Web security hardening

| Threat | Mitigation |
|---|---|
| SQL injection | Sequelize parameterisation; raw report SQL uses bound replacements only |
| XSS | React escapes output by default; strict Content-Security-Policy via Helmet; session cookie is HttpOnly |
| CSRF | `SameSite=Lax` cookie, plus an Origin allow-list check on every state-changing request |
| Clickjacking | `frame-ancestors 'none'` / `X-Frame-Options` |
| Mass assignment | Every request body is parsed through an explicit Zod schema; unknown fields are dropped (or rejected with `.strict()`) |
| Information leakage | Central error handler returns a consistent envelope; unexpected errors are logged with a request ID and returned as a generic 500 without stack traces. The password hash is stripped by `User.toJSON()`. Logs redact cookies and passwords. |
| CSV/formula injection | Exported cells that start with `= + - @` are neutralised |
| Dependency risk | `npm audit` reports 0 known vulnerabilities |
