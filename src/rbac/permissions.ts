import type { Role } from '../domain/enums.js';

/**
 * Role → permission matrix. This is the single source of truth for *what*
 * each role may do. *Which records* they may do it to (their department,
 * their courses, their own data) is enforced separately by scope checks in
 * the service layer — see `rbac/scope.ts`.
 *
 * Permissions are deliberately code-defined rather than editable at runtime:
 * an accidental change to the matrix should go through code review, not a
 * button click. The Super Admin manages *who* holds each role.
 */
export const PERMISSIONS = {
  // Profile
  'profile:read:own': ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],
  'profile:update:own': ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],

  // Organisation structure
  'faculty:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'faculty:manage': ['SUPER_ADMIN'],
  'department:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'department:manage': ['SUPER_ADMIN'],
  'program:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'program:manage': ['DEPT_ADMIN', 'SUPER_ADMIN'],

  // Academic calendar
  'calendar:read': ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],
  'calendar:manage': ['SUPER_ADMIN'],

  // Users
  'user:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'user:create': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'user:update': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'user:status': ['SUPER_ADMIN'],
  'user:role': ['SUPER_ADMIN'],

  // Courses
  'course:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'course:manage': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'allocation:read': ['LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],
  'allocation:manage': ['DEPT_ADMIN', 'SUPER_ADMIN'],

  // Registration
  'registration:create:own': ['STUDENT'],
  'registration:read:own': ['STUDENT'],
  'registration:read': ['LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],

  // Results
  'result:enter': ['LECTURER'],
  'result:submit': ['LECTURER'],
  'result:read': ['LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'],
  'result:approve': ['DEPT_ADMIN'],
  'result:reopen': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'result:read:own': ['STUDENT'],

  // Oversight
  'report:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'audit:read': ['DEPT_ADMIN', 'SUPER_ADMIN'],
  'settings:manage': ['SUPER_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}
