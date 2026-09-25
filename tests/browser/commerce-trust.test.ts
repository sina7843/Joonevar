/**
 * Trust, discounts and points in a real browser — PROMPT-012.
 *
 * A buyer buys, receives, reviews and asks; a moderator decides what is
 * public; a code and points come off a basket; and an invoice comes out at
 * the end. Every one of these is on the real screens, because the rules only
 * matter where somebody meets them.
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
  stateFor,
  stateShippingTerms,
  tradingStore,
  type ShopFixtureOptions,
  type State,
  type TradingStore,
} from './shop-fixture.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-012');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const AGREEMENT = 'SYNTHETIC-AGREEMENT-' + RUN;
const PRODUCT = 'SYNTHETIC غذای سگ ' + RUN;
const CODE = 'SYNTH' + RUN;

let browser!: Browser;
let adminState!: State;
let buyerState!: State;
let shop!: TradingStore;
let fixture!: ShopFixtureOptions & { operatorState: State };
let previousPaymentMode: string | null = null;
let subOrderId = '';

const contextFor = (state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  previousPaymentMode = await setPaymentMode('DEV_GATEWAY');
  browser = await chromium.launch();

  const operatorState = await stateFor(browser, OPERATOR_MOBILE);
  adminState = await stateFor(browser, ADMIN_MOBILE);
  fixture = { browser, adminState, operatorState, reasonFa: REASON, agreementVersion: AGREEMENT };

  await openFlag(fixture, 'market.flag.seller_onboarding_enabled');
  await openFlag(fixture, 'market.flag.commerce_checkout_enabled');
  await setMarketSetting(fixture, 'market.shop.seller_agreement_version', AGREEMENT);
  await setMarketSetting(fixture, 'market.shop.seller_plan_basic_monthly_toman', '900000');
  await setMarketSetting(fixture, 'market.shop.suborder_acceptance_window_hours', '48');
  await setMarketSetting(fixture, 'market.shop.return_window_days', '7');
  // A point is worth 100 toman, and every 1,000 toman earns one.
  await setMarketSetting(fixture, 'market.shop.loyalty_points_per_1000_toman', '1');
  await setMarketSetting(fixture, 'market.shop.loyalty_point_value_toman', '100');
  await setMarketSetting(fixture, 'market.shop.recent_view_retention_days', '30');
  await publishPlan(fixture, {
    code: 'BASIC',
    labelFa: 'پلن پایه فروشنده',
    durationDays: 30,
    productLimit: 50,
    commissionBp: 500,
    priceKey: 'market.shop.seller_plan_basic_monthly_toman',
  });

  shop = await tradingStore(fixture, {
    nameFa: 'SYNTHETIC فروشگاه اعتماد ' + RUN,
    identifier: '6' + RUN.padStart(10, '0'),
    iban: 'IR060540102680020817909401',
    ownerLabelFa: 'فروشنده اعتماد',
  });
  await sellableProduct(fixture, shop, {
    nameFa: PRODUCT,
    sku: 'T-2KG',
    priceToman: 500_000,
    stock: 8,
    imagePng: PNG,
  });
  await stateShippingTerms(fixture, shop, { feeToman: 0 });

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

/** Open the product page and return its address. */
async function openProduct(page: import('playwright').Page): Promise<string> {
  await page.goto(BASE_URL + '/shop', { waitUntil: 'load' });
  const href = (await page
    .locator('[data-testid^="shop-item-"]')
    .filter({ hasText: PRODUCT })
    .first()
    .getAttribute('href'))!;
  await page.goto(BASE_URL + href, { waitUntil: 'load' });
  return href;
}

test('a platform code comes off the basket, and points come off what is left', async () => {
  // The operator declares a code that is Hamzist's own money.
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/promotions', { waitUntil: 'load' });
    assert.match(await page.getByTestId('stacking-none').innerText(), /هیچ دو تخفیفی با هم جمع نمی‌شوند/);
    assert.match(await page.getByTestId('platform-discount-note').innerText(), /از سهم همزیست/);

    await page.getByTestId('discount-kind').selectOption('PLATFORM_CODE');
    await page.getByTestId('discount-label').fill('SYNTHETIC کد آزمایشی');
    await page.getByTestId('discount-code').fill(CODE);
    await page.getByTestId('discount-percent').fill('1000');
    await page.getByTestId('discount-save').click();
    await expectText(page, 'تخفیف ثبت شد');

    await page.goto(BASE_URL + '/market/promotions', { waitUntil: 'load' });
    const ruleId = (await page
      .locator('[data-testid^="platform-rule-status-"]')
      .first()
      .getAttribute('data-testid'))!.replace('platform-rule-status-', '');
    await page.getByTestId('move-discount-' + ruleId + '-ACTIVE').click();
    await page
      .getByTestId('platform-rule-status-' + ruleId)
      .filter({ hasText: 'ACTIVE' })
      .waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'market-promotions-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }

  const context = await contextFor(buyerState);
  try {
    const page = await context.newPage();
    const href = await openProduct(page);
    const form = page.locator('[data-testid^="add-to-cart-form-"]').first();
    const skuId = (await form.getAttribute('data-testid'))!.replace('add-to-cart-form-', '');
    await page.getByTestId('add-quantity-' + skuId).selectOption('1');
    await page.getByTestId('add-to-cart-' + skuId).click();
    await expectText(page, 'سبد خرید به‌روز شد');

    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    await page.getByTestId('basket-code').fill(CODE);
    await page.getByTestId('basket-discount-apply').click();
    await page.getByTestId('cart-discount').waitFor();
    // 10% of 500,000.
    assert.match(await page.getByTestId('cart-discount').innerText(), /۵۰٬۰۰۰/);
    assert.match(await page.getByTestId('checkout-total').innerText(), /۴۵۰٬۰۰۰/);
    await page.screenshot({ path: path.join(SHOTS, 'cart-discount-desktop.png'), fullPage: true });

    await page.getByTestId('checkout-name').fill('SYNTHETIC گیرنده ' + RUN);
    await page.getByTestId('checkout-phone').fill('09120000000');
    await page.getByTestId('checkout-address').fill('SYNTHETIC نشانی تحویل، پلاک ۱۲');
    await page.getByTestId('checkout-submit').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/orders/**/return**');
    assert.match(await page.getByTestId('order-payment-result').innerText(), /پرداخت سفارش تأیید شد/);

    // 450,000 paid earns 450 points, which are not money and say so.
    await page.goto(BASE_URL + '/account/rewards', { waitUntil: 'load' });
    assert.match(await page.getByTestId('loyalty-balance').innerText(), /۴۵۰/);
    assert.match(await page.getByTestId('loyalty-no-cash').innerText(), /به هیچ حسابی واریز نمی‌شود/);
    await page.screenshot({ path: path.join(SHOTS, 'rewards-desktop.png'), fullPage: true });
    assert.ok(href.length > 0);
  } finally {
    await context.close();
  }
});

test('the shop delivers it, and only then may the buyer review it', async () => {
  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    subOrderId = (await page
      .locator('[data-testid^="seller-suborder-"]')
      .first()
      .getAttribute('data-testid'))!.replace('seller-suborder-', '');

    for (const [to, labelFa, tracking] of [
      ['ACCEPTED_BY_SELLER', 'پذیرفته‌شده', ''],
      ['PREPARING', 'در حال آماده‌سازی', ''],
      ['SHIPPED', 'ارسال‌شده', 'SYN-' + RUN],
    ] as const) {
      await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
      await page.getByTestId('seller-move-select-' + subOrderId).selectOption(to);
      if (tracking) await page.getByTestId('seller-move-tracking-' + subOrderId).fill(tracking);
      await page.getByTestId('seller-move-submit-' + subOrderId).click();
      await page.getByTestId('seller-state-' + subOrderId).filter({ hasText: labelFa }).waitFor();
    }
  } finally {
    await seller.close();
  }

  const buyer = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyer.newPage();
    // Not delivered yet: nothing to review.
    await page.goto(BASE_URL + '/account/reviews', { waitUntil: 'load' });
    assert.match(await page.getByTestId('reviewable-note').innerText(), /پشت خریدی ثبت می‌شود که انجام شده باشد/);
    assert.equal(await page.locator('[data-testid^="reviewable-"]').filter({ hasText: 'SYNTHETIC' }).count(), 0);

    await page.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
    await page.locator('[data-testid^="order-link-"]').first().click();
    await page.getByTestId('order-parts').waitFor();
    await page.getByTestId('buyer-move-select-' + subOrderId).selectOption('DELIVERED');
    await page.getByTestId('buyer-move-submit-' + subOrderId).click();
    await page.getByTestId('suborder-status-' + subOrderId).filter({ hasText: 'تحویل‌شده' }).waitFor();

    // Delivered: now it appears, and a review can be left.
    await page.goto(BASE_URL + '/account/reviews', { waitUntil: 'load' });
    await page.getByTestId('reviewable-' + subOrderId).waitFor();
    await page.getByTestId('review-one-' + subOrderId).selectOption('5');
    await page.getByTestId('review-two-' + subOrderId).selectOption('4');
    await page.getByTestId('review-three-' + subOrderId).selectOption('3');
    await page.getByTestId('review-body-' + subOrderId).fill('SYNTHETIC — کالا همان بود که نوشته بودند.');
    await page.getByTestId('review-submit-' + subOrderId).click();
    // The purchase leaves the reviewable list once it has been reviewed.
    await page.getByTestId('reviewable-' + subOrderId).waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(SHOTS, 'review-left-mobile.png'), fullPage: true });
  } finally {
    await buyer.close();
  }
});

test('the rating on the product page is built from reviews and says so', async () => {
  const anonymous = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await openProduct(page);
    // (5 + 4 + 3) / 3 = 4
    assert.match(await page.getByTestId('product-rating').innerText(), /۴ از ۵/);
    assert.match(
      await page.getByTestId('product-rating-note').innerText(),
      /نظر فقط پشت خریدی ثبت می‌شود که انجام شده باشد/,
    );
    await page.screenshot({ path: path.join(SHOTS, 'product-rating-mobile.png'), fullPage: true });
  } finally {
    await anonymous.close();
  }

  // The shop may answer, and may not remove.
  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/reviews', { waitUntil: 'load' });
    await page.getByTestId('seller-reviews').waitFor();
    assert.match(await page.getByTestId('seller-rating-note').innerText(), /هیچ بسته تبلیغی آن را جابه‌جا نمی‌کند/);

    const reviewId = (await page
      .locator('[data-testid^="seller-review-body-"]')
      .first()
      .getAttribute('data-testid'))!.replace('seller-review-body-', '');
    await page.getByTestId('reply-body-' + reviewId).fill('SYNTHETIC — ممنون از خرید شما.');
    await page.getByTestId('reply-submit-' + reviewId).click();
    await page.getByTestId('seller-review-reply-' + reviewId).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'seller-reviews-desktop.png'), fullPage: true });
  } finally {
    await seller.close();
  }
});

test('a question waits for a moderator before anybody reads it', async () => {
  const buyer = await contextFor(buyerState);
  try {
    const page = await buyer.newPage();
    await openProduct(page);
    await page.getByTestId('ask-body-' + (await productIdOf(page))).fill('SYNTHETIC آیا برای توله مناسب است؟');
    await page.locator('[data-testid^="ask-submit-"]').first().click();
    await expectText(page, 'پس از بررسی نمایش داده می‌شود');

    // Still nothing public.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('product-questions-empty').waitFor();
  } finally {
    await buyer.close();
  }

  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/trust', { waitUntil: 'load' });
    assert.match(await page.getByTestId('reputation-note').innerText(), /تبلیغ جایگاه می‌خرد، نه اعتبار/);
    const questionId = (await page
      .locator('[data-testid^="decide-question-select-"]')
      .first()
      .getAttribute('data-testid'))!.replace('decide-question-select-', '');
    await page.getByTestId('decide-question-select-' + questionId).selectOption('PUBLISHED');
    await page.getByTestId('decide-question-submit-' + questionId).click();
    // A decided question leaves the queue, taking its form with it.
    await page.getByTestId('decide-question-select-' + questionId).waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(SHOTS, 'market-trust-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }

  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/reviews', { waitUntil: 'load' });
    const questionId = (await page
      .locator('[data-testid^="answer-body-"]')
      .first()
      .getAttribute('data-testid'))!.replace('answer-body-', '');
    await page.getByTestId('answer-body-' + questionId).fill('SYNTHETIC — بله، برای توله هم مناسب است.');
    await page.getByTestId('answer-submit-' + questionId).click();
    await page.getByTestId('seller-answer-' + questionId).waitFor();
  } finally {
    await seller.close();
  }

  // Now, and only now, the public sees the pair.
  const anonymous = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await openProduct(page);
    assert.match(await page.getByTestId('product-questions').innerText(), /مناسب است/);
  } finally {
    await anonymous.close();
  }
});

test('what somebody keeps, what they are told, and what they can switch off', async () => {
  const context = await contextFor(buyerState);
  try {
    const page = await context.newPage();
    await openProduct(page);
    const productId = await productIdOf(page);
    await page.getByTestId('save-toggle-' + productId).click();
    await expectText(page, 'به فهرست شما اضافه شد');

    await page.goto(BASE_URL + '/account/saved', { waitUntil: 'load' });
    await page.getByTestId('saved-items').waitFor();
    assert.match(await page.getByTestId('saved-' + productId).innerText(), /SYNTHETIC/);
    // Every suggestion explains itself. Asked by counting rather than by
    // waiting for an element that may legitimately not be there — a swallowed
    // timeout is thirty silent seconds.
    if ((await page.getByTestId('suggestions').count()) > 0) {
      assert.match(await page.getByTestId('suggestions').innerText(), /چون/);
    }
    // The history was recorded because a retention period is configured.
    assert.match(await page.getByTestId('viewed').innerText(), /SYNTHETIC/);
    assert.match(await page.getByTestId('privacy-note').innerText(), /آنچه تا امروز نگه داشته شده را هم پاک می‌کند/);
    await page.screenshot({ path: path.join(SHOTS, 'saved-desktop.png'), fullPage: true });

    // Turning the history off clears it, rather than only stopping more.
    await page.getByTestId('pref-history').check();
    await page.getByTestId('preferences-save').click();
    await page.getByTestId('viewed-empty').waitFor();
  } finally {
    await context.close();
  }
});

test('the invoice is a PDF, and only for a paid order', async () => {
  const context = await contextFor(buyerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
    await page.locator('[data-testid^="order-link-"]').first().click();
    await page.getByTestId('order-invoice').waitFor();

    const href = (await page.getByTestId('order-invoice').getAttribute('href'))!;
    const response = await page.request.get(BASE_URL + href);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'] ?? '', /application\/pdf/);
    const body = await response.body();
    // A real PDF, not an error page wearing the header.
    assert.equal(body.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(body.length > 1000);
  } finally {
    await context.close();
  }
});

/** The product id, taken from the save form that carries it. */
async function productIdOf(page: import('playwright').Page): Promise<string> {
  const form = page.locator('[data-testid^="ask-form-"]').first();
  return (await form.getAttribute('data-testid'))!.replace('ask-form-', '');
}
