/**
 * Migration runner.
 *
 * Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so a
 * second run is a no-op rather than a destructive replay. That property is what
 * the migration rerun test asserts.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDatabase } from './client.ts';

export const MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrateTo(connectionString: string): Promise<void> {
  const { db, pool } = createDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

// pathToFileURL keeps this correct on Windows, where a naive 'file://' + path is wrong.
const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  await migrateTo(url);
  console.log('Migrations applied.');
}
