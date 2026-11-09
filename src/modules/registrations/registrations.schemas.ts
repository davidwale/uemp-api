import { z } from 'zod';
import { PaginationQuery } from '../../lib/pagination.js';
import { optionalUuid } from '../../lib/schemas.js';

export const RegisterBody = z.object({
  courseIds: z
    .array(z.uuid())
    .min(1, 'Select at least one course')
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'The same course was selected more than once'),
});

export const MyRegistrationsQuery = z.object({ semesterId: optionalUuid });

export const ListRegistrationsQuery = PaginationQuery.extend({
  semesterId: optionalUuid,
  departmentId: optionalUuid,
  courseId: optionalUuid,
  studentId: optionalUuid,
  level: z.coerce.number().int().optional(),
  search: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
