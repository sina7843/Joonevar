import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.ts';
import * as schema from './schema/index.ts';

/**
 * Exact numerics must not become JavaScript floats. Postgres `numeric` (OID
 * 1700) and `int8` (OID 20) are handed to us as strings so a Toman amount or a
 * large counter is never silently rounded.
 */
pg.types.setTypeParser(1700, (v) => v);
pg.types.setTypeParser(20, (v) => v);

export type Database = NodePgDatabase<typeof schema>;

/** A transaction handle. Services accept `DbClient` so the same code runs inside or outside a transaction. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbClient = Database | Transaction;

let pool: pg.Pool | null = null;
let database: Database | null = null;

export function getPool(connectionString: string = env().DATABASE_URL): pg.Pool {
  if (pool === null) {
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export function db(): Database {
  if (database === null) {
    database = drizzle(getPool(), { schema, casing: 'snake_case' });
  }
  return database;
}

/** Independent connection, used by migrations, seeds and tests against an isolated database. */
export function createDatabase(connectionString: string): { db: Database; pool: pg.Pool } {
  const ownPool = new pg.Pool({ connectionString, max: 4 });
  return { db: drizzle(ownPool, { schema, casing: 'snake_case' }), pool: ownPool };
}

export async function closeDefaultPool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
    database = null;
  }
}

export { schema };
