import { z } from 'zod';
import { optionalUuid, trimmed } from '../../lib/schemas.js';

const code = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[A-Za-z0-9-]+$/, 'Code may contain only letters, numbers and dashes')
    .transform((v) => v.toUpperCase());

export const FacultyBody = z.object({ name: trimmed(150, 3), code: code(10) });
export const UpdateFacultyBody = FacultyBody.partial();

export const DepartmentBody = z.object({ facultyId: z.uuid(), name: trimmed(150, 3), code: code(10) });
export const UpdateDepartmentBody = DepartmentBody.partial();
export const DepartmentQuery = z.object({ facultyId: optionalUuid });

export const ProgramBody = z.object({
  departmentId: z.uuid(),
  name: trimmed(150, 3),
  code: code(15),
  degree: trimmed(20, 2),
  durationYears: z.coerce.number().int().min(1).max(7),
});
export const UpdateProgramBody = ProgramBody.omit({ departmentId: true }).partial();
export const ProgramQuery = z.object({ departmentId: optionalUuid });
