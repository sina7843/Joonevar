/**
 * Membership and payment in a real browser.
 *
 * Runs the F14 journey end to end against the built application: hero,
 * prerequisites, fee review, gateway, server-side verification, active lifetime
 * membership, and the dashboard opening the services that depend on it.
 *
 * The point of doing it in a browser is the negative case: returning from the
 * gateway without paying must not activate anything.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-005');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

/** SYNTHETIC: 0999 is not an assigned mobile range. */
const newSyntheticMobile = () => '0999' + String(randomInt(1_000_000, 9_999_999));

/** SYNTHETIC national ids start at 900000000, outside the issued range. */
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

/**
 * The association operator signs in once for the whole suite.
 *
 * Each sign-in sends a real code and the hourly cap is a real rule, so the
 * operator session is captured and replayed instead of signing in per test.
 */
let operatorState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    // Clearing the synthetic range keeps repeated runs clear of the hourly cap.
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
  } finally {
    await pool.end();
  }
  browser = await chromium.launch();

  const operatorContext = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(operatorContext, '09990000004');
    operatorState = await operatorContext.storageState();
  } finally {
    await operatorContext.close();
  }
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

async function expectText(page: Page, needle: string, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction((text) => (document.body.innerText ?? '').includes(text), needle, { timeout })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 400));
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

/** A fresh account taken all the way to approved KYC through the real screens. */
async function approvedMember(): Promise<{ context: BrowserContext; page: Page; mobile: string }> {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const mobile = newSyntheticMobile();
  const page = await signIn(context, mobile);

  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill('عضو آزمایشی');
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

  await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });
  await page.getByTestId('kyc-file').setInputFiles({
    name: 'card.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  });
  await page.getByTestId('upload-kyc').click();
  await expectText(page, 'تصویر کارت ملی بارگذاری شد');
  await page.getByTestId('submit-kyc').click();
  await expectText(page, 'پرونده شما در حال بررسی است');

  const operatorContext = await browser.newContext({
    viewport: DESKTOP,
    locale: 'fa-IR',
    storageState: operatorState ?? undefined,
  });
  try {
    const opsPage = await operatorContext.newPage();
    await opsPage.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    await opsPage.getByTestId('open-case').first().click();
    await opsPage.getByTestId('review-form').waitFor();
    await opsPage.getByTestId('decision-APPROVED').check();
    await opsPage.getByTestId('submit-review').click();
    await expectText(opsPage, 'این پرونده در انتظار بررسی نیست');
  } finally {
    await operatorContext.close();
  }

  return { context, page, mobile };
}

test('membership shows the fee from managed data and stays inactive before payment', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });

    const body = await page.locator('body').innerText();
    assert.ok(body.includes('عضویت مادام‌العمر است'), 'the hero states the lifetime decision');
    assert.ok(body.includes('پیش‌نیازها'));
    assert.ok(body.includes('با عضویت چه چیزی باز می‌شود'));
    assert.ok(body.includes('مرور هزینه'));
    // No expiry, renewal or post-payment approval is offered anywhere (D04).
    assert.ok(!/تمدید|انقضا|سررسید/.test(body));

    assert.equal(await page.getByTestId('membership-fee').textContent(), '۳۰۰٬۰۰۰ تومان');
    await page.screenshot({ path: path.join(SHOTS, 'membership-before-payment.png'), fullPage: true });
  } finally {
    await member.context.close();
  }
});

test('a browser that returns from the gateway without paying activates nothing', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/dev/gateway**');

    // Skip the gateway entirely and go straight back with the real reference,
    // which is exactly what a forged return looks like.
    const reference = new URL(page.url()).searchParams.get('reference');
    assert.ok(reference);
    await page.goto(BASE_URL + '/membership/return?reference=' + encodeURIComponent(reference!), {
      waitUntil: 'load',
    });

    await expectText(page, 'پرداخت تأیید نشد');
    await page.screenshot({ path: path.join(SHOTS, 'payment-not-verified.png'), fullPage: true });

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(!body.includes('عضویت شما فعال است'), 'membership must not be active');
  } finally {
    await member.context.close();
  }
});

test('a made-up payment reference is not accepted', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership/return?reference=HZP-not-a-real-reference', { waitUntil: 'load' });
    await expectText(page, 'این بازگشت پرداخت شناسایی نشد');
  } finally {
    await member.context.close();
  }
});

test('a failed gateway decision leaves the account able to retry', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-fail').click();

    await page.waitForURL('**/membership/return**');
    await expectText(page, 'پرداخت تأیید نشد');

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(!body.includes('عضویت شما فعال است'));
    // The retry path is still offered with the same fee.
    assert.equal(await page.getByTestId('membership-fee').textContent(), '۳۰۰٬۰۰۰ تومان');
    assert.equal(await page.getByTestId('pay-membership').count(), 1);
  } finally {
    await member.context.close();
  }
});

test('a verified payment activates the lifetime membership and opens the member services', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;

    // Before paying, the member services are locked on the dashboard.
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const before = await page.locator('body').innerText();
    assert.ok(before.includes('برای این خدمت، عضویت فعال انجمن لازم است'));
    // Registering an animal never depended on membership.
    assert.ok(before.includes('پس از تأیید احراز هویت باز می‌شود'));
    await page.screenshot({ path: path.join(SHOTS, 'dashboard-before-membership.png'), fullPage: true });

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/dev/gateway**');

    // The gateway is asked for Rial: 300000 Toman becomes 3000000 Rial.
    assert.equal(await page.getByTestId('gateway-amount-rial').textContent(), '3000000');
    await page.screenshot({ path: path.join(SHOTS, 'dev-gateway.png'), fullPage: true });

    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/membership/return**');
    await expectText(page, 'پرداخت تأیید شد');
    await page.screenshot({ path: path.join(SHOTS, 'payment-verified.png'), fullPage: true });

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    const membershipBody = await page.locator('body').innerText();
    assert.ok(membershipBody.includes('عضویت شما فعال است'));
    // The number is still pending and that is stated as harmless (§7).
    assert.equal(await page.getByTestId('membership-number').textContent(), 'در انتظار صدور');
    assert.ok(membershipBody.includes('متوقف نمی‌کند'));
    await page.screenshot({ path: path.join(SHOTS, 'membership-active.png'), fullPage: true });

    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const after = await page.locator('body').innerText();
    assert.ok(!after.includes('برای این خدمت، عضویت فعال انجمن لازم است'), 'membership locks are gone');
    assert.ok(after.includes('اعلام توافق شخصی جفت‌گیری'));
    // The next prerequisite is now the real one, not membership.
    assert.ok(after.includes('حداقل یک حیوان ثبت‌شده'));
    await page.screenshot({ path: path.join(SHOTS, 'dashboard-after-membership.png'), fullPage: true });

    // Paying twice is refused rather than charging again.
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('pay-membership').count(), 0);
  } finally {
    await member.context.close();
  }
});

test('a second return for an already verified payment reports it once, without a second effect', async () => {
  const member = await approvedMember();
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/dev/gateway**');
    const reference = new URL(page.url()).searchParams.get('reference')!;
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/membership/return**');
    await expectText(page, 'پرداخت تأیید شد');

    // Reloading the return page, twice, the way a refresh or a retried callback would.
    for (let i = 0; i < 2; i += 1) {
      await page.goto(BASE_URL + '/membership/return?reference=' + encodeURIComponent(reference), {
        waitUntil: 'load',
      });
      await expectText(page, 'پرداخت تأیید شد');
    }

    const { db, pool } = createDatabase(DATABASE_URL);
    try {
      const activations = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from audit_event where action = 'MEMBERSHIP_ACTIVATED'
            and target_id = (select id::text from account where mobile = ${member.mobile})`,
      );
      assert.equal(activations.rows[0]?.count, '1', 'the effect was applied exactly once');
    } finally {
      await pool.end();
    }
  } finally {
    await member.context.close();
  }
});

test('an account without approved KYC is refused the membership payment', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(context, mobile);
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('بدون احراز');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1992-02-02');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    // The page shows the lock with its CTA instead of a payment button.
    assert.ok(body.includes('احراز هویت'));
    assert.equal(await page.getByTestId('pay-membership').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'membership-locked.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
