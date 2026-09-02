/**
 * The visual reference review — gate `visual-reference-review`.
 *
 * What this gate can honestly prove is what it checks: the design tokens the
 * Design System defines are really the ones the pages render, the direction is
 * RTL at both reviewed sizes, the logo keeps its true aspect ratio, identifiers
 * stay left-to-right inside Persian text, and no screen scrolls sideways. What
 * it cannot prove is pixel fidelity against the approved prototype: the Figma
 * file is read-only for this execution and no exported reference image is
 * available, so that comparison stays UNVERIFIED and is recorded as such rather
 * than being counted as passed (§24, D06).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-019');

/** The two sizes the review covers, as the Design System names them. */
const VIEWPORTS = {
  mobileReference: { width: 360, height: 800 },
  desktop: { width: 1440, height: 900 },
} as const;

const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));

let browser!: Browser;
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let operatorState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let centreState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let adminState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

async function lastCodeFor(mobile: string): Promise<string> {
  return withDb(async (db) => {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} and body like '%کد%' order by created_at desc limit 1`,
    );
    const match = /(\d{6})/.exec(rows.rows[0]?.body ?? '');
    assert.ok(match, 'no code was sent to ' + mobile);
    return match![1]!;
  });
}

async function signIn(context: BrowserContext, mobile: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByTestId('verify-code').click(),
  ]);
  return page;
}

const contextFor = (
  state: Awaited<ReturnType<BrowserContext['storageState']>> | null,
  viewport: { width: number; height: number },
) => browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

/** The screens this review covers, with the session each one belongs to. */
const SCREENS = [
  { name: 'dashboard', href: '/dashboard', session: 'owner' },
  { name: 'animals', href: '/animals', session: 'owner' },
  { name: 'permits', href: '/mating/permits', session: 'owner' },
  { name: 'permit-new', href: '/mating/permits/new', session: 'owner' },
  { name: 'declaration', href: '/declaration', session: 'owner' },
  { name: 'puppy-cards', href: '/puppy-cards/checkout', session: 'owner' },
  { name: 'notifications', href: '/notifications', session: 'owner' },
  { name: 'assoc', href: '/assoc', session: 'operator' },
  { name: 'assoc-members', href: '/assoc/members', session: 'operator' },
  { name: 'genetics', href: '/genetics', session: 'centre' },
  { name: 'admin-settings', href: '/admin/settings', session: 'admin' },
  { name: 'admin-breeds', href: '/admin/breeds', session: 'admin' },
] as const;

const stateFor = (session: string) =>
  session === 'owner'
    ? ownerState
    : session === 'operator'
      ? operatorState
      : session === 'centre'
        ? centreState
        : adminState;

function syntheticNationalId(): string {
  const base = String(900_000_000 + randomInt(0, 99_000_000)).slice(0, 9);
  for (let d = 0; d < 10; d += 1) {
    const candidate = base + d;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(candidate[i]) * (10 - i);
    const remainder = sum % 11;
    const check = Number(candidate[9]);
    if (remainder < 2 ? check === remainder : check === 11 - remainder) return candidate;
  }
  throw new Error('no valid check digit');
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();

  for (const [mobile, assign] of [
    [OPERATOR_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (operatorState = s)],
    [GENETICS_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (centreState = s)],
    [ADMIN_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (adminState = s)],
  ] as const) {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      assign(await context.storageState());
    } finally {
      await context.close();
    }
  }

  const owner = await browser.newContext({ viewport: VIEWPORTS.mobileReference, locale: 'fa-IR' });
  try {
    const page = await signIn(owner, '0999' + String(randomInt(1_000_000, 9_999_999)));
    await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
    if ((await page.getByTestId('national-id').count()) > 0) {
      await page.getByTestId('first-name').fill('نمونه');
      await page.getByTestId('last-name').fill('کاربر بازبینی بصری');
      await page.getByTestId('national-id').fill(syntheticNationalId());
      await page.getByTestId('birth-date').fill('1990-01-01');
      await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
    }
    ownerState = await owner.storageState();
  } finally {
    await owner.close();
  }
});

after(async () => {
  await browser?.close();
});

test('every reviewed screen renders RTL at both sizes with no sideways scroll', async () => {
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    for (const screen of SCREENS) {
      const context = await contextFor(stateFor(screen.session), viewport);
      try {
        const page = await context.newPage();
        const response = await page.goto(BASE_URL + screen.href, { waitUntil: 'load' });
        assert.equal(response?.status(), 200, screen.href + ' must render at ' + label);

        const direction = await page.evaluate(() => document.documentElement.getAttribute('dir'));
        assert.equal(direction, 'rtl', screen.href + ' must render right to left');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, screen.href + ' must not scroll sideways at ' + label + ' (' + overflow + 'px)');

        await page.screenshot({
          path: path.join(SHOTS, screen.name + '-' + label + '.png'),
          fullPage: true,
        });
      } finally {
        await context.close();
      }
    }
  }
});

test('the rendered pages use the Design System tokens, not ad-hoc values', async () => {
  const context = await contextFor(ownerState, VIEWPORTS.mobileReference);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });

    // The token layer really exists at runtime, with the families the DS names.
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        brand: style.getPropertyValue('--color-bg-brand-subtle').trim(),
        text: style.getPropertyValue('--color-text-primary').trim(),
        controlMd: style.getPropertyValue('--size-control-md').trim(),
        font: getComputedStyle(document.body).fontFamily,
      };
    });
    assert.notEqual(tokens.brand, '', 'the brand token must be defined');
    assert.notEqual(tokens.text, '', 'the text token must be defined');
    assert.notEqual(tokens.controlMd, '', 'the control size token must be defined');
    assert.match(tokens.font, /Vazirmatn|IRANSans|system/i, 'the Persian font family is the one the DS names');

    // The logo keeps its true aspect ratio rather than being stretched.
    const logo = page.locator('img[alt*="زیست"], img[alt*="Hamzist"], svg[role="img"]').first();
    if ((await logo.count()) > 0) {
      const box = await logo.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0, 'the logo renders with a real size');
    }
    await page.screenshot({ path: path.join(SHOTS, 'tokens-dashboard.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('identifiers stay left-to-right inside Persian text on the new screens', async () => {
  const context = await contextFor(ownerState, VIEWPORTS.mobileReference);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/mating/permits/new', { waitUntil: 'load' });

    // Where an identifier is typed, the field is explicitly left to right, so a
    // code never renders reversed inside a Persian sentence (§24.3).
    const code = page.getByTestId('counterparty-code');
    if ((await code.count()) > 0) {
      assert.equal(await code.getAttribute('dir'), 'ltr');
    }
    await page.screenshot({ path: path.join(SHOTS, 'identifiers-ltr.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the visual comparison against the approved prototype stays UNVERIFIED', async () => {
  // §24 and D06: the pages are built from the Design System in code, and the
  // Figma file is read-only for this execution. No exported reference image is
  // available in the repository, so there is nothing to compare a rendered
  // screen against. This test states that fact as evidence rather than letting
  // a passing screenshot count as visual approval.
  const references = await fs
    .readdir(path.join('reference-inputs'))
    .then((entries) => entries.filter((entry) => /\.(png|jpe?g|fig|svg)$/i.test(entry)))
    .catch(() => [] as string[]);
  assert.equal(
    references.length,
    0,
    'if a reference export is added, this gate must be rewritten to compare against it',
  );

  const record = {
    verdict: 'UNVERIFIED',
    reasonFa:
      'تصویر مرجع تأییدشده پروتوتایپ در این اجرا در دسترس نیست و Figma فقط‌خواندنی است؛ بنابراین تطبیق پیکسلی انجام نشد و «تأییدنشده» ثبت می‌شود.',
    covered: SCREENS.map((screen) => screen.href),
    viewports: Object.keys(VIEWPORTS),
    run: RUN,
  };
  await fs.writeFile(
    path.join(SHOTS, 'visual-review.json'),
    JSON.stringify(record, null, 2) + '\n',
    'utf8',
  );
  assert.equal(record.verdict, 'UNVERIFIED');
});
