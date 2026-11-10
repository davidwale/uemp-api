# API Reference

Base URL: `/api/v1`. All requests and responses are JSON. Authentication is the `uemp_sid` HttpOnly
cookie that `POST /auth/login` sets, so browsers send it automatically with `credentials: 'include'`.

## Conventions

| Topic | Convention |
|---|---|
| Success | `{ "data": … }`; paginated lists add `"meta": { page, pageSize, total, totalPages }` |
| Errors | `{ "error": { "code", "message", "details"?, "requestId" } }`. `requestId` matches the server log entry. |
| Pagination | `?page=1&pageSize=20` (max 100) |
| CSV | Report endpoints accept `?format=csv` |

### Error codes

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON body, or a wrong current password when changing password |
| 401 | `UNAUTHENTICATED` | Not signed in, session expired or revoked, or wrong email/password |
| 403 | `FORBIDDEN` | Role lacks the permission, record is outside your scope, or cross-origin request rejected |
| 404 | `NOT_FOUND` | Record doesn't exist or isn't visible to you |
| 409 | `CONFLICT` | e.g. registering for a course you're already registered for this semester |
| 409 | `DUPLICATE` | Unique value already used (email, matric number, course code…) |
| 409 | `IN_USE` | Record is referenced by others and can't be removed |
| 422 | `VALIDATION_ERROR` | Field validation failed; `details` lists `{ field, message }` |
| 422 | `BUSINESS_RULE_VIOLATION` | Request is valid but breaks a rule, e.g. unit cap exceeded, registration closed, approving a sheet that isn't submitted |
| 422 | `CONSTRAINT_VIOLATION` | A database CHECK constraint rejected the values |
| 429 | `TOO_MANY_REQUESTS` | Rate limit reached |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, not returned) |

## Endpoints

The permission column names the entry in `src/rbac/permissions.ts`. Record-level scope
(own department / own courses / own data) is applied on top. See [SECURITY.md](SECURITY.md).

### Auth (public unless noted)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }`; rate-limited |
| POST | `/auth/logout` | authenticated; revokes the session |
| GET | `/auth/me` | authenticated; user, permissions, current semester |
| POST | `/auth/change-password` | authenticated; `{ currentPassword, newPassword }`; revokes other sessions |

### Profile
| Method | Path | Permission |
|---|---|---|
| GET | `/profile` | `profile:read:own` |
| PATCH | `/profile` | `profile:update:own`: phone, plus address for students only |

### Dashboard
| GET | `/dashboard` | any role; returns a role-specific payload |
|---|---|---|

### Academic calendar
| Method | Path | Permission |
|---|---|---|
| GET | `/calendar/current` · `/calendar/sessions` · `/calendar/semesters` | `calendar:read` |
| POST | `/calendar/sessions` · `/calendar/semesters` | `calendar:manage` |
| PATCH | `/calendar/sessions/:id` · `/calendar/semesters/:id` | `calendar:manage` (e.g. `registrationOpen`) |
| POST | `/calendar/semesters/:id/activate` | `calendar:manage`: makes the semester (and its session) current |

### Organisation
| Method | Path | Permission |
|---|---|---|
| GET / POST / PATCH / DELETE | `/organisation/faculties[/:id]` | read `faculty:read`, write `faculty:manage` |
| GET / POST / PATCH / DELETE | `/organisation/departments[/:id]` | read `department:read`, write `department:manage` |
| GET / POST / PATCH / DELETE | `/organisation/programs[/:id]` | read `program:read`, write `program:manage` (dept-scoped) |

### Users
| Method | Path | Permission |
|---|---|---|
| GET | `/users?role&status&departmentId&programId&level&search` | `user:read` |
| GET | `/users/:id` | `user:read` |
| POST | `/users` | `user:create`: body is discriminated by `role` (`student` / `lecturer` sub-objects) |
| PATCH | `/users/:id` | `user:update` |
| PATCH | `/users/:id/status` | `user:status`: `ACTIVE` / `INACTIVE` / `SUSPENDED`; revokes sessions |
| PATCH | `/users/:id/role` | `user:role`: staff roles only |
| POST | `/users/:id/reset-password` | `user:update` |

### Courses & allocation
| Method | Path | Permission |
|---|---|---|
| GET | `/courses?search&level&semesterType&departmentId` · `/courses/:id` | `course:read` |
| POST / PATCH / DELETE | `/courses[/:id]` | `course:manage` |
| GET | `/allocations?semesterId&departmentId` | `allocation:read` |
| POST | `/allocations` | `allocation:manage`: `{ courseId, semesterId, lecturerId }`; creates or reassigns |
| DELETE | `/allocations/:id` | `allocation:manage`: only before results exist |

### Course registration
| Method | Path | Permission |
|---|---|---|
| GET | `/registrations/available` | `registration:create:own`: eligible courses for the current semester |
| GET | `/registrations/mine?semesterId` | `registration:read:own`: registration slip data |
| POST | `/registrations` | `registration:create:own`: `{ courseIds: [] }` |
| DELETE | `/registrations/:id` | `registration:create:own`: while registration is open and no result exists |
| GET | `/registrations?semesterId&departmentId&level&search` | `registration:read` |

### Results
| Method | Path | Permission |
|---|---|---|
| GET | `/results/me` | `result:read:own`: approved results only, with GPA and CGPA |
| GET | `/results/teaching` | `result:enter`: the lecturer's allocated courses |
| GET | `/results/courses/:courseId/semesters/:semesterId` | `result:read`: score sheet and `capabilities` |
| PUT | `/results/courses/:courseId/semesters/:semesterId/entries` | `result:enter`: `{ entries: [{ registrationId, caScore, examScore }] }` |
| POST | `/results/courses/:courseId/semesters/:semesterId/submit` | `result:submit` |
| GET | `/results/sheets?status&semesterId&departmentId` | `result:read` |
| GET | `/results/sheets/:id` · `/results/sheets/:id/history` | `result:read` |
| POST | `/results/sheets/:id/approve` | `result:approve`: `{ comment? }` |
| POST | `/results/sheets/:id/reject` | `result:approve`: `{ comment }` (required) |
| POST | `/results/sheets/:id/reopen` | `result:reopen`: `{ reason }` (required) |

### Reports (`report:read`; add `?format=csv` to download)
| GET | `/reports/students?departmentId&programId&level` |
|---|---|
| GET | `/reports/registrations?semesterId&departmentId` |
| GET | `/reports/performance?semesterId&departmentId` |

### Audit & settings
| Method | Path | Permission |
|---|---|---|
| GET | `/audit-logs?action&from&to` | `audit:read` (dept-scoped for Dept Admins) |
| GET | `/settings/academic` | any role: grade scale and score limits |
| PUT | `/settings/grade-scale` | `settings:manage` |
| GET | `/settings/permissions` | `settings:manage` |

### Health
`GET /api/health` (outside `/v1`, unauthenticated) is used by the hosting platform's health check.
