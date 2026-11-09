import type { NextFunction, Request, Response } from 'express';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { hasPermission, type Permission } from '../rbac/permissions.js';

/**
 * Route guard: the authenticated user's role must hold *any* of the listed
 * permissions. Fine-grained record scoping happens in the service layer.
 */
export const authorize =
  (...permissions: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw Unauthorized();
    const allowed = permissions.some((p) => hasPermission(req.auth!.role, p));
    if (!allowed) throw Forbidden();
    next();
  };
