/**
 * Veterinary centres in the browser — Phase 2 PROMPT-008.
 *
 * The superadmin records a centre, adds a branch with announced hours, writes
 * its services and amenities and publishes it; the review operator records the
 * licence and can hide the page; a visitor filters the directory on a phone and
 * reads the centre; a veterinarian invited to the team appears only after
 * accepting. The management environments stay closed to everyone else.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { accountRoles, accounts } from '../../src/db/schema/core.ts';
import { vetProfiles } from '../../src/db/schema/vets.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-008');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const RUN = String(randomInt(100_000, 999_999));

const ACCOUNTS = { admin: '09990000006', reviewer: '09990000009', user: '09990000001' } as const;
type Who = keyof typeof ACCOUNTS | 'vet' | 'visitor';

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let vet: { mobile: string; nameFa: string; councilCode: string };
let centreSlug = '';

async function lastCodeFor(mobile: string): Promise<string> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} order by created_at desc limit 1`,
    );
    const match = /(\d{6})/.exec(rows.rows[0]?.body ?? '');
    assert.ok(match, 'no code was sent to ' + mobile);
    return match![1]!;
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page, mobile: string): Promise<void> {
  await page.goto(BASE_URL + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByTestId('verify-code').click(),
  ]);
}

/** A Phase 1 veterinarian with a verified profile, to be invited to the team. */
async function seedVet(): Promise<typeof vet> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const mobile = '0999' + String(randomInt(1_000_000, 9_999_999));
    const nameFa = 'دامپزشک تیم SYNTHETIC ' + RUN;
    const councilCode = 'SYN-TEAM-' + RUN;
    const [account] = await db.insert(accounts).values({ mobile, status: 'ACTIVE' }).returning({ id: accounts.id });
    await db.insert(accountRoles).values({ accountId: account!.id, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await db.insert(vetProfiles).values({ accountId: account!.id, displayNameFa: nameFa, councilCode, councilVerifiedAt: new Date() });
    return { mobile, nameFa, councilCode };
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  vet = await seedVet();
  browser = await chromium.launch();
  for (const [who, mobile] of [...Object.entries(ACCOUNTS), ['vet', vet.mobile]] as [Who, string][]) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(await context.newPage(), mobile);
      states.set(who, await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(who: Who, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: who === 'visitor' ? undefined : states.get(who) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page.waitForFunction(
    ([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false,
    [testId, text] as const,
  );
}

const textOf = async (page: Page, testId: string): Promise<string> => ((await page.getByTestId(testId).textContent()) ?? '').trim();

const CENTRE_NAME = 'بیمارستان SYNTHETIC ' + RUN;

test('the superadmin records a centre with a branch and hours, and publishes it', async () => {
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/centres', { waitUntil: 'load' });
    await page.getByTestId('centre-name').fill(CENTRE_NAME);
    await page.getByTestId('centre-type').selectOption('HOSPITAL');
    // No city yet: the centre says where it is once its first branch is recorded.
    await page.getByTestId('centre-contact').fill('SYNTHETIC خیابان آزمایشی');
    await page.getByTestId('centre-source').fill('SYNTHETIC وب‌سایت مرکز');
    await page.getByTestId('centre-create-reason').fill('SYNTHETIC ثبت مرکز');
    await page.getByTestId('create-centre').click();
    await waitForText(page, 'centre-create-result', 'ثبت شد');

    const row = page.locator('[data-testid^="centre-row-"]', { hasText: CENTRE_NAME });
    await row.waitFor();
    await Promise.all([page.waitForURL((url) => /^\/admin\/centres\/[0-9a-f-]{36}$/.test(url.pathname)), row.click()]);
    await page.getByTestId('centre-axes').waitFor();
    assert.match(await textOf(page, 'centre-axis-ownership'), /بدون مالک$/);
    assert.match(await textOf(page, 'centre-axis-verification'), /ثبت‌نشده$/);

    // Publishing is refused until the centre says something and has a branch.
    await page.getByTestId('centre-status-reason').fill('SYNTHETIC انتشار زودهنگام');
    await page.getByTestId('change-centre-status').click();
    await waitForText(page, 'centre-status-result', 'پیش از انتشار');

    await page.getByTestId('branch-name').fill('شعبه مرکزی ' + RUN);
    await page.getByTestId('branch-kind').selectOption('HOSPITAL');
    await page.getByTestId('branch-province').selectOption('tehran');
    await page.getByTestId('branch-city').selectOption({ label: 'تهران' });
    await page.getByTestId('branch-address').fill('نشانی آزمایشی ' + RUN);
    await page.getByTestId('branch-phone').fill('02100000000');
    await page.getByTestId('opens-0').fill('۰۹:۰۰');
    await page.getByTestId('closes-0').fill('17:00');
    await page.getByTestId('add-branch').click();
    await waitForText(page, 'add-branch-result', 'شعبه اضافه شد');

    await page.getByTestId('centre-about').fill('SYNTHETIC معرفی بیمارستان آزمایشی برای بررسی صفحه عمومی.');
    await page.getByTestId('centre-phone').fill('02100000009');
    await page.getByTestId('centre-service-EMERGENCY').check();
    await page.getByTestId('centre-species-DOG').check();
    await page.getByTestId('centre-facility-PARKING').check();
    await page.getByTestId('centre-profile-reason').fill('SYNTHETIC اطلاعات مرکز');
    await page.getByTestId('save-centre-profile').click();
    await waitForText(page, 'centre-profile-result', 'ذخیره شد');
    assert.ok(await page.getByTestId('centre-service-EMERGENCY').isChecked(), 'the saved choices survive the refresh');

    await page.getByTestId('centre-status-reason').fill('SYNTHETIC آماده انتشار');
    await page.getByTestId('change-centre-status').click();
    await waitForText(page, 'centre-status-result', 'مرکز منتشر شد');
    await page.getByTestId('centre-public-link').waitFor();
    centreSlug = (await page.getByTestId('centre-public-link').getAttribute('href'))!.split('/').pop()!;
    assert.match(centreSlug, /^centre-[0-9a-f]{10}$/);
    await page.screenshot({ path: path.join(SHOTS, 'admin-centre-editor.png'), fullPage: true });
  });
});

test('the review operator records the licence, and a visitor reads the centre on a phone', async () => {
  assert.ok(centreSlug, 'the centre was published by the previous test');
  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/centres', { waitUntil: 'load' });
    const row = page.locator('[data-testid^="centre-row-"]', { hasText: CENTRE_NAME });
    await row.waitFor();
    await Promise.all([page.waitForURL((url) => /^\/review\/centres\/[0-9a-f-]{36}$/.test(url.pathname)), row.click()]);
    // The reviewer records the licence but does not rewrite the centre's content.
    assert.equal(await page.getByTestId('centre-profile-form').count(), 0);
    await page.getByTestId('licence-number').fill('SYN-LIC-' + RUN);
    await page.getByTestId('licence-status').selectOption('VALID');
    await page.getByTestId('licence-reason').fill('SYNTHETIC مدارک دیده شد');
    await page.getByTestId('save-centre-licence').click();
    await waitForText(page, 'centre-licence-result', 'مجوز مرکز ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'review-centre-licence.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/centers', { waitUntil: 'load' });
    await page.getByTestId('centre-search').waitFor();
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.getByTestId('centre-filter-type').selectOption('HOSPITAL');
    await page.getByTestId('centre-filter-verified').check();
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('verified') === '1'),
      page.getByTestId('centre-search-submit').click(),
    ]);
    const card = page.getByTestId('centre-card-' + centreSlug);
    await card.waitFor();
    const cardText = (await card.textContent()) ?? '';
    assert.match(cardText, /مجوز معتبر/);
    assert.match(cardText, /تهران/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
    await page.screenshot({ path: path.join(SHOTS, 'centres-list-mobile.png'), fullPage: true });

    await Promise.all([page.waitForURL((url) => url.pathname === '/centers/' + centreSlug), card.click()]);
    await page.getByTestId('centre-page').waitFor();
    assert.equal((await page.locator('h1').textContent())?.trim(), CENTRE_NAME);
    await page.getByTestId('centre-verified').waitFor();
    assert.match(await textOf(page, 'centre-services'), /اورژانس/);
    assert.match(await textOf(page, 'centre-facilities'), /پارکینگ/);
    assert.match(await textOf(page, 'centre-branch-hours'), /09:00/);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), BASE_URL + '/centers/' + centreSlug);
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')?.['@type']));
    assert.ok(types.includes('VeterinaryCare') && types.includes('BreadcrumbList'), types.join(','));
    await page.screenshot({ path: path.join(SHOTS, 'centre-page-mobile.png'), fullPage: true });
  });
});

test('a veterinarian joins the team only after accepting the invitation', async () => {
  assert.ok(centreSlug, 'the centre was published by the first test');
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/centres', { waitUntil: 'load' });
    const row = page.locator('[data-testid^="centre-row-"]', { hasText: CENTRE_NAME });
    await Promise.all([page.waitForURL((url) => /^\/admin\/centres\/[0-9a-f-]{36}$/.test(url.pathname)), row.click()]);
    await page.getByTestId('member-ref').fill(vet.councilCode);
    await page.getByTestId('member-role').fill('جراح');
    await page.getByTestId('member-reason').fill('SYNTHETIC دعوت به تیم');
    await page.getByTestId('invite-member').click();
    await waitForText(page, 'member-invite-result', 'دعوت فرستاده شد');
    await waitForText(page, 'centre-members', 'در انتظار پذیرش');
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/centers/' + centreSlug, { waitUntil: 'load' });
    await page.getByTestId('centre-page').waitFor();
    assert.equal(await page.getByTestId('centre-team').count(), 0, 'an invitation alone shows nobody');
  });

  await as('vet', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    const invitation = page.locator('[data-testid^="centre-invitation-"]').first();
    await invitation.waitFor();
    assert.match((await invitation.textContent()) ?? '', new RegExp(CENTRE_NAME));
    await page.locator('[data-testid^="accept-invitation-"]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="centre-invitation-"]').length === 0);
    await page.screenshot({ path: path.join(SHOTS, 'vet-invitation-accepted.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/centers/' + centreSlug, { waitUntil: 'load' });
    await page.getByTestId('centre-team').waitFor();
    assert.match(await textOf(page, 'centre-team'), new RegExp(vet.nameFa));
    assert.match(await textOf(page, 'centre-team'), /جراح/);
  });
});

test('hiding a centre removes its page, and the management environments stay closed', async () => {
  assert.ok(centreSlug, 'the centre was published by the first test');
  await as('user', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/centres', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
    await page.goto(BASE_URL + '/review/centres', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
    await page.goto(BASE_URL + '/account/centres', { waitUntil: 'load' });
    await page.getByText('هنوز مرکزی به شما سپرده نشده است').waitFor();
  });

  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/centres', { waitUntil: 'load' });
    const row = page.locator('[data-testid^="centre-row-"]', { hasText: CENTRE_NAME });
    await Promise.all([page.waitForURL((url) => /^\/review\/centres\/[0-9a-f-]{36}$/.test(url.pathname)), row.click()]);
    await page.getByTestId('centre-status-to').selectOption('HIDDEN');
    await page.getByTestId('centre-status-reason').fill('SYNTHETIC پنهان‌سازی آزمایشی');
    await page.getByTestId('change-centre-status').click();
    await waitForText(page, 'centre-status-result', 'مرکز پنهان شد');
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/centers/' + centreSlug, { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
    await page.getByTestId('not-found').waitFor();
    await page.goto(BASE_URL + '/centers?q=' + encodeURIComponent(CENTRE_NAME), { waitUntil: 'load' });
    await page.getByTestId('centre-search').waitFor();
    assert.equal(await page.getByTestId('centre-card-' + centreSlug).count(), 0);
    await page.goto(BASE_URL + '/account/centres', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/centres');
  });
});
