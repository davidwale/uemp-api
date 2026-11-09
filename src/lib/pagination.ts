import { z } from 'zod';

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationQuery>;

export const toLimitOffset = ({ page, pageSize }: PaginationInput) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function paginated<T>(rows: T[], total: number, { page, pageSize }: PaginationInput): Paginated<T> {
  return { data: rows, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}
