/**
 * Design-system screenshots — CLAUDE-CODE-DESIGN-SYSTEM-RULES §3.
 *
 * Signs in as a fixture account (synthetic 0999 numbers, dev SMS outbox) and
 * saves each route at 390 and 1440 to docs/qa/design-system/<slug>-<width>.png,
 * so every page can be compared with its key screen. Local development only.
 *
 *   node tools/ds-shots.mjs [--base http://localhost:3100] [--only <substring>] [--out dir]
 *
 * Routes are `role route` pairs; role `-` means signed out.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const BASE = arg('base', 'http://localhost:3100');
const OUT = arg('out', 'docs/qa/design-system');
const ONLY = arg('only', '');
const ROUTES_FILE = arg('routes', 'tools/ds-routes.txt');

const ROLES = {
  owner: '09990000001',
  breeder: '09990000002',
  vet: '09990000003',
  assoc: '09990000004',
  genetics: '09990000005',
  admin: '09990000006',
  author: '09990000007',
  content: '09990000008',
  review: '09990000009',
  market: '09990000010',
};

if (process.env.APP_ENV === 'production') throw new Error('ds-shots is for local development only');

const routes = fs
  .readFileSync(ROUTES_FILE, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [role, route] = line.split(/\s+/);
    return { role, route };
  })
  .filter((entry) => !ONLY || entry.route.includes(ONLY) || entry.role === ONLY);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function lastCode(mobile) {
  const { rows } = await pool.query(
    'select body from dev_outbound_sms where to_mobile = $1 order by created_at desc limit 1',
    [mobile],
  );
  const match = /(\d{6})/.exec(rows[0]?.body ?? '');
  if (!match) throw new Error('no code for ' + mobile);
  return match[1];
}

const browser = await chromium.launch();
const states = new Map();
async function stateFor(role) {
  if (role === '-') return undefined;
  if (states.has(role)) return states.get(role);
  const context = await browser.newContext({ locale: 'fa-IR' });
  const page = await context.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(ROLES[role]);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCode(ROLES[role]));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 }),
    page.getByTestId('verify-code').click(),
  ]);
  const state = await context.storageState();
  await context.close();
  states.set(role, state);
  return state;
}

fs.mkdirSync(OUT, { recursive: true });
const slug = (route) => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=&]+/g, '_'));
const report = [];
for (const { role, route } of routes) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      locale: 'fa-IR',
      viewport: { width, height: width === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
      storageState: await stateFor(role),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const response = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = path.join(OUT, slug(route) + '-' + width + '.png');
      await page.screenshot({ path: file, fullPage: true });
      report.push({ role, route, width, status: response?.status(), overflow, errors });
      console.log([response?.status(), width, overflow > 0 ? 'OVERFLOW ' + overflow : 'ok', role, route, errors.join(' | ')].join('\t'));
    } catch (error) {
      report.push({ role, route, width, error: String(error) });
      console.log(['ERR', width, role, route, String(error).slice(0, 120)].join('\t'));
    }
    await context.close();
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
await pool.end();
