import { Op, literal, type Transaction, type WhereOptions } from 'sequelize';
import type { z } from 'zod';
import { EDITABLE_RESULT_STATUSES, type ResultStatus } from '../../domain/enums.js';
import { classOfDegree, computeGpa, computeGrade, type GradeBand } from '../../domain/grading.js';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule, Forbidden, NotFound } from '../../lib/errors.js';
import {
  AcademicSession,
  AuditLog,
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
import { isSuperAdmin, scopedDepartmentId } from '../../rbac/scope.js';
import { findSemester, requireCurrentSemester, semesterLabel, serializeSemester } from '../calendar/calendar.service.js';
import { getGradeScale } from '../settings/settings.service.js';
import type { ListSheetsQuery, SaveEntriesBody } from './results.schemas.js';

// ── Context & access rules ──────────────────────────────────────────────────

interface SheetContext {
  course: Course;
  semester: Semester;
  allocation: CourseAllocation | null;
  sheet: ResultSheet | null;
}

async function loadContext(courseId: string, semesterId: string, transaction?: Transaction): Promise<SheetContext> {
  const [course, semester] = await Promise.all([
    Course.findByPk(courseId, {
      include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
      transaction,
    }),
    Semester.findByPk(semesterId, { include: [{ model: AcademicSession, as: 'session' }], transaction }),
  ]);
  if (!course) throw NotFound('Course');
  if (!semester) throw NotFound('Semester');

  const [allocation, sheet] = await Promise.all([
    CourseAllocation.findOne({
      where: { courseId, semesterId },
      include: [
        {
          model: User,
          as: 'lecturer',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{ model: LecturerProfile, as: 'lecturerProfile', attributes: ['title', 'staffNumber'] }],
        },
      ],
      transaction,
    }),
    // Row-lock the sheet inside write transactions so concurrent edit/approve can't interleave.
    ResultSheet.findOne({
      where: { courseId, semesterId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    }),
  ]);

  return { course, semester, allocation, sheet };
}

const isAllocatedLecturer = (actor: Actor, ctx: SheetContext) =>
  actor.role === 'LECTURER' && ctx.allocation?.lecturerId === actor.id;

const isDepartmentAdminFor = (actor: Actor, ctx: SheetContext) =>
  actor.role === 'DEPT_ADMIN' && actor.departmentId === ctx.course.departmentId;

function capabilities(actor: Actor, ctx: SheetContext) {
  const status = ctx.sheet?.status ?? null;
  const editable = status === null || EDITABLE_RESULT_STATUSES.includes(status);
  return {
    canView: isSuperAdmin(actor) || isDepartmentAdminFor(actor, ctx) || isAllocatedLecturer(actor, ctx),
    canEdit: isAllocatedLecturer(actor, ctx) && editable,
    canSubmit: isAllocatedLecturer(actor, ctx) && editable && status !== null,
    // Business rule: lecturers never approve their own results (also enforced by a DB CHECK constraint).
    canReview: isDepartmentAdminFor(actor, ctx) && status === 'SUBMITTED' && ctx.sheet?.lecturerId !== actor.id,
    canReopen: (isDepartmentAdminFor(actor, ctx) || isSuperAdmin(actor)) && status === 'APPROVED',
  };
}

function assertCan(actor: Actor, ctx: SheetContext, ability: keyof ReturnType<typeof capabilities>, message: string) {
  if (!capabilities(actor, ctx)[ability]) throw Forbidden(message);
}

// ── Read models ─────────────────────────────────────────────────────────────

async function loadRoster(courseId: string, semesterId: string, transaction?: Transaction) {
  return CourseRegistration.findAll({
    where: { courseId, semesterId },
    include: [
      {
        model: User,
        as: 'student',
        attributes: ['id', 'firstName', 'lastName', 'email'],
        include: [
          {
            model: StudentProfile,
            as: 'studentProfile',
            attributes: ['matricNumber', 'level'],
            include: [{ model: Program, as: 'program', attributes: ['code'] }],
          },
        ],
      },
      { model: ResultEntry, as: 'resultEntry' },
    ],
    order: [[{ model: User, as: 'student' }, { model: StudentProfile, as: 'studentProfile' }, 'matricNumber', 'ASC']],
    transaction,
  });
}

export function summarise(entries: { totalScore: number | null; grade: string | null; gradePoint: number | null }[]) {
  const graded = entries.filter((e) => e.totalScore !== null) as { totalScore: number; grade: string; gradePoint: number }[];
  const totals = graded.map((e) => e.totalScore);
  const distribution: Record<string, number> = {};
  for (const e of graded) distribution[e.grade] = (distribution[e.grade] ?? 0) + 1;
  const passed = graded.filter((e) => e.gradePoint > 0).length;
  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    registered: entries.length,
    graded: graded.length,
    average: graded.length ? round(totals.reduce((a, b) => a + b, 0) / graded.length) : null,
    highest: graded.length ? Math.max(...totals) : null,
    lowest: graded.length ? Math.min(...totals) : null,
    passRate: graded.length ? round((passed / graded.length) * 100) : null,
    distribution,
  };
}

async function buildSheetView(actor: Actor, ctx: SheetContext, transaction?: Transaction) {
  const roster = await loadRoster(ctx.course.id, ctx.semester.id, transaction);
  const caps = capabilities(actor, ctx);

  // Draft scores are work in progress: only the responsible lecturer sees them until submission.
  const hideScores = !isAllocatedLecturer(actor, ctx) && (ctx.sheet?.status ?? 'DRAFT') === 'DRAFT';

  const rows = roster.map((r) => {
    const e = r.resultEntry;
    return {
      registrationId: r.id,
      student: {
        id: r.student!.id,
        fullName: r.student!.fullName,
        matricNumber: r.student!.studentProfile?.matricNumber ?? '',
        level: r.student!.studentProfile?.level ?? null,
        program: r.student!.studentProfile?.program?.code ?? null,
      },
      caScore: hideScores ? null : (e?.caScore ?? null),
      examScore: hideScores ? null : (e?.examScore ?? null),
      totalScore: hideScores ? null : (e?.totalScore ?? null),
      grade: hideScores ? null : (e?.grade ?? null),
      gradePoint: hideScores ? null : (e?.gradePoint ?? null),
    };
  });

  const lecturer = ctx.allocation?.lecturer;
  return {
    sheetId: ctx.sheet?.id ?? null,
    status: (ctx.sheet?.status ?? 'NOT_STARTED') as ResultStatus | 'NOT_STARTED',
    course: {
      id: ctx.course.id,
      code: ctx.course.code,
      title: ctx.course.title,
      units: ctx.course.units,
      level: ctx.course.level,
      department: ctx.course.department ? { id: ctx.course.department.id, code: ctx.course.department.code, name: ctx.course.department.name } : null,
    },
    semester: serializeSemester(ctx.semester),
    lecturer: lecturer
      ? { id: lecturer.id, fullName: `${lecturer.lecturerProfile?.title ?? ''} ${lecturer.fullName}`.trim(), email: lecturer.email }
      : null,
    submittedAt: ctx.sheet?.submittedAt ?? null,
    reviewedAt: ctx.sheet?.reviewedAt ?? null,
    reviewComment: ctx.sheet?.reviewComment ?? null,
    rows,
    summary: summarise(rows),
    capabilities: caps,
  };
}

export async function getSheetView(actor: Actor, courseId: string, semesterId: string) {
  const ctx = await loadContext(courseId, semesterId);
  assertCan(actor, ctx, 'canView', 'You do not have access to results for this course');
  return buildSheetView(actor, ctx);
}

export async function getSheetViewById(actor: Actor, sheetId: string) {
  const sheet = await ResultSheet.findByPk(sheetId, { attributes: ['courseId', 'semesterId'] });
  if (!sheet) throw NotFound('Result sheet');
  return getSheetView(actor, sheet.courseId, sheet.semesterId);
}

// ── Lecturer: entry & submission ────────────────────────────────────────────

const hasScores = (e: { caScore: number | null; examScore: number | null }) =>
  e.caScore !== null && e.examScore !== null;

function grade(caScore: number | null, examScore: number | null, scale: GradeBand[]) {
  if (caScore === null || examScore === null) return { totalScore: null, grade: null, gradePoint: null };
  return computeGrade(caScore, examScore, scale);
}

/**
 * Saves CA/exam scores as a draft. Creates the result sheet on first save.
 * Every change is diffed and written to the audit trail (business rule #8).
 */
export async function saveEntries(
  actor: Actor,
  courseId: string,
  semesterId: string,
  input: z.infer<typeof SaveEntriesBody>,
) {
  return sequelize.transaction(async (transaction) => {
    const ctx = await loadContext(courseId, semesterId, transaction);
    if (!isAllocatedLecturer(actor, ctx)) {
      throw Forbidden('You can only enter results for courses allocated to you');
    }
    assertCan(actor, ctx, 'canEdit', 'These results have been submitted and are locked for editing');

    const sheet = ctx.sheet ?? (await ResultSheet.create({ courseId, semesterId, lecturerId: actor.id, submittedAt: null, reviewedAt: null, reviewedById: null, reviewComment: null }, { transaction }));
    ctx.sheet = sheet;

    const roster = await loadRoster(courseId, semesterId, transaction);
    const byRegistration = new Map(roster.map((r) => [r.id, r]));
    const unknown = input.entries.filter((e) => !byRegistration.has(e.registrationId));
    if (unknown.length) {
      throw BusinessRule('Some rows do not belong to students registered for this course', {
        registrationIds: unknown.map((u) => u.registrationId),
      });
    }

    const scale = await getGradeScale(transaction);
    const changes: Record<string, unknown>[] = [];

    for (const row of input.entries) {
      const registration = byRegistration.get(row.registrationId)!;
      const existing = registration.resultEntry;
      const before = existing ? { caScore: existing.caScore, examScore: existing.examScore } : null;
      const unchanged = before?.caScore === row.caScore && before?.examScore === row.examScore;
      if (unchanged || (!existing && row.caScore === null && row.examScore === null)) continue;

      const values = { caScore: row.caScore, examScore: row.examScore, ...grade(row.caScore, row.examScore, scale) };
      if (existing) {
        await existing.update(values, { transaction });
      } else {
        await ResultEntry.create(
          { sheetId: sheet.id, registrationId: registration.id, studentId: registration.studentId, ...values },
          { transaction },
        );
      }
      changes.push({
        matricNumber: registration.student?.studentProfile?.matricNumber,
        before,
        after: { caScore: row.caScore, examScore: row.examScore, grade: values.grade },
      });
    }

    if (changes.length) {
      sheet.changed('updatedAt', true);
      await sheet.save({ transaction });
      await audit(
        {
          actor,
          action: AuditAction.RESULT_DRAFT_SAVED,
          entityType: 'result_sheet',
          entityId: sheet.id,
          departmentId: ctx.course.departmentId,
          metadata: { courseCode: ctx.course.code, changes },
        },
        transaction,
      );
    }

    return buildSheetView(actor, ctx, transaction);
  });
}

export async function submitSheet(actor: Actor, courseId: string, semesterId: string) {
  return sequelize.transaction(async (transaction) => {
    const ctx = await loadContext(courseId, semesterId, transaction);
    if (!ctx.sheet) throw BusinessRule('Enter and save results before submitting');
    assertCan(actor, ctx, 'canSubmit', 'You cannot submit these results');

    const roster = await loadRoster(courseId, semesterId, transaction);
    if (roster.length === 0) throw BusinessRule('No students are registered for this course');
    const incomplete = roster.filter((r) => !r.resultEntry || !hasScores(r.resultEntry));
    if (incomplete.length) {
      throw BusinessRule(`${incomplete.length} student(s) are missing CA or exam scores`, {
        matricNumbers: incomplete.map((r) => r.student?.studentProfile?.matricNumber),
      });
    }

    const previousStatus = ctx.sheet.status;
    await ctx.sheet.update(
      { status: 'SUBMITTED', submittedAt: new Date(), reviewedAt: null, reviewedById: null },
      { transaction },
    );
    await audit(
      {
        actor,
        action: AuditAction.RESULT_SUBMITTED,
        entityType: 'result_sheet',
        entityId: ctx.sheet.id,
        departmentId: ctx.course.departmentId,
        metadata: {
          courseCode: ctx.course.code,
          from: previousStatus,
          students: roster.length,
          summary: summarise(roster.map((r) => r.resultEntry!)),
        },
      },
      transaction,
    );
    return buildSheetView(actor, ctx, transaction);
  });
}

// ── Department review ───────────────────────────────────────────────────────

async function contextForSheet(sheetId: string, transaction: Transaction) {
  const sheet = await ResultSheet.findByPk(sheetId, { attributes: ['courseId', 'semesterId'], transaction });
  if (!sheet) throw NotFound('Result sheet');
  return loadContext(sheet.courseId, sheet.semesterId, transaction);
}

/**
 * Approves submitted results. Grades are recomputed against the current scale
 * at the moment of approval and then frozen on each entry, so later changes to
 * the grading scale never silently alter an approved transcript.
 */
export async function approveSheet(actor: Actor, sheetId: string, comment?: string) {
  return sequelize.transaction(async (transaction) => {
    const ctx = await contextForSheet(sheetId, transaction);
    if (ctx.sheet!.status !== 'SUBMITTED') throw BusinessRule('Only submitted results can be approved');
    assertCan(actor, ctx, 'canReview', 'Only the department administrator for this course can approve its results');

    const scale = await getGradeScale(transaction);
    const entries = await ResultEntry.findAll({ where: { sheetId }, transaction });
    for (const entry of entries) {
      await entry.update(grade(entry.caScore, entry.examScore, scale), { transaction });
    }

    await ctx.sheet!.update(
      { status: 'APPROVED', reviewedAt: new Date(), reviewedById: actor.id, reviewComment: comment || null },
      { transaction },
    );
    await audit(
      {
        actor,
        action: AuditAction.RESULT_APPROVED,
        entityType: 'result_sheet',
        entityId: sheetId,
        departmentId: ctx.course.departmentId,
        metadata: { courseCode: ctx.course.code, comment: comment || null, students: entries.length },
      },
      transaction,
    );
    return buildSheetView(actor, ctx, transaction);
  });
}

export async function rejectSheet(actor: Actor, sheetId: string, comment: string) {
  return sequelize.transaction(async (transaction) => {
    const ctx = await contextForSheet(sheetId, transaction);
    if (ctx.sheet!.status !== 'SUBMITTED') throw BusinessRule('Only submitted results can be rejected');
    assertCan(actor, ctx, 'canReview', 'Only the department administrator for this course can reject its results');

    await ctx.sheet!.update(
      { status: 'REJECTED', reviewedAt: new Date(), reviewedById: actor.id, reviewComment: comment },
      { transaction },
    );
    await audit(
      {
        actor,
        action: AuditAction.RESULT_REJECTED,
        entityType: 'result_sheet',
        entityId: sheetId,
        departmentId: ctx.course.departmentId,
        metadata: { courseCode: ctx.course.code, comment },
      },
      transaction,
    );
    return buildSheetView(actor, ctx, transaction);
  });
}

/**
 * "Authorised reopening": an approved sheet is returned to the lecturer for
 * correction. Students immediately stop seeing the results until re-approval.
 */
export async function reopenSheet(actor: Actor, sheetId: string, reason: string) {
  return sequelize.transaction(async (transaction) => {
    const ctx = await contextForSheet(sheetId, transaction);
    if (ctx.sheet!.status !== 'APPROVED') throw BusinessRule('Only approved results can be reopened');
    assertCan(actor, ctx, 'canReopen', 'You are not authorised to reopen these results');

    await ctx.sheet!.update(
      { status: 'REJECTED', reviewedAt: new Date(), reviewComment: `Reopened for correction: ${reason}` },
      { transaction },
    );
    await audit(
      {
        actor,
        action: AuditAction.RESULT_REOPENED,
        entityType: 'result_sheet',
        entityId: sheetId,
        departmentId: ctx.course.departmentId,
        metadata: { courseCode: ctx.course.code, reason },
      },
      transaction,
    );
    return buildSheetView(actor, ctx, transaction);
  });
}

export async function getSheetHistory(actor: Actor, sheetId: string) {
  const sheet = await ResultSheet.findByPk(sheetId, { attributes: ['courseId', 'semesterId'] });
  if (!sheet) throw NotFound('Result sheet');
  const ctx = await loadContext(sheet.courseId, sheet.semesterId);
  assertCan(actor, ctx, 'canView', 'You do not have access to results for this course');

  const logs = await AuditLog.findAll({
    where: { entityType: 'result_sheet', entityId: sheetId },
    include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['createdAt', 'DESC']],
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    actor: l.actor ? { id: l.actor.id, fullName: l.actor.fullName, role: l.actorRole } : null,
    metadata: l.metadata,
    createdAt: l.createdAt,
  }));
}

// ── Listings ────────────────────────────────────────────────────────────────

/** A lecturer's teaching load for a semester with result progress per course. */
export async function getTeachingLoad(actor: Actor, semesterId?: string) {
  const semester = semesterId ? serializeSemester(await findSemester(semesterId)) : await requireCurrentSemester();
  const allocations = await CourseAllocation.findAll({
    where: { lecturerId: actor.id, semesterId: semester.id },
    include: [{ model: Course, as: 'course', include: [{ model: Department, as: 'department', attributes: ['code'] }] }],
    order: [[{ model: Course, as: 'course' }, 'code', 'ASC']],
  });
  const courseIds = allocations.map((a) => a.courseId);

  const [sheets, counts] = await Promise.all([
    ResultSheet.findAll({ where: { semesterId: semester.id, courseId: { [Op.in]: courseIds } } }),
    CourseRegistration.count({
      where: { semesterId: semester.id, courseId: { [Op.in]: courseIds } },
      group: ['courseId'],
    }) as unknown as Promise<{ courseId: string; count: number }[]>,
  ]);
  const sheetByCourse = new Map(sheets.map((s) => [s.courseId, s]));
  const countByCourse = new Map(counts.map((c) => [c.courseId, Number(c.count)]));

  return {
    semester,
    courses: allocations.map((a) => {
      const sheet = sheetByCourse.get(a.courseId);
      return {
        allocationId: a.id,
        course: {
          id: a.course!.id,
          code: a.course!.code,
          title: a.course!.title,
          units: a.course!.units,
          level: a.course!.level,
          department: a.course!.department?.code ?? null,
        },
        registeredStudents: countByCourse.get(a.courseId) ?? 0,
        resultStatus: sheet?.status ?? 'NOT_STARTED',
        sheetId: sheet?.id ?? null,
        reviewComment: sheet?.reviewComment ?? null,
        submittedAt: sheet?.submittedAt ?? null,
      };
    }),
  };
}

/** Result sheets for department/university oversight. */
export async function listSheets(actor: Actor, query: z.infer<typeof ListSheetsQuery>) {
  const where: WhereOptions = {};
  if (query.semesterId) Object.assign(where, { semesterId: query.semesterId });
  if (query.status) Object.assign(where, { status: query.status });

  const courseWhere: WhereOptions = {};
  if (actor.role === 'LECTURER') {
    Object.assign(where, { lecturerId: actor.id });
  } else {
    const departmentId = scopedDepartmentId(actor, query.departmentId);
    if (departmentId) Object.assign(courseWhere, { departmentId });
  }

  const sheets = await ResultSheet.findAll({
    where,
    include: [
      {
        model: Course,
        as: 'course',
        where: courseWhere,
        attributes: ['id', 'code', 'title', 'units', 'level', 'departmentId'],
        include: [{ model: Department, as: 'department', attributes: ['code', 'name'] }],
      },
      { model: Semester, as: 'semester', include: [{ model: AcademicSession, as: 'session' }] },
      {
        model: User,
        as: 'lecturer',
        attributes: ['id', 'firstName', 'lastName'],
        include: [{ model: LecturerProfile, as: 'lecturerProfile', attributes: ['title'] }],
      },
      { model: User, as: 'reviewedBy', attributes: ['id', 'firstName', 'lastName'] },
    ],
    // Work awaiting review first, then corrections, then finished, then drafts.
    order: [
      [literal(`CASE "ResultSheet"."status" WHEN 'SUBMITTED' THEN 0 WHEN 'REJECTED' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END`), 'ASC'],
      ['updatedAt', 'DESC'],
    ],
  });

  const entryCounts = (await ResultEntry.count({
    where: { sheetId: { [Op.in]: sheets.map((s) => s.id) } },
    group: ['sheetId'],
  })) as unknown as { sheetId: string; count: number }[];
  const countBySheet = new Map(entryCounts.map((c) => [c.sheetId, Number(c.count)]));

  return sheets.map((s) => ({
    id: s.id,
    status: s.status,
    course: {
      id: s.course!.id,
      code: s.course!.code,
      title: s.course!.title,
      units: s.course!.units,
      level: s.course!.level,
      department: s.course!.department ? { code: s.course!.department.code, name: s.course!.department.name } : null,
    },
    semester: serializeSemester(s.semester!),
    lecturer: s.lecturer
      ? { id: s.lecturer.id, fullName: `${s.lecturer.lecturerProfile?.title ?? ''} ${s.lecturer.fullName}`.trim() }
      : null,
    reviewedBy: s.reviewedBy ? { id: s.reviewedBy.id, fullName: s.reviewedBy.fullName } : null,
    entries: countBySheet.get(s.id) ?? 0,
    submittedAt: s.submittedAt,
    reviewedAt: s.reviewedAt,
    reviewComment: s.reviewComment,
    updatedAt: s.updatedAt,
  }));
}

// ── Student results ─────────────────────────────────────────────────────────

/**
 * A student's academic history. Business rule #6: only APPROVED result sheets
 * are ever read here — drafts, submitted and rejected results are invisible.
 */
export async function getStudentResults(studentId: string) {
  const student = await User.findByPk(studentId, {
    include: [
      { model: StudentProfile, as: 'studentProfile', include: [{ model: Program, as: 'program' }] },
      { model: Department, as: 'department' },
    ],
  });
  if (!student?.studentProfile) throw NotFound('Student');

  const entries = await ResultEntry.findAll({
    where: { studentId },
    include: [
      {
        model: ResultSheet,
        as: 'sheet',
        where: { status: 'APPROVED' },
        attributes: ['id', 'status', 'reviewedAt'],
        include: [{ model: Semester, as: 'semester', include: [{ model: AcademicSession, as: 'session' }] }],
      },
      {
        model: CourseRegistration,
        as: 'registration',
        attributes: ['id'],
        include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title', 'units', 'level'] }],
      },
    ],
  });

  const bySemester = new Map<string, { semester: Semester; rows: typeof entries }>();
  for (const e of entries) {
    const sem = e.sheet!.semester!;
    const bucket = bySemester.get(sem.id) ?? { semester: sem, rows: [] };
    bucket.rows.push(e);
    bySemester.set(sem.id, bucket);
  }

  const ordered = [...bySemester.values()].sort((a, b) => {
    const s = a.semester.session!.startDate.localeCompare(b.semester.session!.startDate);
    return s !== 0 ? s : a.semester.type.localeCompare(b.semester.type);
  });

  const cumulative: { units: number; gradePoint: number }[] = [];
  const semesters = ordered.map(({ semester, rows }) => {
    const courses = rows
      .map((e) => ({
        code: e.registration!.course!.code,
        title: e.registration!.course!.title,
        units: e.registration!.course!.units,
        caScore: e.caScore,
        examScore: e.examScore,
        totalScore: e.totalScore,
        grade: e.grade,
        gradePoint: e.gradePoint ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const semesterGpa = computeGpa(courses);
    cumulative.push(...courses);
    const cgpa = computeGpa(cumulative);

    return {
      semester: { id: semester.id, label: semesterLabel(semester.session!.name, semester.type), type: semester.type, session: semester.session!.name },
      courses,
      totalUnits: semesterGpa.totalUnits,
      totalGradePoints: semesterGpa.totalGradePoints,
      gpa: semesterGpa.gpa,
      cumulativeUnits: cgpa.totalUnits,
      cgpa: cgpa.gpa,
    };
  });

  const overall = computeGpa(cumulative);
  return {
    student: {
      fullName: student.fullName,
      matricNumber: student.studentProfile.matricNumber,
      level: student.studentProfile.level,
      program: student.studentProfile.program?.name ?? null,
      department: student.department?.name ?? null,
    },
    semesters: semesters.reverse(), // newest first for display
    cgpa: overall.gpa,
    totalUnits: overall.totalUnits,
    classOfDegree: overall.totalUnits ? classOfDegree(overall.gpa) : null,
  };
}
