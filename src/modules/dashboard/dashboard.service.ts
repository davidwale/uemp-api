import { Op, QueryTypes } from 'sequelize';
import type { Actor } from '../../lib/actor.js';
import {
  AuditLog,
  Course,
  CourseAllocation,
  CourseRegistration,
  Department,
  Faculty,
  Program,
  ResultSheet,
  User,
  sequelize,
} from '../../models/index.js';
import { getCurrentSemester } from '../calendar/calendar.service.js';
import { getMyRegistrations } from '../registrations/registrations.service.js';
import { getStudentResults, getTeachingLoad } from '../results/results.service.js';

const countBy = <T extends string>(rows: { key: T; count: number | string }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, Number(r.count)])) as Partial<Record<T, number>>;

async function recentActivity(departmentId?: string) {
  const logs = await AuditLog.findAll({
    where: departmentId ? { departmentId } : {},
    include: [{ model: User, as: 'actor', attributes: ['firstName', 'lastName'] }],
    order: [['createdAt', 'DESC']],
    limit: 8,
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    actor: l.actor?.fullName ?? 'System',
    actorRole: l.actorRole,
    metadata: l.metadata,
    createdAt: l.createdAt,
  }));
}

async function sheetStatusCounts(semesterId: string | undefined, departmentId?: string) {
  if (!semesterId) return {};
  const rows = await sequelize.query<{ key: string; count: string }>(
    `SELECT rs.status AS key, COUNT(*) AS count
       FROM result_sheets rs JOIN courses c ON c.id = rs.course_id
      WHERE rs.semester_id = :semesterId ${departmentId ? 'AND c.department_id = :departmentId' : ''}
      GROUP BY rs.status`,
    { type: QueryTypes.SELECT, replacements: { semesterId, departmentId } },
  );
  return countBy(rows);
}

async function studentDashboard(actor: Actor) {
  const semester = await getCurrentSemester();
  const [registration, results] = await Promise.all([
    semester ? getMyRegistrations(actor, semester.id) : null,
    getStudentResults(actor.id),
  ]);
  return {
    role: 'STUDENT' as const,
    semester,
    registeredCourses: registration?.registrations.length ?? 0,
    registeredUnits: registration?.totalUnits ?? 0,
    registrations: registration?.registrations ?? [],
    cgpa: results.cgpa,
    classOfDegree: results.classOfDegree,
    lastGpa: results.semesters[0]?.gpa ?? null,
    lastGpaSemester: results.semesters[0]?.semester.label ?? null,
    completedUnits: results.totalUnits,
    gpaTrend: [...results.semesters].reverse().map((s) => ({ label: s.semester.label, gpa: s.gpa, cgpa: s.cgpa })),
  };
}

async function lecturerDashboard(actor: Actor) {
  const semester = await getCurrentSemester();
  const load = semester ? await getTeachingLoad(actor, semester.id) : { semester: null, courses: [] };
  const statusCounts: Record<string, number> = {};
  for (const c of load.courses) statusCounts[c.resultStatus] = (statusCounts[c.resultStatus] ?? 0) + 1;
  return {
    role: 'LECTURER' as const,
    semester,
    courseCount: load.courses.length,
    studentCount: load.courses.reduce((sum, c) => sum + c.registeredStudents, 0),
    resultStatus: statusCounts,
    needsAttention: load.courses.filter((c) => ['NOT_STARTED', 'DRAFT', 'REJECTED'].includes(c.resultStatus)),
    courses: load.courses,
  };
}

async function departmentDashboard(actor: Actor) {
  const departmentId = actor.departmentId!;
  const semester = await getCurrentSemester();

  const [department, students, lecturers, courses, programs, registrations, sheets, activity] = await Promise.all([
    Department.findByPk(departmentId, { include: [{ model: Faculty, as: 'faculty', attributes: ['name'] }] }),
    User.count({ where: { departmentId, role: 'STUDENT', status: 'ACTIVE' } }),
    User.count({ where: { departmentId, role: 'LECTURER', status: 'ACTIVE' } }),
    Course.count({ where: { departmentId, isActive: true } }),
    Program.count({ where: { departmentId } }),
    semester
      ? CourseRegistration.count({
          where: { semesterId: semester.id },
          include: [{ model: User, as: 'student', where: { departmentId }, attributes: [] }],
        })
      : 0,
    sheetStatusCounts(semester?.id, departmentId),
    recentActivity(departmentId),
  ]);

  // Courses scheduled this semester that still have no lecturer.
  const unallocated = semester
    ? await Course.findAll({
        where: {
          departmentId,
          isActive: true,
          semesterType: semester.type,
          id: {
            [Op.notIn]: sequelize.literal(
              `(SELECT course_id FROM course_allocations WHERE semester_id = ${sequelize.escape(semester.id)})`,
            ),
          },
        },
        attributes: ['id', 'code', 'title', 'level'],
        order: [['code', 'ASC']],
      })
    : [];

  return {
    role: 'DEPT_ADMIN' as const,
    semester,
    department: department
      ? { id: department.id, name: department.name, code: department.code, faculty: department.faculty?.name ?? null }
      : null,
    counts: { students, lecturers, courses, programs, registrations },
    resultStatus: sheets,
    pendingApprovals: sheets.SUBMITTED ?? 0,
    unallocatedCourses: unallocated.map((c) => ({ id: c.id, code: c.code, title: c.title, level: c.level })),
    recentActivity: activity,
  };
}

async function superAdminDashboard() {
  const semester = await getCurrentSemester();

  const [faculties, departments, programs, courses, userCounts, statusCounts, registrations, sheets, perDepartment, activity] =
    await Promise.all([
      Faculty.count(),
      Department.count(),
      Program.count(),
      Course.count({ where: { isActive: true } }),
      sequelize.query<{ key: string; count: string }>(`SELECT role AS key, COUNT(*) AS count FROM users GROUP BY role`, {
        type: QueryTypes.SELECT,
      }),
      sequelize.query<{ key: string; count: string }>(`SELECT status AS key, COUNT(*) AS count FROM users GROUP BY status`, {
        type: QueryTypes.SELECT,
      }),
      semester ? CourseRegistration.count({ where: { semesterId: semester.id } }) : 0,
      sheetStatusCounts(semester?.id),
      sequelize.query<{
        id: string;
        code: string;
        name: string;
        students: string;
        lecturers: string;
        registrations: string;
        pending: string;
        approved: string;
      }>(
        `SELECT d.id, d.code, d.name,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'STUDENT') AS students,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'LECTURER') AS lecturers,
                (SELECT COUNT(*) FROM course_registrations cr JOIN users u ON u.id = cr.student_id
                  WHERE u.department_id = d.id AND cr.semester_id = :semesterId) AS registrations,
                (SELECT COUNT(*) FROM result_sheets rs JOIN courses c ON c.id = rs.course_id
                  WHERE c.department_id = d.id AND rs.semester_id = :semesterId AND rs.status = 'SUBMITTED') AS pending,
                (SELECT COUNT(*) FROM result_sheets rs JOIN courses c ON c.id = rs.course_id
                  WHERE c.department_id = d.id AND rs.semester_id = :semesterId AND rs.status = 'APPROVED') AS approved
           FROM departments d ORDER BY d.name`,
        { type: QueryTypes.SELECT, replacements: { semesterId: semester?.id ?? null } },
      ),
      recentActivity(),
    ]);

  const allocations = semester ? await CourseAllocation.count({ where: { semesterId: semester.id } }) : 0;
  const sheetsTotal = semester ? await ResultSheet.count({ where: { semesterId: semester.id } }) : 0;

  return {
    role: 'SUPER_ADMIN' as const,
    semester,
    counts: { faculties, departments, programs, courses, registrations, allocations, resultSheets: sheetsTotal },
    users: { byRole: countBy(userCounts), byStatus: countBy(statusCounts) },
    resultStatus: sheets,
    departments: perDepartment.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      students: Number(d.students),
      lecturers: Number(d.lecturers),
      registrations: Number(d.registrations),
      pendingApprovals: Number(d.pending),
      approvedSheets: Number(d.approved),
    })),
    recentActivity: activity,
  };
}

export async function getDashboard(actor: Actor) {
  switch (actor.role) {
    case 'STUDENT':
      return studentDashboard(actor);
    case 'LECTURER':
      return lecturerDashboard(actor);
    case 'DEPT_ADMIN':
      return departmentDashboard(actor);
    case 'SUPER_ADMIN':
      return superAdminDashboard();
  }
}
