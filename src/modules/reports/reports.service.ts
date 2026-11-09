import { QueryTypes } from 'sequelize';
import type { Actor } from '../../lib/actor.js';
import { sequelize } from '../../models/index.js';
import { scopedDepartmentId } from '../../rbac/scope.js';
import { requireCurrentSemester } from '../calendar/calendar.service.js';

/**
 * Reports are read-only aggregates written in SQL: they are set-based by nature
 * and far cheaper as a single query than as ORM object graphs.
 * All user input is passed as bound replacements, never interpolated.
 */

interface ReportFilter {
  departmentId?: string;
  programId?: string;
  level?: number;
  semesterId?: string;
}

export async function studentListReport(actor: Actor, filter: ReportFilter) {
  const departmentId = scopedDepartmentId(actor, filter.departmentId);
  return sequelize.query<{
    matricNumber: string;
    lastName: string;
    firstName: string;
    email: string;
    level: number;
    program: string;
    department: string;
    status: string;
    entryYear: number;
  }>(
    `SELECT sp.matric_number AS "matricNumber", u.last_name AS "lastName", u.first_name AS "firstName",
            u.email, sp.level, p.name AS program, d.name AS department, u.status, sp.entry_year AS "entryYear"
       FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       JOIN programs p ON p.id = sp.program_id
       JOIN departments d ON d.id = u.department_id
      WHERE u.role = 'STUDENT'
        AND (CAST(:departmentId AS uuid) IS NULL OR u.department_id = :departmentId)
        AND (CAST(:programId AS uuid) IS NULL OR sp.program_id = :programId)
        AND (CAST(:level AS int) IS NULL OR sp.level = :level)
      ORDER BY d.name, sp.level, sp.matric_number`,
    {
      type: QueryTypes.SELECT,
      replacements: { departmentId: departmentId ?? null, programId: filter.programId ?? null, level: filter.level ?? null },
    },
  );
}

export async function registrationReport(actor: Actor, filter: ReportFilter) {
  const departmentId = scopedDepartmentId(actor, filter.departmentId);
  const semesterId = filter.semesterId ?? (await requireCurrentSemester()).id;
  const rows = await sequelize.query<{
    courseId: string;
    code: string;
    title: string;
    units: number;
    level: number;
    department: string;
    lecturer: string | null;
    registered: string;
    resultStatus: string | null;
  }>(
    `SELECT c.id AS "courseId", c.code, c.title, c.units, c.level, d.code AS department,
            NULLIF(TRIM(CONCAT(lp.title, ' ', l.first_name, ' ', l.last_name)), '') AS lecturer,
            COUNT(cr.id) AS registered,
            rs.status AS "resultStatus"
       FROM courses c
       JOIN departments d ON d.id = c.department_id
       JOIN semesters s ON s.id = :semesterId AND s.type::text = c.semester_type::text
       LEFT JOIN course_registrations cr ON cr.course_id = c.id AND cr.semester_id = s.id
       LEFT JOIN course_allocations ca ON ca.course_id = c.id AND ca.semester_id = s.id
       LEFT JOIN users l ON l.id = ca.lecturer_id
       LEFT JOIN lecturer_profiles lp ON lp.user_id = l.id
       LEFT JOIN result_sheets rs ON rs.course_id = c.id AND rs.semester_id = s.id
      WHERE c.is_active AND (CAST(:departmentId AS uuid) IS NULL OR c.department_id = :departmentId)
      GROUP BY c.id, d.code, lp.title, l.first_name, l.last_name, rs.status
      ORDER BY c.level, c.code`,
    { type: QueryTypes.SELECT, replacements: { semesterId, departmentId: departmentId ?? null } },
  );
  const data = rows.map((r) => ({ ...r, registered: Number(r.registered) }));
  return {
    semesterId,
    rows: data,
    totals: {
      courses: data.length,
      registrations: data.reduce((s, r) => s + r.registered, 0),
      unallocated: data.filter((r) => !r.lecturer).length,
    },
  };
}

/** Course-level performance computed from APPROVED results only. */
export async function performanceReport(actor: Actor, filter: ReportFilter) {
  const departmentId = scopedDepartmentId(actor, filter.departmentId);
  const semesterId = filter.semesterId ?? (await requireCurrentSemester()).id;
  const rows = await sequelize.query<{
    code: string;
    title: string;
    units: number;
    department: string;
    students: string;
    average: string | null;
    highest: string | null;
    lowest: string | null;
    passed: string;
    a: string;
    b: string;
    c: string;
    d: string;
    e: string;
    f: string;
  }>(
    `SELECT c.code, c.title, c.units, d.code AS department,
            COUNT(re.id) AS students,
            ROUND(AVG(re.total_score), 2) AS average,
            MAX(re.total_score) AS highest,
            MIN(re.total_score) AS lowest,
            COUNT(*) FILTER (WHERE re.grade_point > 0) AS passed,
            COUNT(*) FILTER (WHERE re.grade = 'A') AS a,
            COUNT(*) FILTER (WHERE re.grade = 'B') AS b,
            COUNT(*) FILTER (WHERE re.grade = 'C') AS c,
            COUNT(*) FILTER (WHERE re.grade = 'D') AS d,
            COUNT(*) FILTER (WHERE re.grade = 'E') AS e,
            COUNT(*) FILTER (WHERE re.grade = 'F') AS f
       FROM result_sheets rs
       JOIN courses c ON c.id = rs.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN result_entries re ON re.sheet_id = rs.id
      WHERE rs.status = 'APPROVED' AND rs.semester_id = :semesterId
        AND (CAST(:departmentId AS uuid) IS NULL OR c.department_id = :departmentId)
      GROUP BY c.id, d.code
      ORDER BY c.level, c.code`,
    { type: QueryTypes.SELECT, replacements: { semesterId, departmentId: departmentId ?? null } },
  );

  const data = rows.map((r) => {
    const students = Number(r.students);
    const passed = Number(r.passed);
    return {
      code: r.code,
      title: r.title,
      units: r.units,
      department: r.department,
      students,
      average: r.average === null ? null : Number(r.average),
      highest: r.highest === null ? null : Number(r.highest),
      lowest: r.lowest === null ? null : Number(r.lowest),
      passRate: students ? Math.round((passed / students) * 10_000) / 100 : null,
      distribution: { A: +r.a, B: +r.b, C: +r.c, D: +r.d, E: +r.e, F: +r.f },
    };
  });

  const totalStudents = data.reduce((s, r) => s + r.students, 0);
  return {
    semesterId,
    rows: data,
    totals: {
      courses: data.length,
      results: totalStudents,
      average: totalStudents ? Math.round((data.reduce((s, r) => s + (r.average ?? 0) * r.students, 0) / totalStudents) * 100) / 100 : null,
      passRate: totalStudents
        ? Math.round((data.reduce((s, r) => s + ((r.passRate ?? 0) / 100) * r.students, 0) / totalStudents) * 10_000) / 100
        : null,
    },
  };
}
