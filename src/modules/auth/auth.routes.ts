import { Router, type CookieOptions } from 'express';
import { env } from '../../config/env.js';
import { actorFrom } from '../../lib/actor.js';
import { SESSION_COOKIE, authenticate } from '../../middleware/authenticate.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';
import { ChangePasswordBody, LoginBody } from './auth.schemas.js';
import * as service from './auth.service.js';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true, // not readable by JavaScript → immune to token theft via XSS
  secure: env.isProduction, // HTTPS only in production
  sameSite: 'lax', // not sent on cross-site POSTs → CSRF mitigation
  path: '/',
  maxAge: env.SESSION_TTL_HOURS * 3_600_000,
});

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = LoginBody.parse(req.body);
  const { token, user } = await service.login(email, password, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ data: user });
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await service.logout(req.auth!.sessionId, actorFrom(req));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ data: await service.getCurrentUser(req.auth!.userId) });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const body = ChangePasswordBody.parse(req.body);
  await service.changePassword(actorFrom(req), req.auth!.sessionId, body.currentPassword, body.newPassword);
  res.status(204).end();
});
