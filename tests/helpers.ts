import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDemoData, DEMO_PASSWORD } from '../src/db/seeders/demo.js';

export const app = createApp();

export const ACCOUNTS = {
  superAdmin: 'admin@uemp.edu.ng',
  cscAdmin: 'csc.admin@uemp.edu.ng',
  mthAdmin: 'mth.admin@uemp.edu.ng',
  lecturer: 'lecturer@uemp.edu.ng', // Dr. Chinedu Eze — CSC201, CSC203, CSC101
  otherLecturer: 'aisha.bello@uemp.edu.ng', // Dr. Aisha Bello — CSC205 (submitted)
  student: 'student@uemp.edu.ng', // Adaeze Okonkwo — CSC 200L, not yet registered
  registeredStudent: 'chukwuemeka.obi@uemp.edu.ng',
} as const;

export const resetDatabase = () => seedDemoData({ fresh: true });

/** Returns a supertest agent that carries the session cookie of the given user. */
export async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export { request };
