/**
 * The shipped local payment mode, in a real browser — DEC-0123.
 *
 * The rest of the browser suite runs against the visible development gateway,
 * because only that one can express "cancelled" and "failed". This file covers
 * what the product actually ships with locally: `MOCK_AUTO`, where the return
 * is immediate and the server marks the payment verified by itself.
 *
 * What is being checked is not that a mock says yes. It is that the mock does
 * not skip anything: the amount still comes from the frozen record, the effect
 * still runs once, and a replayed return still changes nothing a second time.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import {
  BASE_URL,
  DATABASE_URL,
  approvedMember,
  captureOperatorState,
  clearSyntheticOtp,
  expectText,
  setPaymentMode,
} from './support.ts';

let browser!: Browser;
let operatorState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let previousMode: string | null = null;

before(async () => {
  previousMode = await setPaymentMode('MOCK_AUTO');
  await clearSyntheticOtp();
  browser = await chromium.launch();
  operatorState = await captureOperatorState(browser);
});

after(async () => {
  await browser?.close();
  // Hand the suite back exactly the mode it was running in.
  if (previousMode === 'MOCK_AUTO' || previousMode === 'DEV_GATEWAY') await setPaymentMode(previousMode);
});

test('the mock gateway returns straight to the callback and the server verifies it', async () => {
  const member = await approvedMember(browser, operatorState, 'عضو درگاه شبیه‌سازی');
  try {
    const { page } = member;
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('membership-fee').textContent(), '۳۰۰٬۰۰۰ تومان');

    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/membership/return**');
    // No bank page stands in between; the mock is the bank.
    assert.ok(!page.url().includes('/dev/gateway'));
    const reference = new URL(page.url()).searchParams.get('reference');
    assert.ok(reference, 'the return still carries the real reference');
    await expectText(page, 'پرداخت تأیید شد');

    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('عضویت شما فعال است'));
    assert.equal(await page.getByTestId('pay-membership').count(), 0, 'paying twice is not offered');

    // Replaying the same return, the way a refresh or a retried callback would.
    for (let i = 0; i < 2; i += 1) {
      await page.goto(BASE_URL + '/membership/return?reference=' + encodeURIComponent(reference!), {
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

      // The amount the mock confirmed is the amount that was frozen, in Rial.
      const attempt = await db.execute<{ amount_rial: string; status: string }>(
        sql`select amount_rial, status from payment_attempt where reference = ${reference}`,
      );
      assert.equal(attempt.rows[0]?.amount_rial, '3000000');
      assert.equal(attempt.rows[0]?.status, 'VERIFIED');
    } finally {
      await pool.end();
    }
  } finally {
    await member.context.close();
  }
});

test('a made-up reference is refused even when the gateway always says yes', async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/membership/return?reference=HZP-not-a-real-reference', { waitUntil: 'load' });
    // Unauthenticated or not, no invented reference is ever reported as paid.
    assert.ok(!(await page.locator('body').innerText()).includes('پرداخت تأیید شد'));
  } finally {
    await context.close();
  }
});
