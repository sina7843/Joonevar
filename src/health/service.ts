/**
 * Health and configuration report.
 *
 * This endpoint reports what is actually true: database reachability, how many
 * migrations are applied, which product settings still have no real value, and
 * the honest status of every adapter. It never claims readiness it cannot
 * observe (§26: a success screen is not proof).
 */
import { sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { adapterReports, type AdapterReport } from '../adapters/registry.ts';
import { unconfiguredKeys } from '../settings/service.ts';
import { env as loadEnv, type Env } from '../config/env.ts';

export interface HealthReport {
  /** `ok` = the app can serve; `degraded` = it runs but real data or integrations are missing. */
  readonly status: 'ok' | 'degraded';
  readonly appEnv: Env['APP_ENV'];
  readonly integrationMode: Env['INTEGRATION_MODE'];
  readonly database: { readonly reachable: boolean; readonly migrationsApplied: number | null };
  readonly settings: { readonly total: number; readonly notConfigured: readonly string[] };
  readonly adapters: readonly AdapterReport[];
  readonly checkedAt: string;
}

export async function healthReport(database: DbClient, env: Env = loadEnv()): Promise<HealthReport> {
  let reachable = false;
  let migrationsApplied: number | null = null;
  let notConfigured: readonly string[] = [];
  let total = 0;

  try {
    await database.execute(sql`select 1`);
    reachable = true;
    const applied = await database.execute<{ count: string }>(
      sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
    );
    migrationsApplied = Number(applied.rows[0]?.count ?? 0);
    const counted = await database.execute<{ count: string }>(sql`select count(*)::text as count from product_setting`);
    total = Number(counted.rows[0]?.count ?? 0);
    notConfigured = await unconfiguredKeys(database);
  } catch {
    reachable = false;
  }

  const adapters = adapterReports(env);
  const anythingMissing =
    !reachable || notConfigured.length > 0 || adapters.some((a) => a.status === 'NOT_CONFIGURED');

  return {
    status: anythingMissing ? 'degraded' : 'ok',
    appEnv: env.APP_ENV,
    integrationMode: env.INTEGRATION_MODE,
    database: { reachable, migrationsApplied },
    settings: { total, notConfigured },
    adapters,
    checkedAt: new Date().toISOString(),
  };
}
