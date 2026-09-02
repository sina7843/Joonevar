/**
 * Error contract shared by every service and route.
 *
 * A locked service must always answer with three parts (§5): why it is locked,
 * what the next prerequisite is, and the direct CTA. Modelling that here means
 * a lock cannot be rendered as a bare disabled button with no explanation.
 */

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'VERSION_STALE'
  | 'NOT_CONFIGURED'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

export interface LockDetail {
  /** Why this is locked, in product language. */
  readonly reason: string;
  /** The single next prerequisite the actor must satisfy. */
  readonly nextPrerequisite: string;
  /** Direct route to resolve it. */
  readonly cta: { readonly label: string; readonly href: string };
}

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  VERSION_STALE: 409,
  NOT_CONFIGURED: 503,
  LOCKED: 403,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly detail?: Record<string, unknown>;
  readonly lock?: LockDetail;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { httpStatus?: number; detail?: Record<string, unknown>; lock?: LockDetail } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? DEFAULT_STATUS[code];
    this.detail = options.detail;
    this.lock = options.lock;
  }
}

export const unauthenticated = (m = 'Sign-in required') => new AppError('UNAUTHENTICATED', m);
export const forbidden = (m = 'Not permitted for this actor and record') => new AppError('FORBIDDEN', m);
export const notFound = (m = 'Record not found') => new AppError('NOT_FOUND', m);
export const validation = (m: string, detail?: Record<string, unknown>) => new AppError('VALIDATION', m, { detail });
export const conflict = (m: string, detail?: Record<string, unknown>) => new AppError('CONFLICT', m, { detail });

export const versionStale = (expected: number, actual: number) =>
  new AppError('VERSION_STALE', 'A newer version of this record exists; review it before approving', {
    detail: { expectedVersion: expected, actualVersion: actual },
  });

export const notConfigured = (what: string) =>
  new AppError('NOT_CONFIGURED', what + ' is not configured; no value may be assumed', { detail: { what } });

export const locked = (lock: LockDetail) => new AppError('LOCKED', lock.reason, { lock });

/**
 * Wire shape. Internal detail is not leaked: an unexpected failure says nothing
 * about the database, and no identifier, receipt, OTP or secret appears here.
 */
export interface ErrorBody {
  readonly error: {
    readonly code: AppErrorCode;
    readonly message: string;
    readonly lock?: LockDetail;
    readonly detail?: Record<string, unknown>;
  };
}

export function toErrorBody(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.lock ? { lock: error.lock } : {}),
          ...(error.detail ? { detail: error.detail } : {}),
        },
      },
    };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Unexpected server error' } } };
}
