/**
 * Isolated test database.
 *
 * Each suite creates its own database on the local Postgres server, runs the
 * real migrations against it and drops it afterwards. Nothing is shared, so a
 * failing suite cannot leave state behind for the next one.
 *
 * If the server is not running the suite fails loudly. It is never reported as
 * passing, because a skipped database test proves nothing about persistence.
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDatabase, type Database } from '../../src/db/client.ts';
import { migrateTo } from '../../src/db/migrate.ts';

export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';

function urlFor(databaseName: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = '/' + databaseName;
  return url.toString();
}

export interface TestDb {
  readonly name: string;
  readonly url: string;
  readonly db: Database;
  drop(): Promise<void>;
}

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates and migrates a fresh database. `migrate` false leaves it empty for migration tests. */
export async function createTestDb(options: { migrate?: boolean } = {}): Promise<TestDb> {
  const name = 'hamzist_test_' + randomBytes(6).toString('hex');
  await admin((c) => c.query('create database "' + name + '"'));
  const url = urlFor(name);
  if (options.migrate !== false) await migrateTo(url);
  const { db, pool } = createDatabase(url);
  return {
    name,
    url,
    db,
    async drop() {
      await pool.end();
      await admin(async (c) => {
        await c.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1', [name]);
        await c.query('drop database if exists "' + name + '"');
      });
    },
  };
}

/** A synthetic account row, used only as an actor reference inside tests. */
export async function createTestAccount(db: Database, mobile: string): Promise<string> {
  const { accounts } = await import('../../src/db/schema/core.ts');
  const [row] = await db.insert(accounts).values({ mobile, status: 'ACTIVE' }).returning({ id: accounts.id });
  return row!.id;
}
