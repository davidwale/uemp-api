import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { Unauthorized } from '../lib/errors.js';
import { hashToken } from '../lib/tokens.js';
import { Session, User } from '../models/index.js';

export const SESSION_COOKIE = 'uemp_sid';

/** Avoid a DB write on every request: only bump `lastSeenAt` once per minute. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Resolves the session cookie to an authenticated user.
 *
 * A session is rejected if it is unknown, revoked, past its absolute expiry,
 * idle for longer than the idle timeout, or if the user is no longer ACTIVE.
 * Because sessions live server-side, suspending a user or logging out takes
 * effect immediately — there is no window where a stolen token stays valid.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) throw Unauthorized();

  const session = await Session.findOne({
    where: { tokenHash: hashToken(token) },
    include: [{ model: User, as: 'user', attributes: ['id', 'role', 'status', 'departmentId'] }],
  });

  const now = Date.now();
  const idleLimitMs = env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000;

  if (
    !session ||
    !session.user ||
    session.revokedAt ||
    session.expiresAt.getTime() <= now ||
    now - session.lastSeenAt.getTime() > idleLimitMs
  ) {
    throw Unauthorized('Your session has expired. Please sign in again.');
  }

  if (session.user.status !== 'ACTIVE') {
    await session.update({ revokedAt: new Date() });
    throw Unauthorized('Your account is not active. Contact the administrator.');
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await session.update({ lastSeenAt: new Date(now) });
  }

  req.auth = {
    userId: session.user.id,
    sessionId: session.id,
    role: session.user.role,
    departmentId: session.user.departmentId ?? null,
  };
  next();
}
