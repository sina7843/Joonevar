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
import { adapterReportsWithSettings } from '../adapters/integration-settings.ts';
import { unconfiguredKeys } from '../settings/service.ts';
import { taxonomySeeds } from '../db/schema/taxonomy.ts';
import { env as loadEnv, type Env } from '../config/env.ts';

export interface HealthReport {
  /** `ok` = the app can serve; `degraded` = it runs but real data or integrations are missing. */
  readonly status: 'ok' | 'degraded';
  readonly appEnv: Env['APP_ENV'];
  readonly integrationMode: Env['INTEGRATION_MODE'];
  readonly database: { readonly reachable: boolean; readonly migrationsApplied: number | null };
  readonly settings: { readonly total: number; readonly notConfigured: readonly string[] };
  /** The generation of each taxonomy this database holds (§23, DEC-0179). */
  readonly taxonomies: readonly { readonly name: string; readonly version: number }[];
  readonly adapters: readonly AdapterReport[];
  readonly checkedAt: string;
}

export async function healthReport(database: DbClient, env: Env = loadEnv()): Promise<HealthReport> {
  let reachable = false;
  let migrationsApplied: number | null = null;
  let notConfigured: readonly string[] = [];
  let total = 0;
  let taxonomies: readonly { name: string; version: number }[] = [];

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
    // Which taxonomy generation is installed is an operational fact an operator
    // otherwise has to guess by reading rows (DEC-0179).
    taxonomies = await database
      .select({ name: taxonomySeeds.name, version: taxonomySeeds.version })
      .from(taxonomySeeds)
      .orderBy(taxonomySeeds.name);
  } catch {
    reachable = false;
  }

  // The report must describe the running system, so it reads the provider the
  // superadmin selected, not only the environment file (§21.4).
  const adapters = reachable ? await adapterReportsWithSettings(database, env) : adapterReports(env);
  const anythingMissing =
    !reachable || notConfigured.length > 0 || adapters.some((a) => a.status === 'NOT_CONFIGURED');

  return {
    status: anythingMissing ? 'degraded' : 'ok',
    appEnv: env.APP_ENV,
    integrationMode: env.INTEGRATION_MODE,
    database: { reachable, migrationsApplied },
    settings: { total, notConfigured },
    taxonomies,
    adapters,
    checkedAt: new Date().toISOString(),
  };
}
