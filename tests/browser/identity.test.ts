/**
 * Identity in a real browser — required gate `identity-browser`.
 *
 * The whole flow runs against the built application: a new account signs in and
 * completes its profile, a returning account resumes the request it came from,
 * a document is uploaded and reviewed by an association operator, and a
 * mobile change that fails leaves the old number in place.
 *
 * Codes are read from the development outbox table, which needs database
 * access. Nothing here uses a bypass code and no endpoint returns one.
 *
 * Requires the built app on BASE_URL and `node src/db/seed/run.ts --dev`.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-004');
const MOBILE = { width: 360, height: 800 };

/** SYNTHETIC: 0999 is not an assigned mobile range, so a fixture cannot reach anyone. */
const newSyntheticMobile = () => '0999' + String(randomInt(1_000_000, 9_999_999));

/**
 * SYNTHETIC national ids start at 900000000, outside the issued range. A random
 * base keeps repeated runs from colliding on the uniqueness constraint.
 */
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

let browser!: Browser;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });

  // Clear the synthetic 0999 range only, so repeated runs are not stopped by the
  // hourly send cap. Real numbers keep their history and their cap.
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
  } finally {
    await pool.end();
  }

  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

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

/**
 * Wait for text anywhere in the rendered page.
 *
 * More robust than a text locator here: React re-renders these forms, so a
 * matched node can be replaced between resolution and the visibility check.
 */
async function expectText(page: Page, needle: string, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction((text) => (document.body.innerText ?? '').includes(text), needle, { timeout })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 400));
    });
}

async function requestCode(page: Page, mobile: string, next?: string) {
  await page.goto(BASE_URL + '/login' + (next ? '?next=' + encodeURIComponent(next) : ''), { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
}

async function submitCode(page: Page, code: string) {
  await page.getByTestId('code-input').fill(code);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')).catch(() => undefined),
    page.getByTestId('verify-code').click(),
  ]);
}

async function signIn(context: BrowserContext, mobile: string, next?: string): Promise<Page> {
  const page = await context.newPage();
  await requestCode(page, mobile, next);
  await submitCode(page, await lastCodeFor(mobile));
  return page;
}

/**
 * Creates a fresh account with a complete profile and returns its mobile, so a
 * "returning account" test does not have to share a fixture number and run into
 * the hourly send cap.
 */
async function completedAccount(): Promise<string> {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(context, mobile);
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('حساب بازگشتی');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1990-01-01');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
    return mobile;
  } finally {
    await context.close();
  }
}

test('a new account signs in, completes its profile and reaches the dashboard', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(context, mobile);

    // A brand new account must complete its identity group first (§6.1 step 4).
    assert.match(page.url(), /\/account\/complete/);
    await page.screenshot({ path: path.join(SHOTS, 'account-complete.png'), fullPage: true });

    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('کاربر آزمایشی');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1990-01-01');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    const body = await page.locator('body').innerText();
    assert.ok(body.includes('داشبورد'));
    // Registration is still locked because KYC has not been approved (§5).
    assert.ok(body.includes('برای ثبت حیوان هم‌زیست، احراز هویت لازم است'));
    await page.screenshot({ path: path.join(SHOTS, 'dashboard-new-account.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('an invalid national id is refused before anything is stored', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(context, newSyntheticMobile());
    assert.match(page.url(), /\/account\/complete/);

    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('کاربر آزمایشی');
    // Ten digits, wrong check digit.
    await page.getByTestId('national-id').fill('9000000008');
    await page.getByTestId('birth-date').fill('1990-01-01');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await page.getByTestId('save-identity').click();

    await expectText(page, 'کد ملی واردشده معتبر نیست');
    assert.match(page.url(), /\/account\/complete/, 'the flow stays on the form');
  } finally {
    await context.close();
  }
});

test('a returning account resumes the request it came from', async () => {
  const returning = await completedAccount();
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(context, returning, '/requests');
    assert.match(page.url(), /\/requests$/, 'sign-in returns to the originating request');
    assert.ok((await page.locator('body').innerText()).includes('درخواست‌ها'));
  } finally {
    await context.close();
  }
});

test('a returning account with no origin lands on the dashboard', async () => {
  const returning = await completedAccount();
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(context, returning);
    assert.match(page.url(), /\/dashboard$/);
  } finally {
    await context.close();
  }
});

test('an absolute origin is refused, so sign-in cannot be an open redirect', async () => {
  const returning = await completedAccount();
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/login?next=' + encodeURIComponent('https://example.invalid/steal'), {
      waitUntil: 'load',
    });
    await page.getByTestId('mobile-input').fill(returning);
    await page.getByTestId('send-code').click();
    await page.getByTestId('code-input').waitFor();
    await submitCode(page, await lastCodeFor(returning));
    // The redirect stays on this origin and lands on the dashboard; comparing the
    // parsed URL keeps the assertion independent of the port the suite runs on.
    assert.equal(new URL(page.url()).origin, new URL(BASE_URL).origin);
    assert.equal(new URL(page.url()).pathname, '/dashboard');
  } finally {
    await context.close();
  }
});

test('a wrong code is reported with the remaining attempts and does not sign anyone in', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    const mobile = newSyntheticMobile();
    await requestCode(page, mobile);

    await page.getByTestId('code-input').fill('000000');
    await page.getByTestId('verify-code').click();

    await expectText(page, 'کد واردشده درست نیست');
    assert.match(page.url(), /\/login/, 'a wrong code never creates a session');
    const attempts = await page.getByTestId('attempts-remaining').textContent();
    assert.ok(attempts && /\d/.test(attempts), 'the remaining attempts are shown');
    await page.screenshot({ path: path.join(SHOTS, 'otp-invalid.png'), fullPage: true });

    // The real code still works afterwards.
    await submitCode(page, await lastCodeFor(mobile));
    assert.match(page.url(), /\/account\/complete/);
  } finally {
    await context.close();
  }
});

test('resend is disabled until the interval passes', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    await requestCode(page, newSyntheticMobile());
    const resend = page.getByTestId('resend-code');
    assert.equal(await resend.isDisabled(), true);
    assert.match((await resend.textContent()) ?? '', /ثانیه دیگر/);
  } finally {
    await context.close();
  }
});

test('KYC runs end to end: upload, submit, association review, approval', async () => {
  const applicant = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const operator = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(applicant, mobile);

    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('متقاضی آزمایشی');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1991-02-03');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });

    // A real JPEG header, so the server-side signature check passes.
    await page.getByTestId('kyc-file').setInputFiles({
      name: 'national-card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    });
    await page.getByTestId('upload-kyc').click();
    await expectText(page, 'تصویر کارت ملی بارگذاری شد');

    await page.getByTestId('submit-kyc').click();
    // Submitting takes the case out of the editable state, so the upload form is
    // replaced by the waiting state — that replacement is the confirmation.
    await expectText(page, 'پرونده شما در حال بررسی است');
    await page.screenshot({ path: path.join(SHOTS, 'kyc-under-review.png'), fullPage: true });

    // The association operator reviews it from its own shell.
    const opsPage = await signIn(operator, '09990000004');
    await opsPage.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    const opsBody = await opsPage.locator('body').innerText();
    assert.ok(opsBody.includes('نمونه متقاضی آزمایشی'), 'the case is in the association queue');
    await opsPage.screenshot({ path: path.join(SHOTS, 'assoc-kyc-queue.png'), fullPage: true });

    await opsPage.getByTestId('open-case').first().click();
    await opsPage.getByTestId('review-form').waitFor();

    // A correction needs a reason, and the applicant keeps the uploaded file.
    await opsPage.getByTestId('decision-NEEDS_CORRECTION').check();
    await opsPage.getByTestId('review-reason').fill('تصویر خوانا نیست؛ لطفاً دوباره بارگذاری کنید.');
    await opsPage.getByTestId('submit-review').click();
    // Once decided, the case leaves the review state and the form is replaced.
    await expectText(opsPage, 'این پرونده در انتظار بررسی نیست');
    // No technical enum name may appear in operator text (§24.3).
    assert.ok(!(await opsPage.locator('body').innerText()).includes('NEEDS_CORRECTION'));
    await opsPage.screenshot({ path: path.join(SHOTS, 'assoc-kyc-review.png'), fullPage: true });

    await page.reload({ waitUntil: 'load' });
    const correctionBody = await page.locator('body').innerText();
    assert.ok(correctionBody.includes('نیازمند اصلاح'));
    assert.ok(correctionBody.includes('تصویر خوانا نیست'));
    assert.ok(
      correctionBody.includes('تصویر بارگذاری‌شده شما حفظ شده است'),
      'the previously uploaded file survives the correction',
    );
    await page.screenshot({ path: path.join(SHOTS, 'kyc-needs-correction.png'), fullPage: true });

    // Resubmit the same case and approve it.
    await page.getByTestId('submit-kyc').click();
    await expectText(page, 'پرونده شما در حال بررسی است');

    await opsPage.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    await opsPage.getByTestId('open-case').first().click();
    await opsPage.getByTestId('decision-APPROVED').check();
    await opsPage.getByTestId('submit-review').click();
    await expectText(opsPage, 'این پرونده در انتظار بررسی نیست');
    // No technical enum name may appear in operator text (§24.3).
    assert.ok(!(await opsPage.locator('body').innerText()).includes('NEEDS_CORRECTION'));

    // Approval unlocks animal registration and says nothing about membership.
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const dashboard = await page.locator('body').innerText();
    assert.ok(!dashboard.includes('برای ثبت حیوان هم‌زیست، احراز هویت لازم است'));
    assert.ok(dashboard.includes('برای این کار عضویت لازم نیست'));
    assert.ok(dashboard.includes('فعال نیست'), 'membership is still inactive and shown separately');
    await page.screenshot({ path: path.join(SHOTS, 'dashboard-kyc-approved.png'), fullPage: true });

    // The applicant was notified, and the notification returns to the same case.
    await page.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    const notifications = await page.locator('body').innerText();
    assert.ok(notifications.includes('احراز هویت شما تأیید شد'));
  } finally {
    await applicant.close();
    await operator.close();
  }
});

test('a private KYC document is refused to a signed-in stranger', async () => {
  const owner = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const stranger = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(owner, mobile);
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('صاحب سند');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1994-06-06');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });
    await page.getByTestId('kyc-file').setInputFiles({
      name: 'card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    });
    await page.getByTestId('upload-kyc').click();
    await expectText(page, 'تصویر کارت ملی بارگذاری شد');
    await page.getByTestId('submit-kyc').click();
    await expectText(page, 'پرونده شما در حال بررسی است');

    // Find the file id the way an attacker would have to: not at all. Take it
    // from the operator's own view, then try to read it as somebody else.
    const operator = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
    const opsPage = await signIn(operator, '09990000004');
    await opsPage.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    await opsPage.getByTestId('open-case').first().click();
    const href = await opsPage.getByTestId('kyc-document-link').getAttribute('href');
    assert.ok(href);

    const allowed = await opsPage.request.get(BASE_URL + href!);
    assert.equal(allowed.status(), 200, 'the reviewing operator may read it');
    await operator.close();

    const otherPage = await signIn(stranger, '09990000005');
    const refused = await otherPage.request.get(BASE_URL + href!);
    assert.equal(refused.status(), 403, 'another signed-in account may not');

    const anonymous = await browser.newContext();
    const anonymousResponse = await anonymous.request.get(BASE_URL + href!);
    assert.equal(anonymousResponse.status(), 401);
    await anonymous.close();
  } finally {
    await owner.close();
    await stranger.close();
  }
});

test('a failed mobile change leaves the current number in place', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(context, mobile);
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('تغییر شماره');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1989-09-09');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    await page.goto(BASE_URL + '/account/profile/mobile', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('current-mobile').textContent(), mobile);

    const newMobile = newSyntheticMobile();
    await page.getByTestId('new-mobile').fill(newMobile);
    await page.getByTestId('send-change-code').click();
    await page.getByTestId('change-code').waitFor();

    await page.getByTestId('change-code').fill('000000');
    await page.getByTestId('confirm-change').click();
    await expectText(page, 'کد واردشده درست نیست');
    await page.screenshot({ path: path.join(SHOTS, 'mobile-change-failed.png'), fullPage: true });

    // The account still answers to the original number.
    await page.goto(BASE_URL + '/account/profile', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('account-mobile').textContent(), mobile);

    // And the correct code does move it.
    await page.goto(BASE_URL + '/account/profile/mobile', { waitUntil: 'load' });
    await page.getByTestId('new-mobile').fill(newMobile);
    await page.getByTestId('send-change-code').click();
    await page.getByTestId('change-code').waitFor();
    await page.getByTestId('change-code').fill(await lastCodeFor(newMobile));
    await page.getByTestId('confirm-change').click();
    await expectText(page, 'شماره موبایل حساب تغییر کرد');

    await page.goto(BASE_URL + '/account/profile', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('account-mobile').textContent(), newMobile);
  } finally {
    await context.close();
  }
});

test('signing out ends the session on the server', async () => {
  const returning = await completedAccount();
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(context, returning);
    await page.goto(BASE_URL + '/account/profile', { waitUntil: 'load' });
    await Promise.all([page.waitForURL('**/login'), page.getByTestId('sign-out').click()]);

    // A signed-out visitor is sent back to sign in, carrying the page they
    // asked for so the flow resumes there afterwards (§8, DEC-0110).
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/dashboard');
    assert.equal(await page.getByTestId('mobile-input').count(), 1);
  } finally {
    await context.close();
  }
});
