/**
 * Operational errors that are safe to expose to API clients.
 * Anything that is not an AppError is treated as a 500 and its details are hidden.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const BadRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const Unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const Forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);

export const NotFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const Conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

/** A request that is well-formed but violates a business rule. */
export const BusinessRule = (message: string, details?: unknown) =>
  new AppError(422, 'BUSINESS_RULE_VIOLATION', message, details);
