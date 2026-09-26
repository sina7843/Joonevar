/**
 * Mating-finder foundations in a real browser — PHASE-4 PROMPT-002.
 *
 * What is worth a browser: that the superadmin really publishes a versioned
 * plan and a stale panel is really refused, that an owner really buys it through
 * the server-verified payment and sees the period and capacity it bought, that
 * a closed switch and an unpriced plan say why in Persian, and that an operator
 * who may open other shells is stopped at this one by the server.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, clearSyntheticOtp, expectText, setPaymentMode, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-002');
const SUPERADMIN = '09990000006';
const MARKET_ADMIN = '09990000010';
const OWNER = '09990000001';
const RUN = String(randomInt(100_000, 999_999));

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let browser!: Browser;
const states: Record<string, State> = {};

const contextFor = (who: string, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: states[who] });

async function setting(key: string, value: unknown) {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, version = version + 1, updated_at = now() where key = ${key}`);
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  browser = await chromium.launch();
  for (const mobile of [SUPERADMIN, MARKET_ADMIN, OWNER]) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      states[mobile] = await context.storageState();
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

test('the superadmin publishes a plan version, and a second tab holding the old version is refused', async () => {
  const context = await contextFor(SUPERADMIN);
  try {
    const page = await context.newPage();
    const stale = await context.newPage();
    for (const p of [page, stale]) await p.goto(BASE_URL + '/admin/mating-finder', { waitUntil: 'load' });

    const flags = await page.getByTestId('finder-flags').innerText();
    assert.ok(!flags.includes('باز'), 'every switch starts closed');
    assert.match(await page.getByTestId('finder-slot-state-OWNER-1').innerText(), /منتشر نشده/);

    const slot = page.getByTestId('finder-slot-OWNER-1');
    await page.getByTestId('finder-slot-toggle-OWNER-1').click();
    await slot.getByTestId('finder-plan-title-OWNER-1').fill('SYNTHETIC ماهانه ' + RUN);
    await slot.getByTestId('finder-plan-price-OWNER-1').fill('250000');
    await slot.getByTestId('finder-plan-capacity-OWNER-1').fill('3');
    await slot.getByTestId('finder-plan-suspension-OWNER-1').selectOption('PERIOD_CONTINUES_NO_REFUND');
    await slot.getByTestId('finder-plan-reason-OWNER-1').fill('SYNTHETIC انتشار آزمایشی ' + RUN);
    await slot.getByTestId('finder-plan-publish-OWNER-1').click();
    await page.getByTestId('finder-plan-result-OWNER-1').waitFor();
    assert.match(await page.getByTestId('finder-plan-result-OWNER-1').innerText(), /منتشر شد/);

    // The second tab still believes the slot is empty.
    const staleSlot = stale.getByTestId('finder-slot-OWNER-1');
    await stale.getByTestId('finder-slot-toggle-OWNER-1').click();
    await staleSlot.getByTestId('finder-plan-title-OWNER-1').fill('SYNTHETIC کهنه');
    await staleSlot.getByTestId('finder-plan-price-OWNER-1').fill('1000');
    await staleSlot.getByTestId('finder-plan-capacity-OWNER-1').fill('9');
    await staleSlot.getByTestId('finder-plan-suspension-OWNER-1').selectOption('PERIOD_PAUSED_NO_REFUND');
    await staleSlot.getByTestId('finder-plan-reason-OWNER-1').fill('SYNTHETIC از صفحه کهنه');
    await staleSlot.getByTestId('finder-plan-publish-OWNER-1').click();
    await stale.getByTestId('finder-plan-result-OWNER-1').waitFor();
    assert.match(await stale.getByTestId('finder-plan-result-OWNER-1').innerText(), /تغییر کرده است/);

    // An unpriced plan is published too: it is shown to owners but never sold.
    const three = page.getByTestId('finder-slot-OWNER-3');
    await page.getByTestId('finder-slot-toggle-OWNER-3').click();
    await three.getByTestId('finder-plan-title-OWNER-3').fill('SYNTHETIC سه‌ماهه بدون قیمت');
    await three.getByTestId('finder-plan-capacity-OWNER-3').fill('3');
    await three.getByTestId('finder-plan-suspension-OWNER-3').selectOption('PERIOD_CONTINUES_NO_REFUND');
    await three.getByTestId('finder-plan-reason-OWNER-3').fill('SYNTHETIC ساختار بدون قیمت');
    await three.getByTestId('finder-plan-publish-OWNER-3').click();
    await page.getByTestId('finder-plan-result-OWNER-3').waitFor();

    await page.reload({ waitUntil: 'load' });
    assert.match(await page.getByTestId('finder-slot-state-OWNER-1').innerText(), /نسخه ۱ — در فروش/);
    assert.match(await page.getByTestId('finder-slot-state-OWNER-3').innerText(), /فروخته نمی‌شود/);
    await page.screenshot({ path: path.join(SHOTS, 'admin-finder-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('an owner is told the purchase is closed, then buys through the verified payment and sees the period and capacity', async () => {
  const context = await contextFor(OWNER, MOBILE);
  const previousMode = await setPaymentMode('DEV_GATEWAY');
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/mating-finder', { waitUntil: 'load' });
    await page.getByTestId('finder-purchase-closed').waitFor();
    assert.match(await page.getByTestId('finder-standing').innerText(), /بدون اشتراک/);

    await setting('finder.flag.subscription_purchase', true);
    await page.reload({ waitUntil: 'load' });
    assert.match(await page.getByTestId('finder-buy-blocked-OWNER-3').innerText(), /قیمت این طرح هنوز/);
    assert.match(await page.getByTestId('finder-plan-price-OWNER-1').innerText(), /۲۵۰٬۰۰۰ تومان/);

    await page.getByTestId('finder-buy-OWNER-1').click();
    // The development gateway page stands in for the bank; the period starts
    // only after the server verifies what it answers.
    await page.getByTestId('gateway-pay').click();
    await page.getByTestId('finder-paid').waitFor({ timeout: 20_000 });
    await page.getByTestId('back-to-finder').click();
    await expectText(page, 'اشتراک فعال');
    assert.match(await page.getByTestId('finder-capacity').innerText(), /۳/);
    assert.equal(await page.locator('[data-testid^="finder-history-"]').count(), 1, 'one paid period');
    assert.match(await page.getByTestId('finder-history').innerText(), /پرداخت‌شده/);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.screenshot({ path: path.join(SHOTS, 'account-finder-mobile.png'), fullPage: true });
  } finally {
    await setting('finder.flag.subscription_purchase', false);
    if (previousMode === 'MOCK_AUTO' || previousMode === 'DEV_GATEWAY') await setPaymentMode(previousMode);
    await context.close();
  }
});

test('an operator who may open the market shell is stopped at the finder configuration by the server', async () => {
  const context = await contextFor(MARKET_ADMIN);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/admin/mating-finder', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('finder-flags').count(), 0);
    assert.equal(await page.getByTestId('finder-slot-OWNER-1').count(), 0);
  } finally {
    await context.close();
  }
});
