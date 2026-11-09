import type { Role } from '../domain/enums.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware. */
      auth?: AuthContext;
    }
  }
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  departmentId: string | null;
}

export {};
