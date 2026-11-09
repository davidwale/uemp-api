import { z } from 'zod';
import { SEMESTER_TYPES } from '../../domain/enums.js';
import { PaginationQuery } from '../../lib/pagination.js';
import { optionalUuid, trimmed } from '../../lib/schemas.js';

const level = z.coerce
  .number()
  .int()
  .refine((n) => n >= 100 && n <= 700 && n % 100 === 0, 'Level must be one of 100, 200 … 700');

export const CourseBody = z.object({
  departmentId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,4}\s?\d{3}[A-Za-z]?$/, 'Course code must look like CSC201'),
  title: trimmed(200, 3),
  description: z.string().trim().max(2000).nullable().optional(),
  units: z.coerce.number().int().min(1).max(6),
  level,
  semesterType: z.enum(SEMESTER_TYPES),
  isActive: z.boolean().optional(),
  programIds: z.array(z.uuid()).min(1, 'Offer the course to at least one programme'),
});
export const UpdateCourseBody = CourseBody.omit({ departmentId: true }).partial();

export const ListCoursesQuery = PaginationQuery.extend({
  departmentId: optionalUuid,
  programId: optionalUuid,
  level: level.optional(),
  semesterType: z.enum(SEMESTER_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const AllocationBody = z.object({
  courseId: z.uuid(),
  semesterId: z.uuid(),
  lecturerId: z.uuid(),
});

export const ListAllocationsQuery = z.object({
  semesterId: optionalUuid,
  departmentId: optionalUuid,
});
