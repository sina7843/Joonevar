/**
 * Basket, one payment, two shops — in a real browser, PROMPT-010.
 *
 * Two real trading stores are built the long way, each with a published
 * product, a priced offer and its own delivery charge. A real buyer fills a
 * basket from both, pays once at the gateway, and then each shop handles its
 * own part while the other is untouched.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import {
  clearSyntheticOtp,
  DESKTOP,
  MOBILE,
  expectText,
  newSyntheticMobile,
  setPaymentMode,
  signIn,
  BASE_URL,
} from './support.ts';
import {
  openFlag,
  publishPlan,
  sellableProduct,
  setMarketSetting,
  stateShippingTerms,
  stateFor,
  tradingStore,
  type ShopFixtureOptions,
  type State,
  type TradingStore,
} from './shop-fixture.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-010');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const AGREEMENT = 'SYNTHETIC-AGREEMENT-' + RUN;

let browser!: Browser;
let adminState!: State;
let buyerState!: State;
let shopOne!: TradingStore;
let shopTwo!: TradingStore;
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
    agreementVersion: AGREEMENT,
  };

  await openFlag(fixture, 'market.flag.seller_onboarding_enabled');
  // The checkout has its own switch, and it starts closed like every other.
  await openFlag(fixture, 'market.flag.commerce_checkout_enabled');
  await setMarketSetting(fixture, 'market.shop.seller_agreement_version', AGREEMENT);
  await setMarketSetting(fixture, 'market.shop.seller_plan_basic_monthly_toman', '900000');
  await setMarketSetting(fixture, 'market.shop.suborder_acceptance_window_hours', '48');
  await publishPlan(fixture, {
    code: 'BASIC',
    labelFa: 'پلن پایه فروشنده',
    durationDays: 30,
    productLimit: 50,
    commissionBp: 500,
    priceKey: 'market.shop.seller_plan_basic_monthly_toman',
  });

  shopOne = await tradingStore(fixture, {
    nameFa: 'SYNTHETIC فروشگاه الف ' + RUN,
    identifier: '3' + RUN.padStart(10, '0'),
    iban: 'IR060540102680020817909101',
    ownerLabelFa: 'فروشنده الف',
  });
  shopTwo = await tradingStore(fixture, {
    nameFa: 'SYNTHETIC فروشگاه ب ' + RUN,
    identifier: '4' + RUN.padStart(10, '0'),
    iban: 'IR060540102680020817909102',
    ownerLabelFa: 'فروشنده ب',
  });

  await sellableProduct(fixture, shopOne, {
    nameFa: 'SYNTHETIC غذای سگ ' + RUN,
    sku: 'A-2KG',
    priceToman: 480_000,
    stock: 6,
    imagePng: PNG,
  });
  await sellableProduct(fixture, shopTwo, {
    nameFa: 'SYNTHETIC غذای گربه ' + RUN,
    sku: 'B-2KG',
    priceToman: 250_000,
    stock: 4,
    imagePng: PNG,
  });
  await stateShippingTerms(fixture, shopOne, { feeToman: 45_000 });
  await stateShippingTerms(fixture, shopTwo, { feeToman: 30_000 });

  // The buyer needs nothing but an account: buying goods is not a KYC step.
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, newSyntheticMobile());
    buyerState = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});

/** Put one product's only offer in the basket from its public page. */
async function addToBasket(page: import('playwright').Page, nameFa: string, quantity: number): Promise<void> {
  await page.goto(BASE_URL + '/shop', { waitUntil: 'load' });
  await page.getByTestId('shop-results').waitFor();
  const href = (await page.locator('[data-testid^="shop-item-"]').filter({ hasText: nameFa }).first().getAttribute('href'))!;
  await page.goto(BASE_URL + href, { waitUntil: 'load' });
  const form = page.locator('[data-testid^="add-to-cart-form-"]').first();
  const skuId = (await form.getAttribute('data-testid'))!.replace('add-to-cart-form-', '');
  await page.getByTestId('add-quantity-' + skuId).selectOption(String(quantity));
  await page.getByTestId('add-to-cart-' + skuId).click();
  await expectText(page, 'سبد خرید به‌روز شد');
}

test('a buyer fills one basket from two shops and the basket keeps them apart', async () => {
  const context = await contextFor(buyerState, MOBILE);
  try {
    const page = await context.newPage();
    await addToBasket(page, 'SYNTHETIC غذای سگ ' + RUN, 2);
    await addToBasket(page, 'SYNTHETIC غذای گربه ' + RUN, 1);

    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    await page.getByTestId('cart-groups').waitFor();
    // One group per shop, each with its own delivery charge.
    assert.equal(await page.locator('[data-testid^="cart-group-"]').count(), 2);
    assert.match(await page.getByTestId('cart-split-note').innerText(), /۲ فروشگاه/);
    // 2×480,000 + 45,000 + 250,000 + 30,000 = 1,285,000
    assert.match(await page.getByTestId('checkout-total').innerText(), /۱٬۲۸۵٬۰۰۰/);
    await page.screenshot({ path: path.join(SHOTS, 'cart-two-shops-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('one payment covers both shops, and each becomes its own sub-order', async () => {
  const context = await contextFor(buyerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    await page.getByTestId('checkout-name').fill('SYNTHETIC گیرنده ' + RUN);
    await page.getByTestId('checkout-phone').fill('09120000000');
    await page.getByTestId('checkout-address').fill('SYNTHETIC نشانی تحویل، پلاک ۱۲');
    await page.getByTestId('checkout-postal').fill('1234567890');
    await page.getByTestId('checkout-submit').click();

    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/orders/**/return**');
    assert.match(await page.getByTestId('order-payment-result').innerText(), /پرداخت سفارش تأیید شد/);

    await page.getByTestId('back-to-order').click();
    await page.getByTestId('order-parts').waitFor();
    assert.match(await page.getByTestId('order-status').innerText(), /پرداخت‌شده/);
    assert.match(await page.getByTestId('order-total').innerText(), /۱٬۲۸۵٬۰۰۰/);
    // Two shops, each waiting on its own shop rather than on the order.
    assert.equal(await page.locator('[data-testid^="suborder-status-"]').count(), 2);
    for (const text of await page.locator('[data-testid^="suborder-status-"]').allInnerTexts()) {
      assert.match(text, /در انتظار پذیرش فروشنده/);
    }
    await page.screenshot({ path: path.join(SHOTS, 'order-paid-desktop.png'), fullPage: true });

    // The basket is empty afterwards, rather than still holding what was bought.
    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    await page.getByTestId('cart-empty').waitFor();
  } finally {
    await context.close();
  }
});

test('a shop sees only its own part, with the delivery details and nothing else', async () => {
  const context = await contextFor(shopOne.sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    await page.getByTestId('seller-orders').waitFor();

    const rows = page.locator('[data-testid^="seller-suborder-"]');
    assert.equal(await rows.count(), 1, 'one shop, one sub-order');
    const subOrderId = (await rows.first().getAttribute('data-testid'))!.replace('seller-suborder-', '');

    const items = await page.getByTestId('seller-items-' + subOrderId).innerText();
    assert.match(items, /غذای سگ/);
    // The other shop's goods are not on this screen at all.
    assert.ok(!items.includes('غذای گربه'));

    // The courier's facts, and the shop's own share of the money.
    assert.match(await page.getByTestId('seller-contact-' + subOrderId).innerText(), /۰۹۱۲۰۰۰۰۰۰۰|09120000000/);
    assert.match(await page.getByTestId('seller-payout-' + subOrderId).innerText(), /تومان/);
    // 2×480,000 + 45,000 = 1,005,000 for this shop; never the order's total.
    const money = await page.getByTestId('seller-money-' + subOrderId).innerText();
    assert.match(money, /۱٬۰۰۵٬۰۰۰/);
    assert.ok(!money.includes('۱٬۲۸۵٬۰۰۰'));

    // It accepts, prepares and ships its own part.
    await page.getByTestId('seller-move-select-' + subOrderId).selectOption('ACCEPTED_BY_SELLER');
    await page.getByTestId('seller-move-submit-' + subOrderId).click();
    await page
      .getByTestId('seller-state-' + subOrderId)
      .filter({ hasText: 'پذیرفته‌شده' })
      .waitFor();

    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    await page.getByTestId('seller-move-select-' + subOrderId).selectOption('PREPARING');
    await page.getByTestId('seller-move-submit-' + subOrderId).click();
    await page
      .getByTestId('seller-state-' + subOrderId)
      .filter({ hasText: 'در حال آماده‌سازی' })
      .waitFor();

    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    await page.getByTestId('seller-move-select-' + subOrderId).selectOption('SHIPPED');
    await page.getByTestId('seller-move-tracking-' + subOrderId).fill('SYN-' + RUN);
    await page.getByTestId('seller-move-submit-' + subOrderId).click();
    await page
      .getByTestId('seller-state-' + subOrderId)
      .filter({ hasText: 'ارسال‌شده' })
      .waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'seller-orders-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the other shop is untouched, and the buyer sees the two parts separately', async () => {
  const context = await contextFor(buyerState, MOBILE);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
    await page.getByTestId('orders-list').waitFor();
    await page.locator('[data-testid^="order-link-"]').first().click();
    await page.getByTestId('order-parts').waitFor();

    const statuses = await page.locator('[data-testid^="suborder-status-"]').allInnerTexts();
    assert.equal(statuses.length, 2);
    // One shop moved; the other stands exactly where the payment left it.
    assert.ok(statuses.some((text) => text.includes('ارسال‌شده')), statuses.join('،'));
    assert.ok(statuses.some((text) => text.includes('در انتظار پذیرش فروشنده')), statuses.join('،'));

    // The shipped one carries its tracking code, from the shop that entered it.
    assert.match(
      await page.locator('[data-testid^="suborder-tracking-"]').first().innerText(),
      new RegExp('SYN-' + RUN),
    );
    await page.screenshot({ path: path.join(SHOTS, 'order-parts-mobile.png'), fullPage: true });

    // And the buyer confirms delivery of that part alone.
    const shipped = page
      .locator('[data-testid^="order-part-"]')
      .filter({ hasText: 'ارسال‌شده' })
      .first();
    const subOrderId = (await shipped.getAttribute('data-testid'))!.replace('order-part-', '');
    await page.getByTestId('buyer-move-select-' + subOrderId).selectOption('DELIVERED');
    await page.getByTestId('buyer-move-submit-' + subOrderId).click();
    await page
      .getByTestId('suborder-status-' + subOrderId)
      .filter({ hasText: 'تحویل‌شده' })
      .waitFor();
  } finally {
    await context.close();
  }
});

test('one shop’s sub-order is not another shop’s to open', async () => {
  const context = await contextFor(shopTwo.sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    await page.getByTestId('seller-orders').waitFor();
    const rows = page.locator('[data-testid^="seller-suborder-"]');
    assert.equal(await rows.count(), 1);
    // The other shop's product never appears here, whoever is looking.
    const text = await page.getByTestId('seller-orders').innerText();
    assert.match(text, /غذای گربه/);
    assert.ok(!text.includes('غذای سگ'));
    assert.match(await page.getByTestId('seller-privacy-note').innerText(), /در دسترس شما نیست/);
  } finally {
    await context.close();
  }
});
