import type { NextFunction, Request, Response } from 'express';
import {
  DatabaseError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

const humanise = (field: string) => field.replace(/_/g, ' ').replace(/\bid\b/, '').trim();

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

/**
 * Translates every error into a consistent JSON envelope.
 * Known/operational errors are returned to the client; anything unexpected is
 * logged with full detail and returned as a generic 500 (no stack traces leak).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = String(req.id ?? '');
  const send = (status: number, body: ErrorBody['error']) =>
    res.status(status).json({ error: { ...body, requestId } } satisfies ErrorBody);

  if (err instanceof AppError) {
    send(err.statusCode, { code: err.code, message: err.message, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    send(422, {
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof UniqueConstraintError) {
    const fields = Object.keys(err.fields ?? {}).map(humanise);
    send(409, {
      code: 'DUPLICATE',
      message: fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate record',
    });
    return;
  }

  if (err instanceof ForeignKeyConstraintError) {
    send(409, {
      code: 'IN_USE',
      message: 'This record is referenced by other records and cannot be changed or removed',
    });
    return;
  }

  if (err instanceof SequelizeValidationError) {
    send(422, {
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
    return;
  }

  // Postgres CHECK constraint violations (23514) are business-rule failures, not crashes.
  if (err instanceof DatabaseError && (err.parent as { code?: string })?.code === '23514') {
    send(422, { code: 'CONSTRAINT_VIOLATION', message: 'The submitted values violate a data rule' });
    return;
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && 'body' in err) {
    send(400, { code: 'BAD_REQUEST', message: 'Malformed JSON body' });
    return;
  }

  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  send(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}
