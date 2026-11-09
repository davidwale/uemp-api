import { Op, type Transaction, type WhereOptions } from 'sequelize';
import type { z } from 'zod';
import { ACADEMIC_POLICY } from '../../config/academic.js';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule, Conflict, Forbidden, NotFound } from '../../lib/errors.js';
import { paginated, toLimitOffset } from '../../lib/pagination.js';
import {
  AcademicSession,
  Course,
  CourseAllocation,
  CourseRegistration,
  Department,
  LecturerProfile,
  Program,
  ResultEntry,
  ResultSheet,
  Semester,
  StudentProfile,
  User,
  sequelize,
} from '../../models/index.js';
import { scopedDepartmentId } from '../../rbac/scope.js';
import { findSemester, requireCurrentSemester, serializeSemester } from '../calendar/calendar.service.js';
import type { ListRegistrationsQuery } from './registrations.schemas.js';

async function loadStudent(studentId: string, transaction?: Transaction) {
  const student = await User.findByPk(studentId, {
    include: [
      { model: StudentProfile, as: 'studentProfile', include: [{ model: Program, as: 'program' }] },
      { model: Department, as: 'department' },
    ],
    transaction,
  });
  if (!student?.studentProfile?.program) throw NotFound('Student profile');
  return { user: student, profile: student.studentProfile, program: student.studentProfile.program };
}

/**
 * Business rule #1 — the set of courses a student may register this semester:
 * active, offered to the student's programme, at the student's level, and
 * scheduled for the current semester type (first/second).
 */
async function findEligibleCourses(
  programId: string,
  level: number,
  semesterType: 'FIRST' | 'SECOND',
  transaction?: Transaction,
) {
  return Course.findAll({
    where: { isActive: true, level, semesterType },
    include: [
      { model: Program, as: 'programs', where: { id: programId }, attributes: [], through: { attributes: [] } },
      { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
    ],
    order: [['code', 'ASC']],
    transaction,
  });
}

export async function getAvailableCourses(actor: Actor) {
  const semester = await requireCurrentSemester();
  const { user, profile, program } = await loadStudent(actor.id);
  const courses = await findEligibleCourses(program.id, profile.level, semester.type);

  const [registrations, allocations, lockedSheets] = await Promise.all([
    CourseRegistration.findAll({ where: { studentId: actor.id, semesterId: semester.id } }),
    CourseAllocation.findAll({
      where: { semesterId: semester.id, courseId: { [Op.in]: courses.map((c) => c.id) } },
      include: [
        {
          model: User,
          as: 'lecturer',
          attributes: ['id', 'firstName', 'lastName'],
          include: [{ model: LecturerProfile, as: 'lecturerProfile', attributes: ['title'] }],
        },
      ],
    }),
    ResultSheet.findAll({
      where: { semesterId: semester.id, status: { [Op.in]: ['SUBMITTED', 'APPROVED'] } },
      attributes: ['courseId'],
    }),
  ]);

  const lockedCourseIds = new Set(lockedSheets.map((s) => s.courseId));
  const registeredIds = new Map(registrations.map((r) => [r.courseId, r.id]));
  const lecturerByCourse = new Map(
    allocations.map((a) => [
      a.courseId,
      a.lecturer ? `${a.lecturer.lecturerProfile?.title ?? ''} ${a.lecturer.fullName}`.trim() : null,
    ]),
  );

  const items = courses.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    units: c.units,
    level: c.level,
    semesterType: c.semesterType,
    department: c.department ? { id: c.department.id, code: c.department.code, name: c.department.name } : null,
    lecturer: lecturerByCourse.get(c.id) ?? null,
    registrationId: registeredIds.get(c.id) ?? null,
    /** Results already submitted — the course is closed to new registrations. */
    locked: lockedCourseIds.has(c.id),
  }));

  return {
    semester,
    student: {
      fullName: user.fullName,
      matricNumber: profile.matricNumber,
      level: profile.level,
      program: { id: program.id, name: program.name },
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
    },
    maxUnits: ACADEMIC_POLICY.MAX_UNITS_PER_SEMESTER,
    registeredUnits: items.filter((c) => c.registrationId).reduce((sum, c) => sum + c.units, 0),
    courses: items,
  };
}

/**
 * Registers the student for the selected courses in the current semester.
 *
 * Runs in a transaction that row-locks the student's profile, so two
 * concurrent submissions (double click, two tabs) are serialised: the
 * second one sees the first one's registrations and the unit-cap check
 * can't be bypassed. The unique index on (student, course, semester) is the
 * final backstop against duplicates.
 */
export async function registerCourses(actor: Actor, courseIds: string[]) {
  return sequelize.transaction(async (transaction) => {
    const semester = await requireCurrentSemester(transaction);
    if (!semester.registrationOpen) throw BusinessRule('Course registration is closed for this semester');

    await StudentProfile.findOne({ where: { userId: actor.id }, transaction, lock: transaction.LOCK.UPDATE });
    const { profile, program } = await loadStudent(actor.id, transaction);

    const eligible = new Map(
      (await findEligibleCourses(program.id, profile.level, semester.type, transaction)).map((c) => [c.id, c]),
    );
    const ineligible = courseIds.filter((id) => !eligible.has(id));
    if (ineligible.length) {
      throw BusinessRule('Some selected courses are not available for your programme, level or semester', {
        courseIds: ineligible,
      });
    }

    const existing = await CourseRegistration.findAll({
      where: { studentId: actor.id, semesterId: semester.id },
      include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'units'] }],
      transaction,
    });
    const duplicates = existing.filter((r) => courseIds.includes(r.courseId));
    if (duplicates.length) {
      throw Conflict(
        `You are already registered for ${duplicates.map((d) => d.course!.code).join(', ')} this semester`,
      );
    }

    const lockedSheets = await ResultSheet.findAll({
      where: { semesterId: semester.id, courseId: { [Op.in]: courseIds }, status: { [Op.in]: ['SUBMITTED', 'APPROVED'] } },
      include: [{ model: Course, as: 'course', attributes: ['code'] }],
      transaction,
    });
    if (lockedSheets.length) {
      throw BusinessRule(
        `Results have already been submitted for ${lockedSheets.map((s) => s.course!.code).join(', ')}; registration is closed for these courses`,
      );
    }

    const currentUnits = existing.reduce((sum, r) => sum + (r.course?.units ?? 0), 0);
    const newUnits = courseIds.reduce((sum, id) => sum + eligible.get(id)!.units, 0);
    if (currentUnits + newUnits > ACADEMIC_POLICY.MAX_UNITS_PER_SEMESTER) {
      throw BusinessRule(
        `This registration would bring you to ${currentUnits + newUnits} units; the maximum is ${ACADEMIC_POLICY.MAX_UNITS_PER_SEMESTER}`,
      );
    }

    const created = await CourseRegistration.bulkCreate(
      courseIds.map((courseId) => ({ studentId: actor.id, courseId, semesterId: semester.id })),
      { transaction },
    );

    await audit(
      {
        actor,
        action: AuditAction.COURSES_REGISTERED,
        entityType: 'course_registration',
        entityId: null,
        departmentId: actor.departmentId,
        metadata: {
          semesterId: semester.id,
          courses: courseIds.map((id) => eligible.get(id)!.code),
          totalUnits: currentUnits + newUnits,
        },
      },
      transaction,
    );

    return { registered: created.length, totalUnits: currentUnits + newUnits };
  });
}

export async function dropCourse(actor: Actor, registrationId: string) {
  return sequelize.transaction(async (transaction) => {
    const registration = await CourseRegistration.findByPk(registrationId, {
      include: [{ model: Course, as: 'course', attributes: ['code'] }],
      transaction,
      // Lock only the registration row (Postgres can't lock the nullable side of a join).
      lock: { level: transaction.LOCK.UPDATE, of: CourseRegistration },
    });
    if (!registration || registration.studentId !== actor.id) throw NotFound('Registration');

    const semester = await requireCurrentSemester(transaction);
    if (registration.semesterId !== semester.id) throw BusinessRule('Only current-semester courses can be dropped');
    if (!semester.registrationOpen) throw BusinessRule('Course registration is closed for this semester');

    const entry = await ResultEntry.findOne({ where: { registrationId }, transaction });
    if (entry) throw BusinessRule('Results have already been recorded for this course; it can no longer be dropped');

    await registration.destroy({ transaction });
    await audit(
      {
        actor,
        action: AuditAction.COURSE_DROPPED,
        entityType: 'course_registration',
        entityId: registrationId,
        departmentId: actor.departmentId,
        metadata: { course: registration.course?.code, semesterId: semester.id },
      },
      transaction,
    );
  });
}

/** The student's registration slip for a semester (defaults to the current one). */
export async function getMyRegistrations(actor: Actor, semesterId?: string) {
  const semester = semesterId ? serializeSemester(await findSemester(semesterId)) : await requireCurrentSemester();
  const { user, profile, program } = await loadStudent(actor.id);

  const registrations = await CourseRegistration.findAll({
    where: { studentId: actor.id, semesterId: semester.id },
    include: [{ model: Course, as: 'course', include: [{ model: Department, as: 'department', attributes: ['code'] }] }],
    order: [[{ model: Course, as: 'course' }, 'code', 'ASC']],
  });

  return {
    semester,
    student: {
      fullName: user.fullName,
      email: user.email,
      matricNumber: profile.matricNumber,
      level: profile.level,
      program: program.name,
      department: user.department?.name ?? null,
    },
    registrations: registrations.map((r) => ({
      id: r.id,
      registeredAt: r.createdAt,
      course: {
        id: r.course!.id,
        code: r.course!.code,
        title: r.course!.title,
        units: r.course!.units,
        department: r.course!.department?.code ?? null,
      },
    })),
    totalUnits: registrations.reduce((sum, r) => sum + r.course!.units, 0),
  };
}

/** Registration listing for staff. Department admins see their department's students only. */
export async function listRegistrations(actor: Actor, query: z.infer<typeof ListRegistrationsQuery>) {
  const semesterId = query.semesterId ?? (await requireCurrentSemester()).id;
  const where: WhereOptions = { semesterId };
  if (query.courseId) Object.assign(where, { courseId: query.courseId });
  if (query.studentId) Object.assign(where, { studentId: query.studentId });

  const studentWhere: WhereOptions = {};

  if (actor.role === 'LECTURER') {
    if (!query.courseId) throw Forbidden('Lecturers can only view class lists for their own courses');
    const allocation = await CourseAllocation.findOne({
      where: { courseId: query.courseId, semesterId, lecturerId: actor.id },
    });
    if (!allocation) throw Forbidden('This course is not allocated to you');
  } else {
    const departmentId = scopedDepartmentId(actor, query.departmentId);
    if (departmentId) Object.assign(studentWhere, { departmentId });
  }

  const profileWhere: WhereOptions = {};
  if (query.level) Object.assign(profileWhere, { level: query.level });
  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, '\\$&')}%`;
    Object.assign(where, {
      [Op.or]: [
        { '$student.first_name$': { [Op.iLike]: term } },
        { '$student.last_name$': { [Op.iLike]: term } },
        { '$student.studentProfile.matric_number$': { [Op.iLike]: term } },
        { '$course.code$': { [Op.iLike]: term } },
      ],
    });
  }

  const { rows, count } = await CourseRegistration.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: 'student',
        where: studentWhere,
        attributes: ['id', 'firstName', 'lastName', 'email', 'departmentId'],
        include: [
          {
            model: StudentProfile,
            as: 'studentProfile',
            where: profileWhere,
            attributes: ['matricNumber', 'level'],
            include: [{ model: Program, as: 'program', attributes: ['code', 'name'] }],
          },
        ],
      },
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'units'] },
      { model: Semester, as: 'semester', include: [{ model: AcademicSession, as: 'session' }] },
    ],
    order: [
      [{ model: Course, as: 'course' }, 'code', 'ASC'],
      [{ model: User, as: 'student' }, 'lastName', 'ASC'],
    ],
    subQuery: false,
    distinct: true,
    ...toLimitOffset(query),
  });

  return paginated(
    rows.map((r) => ({
      id: r.id,
      registeredAt: r.createdAt,
      student: {
        id: r.student!.id,
        fullName: r.student!.fullName,
        email: r.student!.email,
        matricNumber: r.student!.studentProfile?.matricNumber ?? null,
        level: r.student!.studentProfile?.level ?? null,
        program: r.student!.studentProfile?.program?.code ?? null,
      },
      course: { id: r.course!.id, code: r.course!.code, title: r.course!.title, units: r.course!.units },
      semester: r.semester ? serializeSemester(r.semester) : null,
    })),
    count,
    query,
  );
}
