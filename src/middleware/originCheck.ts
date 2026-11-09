import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { Forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence-in-depth. The session cookie is already `SameSite=Lax`, which
 * stops cross-site POSTs from carrying it. In addition, any state-changing
 * request that presents an Origin header must come from an allowed origin
 * (or the API's own origin, e.g. requests proxied by the web host).
 */
export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // non-browser clients (curl, tests) don't send Origin

  const selfOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin === selfOrigin || env.CORS_ORIGINS.includes(origin)) return next();

  throw Forbidden('Cross-origin request rejected');
}
