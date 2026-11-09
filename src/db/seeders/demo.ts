/**
 * Demo data covering every role and workflow, so the system can be explored without creating records by hand.
 *
 * Calendar
 *   2025/2026  — completed session; every result is APPROVED (gives students a CGPA history)
 *   2026/2027  — First Semester is CURRENT with registration OPEN
 *
 * Current-semester result sheets are deliberately left at every stage of the workflow:
 *   CSC201  DRAFT      (lecturer@ — partially entered, can be completed and submitted)
 *   CSC203  —          (lecturer@ — not started)
 *   CSC101  REJECTED   (lecturer@ — returned by the department with feedback)
 *   CSC205  SUBMITTED  (awaiting csc.admin@ approval)
 *   CSC207  APPROVED   (visible to registered students)
 *   MTH201  SUBMITTED  (awaiting mth.admin@ approval)
 *
 * The main demo student (student@) is NOT registered for the current semester,
 * so the course-registration workflow can be demonstrated end to end.
 */
import type { Transaction } from 'sequelize';
import { DEFAULT_GRADE_SCALE, computeGrade } from '../../domain/grading.js';
import type { ResultStatus, Role, SemesterType } from '../../domain/enums.js';
import { logger } from '../../lib/logger.js';
import { hashPassword } from '../../lib/password.js';
import {
  AcademicSession,
  AuditLog,
  Course,
  CourseAllocation,
  CourseRegistration,
  Department,
  Faculty,
  GradeScale,
  LecturerProfile,
  Program,
  ResultEntry,
  ResultSheet,
  Semester,
  StudentProfile,
  User,
  sequelize,
} from '../../models/index.js';

export const DEMO_PASSWORD = 'Password123!';

/** Deterministic PRNG so the demo data is identical on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261109);
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

/** Each student gets an "ability" so their grades are consistent across courses. */
function scoresFor(ability: number) {
  const ca = Math.min(30, Math.max(5, Math.round(ability * 30 + between(-6, 5))));
  const exam = Math.min(70, Math.max(10, Math.round(ability * 70 + between(-16, 12))));
  return { caScore: ca, examScore: exam };
}

async function truncateAll(transaction: Transaction) {
  await sequelize.query(
    `TRUNCATE audit_logs, result_entries, result_sheets, course_registrations, course_allocations,
              course_programs, courses, semesters, academic_sessions, lecturer_profiles, student_profiles,
              sessions, users, programs, departments, faculties, grade_scales RESTART IDENTITY CASCADE`,
    { transaction },
  );
}

export async function seedDemoData({ fresh }: { fresh: boolean }): Promise<void> {
  const existing = await User.count();
  if (existing > 0 && !fresh) {
    logger.info('Database already contains data — skipping seed (use --fresh to wipe and reseed)');
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await sequelize.transaction(async (transaction) => {
    const t = { transaction };
    if (fresh) await truncateAll(transaction);

    // ── Grading scale ──────────────────────────────────────────────────────
    await GradeScale.bulkCreate([...DEFAULT_GRADE_SCALE], t);

    // ── Organisation ───────────────────────────────────────────────────────
    const science = await Faculty.create({ name: 'Faculty of Science', code: 'SCI' }, t);
    const engineering = await Faculty.create({ name: 'Faculty of Engineering', code: 'ENG' }, t);

    const csc = await Department.create({ facultyId: science.id, name: 'Computer Science', code: 'CSC' }, t);
    const mth = await Department.create({ facultyId: science.id, name: 'Mathematics', code: 'MTH' }, t);
    const eee = await Department.create(
      { facultyId: engineering.id, name: 'Electrical & Electronics Engineering', code: 'EEE' },
      t,
    );

    const bscCsc = await Program.create(
      { departmentId: csc.id, name: 'B.Sc. Computer Science', code: 'BSC-CSC', degree: 'B.Sc.', durationYears: 4 },
      t,
    );
    const bscMth = await Program.create(
      { departmentId: mth.id, name: 'B.Sc. Mathematics', code: 'BSC-MTH', degree: 'B.Sc.', durationYears: 4 },
      t,
    );
    const bengEee = await Program.create(
      { departmentId: eee.id, name: 'B.Eng. Electrical & Electronics Engineering', code: 'BENG-EEE', degree: 'B.Eng.', durationYears: 5 },
      t,
    );

    // ── Calendar ───────────────────────────────────────────────────────────
    const s2526 = await AcademicSession.create(
      { name: '2025/2026', startDate: '2025-09-15', endDate: '2026-08-31', isCurrent: false },
      t,
    );
    const s2627 = await AcademicSession.create(
      { name: '2026/2027', startDate: '2026-09-14', endDate: '2027-08-31', isCurrent: true },
      t,
    );
    const past1 = await Semester.create(
      { sessionId: s2526.id, type: 'FIRST', startDate: '2025-09-15', endDate: '2026-01-30' },
      t,
    );
    const past2 = await Semester.create(
      { sessionId: s2526.id, type: 'SECOND', startDate: '2026-02-09', endDate: '2026-07-31' },
      t,
    );
    const current = await Semester.create(
      {
        sessionId: s2627.id,
        type: 'FIRST',
        startDate: '2026-09-14',
        endDate: '2027-01-29',
        isCurrent: true,
        registrationOpen: true,
      },
      t,
    );
    await Semester.create({ sessionId: s2627.id, type: 'SECOND', startDate: '2027-02-08', endDate: '2027-07-30' }, t);

    // ── Staff ──────────────────────────────────────────────────────────────
    const makeUser = (
      email: string,
      firstName: string,
      lastName: string,
      role: Role,
      departmentId: string | null,
      phone: string | null = null,
    ) => User.create({ email, passwordHash, firstName, lastName, role, departmentId, phone, lastLoginAt: null }, t);

    const superAdmin = await makeUser('admin@uemp.edu.ng', 'Olufemi', 'Adebayo', 'SUPER_ADMIN', null, '+2348030000001');
    const cscAdmin = await makeUser('csc.admin@uemp.edu.ng', 'Ngozi', 'Okafor', 'DEPT_ADMIN', csc.id, '+2348030000002');
    const mthAdmin = await makeUser('mth.admin@uemp.edu.ng', 'Ibrahim', 'Musa', 'DEPT_ADMIN', mth.id, '+2348030000003');
    await makeUser('eee.admin@uemp.edu.ng', 'Grace', 'Etim', 'DEPT_ADMIN', eee.id, '+2348030000004');

    const makeLecturer = async (
      email: string,
      firstName: string,
      lastName: string,
      departmentId: string,
      staffNumber: string,
      title: string,
      rank: string,
    ) => {
      const user = await makeUser(email, firstName, lastName, 'LECTURER', departmentId);
      await LecturerProfile.create({ userId: user.id, staffNumber, title, rank }, t);
      return user;
    };

    const eze = await makeLecturer('lecturer@uemp.edu.ng', 'Chinedu', 'Eze', csc.id, 'UEMP/STF/0101', 'Dr.', 'Senior Lecturer');
    const bello = await makeLecturer('aisha.bello@uemp.edu.ng', 'Aisha', 'Bello', csc.id, 'UEMP/STF/0102', 'Dr.', 'Lecturer I');
    const bakare = await makeLecturer('tunde.bakare@uemp.edu.ng', 'Tunde', 'Bakare', csc.id, 'UEMP/STF/0103', 'Mr.', 'Lecturer II');
    const nwosu = await makeLecturer('emeka.nwosu@uemp.edu.ng', 'Emeka', 'Nwosu', mth.id, 'UEMP/STF/0201', 'Prof.', 'Professor');
    const yusuf = await makeLecturer('fatima.yusuf@uemp.edu.ng', 'Fatima', 'Yusuf', mth.id, 'UEMP/STF/0202', 'Dr.', 'Senior Lecturer');
    await makeLecturer('segun.afolabi@uemp.edu.ng', 'Segun', 'Afolabi', eee.id, 'UEMP/STF/0301', 'Engr.', 'Lecturer I');

    // ── Courses ────────────────────────────────────────────────────────────
    const makeCourse = async (
      departmentId: string,
      code: string,
      title: string,
      units: number,
      level: number,
      semesterType: SemesterType,
      programs: Program[],
    ) => {
      const course = await Course.create({ departmentId, code, title, units, level, semesterType, description: null }, t);
      await course.setPrograms(programs, t);
      return course;
    };

    const c = {
      CSC101: await makeCourse(csc.id, 'CSC101', 'Introduction to Computer Science', 3, 100, 'FIRST', [bscCsc]),
      CSC103: await makeCourse(csc.id, 'CSC103', 'Introduction to Programming', 3, 100, 'FIRST', [bscCsc]),
      CSC102: await makeCourse(csc.id, 'CSC102', 'Introduction to Problem Solving', 3, 100, 'SECOND', [bscCsc]),
      CSC104: await makeCourse(csc.id, 'CSC104', 'Computer Programming II', 3, 100, 'SECOND', [bscCsc]),
      CSC201: await makeCourse(csc.id, 'CSC201', 'Data Structures', 3, 200, 'FIRST', [bscCsc]),
      CSC203: await makeCourse(csc.id, 'CSC203', 'Discrete Structures', 3, 200, 'FIRST', [bscCsc]),
      CSC205: await makeCourse(csc.id, 'CSC205', 'Computer Architecture & Organisation', 3, 200, 'FIRST', [bscCsc]),
      CSC207: await makeCourse(csc.id, 'CSC207', 'Object-Oriented Programming', 3, 200, 'FIRST', [bscCsc]),
      CSC202: await makeCourse(csc.id, 'CSC202', 'Design & Analysis of Algorithms', 3, 200, 'SECOND', [bscCsc]),
      CSC204: await makeCourse(csc.id, 'CSC204', 'Operating Systems I', 3, 200, 'SECOND', [bscCsc]),
      CSC206: await makeCourse(csc.id, 'CSC206', 'Database Systems I', 3, 200, 'SECOND', [bscCsc]),
      MTH101: await makeCourse(mth.id, 'MTH101', 'Elementary Mathematics I', 3, 100, 'FIRST', [bscCsc, bscMth, bengEee]),
      MTH102: await makeCourse(mth.id, 'MTH102', 'Elementary Mathematics II', 3, 100, 'SECOND', [bscCsc, bscMth, bengEee]),
      MTH201: await makeCourse(mth.id, 'MTH201', 'Mathematical Methods I', 3, 200, 'FIRST', [bscCsc, bscMth]),
      MTH203: await makeCourse(mth.id, 'MTH203', 'Linear Algebra I', 3, 200, 'FIRST', [bscMth]),
      MTH202: await makeCourse(mth.id, 'MTH202', 'Mathematical Methods II', 3, 200, 'SECOND', [bscCsc, bscMth]),
      EEE101: await makeCourse(eee.id, 'EEE101', 'Basic Electrical Engineering I', 2, 100, 'FIRST', [bengEee]),
    };

    // ── Students ───────────────────────────────────────────────────────────
    interface DemoStudent {
      user: User;
      ability: number;
      program: Program;
    }
    const makeStudent = async (
      email: string,
      firstName: string,
      lastName: string,
      department: Department,
      program: Program,
      matricNumber: string,
      level: number,
      entryYear: number,
      gender: 'Male' | 'Female',
      ability: number,
    ): Promise<DemoStudent> => {
      const user = await makeUser(email, firstName, lastName, 'STUDENT', department.id, `+23481${between(10000000, 99999999)}`);
      await StudentProfile.create(
        {
          userId: user.id,
          programId: program.id,
          matricNumber,
          level,
          entryYear,
          gender,
          dateOfBirth: `${2006 - (level / 100 - 1)}-0${between(1, 9)}-1${between(0, 9)}`,
          address: `${between(1, 99)} University Road, Ibadan`,
        },
        t,
      );
      return { user, ability, program };
    };

    // 200L Computer Science (entered 2025) — the main demo student comes first.
    const adaeze = await makeStudent('student@uemp.edu.ng', 'Adaeze', 'Okonkwo', csc, bscCsc, 'CSC/2025/001', 200, 2025, 'Female', 0.69);
    const csc200 = [
      await makeStudent('chukwuemeka.obi@uemp.edu.ng', 'Chukwuemeka', 'Obi', csc, bscCsc, 'CSC/2025/002', 200, 2025, 'Male', 0.62),
      await makeStudent('zainab.abdullahi@uemp.edu.ng', 'Zainab', 'Abdullahi', csc, bscCsc, 'CSC/2025/003', 200, 2025, 'Female', 0.85),
      await makeStudent('oluwaseun.adeyemi@uemp.edu.ng', 'Oluwaseun', 'Adeyemi', csc, bscCsc, 'CSC/2025/004', 200, 2025, 'Male', 0.55),
      await makeStudent('ifeoma.nnaji@uemp.edu.ng', 'Ifeoma', 'Nnaji', csc, bscCsc, 'CSC/2025/005', 200, 2025, 'Female', 0.7),
      await makeStudent('yusuf.garba@uemp.edu.ng', 'Yusuf', 'Garba', csc, bscCsc, 'CSC/2025/006', 200, 2025, 'Male', 0.45),
    ];
    // 100L Computer Science (entered 2026)
    const csc100 = [
      await makeStudent('temitope.ogunleye@uemp.edu.ng', 'Temitope', 'Ogunleye', csc, bscCsc, 'CSC/2026/001', 100, 2026, 'Female', 0.74),
      await makeStudent('kelechi.uche@uemp.edu.ng', 'Kelechi', 'Uche', csc, bscCsc, 'CSC/2026/002', 100, 2026, 'Male', 0.58),
      await makeStudent('halima.sani@uemp.edu.ng', 'Halima', 'Sani', csc, bscCsc, 'CSC/2026/003', 100, 2026, 'Female', 0.66),
    ];
    // 200L Mathematics
    const mth200 = [
      await makeStudent('blessing.akpan@uemp.edu.ng', 'Blessing', 'Akpan', mth, bscMth, 'MTH/2025/001', 200, 2025, 'Female', 0.72),
      await makeStudent('daniel.okoro@uemp.edu.ng', 'Daniel', 'Okoro', mth, bscMth, 'MTH/2025/002', 200, 2025, 'Male', 0.6),
    ];
    // 100L Electrical Engineering
    const eee100 = [
      await makeStudent('samuel.ojo@uemp.edu.ng', 'Samuel', 'Ojo', eee, bengEee, 'EEE/2026/001', 100, 2026, 'Male', 0.68),
    ];

    // ── Helpers for registrations & results ────────────────────────────────
    const allocate = (course: Course, semester: Semester, lecturer: User, allocatedBy: User) =>
      CourseAllocation.create({ courseId: course.id, semesterId: semester.id, lecturerId: lecturer.id, allocatedById: allocatedBy.id }, t);

    const register = (students: DemoStudent[], courses: Course[], semester: Semester) =>
      CourseRegistration.bulkCreate(
        students.flatMap((s) => courses.map((course) => ({ studentId: s.user.id, courseId: course.id, semesterId: semester.id }))),
        t,
      );

    const logAudit = (
      actor: User,
      action: string,
      sheet: ResultSheet,
      course: Course,
      metadata: Record<string, unknown>,
      createdAt: Date,
    ) =>
      AuditLog.create(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action,
          entityType: 'result_sheet',
          entityId: sheet.id,
          departmentId: course.departmentId,
          metadata: { courseCode: course.code, ...metadata },
          ipAddress: '127.0.0.1',
          createdAt,
        },
        t,
      );

    /**
     * Creates a result sheet for a course in the given state.
     * `completion` < 1 leaves some students without scores (a realistic draft).
     */
    const createSheet = async (opts: {
      course: Course;
      semester: Semester;
      lecturer: User;
      reviewer: User;
      students: DemoStudent[];
      status: ResultStatus;
      completion?: number;
      reviewComment?: string;
      at: Date;
    }) => {
      const sheet = await ResultSheet.create(
        {
          courseId: opts.course.id,
          semesterId: opts.semester.id,
          lecturerId: opts.lecturer.id,
          status: opts.status,
          submittedAt: opts.status === 'DRAFT' ? null : opts.at,
          reviewedAt: ['APPROVED', 'REJECTED'].includes(opts.status) ? new Date(opts.at.getTime() + 86_400_000) : null,
          reviewedById: ['APPROVED', 'REJECTED'].includes(opts.status) ? opts.reviewer.id : null,
          reviewComment: opts.reviewComment ?? null,
        },
        t,
      );

      const registrations = await CourseRegistration.findAll({
        where: { courseId: opts.course.id, semesterId: opts.semester.id },
        ...t,
      });
      const abilityOf = new Map(opts.students.map((s) => [s.user.id, s.ability]));
      const completeCount = Math.ceil(registrations.length * (opts.completion ?? 1));

      await ResultEntry.bulkCreate(
        registrations.slice(0, completeCount).map((r) => {
          const { caScore, examScore } = scoresFor(abilityOf.get(r.studentId) ?? 0.6);
          return {
            sheetId: sheet.id,
            registrationId: r.id,
            studentId: r.studentId,
            caScore,
            examScore,
            ...computeGrade(caScore, examScore, DEFAULT_GRADE_SCALE),
          };
        }),
        t,
      );

      // Matching audit trail so result history screens are populated.
      await logAudit(opts.lecturer, 'result.draft_saved', sheet, opts.course, { students: completeCount }, opts.at);
      if (opts.status !== 'DRAFT') {
        await logAudit(opts.lecturer, 'result.submitted', sheet, opts.course, { students: registrations.length }, opts.at);
      }
      if (opts.status === 'APPROVED') {
        await logAudit(opts.reviewer, 'result.approved', sheet, opts.course, { comment: null }, new Date(opts.at.getTime() + 86_400_000));
      }
      if (opts.status === 'REJECTED') {
        await logAudit(opts.reviewer, 'result.rejected', sheet, opts.course, { comment: opts.reviewComment }, new Date(opts.at.getTime() + 86_400_000));
      }
      return sheet;
    };

    const cscCohort = [adaeze, ...csc200];

    // ── 2025/2026 — completed session (200L students were in 100L) ─────────
    const pastFirst = [c.CSC101, c.CSC103, c.MTH101];
    const pastSecond = [c.CSC102, c.CSC104, c.MTH102];
    await register(cscCohort, pastFirst, past1);
    await register(cscCohort, pastSecond, past2);
    await register(mth200, [c.MTH101], past1);
    await register(mth200, [c.MTH102], past2);

    const pastAllocations: [Course, Semester, User, User][] = [
      [c.CSC101, past1, eze, cscAdmin],
      [c.CSC103, past1, bello, cscAdmin],
      [c.MTH101, past1, nwosu, mthAdmin],
      [c.CSC102, past2, eze, cscAdmin],
      [c.CSC104, past2, bakare, cscAdmin],
      [c.MTH102, past2, yusuf, mthAdmin],
    ];
    for (const [course, semester, lecturer, admin] of pastAllocations) {
      await allocate(course, semester, lecturer, admin);
      await createSheet({
        course,
        semester,
        lecturer,
        reviewer: admin,
        students: [...cscCohort, ...mth200],
        status: 'APPROVED',
        at: new Date(semester.type === 'FIRST' ? '2026-02-10T10:00:00Z' : '2026-08-10T10:00:00Z'),
      });
    }

    // ── 2026/2027 First Semester — current ─────────────────────────────────
    await allocate(c.CSC201, current, eze, cscAdmin);
    await allocate(c.CSC203, current, eze, cscAdmin);
    await allocate(c.CSC101, current, eze, cscAdmin);
    await allocate(c.CSC205, current, bello, cscAdmin);
    await allocate(c.CSC103, current, bello, cscAdmin);
    await allocate(c.CSC207, current, bakare, cscAdmin);
    await allocate(c.MTH101, current, nwosu, mthAdmin);
    await allocate(c.MTH201, current, yusuf, mthAdmin);
    // MTH203 and EEE101 are intentionally left without a lecturer, so the department
    // dashboards show the "unallocated courses" prompt.

    // Every 200L CS student except the demo student has registered.
    await register(csc200, [c.CSC201, c.CSC203, c.CSC205, c.CSC207, c.MTH201], current);
    await register(csc100, [c.CSC101, c.CSC103, c.MTH101], current);
    await register(mth200, [c.MTH201, c.MTH203], current);
    await register(eee100, [c.MTH101, c.EEE101], current);

    const now = new Date('2026-11-02T09:00:00Z');
    await createSheet({ course: c.CSC201, semester: current, lecturer: eze, reviewer: cscAdmin, students: csc200, status: 'DRAFT', completion: 0.6, at: now });
    await createSheet({
      course: c.CSC101,
      semester: current,
      lecturer: eze,
      reviewer: cscAdmin,
      students: csc100,
      status: 'REJECTED',
      reviewComment: 'CA scores for CSC/2026/002 look inconsistent with the attendance register. Please verify and resubmit.',
      at: now,
    });
    await createSheet({ course: c.CSC205, semester: current, lecturer: bello, reviewer: cscAdmin, students: csc200, status: 'SUBMITTED', at: now });
    await createSheet({ course: c.CSC207, semester: current, lecturer: bakare, reviewer: cscAdmin, students: csc200, status: 'APPROVED', at: now });
    await createSheet({ course: c.MTH201, semester: current, lecturer: yusuf, reviewer: mthAdmin, students: [...csc200, ...mth200], status: 'SUBMITTED', at: now });

    await AuditLog.create(
      {
        actorId: superAdmin.id,
        actorRole: 'SUPER_ADMIN',
        action: 'calendar.semester_activated',
        entityType: 'semester',
        entityId: current.id,
        departmentId: null,
        metadata: { label: '2026/2027 First Semester' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-09-14T08:00:00Z'),
      },
      t,
    );
  });

  logger.info(`Demo data seeded. All demo accounts use the password "${DEMO_PASSWORD}"`);
}
