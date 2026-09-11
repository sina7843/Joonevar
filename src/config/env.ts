/**
 * Environment contract and startup validation.
 *
 * Two rules drive this file:
 *  - A local-test adapter must never be able to run in production (§26: a
 *    Success screen is not proof that an external operation happened).
 *  - Missing configuration fails loudly at startup instead of degrading into a
 *    fabricated default later.
 */
import { z } from 'zod';

export const APP_ENVS = ['development', 'test', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Integration maturity, mirroring ARCHITECTURE_BASELINE.md. */
export const INTEGRATION_MODES = ['local', 'sandbox', 'live'] as const;
export type IntegrationMode = (typeof INTEGRATION_MODES)[number];

const schema = z.object({
  APP_ENV: z.enum(APP_ENVS).default('development'),
  INTEGRATION_MODE: z.enum(INTEGRATION_MODES).default('local'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  PRIVATE_STORAGE_DIR: z.string().min(1).default('private-storage'),
  /** Public origin for canonical links, the sitemap and OpenGraph (DEC-0150). Required in production. */
  SITE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  /** Provider identifiers. Absent means NOT_CONFIGURED, which is a truthful state, not an error in development. */
  SMS_PROVIDER: z.string().min(1).optional(),
  PAYMENT_PROVIDER: z.string().min(1).optional(),
  MAP_PROVIDER: z.string().min(1).optional(),
  DOCUMENT_RENDERER: z.string().min(1).optional(),
  CHIP_READER_PROVIDER: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export class ConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super('Invalid configuration:\n  - ' + problems.join('\n  - '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadEnv(source: EnvSource = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message));
  }
  const env = parsed.data;
  const problems: string[] = [];

  if (env.APP_ENV === 'production') {
    // Local adapters are fakes. Letting one boot in production would make a
    // fake OTP or a fake payment indistinguishable from a real one.
    if (env.INTEGRATION_MODE === 'local') {
      problems.push('INTEGRATION_MODE=local is a test-only mode and must not run with APP_ENV=production');
    }
    if (!env.SESSION_SECRET) {
      problems.push('SESSION_SECRET is required in production');
    }
    if (env.DATABASE_URL.includes('hamzist_local_dev')) {
      problems.push('DATABASE_URL still points at the local development credentials');
    }
    // Canonical links, the sitemap and OpenGraph are absolute. Taking the origin
    // from the request instead would let any Host header rewrite them.
    if (!env.SITE_URL) {
      problems.push('SITE_URL is required in production');
    } else if (new URL(env.SITE_URL).protocol !== 'https:') {
      problems.push('SITE_URL must use https in production');
    }
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return env;
}

let cached: Env | null = null;

export function env(): Env {
  if (cached === null) cached = loadEnv();
  return cached;
}

/** Test helper so a suite can reset the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}

export const isProduction = (e: Env = env()): boolean => e.APP_ENV === 'production';

/** Outside production an unset SITE_URL means the documented local server. */
const LOCAL_SITE_URL = 'http://localhost:3111';

/** Origin of the public site, with no path or trailing slash (DEC-0150). */
export const siteUrl = (e: Env = env()): string => new URL(e.SITE_URL ?? LOCAL_SITE_URL).origin;
