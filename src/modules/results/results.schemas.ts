import { z } from 'zod';
import { ACADEMIC_POLICY } from '../../config/academic.js';
import { RESULT_STATUSES } from '../../domain/enums.js';
import { optionalUuid } from '../../lib/schemas.js';

const score = (max: number, label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot exceed ${max}`)
    .transform((v) => Math.round(v * 100) / 100)
    .nullable();

export const SaveEntriesBody = z.object({
  entries: z
    .array(
      z.object({
        registrationId: z.uuid(),
        caScore: score(ACADEMIC_POLICY.CA_MAX_SCORE, 'CA score'),
        examScore: score(ACADEMIC_POLICY.EXAM_MAX_SCORE, 'Exam score'),
      }),
    )
    .min(1)
    .max(1000)
    .refine((e) => new Set(e.map((x) => x.registrationId)).size === e.length, 'Duplicate student rows in submission'),
});

export const CourseSemesterParams = z.object({ courseId: z.uuid(), semesterId: z.uuid() });

export const ReviewBody = z.object({ comment: z.string().trim().max(2000).optional() });

export const RejectBody = z.object({
  comment: z.string().trim().min(5, 'Please explain what needs to be corrected (at least 5 characters)').max(2000),
});

export const ReopenBody = z.object({
  reason: z.string().trim().min(5, 'Please give a reason for reopening (at least 5 characters)').max(2000),
});

export const ListSheetsQuery = z.object({
  semesterId: optionalUuid,
  departmentId: optionalUuid,
  status: z.enum(RESULT_STATUSES).optional(),
});

export const TeachingQuery = z.object({ semesterId: optionalUuid });
