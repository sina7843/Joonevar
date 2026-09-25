/**
 * The operational workbenches in a real browser — PROMPT-013.
 *
 * Three screens an operator actually opens: what the marketplace did, which
 * accounts are worth a look, and one account for somebody answering a
 * telephone. What matters on each is as much what it does not show as what
 * it does.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import { clearSyntheticOtp, DESKTOP, expectText, setPaymentMode, BASE_URL } from './support.ts';
import { openFlag, setMarketSetting, stateFor, type ShopFixtureOptions, type State } from './shop-fixture.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-013');

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;

let browser!: Browser;
let adminState!: State;
let fixture!: ShopFixtureOptions & { operatorState: State };
let previousPaymentMode: string | null = null;

const contextFor = (state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  previousPaymentMode = await setPaymentMode('DEV_GATEWAY');
  browser = await chromium.launch();

  const operatorState = await stateFor(browser, OPERATOR_MOBILE);
  adminState = await stateFor(browser, ADMIN_MOBILE);
  fixture = {
    browser,
    adminState,
    operatorState,
    reasonFa: REASON,
    agreementVersion: 'SYNTHETIC-AGREEMENT-' + RUN,
  };
  await openFlag(fixture, 'market.flag.commerce_checkout_enabled');
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});

test('the analytics screen is aggregate and says so', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/analytics', { waitUntil: 'load' });
    await page.getByTestId('analytics-shop').waitFor();

    assert.match(
      await page.getByTestId('analytics-privacy-note').innerText(),
      /نام، شماره و نشانی در این صفحه نمی‌آید/,
    );
    // Every panel the prompt asks for is present, even where its figure is
    // zero: a missing panel reads as "not built", which would be untrue.
    for (const testId of [
      'analytics-gmv',
      'analytics-commission',
      'analytics-returns',
      'analytics-deals',
      'analytics-funnel',
      'analytics-balances',
      'analytics-settlements',
      'analytics-advertising',
    ]) {
      await page.getByTestId(testId).waitFor();
    }

    // The funnel names every step of the animal path.
    const funnel = await page.getByTestId('analytics-funnel').innerText();
    for (const step of ['آگهی منتشرشده', 'درخواست خرید', 'پذیرش فروشنده', 'رزرو با بیعانه', 'معامله کامل‌شده']) {
      assert.ok(funnel.includes(step), step);
    }

    // And nothing on the page is somebody's telephone number.
    const body = await page.locator('body').innerText();
    assert.ok(!/09\d{9}/.test(body), 'no bare mobile number on an analytics screen');
    await page.screenshot({ path: path.join(SHOTS, 'analytics-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }
});

test('the risk screen says its numbers are not a verdict, and changes nothing', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/risk', { waitUntil: 'load' });
    assert.match(
      await page.getByTestId('risk-note').innerText(),
      /هیچ‌کدام از این عددها به‌تنهایی تصمیم نیست/,
    );
    // Nothing in the page's own content could suspend anybody: acting on a
    // signal means going to the record it points at. The shell's own controls
    // are not part of the page, so the count is taken inside main.
    assert.equal(await page.locator('main button[type="submit"]').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'risk-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }
});

test('support finds an account by its id and never by a telephone number', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/support', { waitUntil: 'load' });
    assert.match(
      await page.getByTestId('support-search-note').innerText(),
      /جست‌وجو با شماره تماس در دسترس نیست/,
    );
    assert.match(await page.getByTestId('support-note').innerText(), /اختیار آن جداست/);

    // An id nobody issued is refused, and the refusal says nothing about
    // whether such an account could exist.
    await page.getByTestId('support-account-input').fill('00000000-0000-0000-0000-000000000000');
    await page.getByTestId('support-account-submit').click();
    await page.getByTestId('support-problem').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'support-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }
});

test('the workbenches are closed to an ordinary account', async () => {
  const anonymous = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    for (const route of ['/market/analytics', '/market/risk', '/market/support']) {
      await page.goto(BASE_URL + route, { waitUntil: 'load' });
      // Signed out, every one of them sends the visitor to sign in rather
      // than rendering anything.
      assert.match(page.url(), /\/login/, route + ' is guarded');
    }
  } finally {
    await anonymous.close();
  }
});

test('an operator with no analytics capability is refused the screen', async () => {
  // The seller-reviewer shell holds SELLER_APPLICATION_REVIEW and nothing
  // about money or overview, so the guarded route answers rather than
  // rendering a dashboard.
  const ops = await contextFor(fixture.operatorState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/analytics', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(
      !body.includes('ارزش سفارش‌ها'),
      'an account without the overview capability sees no figures',
    );
  } finally {
    await ops.close();
  }
});

test('an operator can still reach the queues this phase already built', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    for (const [route, marker] of [
      ['/market/listings', 'گزارش'],
      ['/market/sellers', 'فروشنده'],
      ['/market/disputes', 'اختلاف'],
      ['/market/returns', 'مرجوعی'],
      ['/market/settlement', 'تسویه'],
      ['/market/orders', 'سفارش'],
      ['/market/trust', 'نظر'],
    ] as const) {
      await page.goto(BASE_URL + route, { waitUntil: 'load' });
      const body = await page.locator('body').innerText();
      assert.ok(body.includes(marker), route + ' answers with its own workbench');
    }
    await expectText(page, 'نظرها');
  } finally {
    await ops.close();
  }
});
