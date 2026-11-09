import type { Actor } from '../lib/actor.js';
import { Forbidden } from '../lib/errors.js';

/**
 * Scope rules — *which records* an actor may act on. Complements the
 * role → permission matrix in `permissions.ts`.
 *
 *  SUPER_ADMIN  university-wide
 *  DEPT_ADMIN   records belonging to their own department
 *  LECTURER     courses allocated to them (checked in the results/course services)
 *  STUDENT      their own records only
 */

export const isSuperAdmin = (actor: Actor) => actor.role === 'SUPER_ADMIN';

/** Throws unless the actor may manage records belonging to `departmentId`. */
export function assertDepartmentScope(actor: Actor, departmentId: string | null | undefined): void {
  if (isSuperAdmin(actor)) return;
  if (!departmentId || actor.departmentId !== departmentId) {
    throw Forbidden('This record belongs to another department');
  }
}

/**
 * Returns the department filter to apply to list queries.
 * Super Admins may optionally narrow to a department; everyone else is pinned to their own.
 */
export function scopedDepartmentId(actor: Actor, requested?: string): string | undefined {
  if (isSuperAdmin(actor)) return requested;
  if (!actor.departmentId) throw Forbidden('Your account is not assigned to a department');
  return actor.departmentId;
}
