import type { Request } from 'express';
import type { Role } from '../domain/enums.js';
import { Unauthorized } from './errors.js';

/** The authenticated user performing an operation. Passed explicitly into services. */
export interface Actor {
  id: string;
  role: Role;
  departmentId: string | null;
  ip: string | null;
}

export function actorFrom(req: Request): Actor {
  if (!req.auth) throw Unauthorized();
  return {
    id: req.auth.userId,
    role: req.auth.role,
    departmentId: req.auth.departmentId,
    ip: req.ip ?? null,
  };
}
