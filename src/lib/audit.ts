import type { Transaction } from 'sequelize';
import { AuditLog } from '../models/index.js';
import type { Actor } from './actor.js';

/** Canonical list of audited actions. */
export const AuditAction = {
  LOGIN_SUCCESS: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password_changed',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_STATUS_CHANGED: 'user.status_changed',
  USER_ROLE_CHANGED: 'user.role_changed',
  PROFILE_UPDATED: 'user.profile_updated',

  FACULTY_CREATED: 'faculty.created',
  FACULTY_UPDATED: 'faculty.updated',
  FACULTY_DELETED: 'faculty.deleted',
  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',
  DEPARTMENT_DELETED: 'department.deleted',
  PROGRAM_CREATED: 'program.created',
  PROGRAM_UPDATED: 'program.updated',
  PROGRAM_DELETED: 'program.deleted',

  SESSION_CREATED: 'calendar.session_created',
  SESSION_UPDATED: 'calendar.session_updated',
  SEMESTER_CREATED: 'calendar.semester_created',
  SEMESTER_UPDATED: 'calendar.semester_updated',
  SEMESTER_ACTIVATED: 'calendar.semester_activated',

  COURSE_CREATED: 'course.created',
  COURSE_UPDATED: 'course.updated',
  COURSE_DELETED: 'course.deleted',
  COURSE_ALLOCATED: 'course.allocated',
  COURSE_UNALLOCATED: 'course.unallocated',

  COURSES_REGISTERED: 'registration.created',
  COURSE_DROPPED: 'registration.dropped',

  RESULT_DRAFT_SAVED: 'result.draft_saved',
  RESULT_SUBMITTED: 'result.submitted',
  RESULT_APPROVED: 'result.approved',
  RESULT_REJECTED: 'result.rejected',
  RESULT_REOPENED: 'result.reopened',

  GRADE_SCALE_UPDATED: 'settings.grade_scale_updated',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

interface AuditInput {
  actor: Actor | null;
  action: AuditActionType;
  entityType: string;
  entityId?: string | null;
  departmentId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Writes an audit record. When a transaction is passed, the audit row commits
 * or rolls back atomically with the change it describes — there is never an
 * audited action that didn't happen, or an action that wasn't audited.
 */
export async function audit(input: AuditInput, transaction?: Transaction): Promise<void> {
  await AuditLog.create(
    {
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      departmentId: input.departmentId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ip ?? input.actor?.ip ?? null,
    },
    { transaction },
  );
}
