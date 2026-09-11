/**
 * Suggested records and centre claims in the browser — Phase 2 PROMPT-009.
 *
 * An ordinary user reports that a centre exists, the review operator approves
 * it and the record appears in the public directory with the «بدون مالک»
 * label; a representative claims it with a document, the reviewer approves and
 * the same page belongs to that account from then on. The review environment
 * stays closed to everyone else.
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

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-009');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const RUN = String(randomInt(100_000, 999_999));

const ACCOUNTS = { suggester: '09990000001', claimant: '09990000002', reviewer: '09990000009' } as const;
type Who = keyof typeof ACCOUNTS | 'visitor';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const licence = () => ({ name: 'licence.png', mimeType: 'image/png', buffer: PNG });

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let centreSlug = '';

const CENTRE_NAME = 'درمانگاه پیشنهادی SYNTHETIC ' + RUN;

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

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
  for (const [who, mobile] of Object.entries(ACCOUNTS) as [Who, string][]) {
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

/** Opens the queue item with this name and records a decision. */
async function decide(page: Page, listPath: string, name: string, decision: string, reason: string, expected: string): Promise<void> {
  await page.goto(BASE_URL + listPath, { waitUntil: 'load' });
  const item = page.locator('[data-testid^="' + (listPath.includes('suggestions') ? 'suggestion-item-' : 'claim-item-') + '"]', { hasText: name });
  await item.waitFor();
  await Promise.all([page.waitForURL((url) => /[0-9a-f-]{36}$/.test(url.pathname)), item.click()]);
  const prefix = listPath.includes('suggestions') ? 'suggestion' : 'claim';
  await page.getByTestId(prefix + '-decision-form').waitFor();
  await page.getByTestId(prefix + '-decision').selectOption(decision);
  await page.getByTestId(prefix + '-decision-reason').fill(reason);
  await page.getByTestId('submit-' + prefix + '-decision').click();
  await waitForText(page, prefix + '-decision-result', expected);
}

test('an ordinary user suggests a centre and the reviewer publishes it without an owner', async () => {
  await as('suggester', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/suggestions', { waitUntil: 'load' });
    await page.getByTestId('suggestion-form').waitFor();
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.getByTestId('suggestion-kind').selectOption('CENTRE');
    await page.getByTestId('suggestion-name').fill(CENTRE_NAME);
    await page.getByTestId('suggestion-province').selectOption('tehran');
    await page.getByTestId('suggestion-city').selectOption({ label: 'تهران' });
    await page.getByTestId('suggestion-contact').fill('SYNTHETIC خیابان آزمایشی');
    await page.getByTestId('suggestion-source').fill('SYNTHETIC تابلوی درمانگاه');
    await page.getByTestId('submit-suggestion').click();
    await waitForText(page, 'suggestion-result', 'ثبت شد');
    const status = page.locator('[data-testid^="suggestion-status-"]').first();
    await status.waitFor();
    assert.match((await status.textContent()) ?? '', /در انتظار بررسی/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
    await page.screenshot({ path: path.join(SHOTS, 'suggestion-submitted-mobile.png'), fullPage: true });
  });

  await as('reviewer', DESKTOP, async (page) => {
    await decide(page, '/review/suggestions', CENTRE_NAME, 'REQUEST_CORRECTION', 'SYNTHETIC منبع را دقیق‌تر بنویسید', 'درخواست اصلاح ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'review-suggestion.png'), fullPage: true });
  });

  await as('suggester', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/suggestions', { waitUntil: 'load' });
    // Both forms are on this page — a new suggestion and the correction — so the fields are scoped.
    const correction = page.getByTestId('suggestion-correction-form');
    await correction.waitFor();
    await correction.getByTestId('suggestion-source').fill('SYNTHETIC تابلوی درمانگاه و مراجعه حضوری');
    await correction.getByTestId('resubmit-suggestion').click();
    // The corrected suggestion is waiting for review again, so the correction form is gone.
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="suggestion-correction-form"]') &&
        (document.querySelector('[data-testid^="suggestion-status-"]')?.textContent ?? '').includes('در انتظار بررسی'),
    );
  });

  await as('reviewer', DESKTOP, async (page) => {
    await decide(page, '/review/suggestions', CENTRE_NAME, 'APPROVE', 'SYNTHETIC با منبع تطبیق داده شد', 'رکورد بدون مالک منتشر شد');
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/centers?q=' + encodeURIComponent(CENTRE_NAME), { waitUntil: 'load' });
    const card = page.locator('[data-testid^="centre-card-"]', { hasText: CENTRE_NAME });
    await card.waitFor();
    assert.match((await card.textContent()) ?? '', /بدون مالک/);
    centreSlug = (await card.getAttribute('data-testid'))!.replace('centre-card-', '');
    await Promise.all([page.waitForURL((url) => url.pathname === '/centers/' + centreSlug), card.click()]);
    await page.getByTestId('centre-unowned').waitFor();
    assert.match(await textOf(page, 'centre-listed-place'), /تهران/);
    // The claim link sends an anonymous visitor to sign in and back.
    await Promise.all([page.waitForURL((url) => url.pathname === '/login'), page.getByTestId('centre-claim-link').click()]);
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/centres/claim/' + centreSlug);
  });
});

test('a representative claims the centre with a document and takes over the same page', async () => {
  assert.ok(centreSlug, 'the centre was published by the previous test');
  await as('claimant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/centres/claim/' + centreSlug, { waitUntil: 'load' });
    await page.getByTestId('centre-claim-form').waitFor();
    await page.getByTestId('claim-name').fill('نماینده SYNTHETIC ' + RUN);
    await page.getByTestId('claim-role').fill('مدیر فنی');
    await page.getByTestId('claim-phone').fill('02100000000');
    await page.getByTestId('claim-doc-CENTRE_LICENCE').setInputFiles(licence());
    await page.screenshot({ path: path.join(SHOTS, 'claim-form-mobile.png'), fullPage: true });
    await page.getByTestId('submit-centre-claim').click();
    await page.getByTestId('claim-in-review').waitFor();
  });

  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/centres/claims', { waitUntil: 'load' });
    const item = page.locator('[data-testid^="claim-item-"]', { hasText: CENTRE_NAME });
    await item.waitFor();
    await Promise.all([page.waitForURL((url) => /[0-9a-f-]{36}$/.test(url.pathname)), item.click()]);
    const document = await page.getByTestId('claim-document-CENTRE_LICENCE').getAttribute('href');
    const file = await page.request.get(BASE_URL + document!);
    assert.equal(file.status(), 200, 'the reviewer reads the licence');
    assert.equal(file.headers()['content-type'], 'image/png');
    await page.getByTestId('claim-decision').selectOption('APPROVE');
    await page.getByTestId('claim-decision-reason').fill('SYNTHETIC پروانه با نام مرکز می‌خواند');
    await page.getByTestId('submit-claim-decision').click();
    await waitForText(page, 'claim-decision-result', 'سپرده شد');
    await page.screenshot({ path: path.join(SHOTS, 'review-claim.png'), fullPage: true });
  });

  await as('claimant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/centres', { waitUntil: 'load' });
    const row = page.locator('[data-testid^="my-centre-"]', { hasText: CENTRE_NAME });
    await row.waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'centre-claimed.png'), fullPage: true });
    // The new manager really manages it.
    await Promise.all([page.waitForURL((url) => /^\/account\/centres\/[0-9a-f-]{36}$/.test(url.pathname)), row.click()]);
    await page.getByTestId('centre-axes').waitFor();
    assert.match(await textOf(page, 'centre-axis-ownership'), /دارای مدیر$/);
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/centers/' + centreSlug, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'the same address now belongs to the claimant');
    assert.equal(await page.getByTestId('centre-unowned').count(), 0);
  });
});

test('the review environment and the claim documents stay closed to everyone else', async () => {
  await as('suggester', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/suggestions', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
    await page.goto(BASE_URL + '/review/centres/claims', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
  });
  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/suggestions', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/suggestions');
  });
});
