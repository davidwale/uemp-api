import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '../src/models/index.js';
import { ACCOUNTS, app, loginAs, request, resetDatabase } from './helpers.js';

beforeAll(resetDatabase);
afterAll(() => sequelize.close());

describe('authentication', () => {
  it('logs in, sets a hardened session cookie and returns the profile with role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ACCOUNTS.student, password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: ACCOUNTS.student, role: 'STUDENT' });
    expect(res.body.data.passwordHash).toBeUndefined();

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/uemp_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ACCOUNTS.student, password: 'nope' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@uemp.edu.ng', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('validates the login payload', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('invalidates the session server-side on logout', async () => {
    const agent = await loginAs(ACCOUNTS.student);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('suspending a user revokes their live sessions immediately and blocks login', async () => {
    const student = await loginAs(ACCOUNTS.registeredStudent);
    const admin = await loginAs(ACCOUNTS.superAdmin);

    const me = await student.get('/api/v1/auth/me');
    const suspend = await admin.patch(`/api/v1/users/${me.body.data.id}/status`).send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(200);

    expect((await student.get('/api/v1/dashboard')).status).toBe(401);

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ACCOUNTS.registeredStudent, password: 'Password123!' });
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe('ACCOUNT_DISABLED');

    await admin.patch(`/api/v1/users/${me.body.data.id}/status`).send({ status: 'ACTIVE' });
  });

  it('rejects state-changing requests from untrusted origins (CSRF defence)', async () => {
    const agent = await loginAs(ACCOUNTS.student);
    const res = await agent.post('/api/v1/auth/logout').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });
});
