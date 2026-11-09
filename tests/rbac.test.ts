import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Course, ResultSheet, sequelize } from '../src/models/index.js';
import { ACCOUNTS, loginAs, resetDatabase } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAs>>;
let agents: Record<'student' | 'lecturer' | 'cscAdmin' | 'mthAdmin' | 'superAdmin', Agent>;

beforeAll(async () => {
  await resetDatabase();
  agents = {
    student: await loginAs(ACCOUNTS.student),
    lecturer: await loginAs(ACCOUNTS.lecturer),
    cscAdmin: await loginAs(ACCOUNTS.cscAdmin),
    mthAdmin: await loginAs(ACCOUNTS.mthAdmin),
    superAdmin: await loginAs(ACCOUNTS.superAdmin),
  };
});
afterAll(() => sequelize.close());

/**
 * Route-level permission matrix: [method, path, role, expected status].
 * 403 means the role is blocked before any business logic runs.
 */
const matrix: [string, string, keyof typeof agents, number][] = [
  ['get', '/api/v1/users', 'student', 403],
  ['get', '/api/v1/users', 'lecturer', 403],
  ['get', '/api/v1/users', 'cscAdmin', 200],
  ['get', '/api/v1/users', 'superAdmin', 200],

  ['get', '/api/v1/organisation/faculties', 'student', 403],
  ['get', '/api/v1/organisation/faculties', 'superAdmin', 200],

  ['get', '/api/v1/results/sheets', 'student', 403],
  ['get', '/api/v1/results/me', 'lecturer', 403],
  ['get', '/api/v1/results/me', 'student', 200],
  ['get', '/api/v1/results/teaching', 'cscAdmin', 403],

  ['get', '/api/v1/registrations/available', 'lecturer', 403],
  ['get', '/api/v1/registrations', 'student', 403],

  ['get', '/api/v1/audit-logs', 'student', 403],
  ['get', '/api/v1/audit-logs', 'lecturer', 403],
  ['get', '/api/v1/audit-logs', 'cscAdmin', 200],

  ['get', '/api/v1/reports/students', 'lecturer', 403],
  ['get', '/api/v1/settings/permissions', 'cscAdmin', 403],
  ['get', '/api/v1/settings/permissions', 'superAdmin', 200],
];

describe('route-level RBAC', () => {
  it.each(matrix)('%s %s as %s → %i', async (method, path, role, expected) => {
    const res = await (agents[role] as unknown as Record<string, (p: string) => Promise<{ status: number }>>)[method]!(path);
    expect(res.status).toBe(expected);
  });

  it('only the Super Admin can create faculties', async () => {
    const body = { name: 'Faculty of Arts', code: 'ART' };
    expect((await agents.cscAdmin.post('/api/v1/organisation/faculties').send(body)).status).toBe(403);
    expect((await agents.superAdmin.post('/api/v1/organisation/faculties').send(body)).status).toBe(201);
  });

  it('only the Super Admin can manage sessions and semesters', async () => {
    const body = { name: '2027/2028', startDate: '2027-09-13', endDate: '2028-08-31' };
    expect((await agents.cscAdmin.post('/api/v1/calendar/sessions').send(body)).status).toBe(403);
    expect((await agents.superAdmin.post('/api/v1/calendar/sessions').send(body)).status).toBe(201);
  });
});

describe('record-level scoping', () => {
  it('department admins only see users in their own department', async () => {
    const res = await agents.mthAdmin.get('/api/v1/users?pageSize=100');
    expect(res.status).toBe(200);
    const departments = new Set(res.body.data.map((u: { department: { code: string } }) => u.department.code));
    expect([...departments]).toEqual(['MTH']);
  });

  it('a department admin cannot approve another department’s results', async () => {
    const csc205 = await Course.findOne({ where: { code: 'CSC205' } });
    const sheet = await ResultSheet.findOne({ where: { courseId: csc205!.id, status: 'SUBMITTED' } });

    const res = await agents.mthAdmin.post(`/api/v1/results/sheets/${sheet!.id}/approve`).send({});
    expect(res.status).toBe(403);
  });

  it('a department admin cannot create courses for another department', async () => {
    const depts = await agents.superAdmin.get('/api/v1/organisation/departments');
    const mth = depts.body.data.find((d: { code: string }) => d.code === 'MTH');
    const programs = await agents.superAdmin.get(`/api/v1/organisation/programs?departmentId=${mth.id}`);

    const res = await agents.cscAdmin.post('/api/v1/courses').send({
      departmentId: mth.id,
      code: 'MTH299',
      title: 'Smuggled Course',
      units: 2,
      level: 200,
      semesterType: 'FIRST',
      programIds: [programs.body.data[0].id],
    });
    expect(res.status).toBe(403);
  });

  it('a lecturer cannot enter results for a course allocated to someone else', async () => {
    const csc205 = await Course.findOne({ where: { code: 'CSC205' } });
    const current = await agents.lecturer.get('/api/v1/calendar/current');
    const res = await agents.lecturer
      .put(`/api/v1/results/courses/${csc205!.id}/semesters/${current.body.data.id}/entries`)
      .send({ entries: [{ registrationId: '00000000-0000-4000-8000-000000000000', caScore: 10, examScore: 10 }] });
    expect(res.status).toBe(403);
  });

  it('a lecturer cannot view a class list for a course that is not theirs', async () => {
    const csc205 = await Course.findOne({ where: { code: 'CSC205' } });
    const res = await agents.lecturer.get(`/api/v1/registrations?courseId=${csc205!.id}`);
    expect(res.status).toBe(403);
  });

  it('students cannot edit academic fields on their own profile', async () => {
    const res = await agents.student.patch('/api/v1/profile').send({ level: 400 });
    expect(res.status).toBe(422);
  });

  it('a department admin cannot change user roles or statuses', async () => {
    const users = await agents.cscAdmin.get('/api/v1/users?role=LECTURER');
    const lecturerId = users.body.data[0].id;
    expect((await agents.cscAdmin.patch(`/api/v1/users/${lecturerId}/role`).send({ role: 'DEPT_ADMIN' })).status).toBe(403);
    expect((await agents.cscAdmin.patch(`/api/v1/users/${lecturerId}/status`).send({ status: 'SUSPENDED' })).status).toBe(403);
  });
});
