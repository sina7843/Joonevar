/**
 * Key-screen evidence for the final design-system QA (QA-FINAL-RECONCILIATION.md).
 *
 * Builds a disposable database (migrations, baseline, dev fixtures, the demo
 * seed), starts the production build against it, signs in one session per role
 * straight in the session table, finds a real record for every `[id]` route,
 * writes the routes file and runs `docs/design-system/qa/compare-key-screens.mjs`.
 * Output: docs/qa/design-system/key-screens/ (ref/app PNGs, diff notes, SUMMARY.md).
 *
 *   npm run build && node tools/qa-key-screens.mjs
 *
 * Everything is synthetic; nothing leaves the machine. The database and the
 * private storage are dropped at the end unless KEEP_QA_DB=1.
 *
 * Screens whose records the demo seed does not create (K11 request, K18
 * pedigree) are taken from a database a real flow left behind:
 *   KEEP_BROWSER_DB=1 node tools/browser-tests.mjs tests/browser/cross-flow.test.ts
 *   QA_DB=<kept name> QA_STORAGE=<kept dir> node tools/qa-key-screens.mjs --only K11,K18
 * An existing database is used as it is (no seed) and never dropped.
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
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.error('No production build found. Run `npm run build` first.');
  process.exit(1);
}

const admin = async (sql, params = []) => {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
};
const dbUrl = (name) => Object.assign(new URL(ADMIN_URL), { pathname: '/' + name }).toString();
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(args.join(' ') + ' exited with ' + code))));
  });

const existing = process.env.QA_DB ?? null;
const name = existing ?? 'hamzist_qa_' + randomBytes(5).toString('hex');
const url = dbUrl(name);
const storage = existing ? process.env.QA_STORAGE : await fsp.mkdtemp(path.join(os.tmpdir(), 'hamzist-qa-storage-'));
const onlyArg = process.argv.includes('--only') ? ['--only', process.argv[process.argv.indexOf('--only') + 1]] : [];
const stateDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hamzist-qa-sessions-'));
let server = null;
let exitCode = 1;

try {
  if (!existing) await admin('create database "' + name + '"');
  const { migrateTo } = await import('../src/db/migrate.ts');
  const { createDatabase } = await import('../src/db/client.ts');
  const { loadEnv } = await import('../src/config/env.ts');
  const { seedBaseline } = await import('../src/db/seed/index.ts');
  const { seedDevFixtures } = await import('../src/db/seed/dev-fixtures.ts');
  const { createSession } = await import('../src/identity/session.ts');

  if (!existing) await migrateTo(url);
  const env = { ...process.env, APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: url, PRIVATE_STORAGE_DIR: storage };
  const runEnv = loadEnv(env);
  if (!existing) {
    const { db, pool } = createDatabase(url);
    try {
      await seedBaseline(db);
      await seedDevFixtures(db, runEnv);
    } finally {
      await pool.end();
    }
    await run([path.join('src', 'db', 'seed', 'demo.ts')], env);
  }

  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: root,
    env: { ...env, SITE_URL: base },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(base + '/login')).status === 200) break;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const conn = createDatabase(url);
  const q = async (sql, params = []) => (await conn.pool.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0] ?? null;
  const accountByMobile = async (mobile) => (await one('select id from account where mobile = $1', [mobile]))?.id ?? null;

  // A session cookie per account and context, written as a Playwright storage state.
  const states = new Map();
  const stateFor = async (accountId, context) => {
    if (!accountId) return null;
    const key = accountId + ':' + context;
    if (states.has(key)) return states.get(key);
    const session = await createSession(conn.db, accountId, context);
    const file = path.join(stateDir, key.replace(/[^a-z0-9]/gi, '_') + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ cookies: [{ name: 'hz_session', value: session.token, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] }),
    );
    states.set(key, file);
    return file;
  };

  // Records the key screens show (demo data; the oldest open case where there is a queue).
  const kyc = await one("select id from kyc_case order by (status = 'UNDER_REVIEW') desc, submitted_at nulls last limit 1");
  const article = await one("select slug from content_item where kind = 'ARTICLE' and status = 'PUBLISHED' order by publish_at desc nulls last limit 1");
  const listing = await one("select id, seller_account_id from animal_listing where status = 'PUBLISHED' order by published_at desc nulls last limit 1");
  const product = await one("select slug from commerce_product where status = 'PUBLISHED' limit 1").catch(() => null);
  const pedigree = await one('select id, animal_id, owner_account_id from pedigree limit 1').catch(() => null);
  const animal = pedigree ? { id: pedigree.animal_id, owner: pedigree.owner_account_id } : await one("select id, owner_account_id as owner from animal where status = 'REGISTERED' limit 1");
  const request = await one('select id, owner_account_id from vet_visit_request order by created_at desc limit 1').catch(() => null);
  const report = await one('select content_id from moderation_report order by created_at limit 1').catch(() => null);
  const anyContent = await one('select id from content_item limit 1');
  const inquiryListing = await one('select listing_id, seller_account_id from listing_inquiry order by created_at desc limit 1').catch(() => null);

  const user = animal?.owner ?? (await accountByMobile('09990000001'));
  const roleState = {
    visitor: null,
    '': null,
    user: await stateFor(user, 'USER'),
    seller: await stateFor(inquiryListing?.seller_account_id ?? listing?.seller_account_id ?? user, 'USER'),
    'association operator': await stateFor(await accountByMobile('09990000004'), 'ASSOCIATION_OPERATOR'),
    'genetics operator': await stateFor(await accountByMobile('09990000005'), 'GENETICS_OPERATOR'),
    superadmin: await stateFor(await accountByMobile('09990000006'), 'SUPERADMIN'),
    'content admin': await stateFor(await accountByMobile('09990000008'), 'CONTENT_ADMIN'),
    'listing moderator': await stateFor(await accountByMobile('09990000011'), 'LISTING_MODERATOR'),
    'trusted vet': await stateFor(await accountByMobile('09990000003'), 'TRUSTED_VET'),
  };
  const ids = {
    '/assoc/kyc/[id]': kyc ? '/assoc/kyc/' + kyc.id : null,
    '/articles/[slug]': article ? '/articles/' + article.slug : null,
    '/animals-market/[id]': listing ? '/animals-market/' + listing.id : null,
    '/shop/[slug]': product ? '/shop/' + product.slug : null,
    '/animals/[id]': animal ? '/animals/' + animal.id : null,
    '/requests/[id]': request ? '/requests/' + request.id : null,
    '/content/reports/[id]': '/content/reports/' + (report?.content_id ?? anyContent?.id),
    '/account/listings/[id]/requests': inquiryListing ? '/account/listings/' + inquiryListing.listing_id + '/requests' : listing ? '/account/listings/' + listing.id + '/requests' : null,
    '/documents/pedigree/[id]': pedigree ? '/documents/pedigree/' + pedigree.id : null,
  };
  // The request page belongs to its own owner.
  const requestState = request ? await stateFor(request.owner_account_id, 'USER') : roleState.user;
  const pedigreeState = pedigree ? await stateFor(pedigree.owner_account_id, 'USER') : roleState.user;
  await conn.pool.end();

  const template = JSON.parse(fs.readFileSync(path.join(root, 'docs/qa/design-system/key-screen-routes.json'), 'utf8'));
  const config = {};
  for (const [key, entry] of Object.entries(template)) {
    const route = ids[entry.path] !== undefined ? ids[entry.path] : entry.path;
    const storageState = entry.path === '/requests/[id]' ? requestState : entry.path === '/documents/pedigree/[id]' ? pedigreeState : (roleState[entry.role] ?? null);
    config[key] = { ...entry, path: route ?? entry.path, storageState };
  }
  const configFile = path.join(stateDir, 'key-screen-routes.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log('QA: database ' + name + ', server ' + base);
  await run(['docs/design-system/qa/compare-key-screens.mjs', '--base', base, '--config', configFile, ...onlyArg], env);
  exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once('exit', r)).catch(() => undefined);
  }
  if (process.env.KEEP_QA_DB !== '1' && !existing) {
    await admin('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1', [name]).catch(() => undefined);
    await admin('drop database if exists "' + name + '"').catch(() => undefined);
    await fsp.rm(storage, { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
process.exit(exitCode);
