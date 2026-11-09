import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/** Brute-force protection: 10 attempts per 15 minutes per IP + email pair. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 1_000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    // ipKeyGenerator collapses IPv6 addresses to their /56 subnet so attackers can't rotate addresses.
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please try again in 15 minutes.' },
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 100_000 : 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please slow down.' } },
});
