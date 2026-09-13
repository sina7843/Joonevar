/**
 * Veterinarian onboarding and claims in the browser — Phase 2 PROMPT-007,
 * moved onto the Phase 2.5 doctor path (PROMPT-005, DEC-0191).
 *
 * A signed-in account chooses the doctor path and applies with general or
 * specialist, its council code and council card; the association admin asks for
 * a correction, the applicant answers it and the association verifies; the new
 * owner holds exactly the unlicensed doctor tag, adds a location, writes the
 * profile and publishes it. Then the review operator publishes an unowned
 * profile, a visitor sees «بدون مالک» and the claim link, another veterinarian
 * claims it, the association verifies and the claimant takes over the same page.
 * The association environment and the documents stay closed to everyone else.
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
const ACCOUNTS = { applicant: '09990000001', claimant: '09990000002', reviewer: '09990000009', association: '09990000004' } as const;
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

async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page
    .waitForFunction(([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false, [testId, text] as const)
    .catch(async () => {
      const actual = (await page.locator('[data-testid="' + testId + '"]').first().textContent().catch(() => null)) ?? '(no such element)';
      throw new Error(testId + ' never said "' + text + '"; it said: ' + actual.trim().slice(0, 300));
    });
}

const textOf = async (page: Page, testId: string): Promise<string> => ((await page.getByTestId(testId).textContent()) ?? '').trim();

/**
 * The association admin opens the waiting case with this name and records a
 * decision. A decided case no longer shows its form, so the persisted status on
 * the re-rendered page is what proves the decision.
 */
async function decide(page: Page, name: string, decision: string, reason: string, expectedStatus: string): Promise<void> {
  await page.goto(BASE_URL + '/assoc/vet-doctors?view=OPEN', { waitUntil: 'load' });
  const item = page.locator('[data-testid="doctor-queue"] > li', { hasText: name });
  await item.waitFor();
  await Promise.all([page.waitForURL((url) => /^\/assoc\/vet-doctors\/[0-9a-f-]{36}$/.test(url.pathname)), item.getByTestId('open-doctor-case').click()]);
  await page.getByTestId('doctor-decision-form').waitFor();
  await page.getByTestId('doctor-decision-' + decision).check();
  await page.getByTestId('doctor-decision-reason').fill(reason);
  await page.getByTestId('submit-doctor-decision').click();
  await waitForText(page, 'doctor-case-status', expectedStatus);
}

const APPLICANT_NAME = 'دامپزشک متقاضی SYNTHETIC ' + RUN;

test('a veterinarian applies, answers a correction and, once verified, manages and publishes the profile', async () => {
  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await Promise.all([page.waitForURL('**/account/vet-profile?path=doctor'), page.getByTestId('path-doctor').click()]);
    await page.getByTestId('doctor-application-form').waitFor();
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.getByTestId('app-name').fill(APPLICANT_NAME);
    await page.getByTestId('app-scope-GENERAL').check();
    await page.getByTestId('app-council-code').fill('syn br7 ' + RUN);
    await page.getByTestId('app-phone').fill('02100000000');
    await page.getByTestId('app-province').selectOption('tehran');
    await page.getByTestId('app-city').selectOption({ label: 'تهران' });
    await page.getByTestId('app-doc-COUNCIL_CARD').setInputFiles(card('council-card.png'));
    await page.getByTestId('submit-doctor-application').click();
    await waitForText(page, 'doctor-case-status', 'ارسال‌شده');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
    await page.screenshot({ path: path.join(SHOTS, 'application-submitted-mobile.png'), fullPage: true });
  });

  await as('association', DESKTOP, async (page) => {
    await decide(page, APPLICANT_NAME, 'REQUEST_CORRECTION', 'SYNTHETIC تصویر کارت خوانا نیست', 'نیازمند اصلاح');
    assert.equal(await textOf(page, 'review-doctor-council-code'), 'SYNBR7' + RUN, 'the council code was normalised');
    documentPath = (await page.getByTestId('doctor-document-link-COUNCIL_CARD').getAttribute('href'))!;
    const file = await page.request.get(BASE_URL + documentPath);
    assert.equal(file.status(), 200, 'the association reads the council card');
    assert.equal(file.headers()['content-type'], 'image/png');
    assert.match(file.headers()['cache-control'] ?? '', /no-store/);
    await page.screenshot({ path: path.join(SHOTS, 'review-correction.png'), fullPage: true });
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'doctor-case-status', 'نیازمند اصلاح');
    assert.match(await textOf(page, 'doctor-review-note'), /خوانا نیست/);
    const form = page.getByTestId('doctor-correction-form');
    await form.getByTestId('app-statement').fill('SYNTHETIC کارت خوانا دوباره پیوست شد');
    await form.getByTestId('app-doc-IDENTITY').setInputFiles(card('identity.png'));
    await form.getByTestId('resubmit-doctor-application').click();
    await waitForText(page, 'doctor-case-status', 'ارسال‌شده');
  });

  await as('association', DESKTOP, async (page) => {
    await decide(page, APPLICANT_NAME, 'VERIFY', 'SYNTHETIC کارت نظام با کد تطبیق داده شد', 'کد نظام تأییدشده');
  });

  let slug = '';
  await as('applicant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-current-tag', 'دکتر دامپزشک - عمومی - بدون پروانه فعالیت');
    await page.getByTestId('directory-axes').waitFor();
    assert.match(await textOf(page, 'axis-verification'), /تأییدشده$/);
    assert.match(await textOf(page, 'axis-trusted'), /غیرفعال$/, 'verification does not make the veterinarian trusted');

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
    await page.getByTestId('doctor-application-form').waitFor();
    assert.equal(await page.getByTestId('app-name').inputValue(), unownedName);
    await page.getByTestId('app-scope-SPECIALIST').check();
    await page.getByTestId('app-council-code').fill('SYN-CL7-' + RUN);
    await page.getByTestId('app-doc-COUNCIL_CARD').setInputFiles(card('claim-card.png'));
    await page.getByTestId('submit-doctor-application').click();
    await page.getByTestId('claim-in-review').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'claim-in-review-mobile.png'), fullPage: true });
  });

  await as('association', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-doctors?view=OPEN', { waitUntil: 'load' });
    const item = page.locator('[data-testid="doctor-queue"] > li', { hasText: unownedName });
    await item.waitFor();
    assert.match((await item.textContent()) ?? '', /Claim/);
    await decide(page, unownedName, 'VERIFY', 'SYNTHETIC هویت و کارت نظام تطبیق داده شد', 'کد نظام تأییدشده');
    await page.getByTestId('doctor-claim-target').waitFor();
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/veterinarians/' + slug, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'the same address now belongs to the claimant');
    await page.getByTestId('vet-verified').waitFor();
    assert.equal(await page.getByTestId('vet-unowned').count(), 0);
  });

  await as('claimant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-current-tag', 'دکتر دامپزشک - متخصص - بدون پروانه فعالیت');
    await page.getByTestId('directory-axes').waitFor();
    assert.match(await textOf(page, 'axis-ownership'), /Claim/);
    await page.screenshot({ path: path.join(SHOTS, 'claimed-owner.png'), fullPage: true });
  });
});

test('the association environment and application documents stay closed to everyone else', async () => {
  assert.ok(documentPath, 'the first test captured a document address');
  await as('applicant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-doctors', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
    // The applicant reads their own document.
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 200);
  });
  await as('claimant', DESKTOP, async (page) => {
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 403, 'another account cannot read it');
  });
  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-doctors', { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN', 'the Phase 2 review operator does not verify council codes');
  });
  await as('visitor', MOBILE, async (page) => {
    assert.equal((await page.request.get(BASE_URL + documentPath)).status(), 401);
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/account/vet-profile');
  });
});
