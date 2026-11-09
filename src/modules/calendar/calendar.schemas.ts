import { z } from 'zod';
import { SEMESTER_TYPES } from '../../domain/enums.js';
import { isoDate } from '../../lib/schemas.js';

const dateRange = <T extends { startDate?: string; endDate?: string }>(v: T) =>
  !v.startDate || !v.endDate || v.endDate > v.startDate;

export const CreateSessionBody = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, 'Session name must look like 2025/2026')
      .refine((n) => Number(n.slice(5)) === Number(n.slice(0, 4)) + 1, 'Session years must be consecutive'),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine(dateRange, { message: 'End date must be after start date', path: ['endDate'] });

export const UpdateSessionBody = z
  .object({ startDate: isoDate.optional(), endDate: isoDate.optional() })
  .refine(dateRange, { message: 'End date must be after start date', path: ['endDate'] });

export const CreateSemesterBody = z
  .object({
    sessionId: z.uuid(),
    type: z.enum(SEMESTER_TYPES),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine(dateRange, { message: 'End date must be after start date', path: ['endDate'] });

export const UpdateSemesterBody = z
  .object({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    registrationOpen: z.boolean().optional(),
  })
  .refine(dateRange, { message: 'End date must be after start date', path: ['endDate'] });
