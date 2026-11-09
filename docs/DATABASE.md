# Database Design

PostgreSQL 14+, managed through **Sequelize 6** models with versioned **Umzug** migrations
(`src/db/migrations`). The schema is normalised (3NF) and every rule that *can* live in the
database does: foreign keys, unique indexes, `CHECK` constraints and partial unique indexes. The
application enforces the same rules with friendlier messages, so the database is the final safety net
rather than the only check.

## Entity–relationship diagram

```mermaid
erDiagram
    FACULTIES ||--o{ DEPARTMENTS : contains
    DEPARTMENTS ||--o{ PROGRAMS : offers
    DEPARTMENTS ||--o{ COURSES : owns
    DEPARTMENTS ||--o{ USERS : "employs / enrols"

    USERS ||--o| STUDENT_PROFILES : "has (students)"
    USERS ||--o| LECTURER_PROFILES : "has (lecturers)"
    USERS ||--o{ SESSIONS : "signs in with"
    PROGRAMS ||--o{ STUDENT_PROFILES : enrols

    COURSES }o--o{ PROGRAMS : "offered to (course_programs)"

    ACADEMIC_SESSIONS ||--o{ SEMESTERS : "split into"

    COURSES ||--o{ COURSE_ALLOCATIONS : "taught via"
    SEMESTERS ||--o{ COURSE_ALLOCATIONS : during
    USERS ||--o{ COURSE_ALLOCATIONS : "lecturer of"

    USERS ||--o{ COURSE_REGISTRATIONS : "student registers"
    COURSES ||--o{ COURSE_REGISTRATIONS : "registered for"
    SEMESTERS ||--o{ COURSE_REGISTRATIONS : in

    COURSES ||--o{ RESULT_SHEETS : "graded in"
    SEMESTERS ||--o{ RESULT_SHEETS : for
    USERS ||--o{ RESULT_SHEETS : "submitted by / reviewed by"
    RESULT_SHEETS ||--o{ RESULT_ENTRIES : contains
    COURSE_REGISTRATIONS ||--o| RESULT_ENTRIES : "graded as"

    USERS ||--o{ AUDIT_LOGS : performs

    FACULTIES {
        uuid id PK
        string name UK
        string code UK
    }
    DEPARTMENTS {
        uuid id PK
        uuid faculty_id FK
        string name
        string code UK
    }
    PROGRAMS {
        uuid id PK
        uuid department_id FK
        string name
        string code UK
        string degree
        smallint duration_years "defines levels 100..N00"
    }
    USERS {
        uuid id PK
        string email UK
        string password_hash "bcrypt, cost 12"
        string first_name
        string last_name
        enum role "STUDENT | LECTURER | DEPT_ADMIN | SUPER_ADMIN"
        enum status "ACTIVE | INACTIVE | SUSPENDED"
        uuid department_id FK "required unless SUPER_ADMIN"
        timestamp last_login_at
    }
    STUDENT_PROFILES {
        uuid id PK
        uuid user_id FK,UK
        uuid program_id FK
        string matric_number UK
        smallint level "100..700"
        smallint entry_year
    }
    LECTURER_PROFILES {
        uuid id PK
        uuid user_id FK,UK
        string staff_number UK
        string title
        string rank
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        string token_hash UK "SHA-256 of cookie token"
        timestamp expires_at
        timestamp last_seen_at
        timestamp revoked_at
    }
    ACADEMIC_SESSIONS {
        uuid id PK
        string name UK "2026/2027"
        date start_date
        date end_date
        bool is_current "at most one true"
    }
    SEMESTERS {
        uuid id PK
        uuid session_id FK
        enum type "FIRST | SECOND"
        bool is_current "at most one true"
        bool registration_open
    }
    COURSES {
        uuid id PK
        uuid department_id FK
        string code UK
        string title
        smallint units "1..6"
        smallint level
        enum semester_type
        bool is_active
    }
    COURSE_ALLOCATIONS {
        uuid id PK
        uuid course_id FK
        uuid semester_id FK
        uuid lecturer_id FK
        uuid allocated_by_id FK
    }
    COURSE_REGISTRATIONS {
        uuid id PK
        uuid student_id FK
        uuid course_id FK
        uuid semester_id FK
    }
    RESULT_SHEETS {
        uuid id PK
        uuid course_id FK
        uuid semester_id FK
        uuid lecturer_id FK
        enum status "DRAFT | SUBMITTED | APPROVED | REJECTED"
        timestamp submitted_at
        uuid reviewed_by_id FK
        text review_comment
    }
    RESULT_ENTRIES {
        uuid id PK
        uuid sheet_id FK
        uuid registration_id FK,UK
        uuid student_id FK
        decimal ca_score "0..30"
        decimal exam_score "0..70"
        decimal total_score
        string grade
        smallint grade_point
    }
    GRADE_SCALES {
        uuid id PK
        string grade UK
        smallint min_score
        smallint max_score
        smallint grade_point
    }
    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        string action
        string entity_type
        uuid entity_id
        uuid department_id "for department-scoped viewing"
        jsonb metadata "before/after diffs, comments"
        string ip_address
        timestamp created_at
    }
```

## Key relationships and why

| Relationship | Design | Reason |
|---|---|---|
| User → Student/Lecturer profile | 1 : 0..1 tables, not columns on `users` | Role-specific fields stay out of the core identity table; `users` stays small and uniform for authentication. |
| Course ↔ Programme | Many-to-many via `course_programs` | A course is *owned* by one department but can be *offered* to several programmes, e.g. MTH101 is owned by Mathematics and taken by Computer Science and Engineering students. Business rule #1 (eligibility) is answered by this join. |
| Course allocation | Unique `(course_id, semester_id)` | Exactly one lecturer is accountable for a course's results in a given semester. |
| Result sheet | Unique `(course_id, semester_id)` | The **sheet** is the unit of submission and approval; its **entries** hold per-student scores. This gives one clean state machine per course instead of per-row statuses. |
| Result entry → registration | Unique `registration_id` FK | A result can only exist for a real registration, so a lecturer cannot grade a student who isn't registered. |
| Student department | `users.department_id` plus the programme's department | `users.department_id` drives administrative scoping for every role. The service layer verifies that a student's programme belongs to their department. |

## Constraints enforced by PostgreSQL

| Constraint | Business rule it backs |
|---|---|
| `course_registrations_no_duplicates` UNIQUE `(student_id, course_id, semester_id)` | #2: no duplicate registration in a semester |
| `result_sheets_no_self_review_chk` CHECK `reviewed_by_id <> lecturer_id` | Lecturers cannot approve their own results |
| `result_entries_scores_chk` CHECK CA 0–30, exam 0–70, total 0–100 | Score validity |
| `users_department_required_chk` CHECK `role = 'SUPER_ADMIN' OR department_id IS NOT NULL` | Every non-super-admin is scoped to a department |
| `semesters_single_current`, `academic_sessions_single_current`: partial UNIQUE `WHERE is_current` | Only one current semester/session, even under concurrent requests |
| `courses_units_chk`, `courses_level_chk`, `student_level_chk` | Valid units (1–6) and levels (100–700 in steps of 100) |
| `grade_scales_range_chk` | Each grade band lies within 0–100 |
| `ON DELETE RESTRICT` on all academic-record FKs | Deleting a course/semester/student that has registrations or results fails rather than cascading official records away |

## Indexes

Every foreign key used in a filter is indexed. Composite indexes match the hot query paths:

- `course_registrations (course_id, semester_id)`: class lists
- `course_allocations (lecturer_id, semester_id)`: a lecturer's teaching load
- `student_profiles (program_id, level)`: eligible-course lookups
- `courses (level, semester_type)`: registration eligibility
- `users (department_id, role)`: department-scoped user lists
- `audit_logs (entity_type, entity_id)`, `(created_at)`, `(department_id)`: audit trail views

## Grading scale

The scale is stored in `grade_scales`, seeded with the Nigerian NUC 5-point scale, and editable by the
Super Admin, who gets server-side validation for gaps, overlaps and coverage of 0–100.

| Grade | Score | Point |
|---|---|---|
| A | 70–100 | 5 |
| B | 60–69 | 4 |
| C | 50–59 | 3 |
| D | 45–49 | 2 |
| E | 40–44 | 1 |
| F | 0–39 | 0 |

**GPA** = Σ(course units × grade point) ÷ Σ(course units), computed per semester.
**CGPA** applies the same formula across all approved results to date. Values are rounded to 2 dp
only for display. Grades are **frozen on each entry at approval time**, so a later change to the scale
never silently alters a published transcript.

## Migrations & seed

```bash
npm run db:migrate     # apply pending migrations (tracked in schema_migrations)
npm run db:rollback    # revert the last one
npm run db:seed        # demo data (no-op if data already exists; --fresh to wipe first)
npm run db:reset       # drop schema, migrate, seed (refuses in production without --force)
```
