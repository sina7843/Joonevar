/**
 * Browser suite runner — one isolated database and one server per run.
 *
 * The suites used to run against the developer's own database and whatever
 * server was listening on 3111. Every run left locations, samples and visits
 * behind on the shared fixture accounts, and after enough runs the evidence was
 * about the leftovers rather than the product: a Finder that was never empty,
 * `.first()` picking another suite's clinic, pages too tall to capture, and a
 * payment mode flipped for the suite leaking into manual testing (DEC-0148).
 *
 * Unit and database tests already get a fresh database per suite. This gives the
 * browser suites the same guarantee: a new database, migrated and seeded with
 * the baseline and the synthetic fixtures; a private storage directory of its
 * own; and a production server started against exactly that database on a free
 * port. Everything is torn down afterwards, pass or fail, and the developer's
 * database and running server are never touched.
 *
 * The payment mode is set to DEV_GATEWAY inside the fresh database, because a
 * mock that always succeeds cannot express the cancelled and failed cases the
 * suite exists to prove; `tests/browser/payment-mock.test.ts` switches itself to
 * MOCK_AUTO and back.
 *
 * Requires a completed `npm run build` and the local Postgres server.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';

if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.error('No production build found. Run `npm run build` first; the suite tests the built app.');
  process.exit(1);
}

async function adminQuery(sql, params = []) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

function databaseUrl(name) {
  const url = new URL(ADMIN_URL);
  url.pathname = '/' + name;
  return url.toString();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('The test server exited with code ' + child.exitCode);
    try {
      const response = await fetch(url + '/login');
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The test server did not answer on ' + url + ' within ' + timeoutMs / 1000 + 's');
}

const name = 'hamzist_browser_' + randomBytes(6).toString('hex');
const url = databaseUrl(name);
const storage = await fsp.mkdtemp(path.join(os.tmpdir(), 'hamzist-browser-storage-'));
let server = null;
let exitCode = 1;

try {
  await adminQuery('create database "' + name + '"');

  const { migrateTo } = await import('../src/db/migrate.ts');
  const { createDatabase } = await import('../src/db/client.ts');
  const { loadEnv } = await import('../src/config/env.ts');
  const { seedBaseline } = await import('../src/db/seed/index.ts');
  const { seedDevFixtures } = await import('../src/db/seed/dev-fixtures.ts');

  await migrateTo(url);
  const runEnv = loadEnv({
    APP_ENV: 'development',
    INTEGRATION_MODE: 'local',
    DATABASE_URL: url,
    PRIVATE_STORAGE_DIR: storage,
  });
  const { db, pool } = createDatabase(url);
  try {
    await seedBaseline(db);
    await seedDevFixtures(db, runEnv);
    await pool.query(
      "update product_setting set value = $1::jsonb, updated_at = now() where key = 'integration.payment.mode'",
      [JSON.stringify('DEV_GATEWAY')],
    );
  } finally {
    await pool.end();
  }

  const port = await freePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const childEnv = {
    ...process.env,
    APP_ENV: 'development',
    INTEGRATION_MODE: 'local',
    DATABASE_URL: url,
    PRIVATE_STORAGE_DIR: storage,
  };
  server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForServer(baseUrl, server);
  console.log('Browser suite: database ' + name + ', server ' + baseUrl);

  const suite = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/browser/*.test.ts'], {
    cwd: root,
    env: { ...childEnv, BROWSER_TEST_URL: baseUrl },
    stdio: 'inherit',
  });
  exitCode = await new Promise((resolve) => suite.on('exit', (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once('exit', r)).catch(() => undefined);
  }
  await adminQuery('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1', [name]).catch(() => undefined);
  await adminQuery('drop database if exists "' + name + '"').catch((error) =>
    console.error('Could not drop ' + name + ': ' + (error instanceof Error ? error.message : error)),
  );
  await fsp.rm(storage, { recursive: true, force: true }).catch(() => undefined);
}

process.exit(exitCode);
