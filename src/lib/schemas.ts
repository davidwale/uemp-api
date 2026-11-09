import { z } from 'zod';

export const IdParam = z.object({ id: z.uuid('Invalid identifier') });

export const trimmed = (max: number, min = 1) => z.string().trim().min(min).max(max);

export const optionalUuid = z
  .union([z.uuid(), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const isoDate = z.iso.date();
