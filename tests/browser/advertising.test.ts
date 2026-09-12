/**
 * Advertising packages in the browser — Phase 2 PROMPT-011.
 *
 * The superadmin sees a catalogue that cannot be sold until a price exists,
 * configures one plan's features and capacity, and the record's own manager
 * then buys it through the real checkout: the gateway answers, the server
 * verifies, and only then is the package active with its own end date. The
 * catalogue stays closed to an ordinary account.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`, in the
 * shipped local payment mode.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, expectText, setPaymentMode, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-011');
const RUN = String(randomInt(100_000, 999_999));
const CLUB = 'کلاب تبلیغ SYNTHETIC ' + RUN;
const PRICE_KEY = 'advertising.featured_30_toman';
const ACCOUNTS = { admin: '09990000006', user: '09990000001' } as const;
type Who = keyof typeof ACCOUNTS;

let browser!: Browser;
let previousMode: string | null = null;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();

/** The managed tariff, written the way the settings panel writes it. */
async function setPrice(value: string | null): Promise<void> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(
      sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb, version = version + 1, updated_at = now()
          where key = ${PRICE_KEY}`,
    );
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  previousMode = await setPaymentMode('MOCK_AUTO');
  browser = await chromium.launch();
  for (const [who, mobile] of Object.entries(ACCOUNTS) as [Who, string][]) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      states.set(who, await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  // The mode is restored first and unconditionally (DEC-0148).
  try {
    if (previousMode === 'MOCK_AUTO' || previousMode === 'DEV_GATEWAY') await setPaymentMode(previousMode);
  } finally {
    await browser?.close().catch(() => undefined);
  }
});

async function as<T>(who: Who, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: states.get(who) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('the catalogue cannot be sold before a price exists, and the panel sets features and capacity', async () => {
  await setPrice(null);
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/packages', { waitUntil: 'load' });
    await expectText(page, 'بسته‌های تبلیغاتی');
    // Six plans, every one of them unpriced on a fresh database.
    assert.equal(await page.locator('[data-testid^="plan-form-"]').count(), 6);
    assert.ok((await page.locator('[data-testid^="plan-unpriced-"]').count()) >= 1);
    await page.screenshot({ path: path.join(SHOTS, 'admin-catalogue.png'), fullPage: true });

    const form = page.locator('[data-testid^="plan-form-"]').first();
    const planId = (await form.getAttribute('data-testid'))!.replace('plan-form-', '');
    await page.getByTestId('plan-features-' + planId).fill('نمایش با برچسب تبلیغ در فهرست‌های مرتبط.');
    await page.getByTestId('plan-capacity-' + planId).fill('5');
    await page.getByTestId('plan-reason-' + planId).fill('تنظیم ظرفیت برای آزمون مرورگر');
    await page.getByTestId('save-plan-' + planId).click();
    await expectText(page, 'بسته ذخیره شد');
  });
});

test('a manager buys a package through the real checkout and it is active only after the server verifies', async () => {
  // A record handed to the ordinary account, because only a claimed record buys.
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/communities', { waitUntil: 'load' });
    await page.getByTestId('community-name').fill(CLUB);
    await page.getByTestId('community-kind').selectOption('CLUB');
    await page.getByTestId('community-create-reason').fill('ثبت برای آزمون بسته تبلیغاتی');
    await page.getByTestId('create-community').click();
    await expectText(page, CLUB);

    await page.getByRole('link', { name: CLUB }).click();
    await page.getByTestId('community-owner-form').waitFor();
    await page.getByTestId('community-owner-mobile').fill(ACCOUNTS.user);
    await page.getByTestId('community-owner-reason').fill('واگذاری برای آزمون');
    await page.getByTestId('assign-community-owner').click();
    await expectText(page, 'دارای مدیر');
  });

  await setPrice('500000');

  await as('user', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/packages', { waitUntil: 'load' });
    await expectText(page, CLUB);
    await expectText(page, 'بسته فعالی ندارد');
    await expectText(page, '۵۰۰٬۰۰۰ تومان');
    await page.screenshot({ path: path.join(SHOTS, 'packages-mobile.png'), fullPage: true });

    // The shipped local mode returns straight to the callback; the server still verifies.
    // The button itself: the prefix also matches its own form and result banner.
    await page.locator('button[data-testid^="buy-"]').first().click();
    // expectText dumps the page on failure, so a refused purchase says why.
    await expectText(page, 'پرداخت تأیید شد و بسته فعال است', 20_000);
    await page.getByTestId('package-paid').waitFor({ timeout: 20_000 });
    await page.screenshot({ path: path.join(SHOTS, 'package-paid.png'), fullPage: true });

    await page.getByTestId('back-to-packages').click();
    await expectText(page, 'بسته فعال');
    await expectText(page, 'روز باقی مانده');
    await page.screenshot({ path: path.join(SHOTS, 'package-active.png'), fullPage: true });
  });
});

test('the superadmin sees the purchase in the catalogue and an ordinary account cannot open it', async () => {
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/packages', { waitUntil: 'load' });
    await page.getByTestId('package-subscriptions').waitFor();
    await expectText(page, CLUB);
    await expectText(page, 'فعال');
    await page.screenshot({ path: path.join(SHOTS, 'admin-subscriptions.png'), fullPage: true });
  });

  await as('user', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/packages', { waitUntil: 'load' });
    await expectText(page, 'دسترسی');
    assert.equal(await page.locator('[data-testid^="plan-form-"]').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'forbidden.png'), fullPage: true });
  });
});
