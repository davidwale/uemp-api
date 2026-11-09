import { literal } from 'sequelize';
import type { z } from 'zod';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { NotFound } from '../../lib/errors.js';
import { Department, Faculty, Program, sequelize } from '../../models/index.js';
import { assertDepartmentScope } from '../../rbac/scope.js';
import type {
  DepartmentBody,
  FacultyBody,
  ProgramBody,
  UpdateDepartmentBody,
  UpdateFacultyBody,
  UpdateProgramBody,
} from './organisation.schemas.js';

// ── Faculties ───────────────────────────────────────────────────────────────

export async function listFaculties() {
  return Faculty.findAll({
    attributes: {
      include: [
        [literal(`(SELECT COUNT(*)::int FROM departments d WHERE d.faculty_id = "Faculty".id)`), 'departmentCount'],
      ],
    },
    order: [['name', 'ASC']],
  });
}

export async function createFaculty(actor: Actor, input: z.infer<typeof FacultyBody>) {
  return sequelize.transaction(async (transaction) => {
    const faculty = await Faculty.create(input, { transaction });
    await audit({ actor, action: AuditAction.FACULTY_CREATED, entityType: 'faculty', entityId: faculty.id, metadata: input }, transaction);
    return faculty;
  });
}

export async function updateFaculty(actor: Actor, id: string, input: z.infer<typeof UpdateFacultyBody>) {
  const faculty = await Faculty.findByPk(id);
  if (!faculty) throw NotFound('Faculty');
  return sequelize.transaction(async (transaction) => {
    await faculty.update(input, { transaction });
    await audit({ actor, action: AuditAction.FACULTY_UPDATED, entityType: 'faculty', entityId: id, metadata: input }, transaction);
    return faculty;
  });
}

export async function deleteFaculty(actor: Actor, id: string) {
  const faculty = await Faculty.findByPk(id);
  if (!faculty) throw NotFound('Faculty');
  await sequelize.transaction(async (transaction) => {
    await faculty.destroy({ transaction });
    await audit({ actor, action: AuditAction.FACULTY_DELETED, entityType: 'faculty', entityId: id, metadata: { name: faculty.name } }, transaction);
  });
}

// ── Departments ─────────────────────────────────────────────────────────────

const departmentCounts = [
  [literal(`(SELECT COUNT(*)::int FROM programs p WHERE p.department_id = "Department".id)`), 'programCount'],
  [literal(`(SELECT COUNT(*)::int FROM courses c WHERE c.department_id = "Department".id)`), 'courseCount'],
  [literal(`(SELECT COUNT(*)::int FROM users u WHERE u.department_id = "Department".id AND u.role = 'STUDENT')`), 'studentCount'],
  [literal(`(SELECT COUNT(*)::int FROM users u WHERE u.department_id = "Department".id AND u.role = 'LECTURER')`), 'lecturerCount'],
] as [ReturnType<typeof literal>, string][];

export async function listDepartments(filter: { facultyId?: string }) {
  return Department.findAll({
    where: filter.facultyId ? { facultyId: filter.facultyId } : {},
    attributes: { include: departmentCounts },
    include: [{ model: Faculty, as: 'faculty', attributes: ['id', 'name', 'code'] }],
    order: [['name', 'ASC']],
  });
}

export async function createDepartment(actor: Actor, input: z.infer<typeof DepartmentBody>) {
  if (!(await Faculty.findByPk(input.facultyId))) throw NotFound('Faculty');
  return sequelize.transaction(async (transaction) => {
    const department = await Department.create(input, { transaction });
    await audit(
      { actor, action: AuditAction.DEPARTMENT_CREATED, entityType: 'department', entityId: department.id, departmentId: department.id, metadata: input },
      transaction,
    );
    return department;
  });
}

export async function updateDepartment(actor: Actor, id: string, input: z.infer<typeof UpdateDepartmentBody>) {
  const department = await Department.findByPk(id);
  if (!department) throw NotFound('Department');
  if (input.facultyId && !(await Faculty.findByPk(input.facultyId))) throw NotFound('Faculty');
  return sequelize.transaction(async (transaction) => {
    await department.update(input, { transaction });
    await audit(
      { actor, action: AuditAction.DEPARTMENT_UPDATED, entityType: 'department', entityId: id, departmentId: id, metadata: input },
      transaction,
    );
    return department;
  });
}

export async function deleteDepartment(actor: Actor, id: string) {
  const department = await Department.findByPk(id);
  if (!department) throw NotFound('Department');
  await sequelize.transaction(async (transaction) => {
    await department.destroy({ transaction });
    await audit(
      { actor, action: AuditAction.DEPARTMENT_DELETED, entityType: 'department', entityId: id, metadata: { name: department.name } },
      transaction,
    );
  });
}

// ── Programmes ──────────────────────────────────────────────────────────────

/** Programme lists are readable by all admins: courses may be offered across departments. */
export async function listPrograms(filter: { departmentId?: string }) {
  const programs = await Program.findAll({
    where: filter.departmentId ? { departmentId: filter.departmentId } : {},
    attributes: {
      include: [
        [literal(`(SELECT COUNT(*)::int FROM student_profiles sp WHERE sp.program_id = "Program".id)`), 'studentCount'],
      ],
    },
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
    order: [['name', 'ASC']],
  });
  return programs.map((p) => ({ ...p.toJSON(), levels: p.levels }));
}

async function findProgramInScope(actor: Actor, id: string) {
  const program = await Program.findByPk(id);
  if (!program) throw NotFound('Programme');
  assertDepartmentScope(actor, program.departmentId);
  return program;
}

export async function createProgram(actor: Actor, input: z.infer<typeof ProgramBody>) {
  assertDepartmentScope(actor, input.departmentId);
  if (!(await Department.findByPk(input.departmentId))) throw NotFound('Department');
  return sequelize.transaction(async (transaction) => {
    const program = await Program.create(input, { transaction });
    await audit(
      { actor, action: AuditAction.PROGRAM_CREATED, entityType: 'program', entityId: program.id, departmentId: input.departmentId, metadata: input },
      transaction,
    );
    return program;
  });
}

export async function updateProgram(actor: Actor, id: string, input: z.infer<typeof UpdateProgramBody>) {
  const program = await findProgramInScope(actor, id);
  return sequelize.transaction(async (transaction) => {
    await program.update(input, { transaction });
    await audit(
      { actor, action: AuditAction.PROGRAM_UPDATED, entityType: 'program', entityId: id, departmentId: program.departmentId, metadata: input },
      transaction,
    );
    return program;
  });
}

export async function deleteProgram(actor: Actor, id: string) {
  const program = await findProgramInScope(actor, id);
  await sequelize.transaction(async (transaction) => {
    await program.destroy({ transaction });
    await audit(
      { actor, action: AuditAction.PROGRAM_DELETED, entityType: 'program', entityId: id, departmentId: program.departmentId, metadata: { name: program.name } },
      transaction,
    );
  });
}
