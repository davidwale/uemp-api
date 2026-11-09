import { Op, literal, type WhereOptions } from 'sequelize';
import type { z } from 'zod';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule, NotFound } from '../../lib/errors.js';
import { paginated, toLimitOffset } from '../../lib/pagination.js';
import {
  AcademicSession,
  Course,
  CourseAllocation,
  Department,
  LecturerProfile,
  Program,
  ResultSheet,
  Semester,
  User,
  sequelize,
} from '../../models/index.js';
import { assertDepartmentScope, scopedDepartmentId } from '../../rbac/scope.js';
import { requireCurrentSemester, serializeSemester } from '../calendar/calendar.service.js';
import type {
  AllocationBody,
  CourseBody,
  ListAllocationsQuery,
  ListCoursesQuery,
  UpdateCourseBody,
} from './courses.schemas.js';

const courseIncludes = [
  { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
  { model: Program, as: 'programs', attributes: ['id', 'name', 'code', 'durationYears'], through: { attributes: [] } },
];

export function serializeCourse(course: Course) {
  return {
    id: course.id,
    code: course.code,
    title: course.title,
    description: course.description,
    units: course.units,
    level: course.level,
    semesterType: course.semesterType,
    isActive: course.isActive,
    department: course.department
      ? { id: course.department.id, name: course.department.name, code: course.department.code }
      : null,
    programs: (course.programs ?? []).map((p) => ({ id: p.id, name: p.name, code: p.code })),
  };
}

async function validatePrograms(programIds: string[], level: number) {
  const programs = await Program.findAll({ where: { id: { [Op.in]: programIds } } });
  if (programs.length !== new Set(programIds).size) throw NotFound('One or more programmes');
  const tooShort = programs.filter((p) => level > p.durationYears * 100);
  if (tooShort.length) {
    throw BusinessRule(`Level ${level} does not exist in: ${tooShort.map((p) => p.name).join(', ')}`);
  }
  return programs;
}

export async function listCourses(actor: Actor, query: z.infer<typeof ListCoursesQuery>) {
  const departmentId = scopedDepartmentId(actor, query.departmentId);
  const where: WhereOptions = {};
  if (departmentId) Object.assign(where, { departmentId });
  if (query.level) Object.assign(where, { level: query.level });
  if (query.semesterType) Object.assign(where, { semesterType: query.semesterType });
  if (query.programId) {
    Object.assign(where, {
      id: { [Op.in]: literal(`(SELECT course_id FROM course_programs WHERE program_id = ${sequelize.escape(query.programId)})`) },
    });
  }
  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, '\\$&')}%`;
    Object.assign(where, { [Op.or]: [{ code: { [Op.iLike]: term } }, { title: { [Op.iLike]: term } }] });
  }

  const { rows, count } = await Course.findAndCountAll({
    where,
    include: courseIncludes,
    order: [
      ['level', 'ASC'],
      ['code', 'ASC'],
    ],
    distinct: true,
    ...toLimitOffset(query),
  });
  return paginated(rows.map(serializeCourse), count, query);
}

async function findCourseInScope(actor: Actor, id: string) {
  const course = await Course.findByPk(id, { include: courseIncludes });
  if (!course) throw NotFound('Course');
  assertDepartmentScope(actor, course.departmentId);
  return course;
}

export async function getCourse(actor: Actor, id: string) {
  return serializeCourse(await findCourseInScope(actor, id));
}

export async function createCourse(actor: Actor, input: z.infer<typeof CourseBody>) {
  assertDepartmentScope(actor, input.departmentId);
  if (!(await Department.findByPk(input.departmentId))) throw NotFound('Department');
  const programs = await validatePrograms(input.programIds, input.level);

  return sequelize.transaction(async (transaction) => {
    const { programIds: _ids, ...data } = input;
    const course = await Course.create(data, { transaction });
    await course.setPrograms(programs, { transaction });
    await audit(
      { actor, action: AuditAction.COURSE_CREATED, entityType: 'course', entityId: course.id, departmentId: input.departmentId, metadata: input },
      transaction,
    );
    return serializeCourse((await Course.findByPk(course.id, { include: courseIncludes, transaction }))!);
  });
}

export async function updateCourse(actor: Actor, id: string, input: z.infer<typeof UpdateCourseBody>) {
  const course = await findCourseInScope(actor, id);
  const level = input.level ?? course.level;
  const programIds = input.programIds ?? (course.programs ?? []).map((p) => p.id);
  const programs = await validatePrograms(programIds, level);

  return sequelize.transaction(async (transaction) => {
    const { programIds: _ids, ...data } = input;
    await course.update(data, { transaction });
    if (input.programIds) {
      await course.setPrograms(programs, { transaction });
    }
    await audit(
      { actor, action: AuditAction.COURSE_UPDATED, entityType: 'course', entityId: id, departmentId: course.departmentId, metadata: input },
      transaction,
    );
    return serializeCourse((await Course.findByPk(id, { include: courseIncludes, transaction }))!);
  });
}

/** Courses with registrations or results cannot be deleted (FK RESTRICT); deactivate them instead. */
export async function deleteCourse(actor: Actor, id: string) {
  const course = await findCourseInScope(actor, id);
  await sequelize.transaction(async (transaction) => {
    await course.destroy({ transaction });
    await audit(
      { actor, action: AuditAction.COURSE_DELETED, entityType: 'course', entityId: id, departmentId: course.departmentId, metadata: { code: course.code } },
      transaction,
    );
  });
}

// ── Allocations ─────────────────────────────────────────────────────────────

const allocationIncludes = [
  { model: Course, as: 'course', include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }] },
  { model: Semester, as: 'semester', include: [{ model: AcademicSession, as: 'session' }] },
  {
    model: User,
    as: 'lecturer',
    attributes: ['id', 'firstName', 'lastName', 'email'],
    include: [{ model: LecturerProfile, as: 'lecturerProfile', attributes: ['staffNumber', 'title'] }],
  },
];

function serializeAllocation(a: CourseAllocation) {
  return {
    id: a.id,
    course: a.course ? serializeCourse(a.course) : null,
    semester: a.semester ? serializeSemester(a.semester) : null,
    lecturer: a.lecturer
      ? {
          id: a.lecturer.id,
          fullName: a.lecturer.fullName,
          email: a.lecturer.email,
          title: a.lecturer.lecturerProfile?.title ?? null,
          staffNumber: a.lecturer.lecturerProfile?.staffNumber ?? null,
        }
      : null,
    createdAt: a.createdAt,
  };
}

export async function listAllocations(actor: Actor, query: z.infer<typeof ListAllocationsQuery>) {
  const semesterId = query.semesterId ?? (await requireCurrentSemester()).id;
  const where: WhereOptions = { semesterId };
  const courseWhere: WhereOptions = {};

  if (actor.role === 'LECTURER') {
    Object.assign(where, { lecturerId: actor.id });
  } else {
    const departmentId = scopedDepartmentId(actor, query.departmentId);
    if (departmentId) Object.assign(courseWhere, { departmentId });
  }

  const allocations = await CourseAllocation.findAll({
    where,
    include: allocationIncludes.map((inc) => (inc.as === 'course' ? { ...inc, where: courseWhere } : inc)),
    order: [[{ model: Course, as: 'course' }, 'code', 'ASC']],
  });
  return allocations.map(serializeAllocation);
}

/**
 * Assigns (or reassigns) the responsible lecturer for a course in a semester.
 * Reassignment is blocked once results have been submitted, so the person who
 * entered the results always remains accountable for them.
 */
export async function allocateCourse(actor: Actor, input: z.infer<typeof AllocationBody>) {
  const course = await Course.findByPk(input.courseId);
  if (!course) throw NotFound('Course');
  assertDepartmentScope(actor, course.departmentId);
  if (!course.isActive) throw BusinessRule('Inactive courses cannot be allocated');

  const semester = await Semester.findByPk(input.semesterId);
  if (!semester) throw NotFound('Semester');
  if (semester.type !== course.semesterType) {
    throw BusinessRule(`${course.code} is a ${course.semesterType.toLowerCase()}-semester course`);
  }

  const lecturer = await User.findByPk(input.lecturerId);
  if (!lecturer || lecturer.role !== 'LECTURER') throw NotFound('Lecturer');
  if (lecturer.status !== 'ACTIVE') throw BusinessRule('Only active lecturers can be allocated courses');
  if (lecturer.departmentId !== course.departmentId) {
    throw BusinessRule('Lecturers can only be allocated courses from their own department');
  }

  return sequelize.transaction(async (transaction) => {
    const existing = await CourseAllocation.findOne({
      where: { courseId: input.courseId, semesterId: input.semesterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const sheet = await ResultSheet.findOne({
      where: { courseId: input.courseId, semesterId: input.semesterId },
      transaction,
    });
    if (existing && sheet && !['DRAFT', 'REJECTED'].includes(sheet.status)) {
      throw BusinessRule('Results for this course have been submitted; the lecturer can no longer be changed');
    }

    const previousLecturerId = existing?.lecturerId ?? null;
    let allocation: CourseAllocation;
    if (existing) {
      await existing.update({ lecturerId: input.lecturerId, allocatedById: actor.id }, { transaction });
      // A draft result sheet follows the course to its new lecturer.
      if (sheet) await sheet.update({ lecturerId: input.lecturerId }, { transaction });
      allocation = existing;
    } else {
      allocation = await CourseAllocation.create({ ...input, allocatedById: actor.id }, { transaction });
    }

    await audit(
      {
        actor,
        action: AuditAction.COURSE_ALLOCATED,
        entityType: 'course_allocation',
        entityId: allocation.id,
        departmentId: course.departmentId,
        metadata: { courseCode: course.code, lecturerId: input.lecturerId, previousLecturerId },
      },
      transaction,
    );

    return serializeAllocation((await CourseAllocation.findByPk(allocation.id, { include: allocationIncludes, transaction }))!);
  });
}

export async function removeAllocation(actor: Actor, id: string) {
  const allocation = await CourseAllocation.findByPk(id, { include: [{ model: Course, as: 'course' }] });
  if (!allocation) throw NotFound('Allocation');
  assertDepartmentScope(actor, allocation.course!.departmentId);

  const sheet = await ResultSheet.findOne({ where: { courseId: allocation.courseId, semesterId: allocation.semesterId } });
  if (sheet) throw BusinessRule('Results have been started for this course; reassign the lecturer instead of removing');

  await sequelize.transaction(async (transaction) => {
    await allocation.destroy({ transaction });
    await audit(
      {
        actor,
        action: AuditAction.COURSE_UNALLOCATED,
        entityType: 'course_allocation',
        entityId: id,
        departmentId: allocation.course!.departmentId,
        metadata: { courseCode: allocation.course!.code, lecturerId: allocation.lecturerId },
      },
      transaction,
    );
  });
}
