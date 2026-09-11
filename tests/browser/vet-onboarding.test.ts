/**
 * Veterinarian onboarding and claims in the browser — Phase 2 PROMPT-007.
 *
 * A signed-in account requests a directory profile with its council code and
 * council card; the review operator asks for a correction, the applicant
 * answers it and the operator approves; the new owner adds a location, writes
 * the profile and publishes it. Then the operator publishes an unowned profile,
 * a visitor sees «بدون مالک» and the claim link, another veterinarian claims it
 * and takes over the same page. The review environment and the documents stay
 * closed to everyone else.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-007');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const RUN = String(randomInt(100_000, 999_999));

/** SYNTHETIC fixtures on the reserved 0999 range. */
const ACCOUNTS = { applicant: '09990000001', claimant: '09990000002', reviewer: '09990000009' } as const;
type Who = keyof typeof ACCOUNTS;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const card = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let documentPath = '';

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
  for (const who of Object.keys(ACCOUNTS) as Who[]) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(await context.newPage(), ACCOUNTS[who]);
      states.set(who, await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(who: Who | 'visitor', viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: who === 'visitor' ? undefined : states.get(who) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** A form's result line changes in place, so wait for the text rather than the element. */
async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page.waitForFunction(
    ([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false,
    [testId, text] as const,
  );
}

const textOf = async (page: Page, testId: string): Promise<string> => ((await page.getByTestId(testId).textContent()) ?? '').trim();

/** The operator opens the queue item with this name and records a decision. */
async function decide(page: Page, name: string, decision: string, reason: string, expected: string): Promise<void> {
  await page.goto(BASE_URL + '/review/vets', { waitUntil: 'load' });
  const item = page.locator('[data-testid^="review-item-"]', { hasText: name });
  await item.waitFor();
  await Promise.all([page.waitForURL((url) => /^\/review\/vets\/[0-9a-f-]{36}$/.test(url.pathname)), item.click()]);
  await page.getByTestId('review-decision-form').waitFor();
  await page.getByTestId('review-decision').selectOption(decision);
  await page.getByTestId('review-reason').fill(reason);
  await page.getByTestId('submit-review-decision').click();
  await waitForText(page, 'review-decision-result', expected);
}

const APPLICANT_NAME = 'دامپزشک متقاضی SYNTHETIC ' + RUN;

test('a veterinarian applies, answers a correction and, once approved, manages and publishes the profile', async () => {
  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.getByTestId('vet-application-form').waitFor();
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.getByTestId('app-name').fill(APPLICANT_NAME);
    await page.getByTestId('app-council-code').fill('syn br7 ' + RUN);
    await page.getByTestId('app-phone').fill('02100000000');
    await page.getByTestId('app-province').selectOption('tehran');
    await page.getByTestId('app-city').selectOption({ label: 'تهران' });
    await page.getByTestId('app-doc-COUNCIL_CARD').setInputFiles(card('council-card.png'));
    await page.getByTestId('submit-vet-application').click();
    await waitForText(page, 'vet-application-status', 'در انتظار بررسی');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
    await page.screenshot({ path: path.join(SHOTS, 'application-submitted-mobile.png'), fullPage: true });
  });

  await as('reviewer', DESKTOP, async (page) => {
    await decide(page, APPLICANT_NAME, 'REQUEST_CORRECTION', 'SYNTHETIC تصویر کارت خوانا نیست', 'درخواست اصلاح ثبت شد');
    documentPath = (await page.getByTestId('review-document-COUNCIL_CARD').getAttribute('href'))!;
    const file = await page.request.get(BASE_URL + documentPath);
    assert.equal(file.status(), 200, 'the reviewer reads the council card');
    assert.equal(file.headers()['content-type'], 'image/png');
    assert.match(file.headers()['cache-control'] ?? '', /no-store/);
    assert.match(await textOf(page, 'review-application-status'), /نیازمند اصلاح/);
    await page.screenshot({ path: path.join(SHOTS, 'review-correction.png'), fullPage: true });
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-application-status', 'نیازمند اصلاح');
    assert.match(await textOf(page, 'vet-application-note'), /خوانا نیست/);
    await page.getByTestId('app-statement').fill('SYNTHETIC کارت خوانا دوباره پیوست شد');
    await page.getByTestId('app-doc-IDENTITY').setInputFiles(card('identity.png'));
    await page.getByTestId('resubmit-vet-application').click();
    await waitForText(page, 'vet-application-status', 'در انتظار بررسی');
  });

  await as('reviewer', DESKTOP, async (page) => {
    await decide(page, APPLICANT_NAME, 'APPROVE', 'SYNTHETIC کارت نظام با کد تطبیق داده شد', 'درخواست تأیید شد');
  });

  let slug = '';
  await as('applicant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.getByTestId('directory-axes').waitFor();
    assert.match(await textOf(page, 'axis-verification'), /تأییدشده$/);
    assert.match(await textOf(page, 'axis-trusted'), /غیرفعال$/, 'approval does not make the veterinarian trusted');

    await page.getByTestId('own-location-name').fill('مطب SYNTHETIC ' + RUN);
    await page.getByTestId('own-location-province').selectOption('tehran');
    await page.getByTestId('own-location-city').selectOption({ label: 'تهران' });
    await page.getByTestId('own-location-address').fill('نشانی آزمایشی ' + RUN);
    await page.getByTestId('add-own-location').click();
    await waitForText(page, 'add-own-location-result', 'محل کار اضافه شد');

    await page.getByTestId('directory-bio').fill('SYNTHETIC معرفی دامپزشک تأییدشده برای بررسی صفحه عمومی.');
    await page.getByTestId('save-directory-profile').click();
    await waitForText(page, 'directory-profile-result', 'پروفایل عمومی ذخیره شد');

    await page.getByTestId('change-directory-status').click();
    await waitForText(page, 'directory-status-result', 'پروفایل منتشر شد');
    await page.getByTestId('directory-public-link').waitFor();
    slug = (await page.getByTestId('directory-public-link').getAttribute('href'))!.split('/').pop()!;
    await page.screenshot({ path: path.join(SHOTS, 'owner-published.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/veterinarians/' + slug, { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    assert.equal((await page.locator('h1').textContent())?.trim(), APPLICANT_NAME);
    await page.getByTestId('vet-verified').waitFor();
    assert.equal(await page.getByTestId('vet-trusted').count(), 0);
    assert.equal(await page.getByTestId('vet-unowned').count(), 0);
  });
});

test('a reviewer publishes an unowned profile, and a veterinarian claims it and takes over the same page', async () => {
  const unownedName = 'دامپزشک بدون مالک SYNTHETIC ' + RUN;
  let slug = '';
  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/vets/unowned', { waitUntil: 'load' });
    await page.getByTestId('unowned-name').fill(unownedName);
    await page.getByTestId('unowned-province').selectOption('fars');
    await page.getByTestId('unowned-city').selectOption({ label: 'شیراز' });
    await page.getByTestId('unowned-contact').fill('SYNTHETIC خیابان آزمایشی');
    await page.getByTestId('unowned-source').fill('SYNTHETIC وب‌سایت مطب');
    await page.getByTestId('unowned-reason').fill('SYNTHETIC منبع بررسی شد');
    await page.getByTestId('publish-unowned').click();
    await waitForText(page, 'unowned-vet-result', 'منتشر شد');
    const item = page.locator('[data-testid^="unowned-item-"]', { hasText: unownedName });
    await item.waitFor();
    slug = (await item.locator('[data-testid^="unowned-link-"]').getAttribute('href'))!.split('/').pop()!;
    assert.match(slug, /^vet-[0-9a-f]{10}$/);
    await page.screenshot({ path: path.join(SHOTS, 'review-unowned.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/veterinarians?q=' + encodeURIComponent(unownedName), { waitUntil: 'load' });
    const listed = page.getByTestId('vet-card-' + slug);
    await listed.waitFor();
    assert.match((await listed.textContent()) ?? '', /بدون مالک/);
    await Promise.all([page.waitForURL((url) => url.pathname === '/veterinarians/' + slug), listed.click()]);
    await page.getByTestId('vet-unowned').waitFor();
    assert.match(await textOf(page, 'vet-listed-place'), /شیراز/);
    assert.equal(await page.getByTestId('vet-verified').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'unowned-profile-mobile.png'), fullPage: true });
    await Promise.all([page.waitForURL((url) => url.pathname === '/login'), page.getByTestId('vet-claim-link').click()]);
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/vet-profile/claim/' + slug);
  });

  await as('claimant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile/claim/' + slug, { waitUntil: 'load' });
    await page.getByTestId('vet-application-form').waitFor();
    assert.equal(await page.getByTestId('app-name').inputValue(), unownedName);
    await page.getByTestId('app-council-code').fill('SYN-CL7-' + RUN);
    await page.getByTestId('app-doc-COUNCIL_CARD').setInputFiles(card('claim-card.png'));
    await page.getByTestId('submit-vet-application').click();
    await page.getByTestId('claim-in-review').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'claim-in-review-mobile.png'), fullPage: true });
  });

  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/vets', { waitUntil: 'load' });
    const item = page.locator('[data-testid^="review-item-"]', { hasText: unownedName });
    await item.waitFor();
    assert.match((await item.textContent()) ?? '', /Claim/);
    await decide(page, unownedName, 'APPROVE', 'SYNTHETIC هویت و کارت نظام تطبیق داده شد', 'درخواست تأیید شد');
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/veterinarians/' + slug, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'the same address now belongs to the claimant');
    await page.getByTestId('vet-verified').waitFor();
    assert.equal(await page.getByTestId('vet-unowned').count(), 0);
  });

  await as('claimant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.getByTestId('directory-axes').waitFor();
    assert.match(await textOf(page, 'axis-ownership'), /Claim/);
    await page.screenshot({ path: path.join(SHOTS, 'claimed-owner.png'), fullPage: true });
  });
});

test('the review environment and application documents stay closed to everyone else', async () => {
  assert.ok(documentPath, 'the first test captured a document address');
  await as('applicant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/vets', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
    // The applicant reads their own document.
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 200);
  });
  await as('claimant', DESKTOP, async (page) => {
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 403, 'another account cannot read it');
  });
  await as('visitor', MOBILE, async (page) => {
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 401);
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/vet-profile');
  });
});
