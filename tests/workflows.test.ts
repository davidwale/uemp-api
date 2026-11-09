import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '../src/models/index.js';
import { ACCOUNTS, loginAs, resetDatabase } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAs>>;
let student: Agent;
let lecturer: Agent;
let cscAdmin: Agent;
let superAdmin: Agent;
let semesterId: string;
let courses: Record<string, { id: string; registrationId: string | null; units: number }>;

beforeAll(async () => {
  await resetDatabase();
  [student, lecturer, cscAdmin, superAdmin] = await Promise.all([
    loginAs(ACCOUNTS.student),
    loginAs(ACCOUNTS.lecturer),
    loginAs(ACCOUNTS.cscAdmin),
    loginAs(ACCOUNTS.superAdmin),
  ]);
  semesterId = (await student.get('/api/v1/calendar/current')).body.data.id;
});
afterAll(() => sequelize.close());

async function loadAvailable() {
  const res = await student.get('/api/v1/registrations/available');
  courses = Object.fromEntries(
    res.body.data.courses.map((c: { code: string; id: string; registrationId: string | null; units: number }) => [c.code, c]),
  );
  return res.body.data;
}

describe('Workflow 1 — student course registration', () => {
  it('lists only courses for the student’s programme, level and current semester', async () => {
    const data = await loadAvailable();
    expect(data.student).toMatchObject({ level: 200, matricNumber: 'CSC/2025/001' });
    // 200L first-semester courses offered to B.Sc. CS — MTH203 is Mathematics-only and must not appear.
    expect(Object.keys(courses).sort()).toEqual(['CSC201', 'CSC203', 'CSC205', 'CSC207', 'MTH201']);
  });

  it('rejects courses outside the student’s eligibility', async () => {
    const admin = await superAdmin.get('/api/v1/courses?search=MTH203');
    const res = await student.post('/api/v1/registrations').send({ courseIds: [admin.body.data[0].id] });
    expect(res.status).toBe(422);
  });

  it('rejects registration for a course whose results are already submitted', async () => {
    const res = await student.post('/api/v1/registrations').send({ courseIds: [courses.CSC205!.id] });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/already been submitted/);
  });

  it('registers courses and shows them on the dashboard', async () => {
    const res = await student.post('/api/v1/registrations').send({ courseIds: [courses.CSC201!.id, courses.CSC203!.id] });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ registered: 2, totalUnits: 6 });

    const dashboard = await student.get('/api/v1/dashboard');
    expect(dashboard.body.data.registeredCourses).toBe(2);
    expect(dashboard.body.data.registeredUnits).toBe(6);
  });

  it('prevents registering the same course twice in a semester', async () => {
    const res = await student.post('/api/v1/registrations').send({ courseIds: [courses.CSC201!.id] });
    expect(res.status).toBe(409);
  });

  it('lets the department admin see the new registrations', async () => {
    const res = await cscAdmin.get('/api/v1/registrations?search=CSC/2025/001');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { course: { code: string } }) => r.course.code).sort()).toEqual(['CSC201', 'CSC203']);
  });

  it('allows dropping a course while registration is open', async () => {
    await loadAvailable();
    const res = await student.delete(`/api/v1/registrations/${courses.CSC203!.registrationId}`);
    expect(res.status).toBe(204);
    const slip = await student.get('/api/v1/registrations/mine');
    expect(slip.body.data.registrations).toHaveLength(1);
  });
});

describe('Workflows 2 & 3 — result entry, submission and departmental approval', () => {
  let sheetId: string;
  const path = () => `/api/v1/results/courses/${courses.CSC201!.id}/semesters/${semesterId}`;

  it('shows the lecturer the registered students, including the newly registered one', async () => {
    const res = await lecturer.get(path());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.capabilities.canEdit).toBe(true);
    expect(res.body.data.rows.map((r: { student: { matricNumber: string } }) => r.student.matricNumber)).toContain('CSC/2025/001');
  });

  it('rejects out-of-range scores', async () => {
    const view = await lecturer.get(path());
    const res = await lecturer.put(`${path()}/entries`).send({
      entries: [{ registrationId: view.body.data.rows[0].registrationId, caScore: 35, examScore: 50 }],
    });
    expect(res.status).toBe(422);
  });

  it('refuses submission while any student is missing scores', async () => {
    const res = await lecturer.post(`${path()}/submit`);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/missing CA or exam scores/);
  });

  it('saves scores as a draft and computes totals and grades server-side', async () => {
    const view = await lecturer.get(path());
    const entries = view.body.data.rows.map((r: { registrationId: string; student: { matricNumber: string } }) => ({
      registrationId: r.registrationId,
      caScore: r.student.matricNumber === 'CSC/2025/001' ? 24 : 18,
      examScore: r.student.matricNumber === 'CSC/2025/001' ? 51.5 : 40,
    }));
    const res = await lecturer.put(`${path()}/entries`).send({ entries });
    expect(res.status).toBe(200);

    const adaeze = res.body.data.rows.find((r: { student: { matricNumber: string } }) => r.student.matricNumber === 'CSC/2025/001');
    expect(adaeze).toMatchObject({ caScore: 24, examScore: 51.5, totalScore: 75.5, grade: 'A', gradePoint: 5 });
    sheetId = res.body.data.sheetId;
  });

  it('hides draft scores from the department admin', async () => {
    const res = await cscAdmin.get(`/api/v1/results/sheets/${sheetId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows.every((r: { totalScore: number | null }) => r.totalScore === null)).toBe(true);
  });

  it('submits the results and locks them against editing', async () => {
    const submit = await lecturer.post(`${path()}/submit`);
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('SUBMITTED');

    const view = await lecturer.get(path());
    const edit = await lecturer.put(`${path()}/entries`).send({
      entries: [{ registrationId: view.body.data.rows[0].registrationId, caScore: 30, examScore: 70 }],
    });
    expect(edit.status).toBe(403);
  });

  it('does not show submitted (unapproved) results to the student', async () => {
    const res = await student.get('/api/v1/results/me');
    const codes = res.body.data.semesters.flatMap((s: { courses: { code: string }[] }) => s.courses.map((c) => c.code));
    expect(codes).not.toContain('CSC201');
  });

  it('a lecturer cannot approve results', async () => {
    expect((await lecturer.post(`/api/v1/results/sheets/${sheetId}/approve`).send({})).status).toBe(403);
  });

  it('rejection requires feedback and returns the sheet to the lecturer', async () => {
    expect((await cscAdmin.post(`/api/v1/results/sheets/${sheetId}/reject`).send({ comment: '' })).status).toBe(422);

    const res = await cscAdmin
      .post(`/api/v1/results/sheets/${sheetId}/reject`)
      .send({ comment: 'Please double-check the exam score for CSC/2025/002.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');

    const lecturerView = await lecturer.get(path());
    expect(lecturerView.body.data.reviewComment).toMatch(/double-check/);
    expect(lecturerView.body.data.capabilities.canEdit).toBe(true);
  });

  it('the lecturer corrects and resubmits, and the department admin approves', async () => {
    const view = await lecturer.get(path());
    const row = view.body.data.rows.find((r: { student: { matricNumber: string } }) => r.student.matricNumber === 'CSC/2025/002');
    expect((await lecturer.put(`${path()}/entries`).send({ entries: [{ registrationId: row.registrationId, caScore: 18, examScore: 44 }] })).status).toBe(200);
    expect((await lecturer.post(`${path()}/submit`)).status).toBe(200);

    const approve = await cscAdmin.post(`/api/v1/results/sheets/${sheetId}/approve`).send({ comment: 'Verified.' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');
  });

  it('approved results become visible to the student with GPA and CGPA', async () => {
    const res = await student.get('/api/v1/results/me');
    const current = res.body.data.semesters[0];
    expect(current.semester.label).toBe('2026/2027 First Semester');
    expect(current.courses).toEqual([
      expect.objectContaining({ code: 'CSC201', totalScore: 75.5, grade: 'A', gradePoint: 5 }),
    ]);
    expect(current.gpa).toBe(5);
    expect(res.body.data.cgpa).toBeGreaterThan(0);
  });

  it('records every step in the audit trail', async () => {
    const res = await cscAdmin.get(`/api/v1/results/sheets/${sheetId}/history`);
    const actions = res.body.data.map((h: { action: string }) => h.action);
    for (const action of ['result.draft_saved', 'result.submitted', 'result.rejected', 'result.approved']) {
      expect(actions).toContain(action);
    }
  });

  it('authorised reopening hides the results from students again', async () => {
    const res = await superAdmin
      .post(`/api/v1/results/sheets/${sheetId}/reopen`)
      .send({ reason: 'Script remarking approved by Senate.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');

    const results = await student.get('/api/v1/results/me');
    const codes = results.body.data.semesters.flatMap((s: { courses: { code: string }[] }) => s.courses.map((c) => c.code));
    expect(codes).not.toContain('CSC201');
  });
});

describe('Workflow 4 — Super Admin management', () => {
  it('creates a faculty, department and programme, and assigns a new lecturer to it', async () => {
    const faculty = await superAdmin.post('/api/v1/organisation/faculties').send({ name: 'Faculty of Social Sciences', code: 'SSC' });
    expect(faculty.status).toBe(201);
    const department = await superAdmin
      .post('/api/v1/organisation/departments')
      .send({ facultyId: faculty.body.data.id, name: 'Economics', code: 'ECO' });
    expect(department.status).toBe(201);
    const program = await superAdmin.post('/api/v1/organisation/programs').send({
      departmentId: department.body.data.id,
      name: 'B.Sc. Economics',
      code: 'BSC-ECO',
      degree: 'B.Sc.',
      durationYears: 4,
    });
    expect(program.status).toBe(201);

    const lecturerRes = await superAdmin.post('/api/v1/users').send({
      role: 'LECTURER',
      email: 'new.lecturer@uemp.edu.ng',
      firstName: 'Kemi',
      lastName: 'Adeleke',
      password: 'Welcome123',
      departmentId: department.body.data.id,
      lecturer: { staffNumber: 'UEMP/STF/0401', title: 'Dr.' },
    });
    expect(lecturerRes.status).toBe(201);
    expect(lecturerRes.body.data.department.code).toBe('ECO');
  });

  it('rejects duplicate department codes', async () => {
    const faculties = await superAdmin.get('/api/v1/organisation/faculties');
    const res = await superAdmin
      .post('/api/v1/organisation/departments')
      .send({ facultyId: faculties.body.data[0].id, name: 'Duplicate CS', code: 'CSC' });
    expect(res.status).toBe(409);
  });

  it('activates a new semester and allows only one current semester', async () => {
    const sessions = await superAdmin.get('/api/v1/calendar/sessions');
    const second = sessions.body.data[0].semesters.find((s: { type: string }) => s.type === 'SECOND');
    const res = await superAdmin.post(`/api/v1/calendar/semesters/${second.id}/activate`);
    expect(res.status).toBe(200);

    const all = await superAdmin.get('/api/v1/calendar/semesters');
    expect(all.body.data.filter((s: { isCurrent: boolean }) => s.isCurrent)).toHaveLength(1);
  });
});
