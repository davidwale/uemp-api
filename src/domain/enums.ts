export const ROLES = ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SEMESTER_TYPES = ['FIRST', 'SECOND'] as const;
export type SemesterType = (typeof SEMESTER_TYPES)[number];

/**
 * Result sheet lifecycle:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED
 *     ▲                  │                      │
 *     │               reject                 reopen
 *     │                  ▼                      │
 *     └──(edit/submit)─ REJECTED ◀──────────────┘
 *
 * Only DRAFT and REJECTED sheets are editable by the lecturer.
 * Only APPROVED results are visible to students.
 */
export const RESULT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const EDITABLE_RESULT_STATUSES: readonly ResultStatus[] = ['DRAFT', 'REJECTED'];
