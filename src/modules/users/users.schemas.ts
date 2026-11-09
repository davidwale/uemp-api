import { z } from 'zod';
import { ROLES, USER_STATUSES } from '../../domain/enums.js';
import { PaginationQuery } from '../../lib/pagination.js';
import { isoDate, optionalUuid, trimmed } from '../../lib/schemas.js';
import { PasswordPolicy } from '../auth/auth.schemas.js';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
  .nullable()
  .optional();

const level = z.coerce
  .number()
  .int()
  .refine((n) => n >= 100 && n <= 700 && n % 100 === 0, 'Level must be one of 100, 200 … 700');

const StudentFields = z.object({
  matricNumber: z
    .string()
    .trim()
    .min(4)
    .max(30)
    .transform((v) => v.toUpperCase()),
  programId: z.uuid(),
  level,
  entryYear: z.coerce.number().int().min(1990).max(2100),
  gender: z.enum(['Male', 'Female']).nullable().optional(),
  dateOfBirth: isoDate.nullable().optional(),
  address: trimmed(255, 0).nullable().optional(),
});

const LecturerFields = z.object({
  staffNumber: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .transform((v) => v.toUpperCase()),
  title: trimmed(20, 0).nullable().optional(),
  rank: trimmed(60, 0).nullable().optional(),
});

const BaseUser = z.object({
  email: z.email().trim().toLowerCase(),
  firstName: trimmed(100),
  lastName: trimmed(100),
  phone,
  password: PasswordPolicy,
});

export const CreateUserBody = z.discriminatedUnion('role', [
  BaseUser.extend({ role: z.literal('STUDENT'), departmentId: z.uuid(), student: StudentFields }),
  BaseUser.extend({ role: z.literal('LECTURER'), departmentId: z.uuid(), lecturer: LecturerFields }),
  BaseUser.extend({ role: z.literal('DEPT_ADMIN'), departmentId: z.uuid() }),
  BaseUser.extend({ role: z.literal('SUPER_ADMIN') }),
]);
export type CreateUserInput = z.infer<typeof CreateUserBody>;

export const UpdateUserBody = z.object({
  email: z.email().trim().toLowerCase().optional(),
  firstName: trimmed(100).optional(),
  lastName: trimmed(100).optional(),
  phone,
  departmentId: z.uuid().optional(),
  student: StudentFields.partial().optional(),
  lecturer: LecturerFields.partial().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserBody>;

export const UpdateStatusBody = z.object({
  status: z.enum(USER_STATUSES),
  reason: trimmed(500, 0).optional(),
});

export const UpdateRoleBody = z.object({
  role: z.enum(ROLES).exclude(['STUDENT']),
  departmentId: z.uuid().optional(),
  staffNumber: z.string().trim().min(3).max(30).optional(),
});

export const ResetPasswordBody = z.object({ password: PasswordPolicy });

export const ListUsersQuery = PaginationQuery.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  departmentId: optionalUuid,
  programId: optionalUuid,
  level: level.optional(),
  search: z.string().trim().max(100).optional(),
});
