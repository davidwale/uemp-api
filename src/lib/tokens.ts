import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of entropy, URL-safe. */
export const generateSessionToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
