import { Op, type Transaction, type WhereOptions } from 'sequelize';
import type { z } from 'zod';
import type { Role } from '../../domain/enums.js';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule, Forbidden, NotFound } from '../../lib/errors.js';
import { paginated, toLimitOffset } from '../../lib/pagination.js';
import { hashPassword } from '../../lib/password.js';
import {
  CourseAllocation,
  Department,
  LecturerProfile,
  Program,
  Semester,
  Session,
  StudentProfile,
  User,
  sequelize,
} from '../../models/index.js';
import { assertDepartmentScope, isSuperAdmin, scopedDepartmentId } from '../../rbac/scope.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateRoleBody,
  UpdateStatusBody,
  UpdateUserInput,
} from './users.schemas.js';

/** Roles a Department Admin may see and manage within their department. */
const DEPT_MANAGEABLE_ROLES: Role[] = ['STUDENT', 'LECTURER'];

const userIncludes = [
  { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
  {
    model: StudentProfile,
    as: 'studentProfile',
    include: [{ model: Program, as: 'program', attributes: ['id', 'name', 'code', 'durationYears'] }],
  },
  { model: LecturerProfile, as: 'lecturerProfile' },
];

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    department: user.department
      ? { id: user.department.id, name: user.department.name, code: user.department.code }
      : null,
    studentProfile: user.studentProfile
      ? {
          matricNumber: user.studentProfile.matricNumber,
          level: user.studentProfile.level,
          entryYear: user.studentProfile.entryYear,
          gender: user.studentProfile.gender,
          dateOfBirth: user.studentProfile.dateOfBirth,
          address: user.studentProfile.address,
          program: user.studentProfile.program
            ? { id: user.studentProfile.program.id, name: user.studentProfile.program.name, code: user.studentProfile.program.code }
            : null,
        }
      : null,
    lecturerProfile: user.lecturerProfile
      ? {
          staffNumber: user.lecturerProfile.staffNumber,
          title: user.lecturerProfile.title,
          rank: user.lecturerProfile.rank,
        }
      : null,
  };
}

/** Loads a user and verifies the actor is allowed to manage them. */
async function findManageableUser(actor: Actor, id: string, transaction?: Transaction) {
  const user = await User.findByPk(id, { include: userIncludes, transaction });
  if (!user) throw NotFound('User');
  if (!isSuperAdmin(actor)) {
    assertDepartmentScope(actor, user.departmentId);
    if (!DEPT_MANAGEABLE_ROLES.includes(user.role)) throw Forbidden('You cannot manage this account');
  }
  return user;
}

/** A student's programme must belong to their department, and their level must exist in the programme. */
async function validateStudentPlacement(departmentId: string, programId: string, level: number, transaction?: Transaction) {
  const program = await Program.findByPk(programId, { transaction });
  if (!program) throw NotFound('Programme');
  if (program.departmentId !== departmentId) {
    throw BusinessRule('The selected programme does not belong to the selected department');
  }
  if (level > program.durationYears * 100) {
    throw BusinessRule(`${program.name} runs for ${program.durationYears} years; level ${level} does not exist`);
  }
}

export async function listUsers(actor: Actor, query: z.infer<typeof ListUsersQuery>) {
  const departmentId = scopedDepartmentId(actor, query.departmentId);

  const where: WhereOptions = {};
  if (departmentId) Object.assign(where, { departmentId });
  if (query.status) Object.assign(where, { status: query.status });
  if (query.role) {
    if (!isSuperAdmin(actor) && !DEPT_MANAGEABLE_ROLES.includes(query.role)) throw Forbidden();
    Object.assign(where, { role: query.role });
  } else if (!isSuperAdmin(actor)) {
    Object.assign(where, { role: { [Op.in]: DEPT_MANAGEABLE_ROLES } });
  }
  if (query.programId) Object.assign(where, { '$studentProfile.program_id$': query.programId });
  if (query.level) Object.assign(where, { '$studentProfile.level$': query.level });
  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, '\\$&')}%`;
    Object.assign(where, {
      [Op.or]: [
        { firstName: { [Op.iLike]: term } },
        { lastName: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { '$studentProfile.matric_number$': { [Op.iLike]: term } },
        { '$lecturerProfile.staff_number$': { [Op.iLike]: term } },
      ],
    });
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    include: userIncludes,
    order: [
      ['lastName', 'ASC'],
      ['firstName', 'ASC'],
    ],
    distinct: true,
    subQuery: false,
    ...toLimitOffset(query),
  });
  return paginated(rows.map(serializeUser), count, query);
}

export async function getUser(actor: Actor, id: string) {
  return serializeUser(await findManageableUser(actor, id));
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  if (!isSuperAdmin(actor)) {
    if (!DEPT_MANAGEABLE_ROLES.includes(input.role)) throw Forbidden('You can only create student and lecturer accounts');
    // Department admins always create accounts in their own department.
    if ('departmentId' in input) input = { ...input, departmentId: actor.departmentId! };
  }

  const departmentId = 'departmentId' in input ? input.departmentId : null;
  if (departmentId && !(await Department.findByPk(departmentId))) throw NotFound('Department');

  return sequelize.transaction(async (transaction) => {
    if (input.role === 'STUDENT') {
      await validateStudentPlacement(input.departmentId, input.student.programId, input.student.level, transaction);
    }

    const user = await User.create(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        role: input.role,
        departmentId,
        lastLoginAt: null,
      },
      { transaction },
    );

    if (input.role === 'STUDENT') {
      await StudentProfile.create(
        {
          userId: user.id,
          ...input.student,
          gender: input.student.gender ?? null,
          dateOfBirth: input.student.dateOfBirth ?? null,
          address: input.student.address ?? null,
        },
        { transaction },
      );
    }
    if (input.role === 'LECTURER') {
      await LecturerProfile.create(
        { userId: user.id, ...input.lecturer, title: input.lecturer.title ?? null, rank: input.lecturer.rank ?? null },
        { transaction },
      );
    }

    await audit(
      {
        actor,
        action: AuditAction.USER_CREATED,
        entityType: 'user',
        entityId: user.id,
        departmentId,
        metadata: { email: input.email, role: input.role },
      },
      transaction,
    );

    return serializeUser((await User.findByPk(user.id, { include: userIncludes, transaction }))!);
  });
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  return sequelize.transaction(async (transaction) => {
    const user = await findManageableUser(actor, id, transaction);

    if (input.departmentId && input.departmentId !== user.departmentId) {
      if (!isSuperAdmin(actor)) throw Forbidden('Only the Super Admin can move users between departments');
      if (!(await Department.findByPk(input.departmentId, { transaction }))) throw NotFound('Department');
    }

    const before = serializeUser(user);
    const { student, lecturer, ...core } = input;
    await user.update(core, { transaction });

    if (user.role === 'STUDENT' && user.studentProfile) {
      const profile = user.studentProfile;
      const programId = student?.programId ?? profile.programId;
      const level = student?.level ?? profile.level;
      await validateStudentPlacement(user.departmentId!, programId, level, transaction);
      if (student) await profile.update(student, { transaction });
    }
    if (user.role === 'LECTURER' && user.lecturerProfile && lecturer) {
      await user.lecturerProfile.update(lecturer, { transaction });
    }

    await audit(
      {
        actor,
        action: AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: id,
        departmentId: user.departmentId,
        metadata: { changes: input, before: { email: before.email, departmentId: before.department?.id } },
      },
      transaction,
    );

    return serializeUser((await User.findByPk(id, { include: userIncludes, transaction }))!);
  });
}

export async function updateStatus(actor: Actor, id: string, input: z.infer<typeof UpdateStatusBody>) {
  if (actor.id === id) throw BusinessRule('You cannot change the status of your own account');
  return sequelize.transaction(async (transaction) => {
    const user = await findManageableUser(actor, id, transaction);
    const previous = user.status;
    await user.update({ status: input.status }, { transaction });

    // Deactivation takes effect immediately: kill every live session.
    if (input.status !== 'ACTIVE') {
      await Session.update({ revokedAt: new Date() }, { where: { userId: id, revokedAt: null }, transaction });
    }

    await audit(
      {
        actor,
        action: AuditAction.USER_STATUS_CHANGED,
        entityType: 'user',
        entityId: id,
        departmentId: user.departmentId,
        metadata: { from: previous, to: input.status, reason: input.reason ?? null },
      },
      transaction,
    );
    return serializeUser(user);
  });
}

/**
 * Role changes are restricted to staff roles. A student account carries an
 * academic record and cannot be converted into a staff account (or vice versa).
 */
export async function updateRole(actor: Actor, id: string, input: z.infer<typeof UpdateRoleBody>) {
  if (actor.id === id) throw BusinessRule('You cannot change your own role');

  return sequelize.transaction(async (transaction) => {
    const user = await findManageableUser(actor, id, transaction);
    if (user.role === 'STUDENT') throw BusinessRule('Student accounts cannot be converted to staff roles');
    if (user.role === input.role) return serializeUser(user);

    const departmentId = input.role === 'SUPER_ADMIN' ? null : (input.departmentId ?? user.departmentId);
    if (input.role !== 'SUPER_ADMIN' && !departmentId) {
      throw BusinessRule('A department is required for this role');
    }

    if (user.role === 'LECTURER') {
      const activeAllocations = await CourseAllocation.count({
        where: { lecturerId: id },
        include: [{ model: Semester, as: 'semester', where: { isCurrent: true }, attributes: [] }],
        transaction,
      });
      if (activeAllocations > 0) {
        throw BusinessRule('Reassign this lecturer’s courses for the current semester before changing their role');
      }
    }

    if (input.role === 'LECTURER' && !user.lecturerProfile) {
      if (!input.staffNumber) throw BusinessRule('A staff number is required to make this user a lecturer');
      await LecturerProfile.create(
        { userId: id, staffNumber: input.staffNumber.toUpperCase(), title: null, rank: null },
        { transaction },
      );
    }

    const previous = user.role;
    await user.update({ role: input.role, departmentId }, { transaction });

    await audit(
      {
        actor,
        action: AuditAction.USER_ROLE_CHANGED,
        entityType: 'user',
        entityId: id,
        departmentId,
        metadata: { from: previous, to: input.role, departmentId },
      },
      transaction,
    );
    return serializeUser((await User.findByPk(id, { include: userIncludes, transaction }))!);
  });
}

export async function resetPassword(actor: Actor, id: string, password: string) {
  return sequelize.transaction(async (transaction) => {
    const user = await findManageableUser(actor, id, transaction);
    await user.update({ passwordHash: await hashPassword(password) }, { transaction });
    await Session.update({ revokedAt: new Date() }, { where: { userId: id, revokedAt: null }, transaction });
    await audit(
      {
        actor,
        action: AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: id,
        departmentId: user.departmentId,
        metadata: { passwordReset: true },
      },
      transaction,
    );
  });
}
