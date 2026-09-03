/**
 * Shared browser-suite helpers.
 *
 * These are the steps every payment journey needs before it can start: a real
 * sign-in with a real one-time code, a real identity form and a real KYC review
 * by the association operator. They live here so two suites can exercise two
 * different gateway modes without keeping two copies of the same journey.
 *
 * Not a `*.test.ts` file on purpose: the runner globs tests, not this.
 */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Browser, BrowserContext, Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';

export const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
export const MOBILE = { width: 360, height: 800 };
export const DESKTOP = { width: 1440, height: 900 };

/** SYNTHETIC: 0999 is not an assigned mobile range. */
export const newSyntheticMobile = (): string => '0999' + String(randomInt(1_000_000, 9_999_999));

/** SYNTHETIC national ids start at 900000000, outside the issued range. */
export function syntheticNationalId(): string {
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

/** Repeated runs would otherwise hit the real hourly send cap. */
export async function clearSyntheticOtp(): Promise<void> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
  } finally {
    await pool.end();
  }
}

export async function lastCodeFor(mobile: string): Promise<string> {
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

export async function expectText(page: Page, needle: string, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction((text) => (document.body.innerText ?? '').includes(text), needle, { timeout })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 400));
    });
}

export async function signIn(context: BrowserContext, mobile: string): Promise<Page> {
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

/** The association operator session, captured once and replayed per review. */
export async function captureOperatorState(
  browser: Browser,
  mobile = '09990000004',
): Promise<Awaited<ReturnType<BrowserContext['storageState']>>> {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, mobile);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

/** A fresh account taken all the way to approved KYC through the real screens. */
export async function approvedMember(
  browser: Browser,
  operatorState: Awaited<ReturnType<BrowserContext['storageState']>> | null,
  lastName = 'عضو آزمایشی',
): Promise<{ context: BrowserContext; page: Page; mobile: string }> {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const mobile = newSyntheticMobile();
  const page = await signIn(context, mobile);
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill(lastName);
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

/** Reads and writes the managed payment mode, so a suite can pick its gateway. */
export async function setPaymentMode(mode: 'MOCK_AUTO' | 'DEV_GATEWAY'): Promise<string | null> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const before = await db.execute<{ value: string }>(
      sql`select value #>> '{}' as value from product_setting where key = 'integration.payment.mode'`,
    );
    await db.execute(
      sql`update product_setting set value = ${JSON.stringify(mode)}::jsonb, updated_at = now()
          where key = 'integration.payment.mode'`,
    );
    return before.rows[0]?.value ?? null;
  } finally {
    await pool.end();
  }
}

/**
 * §13: the vet certifies the identity before the chip step opens.
 *
 * The form arrives prefilled with what the owner declared, so a fixture that has
 * nothing to correct submits it as it stands — which is exactly what a vet does
 * when the declaration matches the animal in front of them. If the identity is
 * already on record the panel is read-only and there is nothing to do.
 */
export async function certifyIdentity(page: Page): Promise<void> {
  const form = page.getByTestId('identity-form');
  if ((await form.count()) === 0) return;
  await page.getByTestId('identity-submit').click();
  await page.getByTestId('identity-locked').waitFor({ timeout: 20_000 });
}

/**
 * Waits for the centre to see a sample as shipped, reloading rather than staring.
 *
 * The custodian's shipment and the centre's page are two different requests, and
 * under a loaded run the centre can render a moment before the write lands. A
 * single waitFor then watches a page that will never change on its own, because
 * the list is server-rendered. Reloading is what actually asks again.
 */
export async function waitForShippedSample(page: Page, trackingCode: string): Promise<void> {
  const row = () =>
    page.locator('[data-testid="centre-sample-list"] > li').filter({ hasText: trackingCode });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await row().getByText('ارسال‌شده').count()) > 0) return;
    await page.waitForTimeout(1_000);
    await page.goto(BASE_URL + '/genetics/samples?q=' + encodeURIComponent(trackingCode), {
      waitUntil: 'load',
    });
  }
  throw new Error('the centre never saw ' + trackingCode + ' as shipped');
}
