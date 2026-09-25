/**
 * Delivery, a return and a settlement, in a real browser — PROMPT-011.
 *
 * A shop states how it delivers; a buyer picks it and pays; the goods arrive
 * and one of them goes back; and the money that is left is gathered, sent by
 * a person and written down with the bank's own reference. Nothing here is
 * performed by the platform — it is recorded, which is the whole of what a
 * marketplace can honestly claim about a bank transfer.
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
  tradingStore,
  type ShopFixtureOptions,
  type State,
  type TradingStore,
} from './shop-fixture.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-011');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const AGREEMENT = 'SYNTHETIC-AGREEMENT-' + RUN;
const PRODUCT = 'SYNTHETIC غذای سگ ' + RUN;

let browser!: Browser;
let adminState!: State;
let buyerState!: State;
let shop!: TradingStore;
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
  fixture = { browser, adminState, operatorState, reasonFa: REASON, agreementVersion: AGREEMENT };

  await openFlag(fixture, 'market.flag.seller_onboarding_enabled');
  await openFlag(fixture, 'market.flag.commerce_checkout_enabled');
  await setMarketSetting(fixture, 'market.shop.seller_agreement_version', AGREEMENT);
  await setMarketSetting(fixture, 'market.shop.seller_plan_basic_monthly_toman', '900000');
  await setMarketSetting(fixture, 'market.shop.suborder_acceptance_window_hours', '48');
  // A day, so a return is actually possible inside this run. The money that
  // follows a delivery is therefore still held when the run ends, which is
  // correct and is why the settlement below is exercised on a figure that
  // does not have to wait for a window — the held path is proved in the
  // database suite, where the clock can be asked about a later moment.
  await setMarketSetting(fixture, 'market.shop.return_window_days', '1');
  await setMarketSetting(fixture, 'market.settlement.hold_days_after_delivery', '0');
  await publishPlan(fixture, {
    code: 'BASIC',
    labelFa: 'پلن پایه فروشنده',
    durationDays: 30,
    productLimit: 50,
    commissionBp: 500,
    priceKey: 'market.shop.seller_plan_basic_monthly_toman',
  });

  shop = await tradingStore(fixture, {
    nameFa: 'SYNTHETIC فروشگاه تحویل ' + RUN,
    identifier: '5' + RUN.padStart(10, '0'),
    iban: 'IR060540102680020817909301',
    ownerLabelFa: 'فروشنده تحویل',
  });
  await sellableProduct(fixture, shop, {
    nameFa: PRODUCT,
    sku: 'F-2KG',
    priceToman: 500_000,
    stock: 6,
    imagePng: PNG,
  });

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

test('a shop states how it delivers, and until it does nothing of its can be bought', async () => {
  // Before any method exists, the basket refuses and says why.
  const early = await contextFor(buyerState, MOBILE);
  try {
    const page = await early.newPage();
    await page.goto(BASE_URL + '/shop', { waitUntil: 'load' });
    const href = (await page
      .locator('[data-testid^="shop-item-"]')
      .filter({ hasText: PRODUCT })
      .first()
      .getAttribute('href'))!;
    await page.goto(BASE_URL + href, { waitUntil: 'load' });
    const form = page.locator('[data-testid^="add-to-cart-form-"]').first();
    const skuId = (await form.getAttribute('data-testid'))!.replace('add-to-cart-form-', '');
    await page.getByTestId('add-quantity-' + skuId).selectOption('2');
    await page.getByTestId('add-to-cart-' + skuId).click();
    await expectText(page, 'سبد خرید به‌روز شد');

    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    assert.match(await page.getByTestId('cart-blocked').innerText(), /از سبد بردارید|تعدادشان/);
    assert.match(
      await page.getByTestId('cart-no-method-' + shop.sellerId).innerText(),
      /هیچ روش ارسالی اعلام نکرده/,
    );
    await page.screenshot({ path: path.join(SHOTS, 'cart-no-method-mobile.png'), fullPage: true });
  } finally {
    await early.close();
  }

  // The shop states two ways of delivering, on its own terms.
  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    assert.match(await page.getByTestId('shipping-methods-note').innerText(), /تا ثبت حداقل یک روش ارسال/);

    await page.getByTestId('method-label').fill('SYNTHETIC پست پیشتاز');
    await page.getByTestId('method-kind').selectOption('POST');
    await page.getByTestId('method-coverage').selectOption('WHOLE_COUNTRY');
    await page.getByTestId('method-pricing').selectOption('FIXED');
    await page.getByTestId('method-base-fee').fill('45000');
    await page.getByTestId('method-preparation-days').fill('2');
    await page.getByTestId('method-save').click();
    await expectText(page, 'روش ارسال ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('method-label').fill('SYNTHETIC تحویل حضوری');
    await page.getByTestId('method-kind').selectOption('PICKUP');
    await page.getByTestId('method-coverage').selectOption('WHOLE_COUNTRY');
    await page.getByTestId('method-pricing').selectOption('FIXED');
    await page.getByTestId('method-base-fee').fill('0');
    await page.getByTestId('method-preparation-days').fill('1');
    await page.getByTestId('method-save').click();
    await expectText(page, 'روش ارسال ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    assert.equal(await page.locator('[data-testid^="shipping-method-"]').count(), 2);
    await page.screenshot({ path: path.join(SHOTS, 'shipping-methods-desktop.png'), fullPage: true });
  } finally {
    await seller.close();
  }
});

test('the buyer picks a delivery, sees what it costs, and pays once', async () => {
  const context = await contextFor(buyerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/shop/cart', { waitUntil: 'load' });
    await page.getByTestId('cart-methods-' + shop.sellerId).waitFor();

    // Both ways are offered, each with its own charge and promise.
    const methods = await page.getByTestId('cart-methods-' + shop.sellerId).innerText();
    assert.match(methods, /پست پیشتاز/);
    assert.match(methods, /تحویل حضوری/);
    assert.match(methods, /آماده‌سازی/);

    // Collection costs nothing, because nothing is delivered.
    const pickup = page.locator('[data-testid^="cart-method-"]').filter({ hasText: 'تحویل حضوری' }).first();
    await pickup.click();
    await page
      .getByTestId('cart-money-' + shop.sellerId)
      .filter({ hasText: 'رایگان' })
      .waitFor();

    // The post costs what the shop said, and the total follows it. The page
    // reloads with the choice in its address, so the new figure is what is
    // waited for rather than the element, which was there all along.
    const post = page.locator('[data-testid^="cart-method-"]').filter({ hasText: 'پست پیشتاز' }).first();
    await post.click();
    await page
      .getByTestId('cart-money-' + shop.sellerId)
      .filter({ hasText: '۴۵٬۰۰۰' })
      .waitFor();
    // 2 × 500,000 + 45,000
    assert.match(await page.getByTestId('checkout-total').innerText(), /۱٬۰۴۵٬۰۰۰/);
    await page.screenshot({ path: path.join(SHOTS, 'cart-methods-desktop.png'), fullPage: true });

    await page.getByTestId('checkout-name').fill('SYNTHETIC گیرنده ' + RUN);
    await page.getByTestId('checkout-phone').fill('09120000000');
    await page.getByTestId('checkout-address').fill('SYNTHETIC نشانی تحویل، پلاک ۱۲');
    await page.getByTestId('checkout-submit').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/orders/**/return**');
    assert.match(await page.getByTestId('order-payment-result').innerText(), /پرداخت سفارش تأیید شد/);
  } finally {
    await context.close();
  }
});

test('the shop delivers it, and its money is held rather than settleable', async () => {
  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
    const rows = page.locator('[data-testid^="seller-suborder-"]');
    const subOrderId = (await rows.first().getAttribute('data-testid'))!.replace('seller-suborder-', '');

    // The status badge is always on the page, so each step waits for the new
    // label rather than for the element, which was there all along.
    for (const [to, labelFa, tracking] of [
      ['ACCEPTED_BY_SELLER', 'پذیرفته‌شده', ''],
      ['PREPARING', 'در حال آماده‌سازی', ''],
      ['SHIPPED', 'ارسال‌شده', 'SYN-' + RUN],
    ] as const) {
      await page.goto(BASE_URL + '/account/seller/orders', { waitUntil: 'load' });
      await page.getByTestId('seller-move-select-' + subOrderId).selectOption(to);
      if (tracking) await page.getByTestId('seller-move-tracking-' + subOrderId).fill(tracking);
      await page.getByTestId('seller-move-submit-' + subOrderId).click();
      await page
        .getByTestId('seller-state-' + subOrderId)
        .filter({ hasText: labelFa })
        .waitFor();
    }

    // Money taken but not earned: it waits in pending until the goods arrive.
    await page.goto(BASE_URL + '/account/seller/finance', { waitUntil: 'load' });
    await page.getByTestId('balances').waitFor();
    assert.match(await page.getByTestId('balance-PENDING').innerText(), /۹۹۲٬۷۵۰/);
    assert.match(await page.getByTestId('balance-AVAILABLE').innerText(), /^۰ تومان$/);
    await page.screenshot({ path: path.join(SHOTS, 'seller-finance-desktop.png'), fullPage: true });
  } finally {
    await seller.close();
  }

  // The buyer confirms delivery, which is what moves the money on.
  const buyer = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
    await page.locator('[data-testid^="order-link-"]').first().click();
    await page.getByTestId('order-parts').waitFor();
    const part = page.locator('[data-testid^="order-part-"]').first();
    const subOrderId = (await part.getAttribute('data-testid'))!.replace('order-part-', '');
    await page.getByTestId('buyer-move-select-' + subOrderId).selectOption('DELIVERED');
    await page.getByTestId('buyer-move-submit-' + subOrderId).click();
    await page
      .getByTestId('suborder-status-' + subOrderId)
      .filter({ hasText: 'تحویل‌شده' })
      .waitFor();
  } finally {
    await buyer.close();
  }
});

test('one item goes back, and only that one is refunded', async () => {
  const buyer = await contextFor(buyerState, MOBILE);
  let subOrderId = '';
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
    await page.locator('[data-testid^="order-link-"]').first().click();
    const part = page.locator('[data-testid^="order-part-"]').first();
    subOrderId = (await part.getAttribute('data-testid'))!.replace('order-part-', '');

    await page.getByTestId('return-open-' + subOrderId).locator('summary').click();
    const itemBox = page.locator('[data-testid^="return-line-"]').first();
    const itemId = (await itemBox.getAttribute('data-testid'))!.replace('return-line-', '');
    await itemBox.check();
    await page.getByTestId('return-quantity-' + itemId).selectOption('1');
    await page.getByTestId('return-item-reason-' + itemId).fill('SYNTHETIC یکی اضافه بود');
    await page.getByTestId('return-reason-' + subOrderId).fill('SYNTHETIC فقط یکی را برمی‌گردانم');
    await page.getByTestId('return-submit-' + subOrderId).click();
    // A requested return takes the sub-order out of «تحویل‌شده», and the form
    // — with its message — leaves the page with it. The state it produced is
    // what is waited for.
    await page
      .getByTestId('suborder-status-' + subOrderId)
      .filter({ hasText: 'درخواست مرجوعی' })
      .waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'return-requested-mobile.png'), fullPage: true });
  } finally {
    await buyer.close();
  }

  const seller = await contextFor(shop.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/returns', { waitUntil: 'load' });
    await page.getByTestId('seller-returns').waitFor();
    const returnId = (await page
      .locator('[data-testid^="seller-return-status-"]')
      .first()
      .getAttribute('data-testid'))!.replace('seller-return-status-', '');

    for (const step of ['APPROVED'] as const) {
      await page.getByTestId('seller-return-select-' + returnId).selectOption(step);
      await page.getByTestId('seller-return-submit-' + returnId).click();
      await page.getByTestId('seller-return-status-' + returnId).filter({ hasText: 'پذیرفته‌شده' }).waitFor();
    }
    await page.screenshot({ path: path.join(SHOTS, 'seller-returns-desktop.png'), fullPage: true });

    // The buyer posts it back.
    const back = await contextFor(buyerState, MOBILE);
    try {
      const buyerPage = await back.newPage();
      await buyerPage.goto(BASE_URL + '/account/orders', { waitUntil: 'load' });
      await buyerPage.locator('[data-testid^="order-link-"]').first().click();
      await buyerPage.getByTestId('order-parts').waitFor();
    } finally {
      await back.close();
    }

    // The shop records it as arrived, and what condition it arrived in.
    await page.goto(BASE_URL + '/account/seller/returns', { waitUntil: 'load' });
    await page.getByTestId('seller-return-select-' + returnId).selectOption('DISPUTED');
    await page.getByTestId('seller-return-note-' + returnId).fill('SYNTHETIC — درباره وضعیت کالا اختلاف داریم');
    await page.getByTestId('seller-return-submit-' + returnId).click();
    await page
      .getByTestId('seller-return-status-' + returnId)
      .filter({ hasText: 'اختلاف' })
      .waitFor();
  } finally {
    await seller.close();
  }

  // A disputed return keeps the shop's money held: it is not settleable.
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/returns', { waitUntil: 'load' });
    await page.getByTestId('disputed-returns').waitFor();
    assert.match(await page.getByTestId('disputed-hold-note').innerText(), /نگه داشته می‌شود/);
    const returnId = (await page
      .locator('[data-testid^="disputed-status-"]')
      .first()
      .getAttribute('data-testid'))!.replace('disputed-status-', '');
    await page.screenshot({ path: path.join(SHOTS, 'disputed-return-desktop.png'), fullPage: true });

    // The operator settles it: the goods are treated as received as sold.
    await page.getByTestId('ops-return-select-' + returnId).selectOption('RECEIVED');
    await page.getByTestId('ops-return-condition-' + returnId).selectOption('AS_SOLD');
    await page.getByTestId('ops-return-submit-' + returnId).click();
    // A settled return leaves the disputed queue, taking its form and the
    // message on it, so the row going is the result that is waited for.
    await page.getByTestId('disputed-status-' + returnId).waitFor({ state: 'detached' });
  } finally {
    await ops.close();
  }

  const refunding = await contextFor(shop.sellerState);
  try {
    const page = await refunding.newPage();
    await page.goto(BASE_URL + '/account/seller/returns', { waitUntil: 'load' });
    const returnId = (await page
      .locator('[data-testid^="seller-return-status-"]')
      .first()
      .getAttribute('data-testid'))!.replace('seller-return-status-', '');
    await page.getByTestId('seller-return-select-' + returnId).selectOption('REFUNDED');
    await page.getByTestId('seller-return-submit-' + returnId).click();
    await page.getByTestId('seller-return-status-' + returnId).filter({ hasText: 'بازپرداخت‌شده' }).waitFor();

    // One of the two, so the shop keeps the other.
    await page.goto(BASE_URL + '/account/seller/finance', { waitUntil: 'load' });
    const ledger = await page.getByTestId('ledger').innerText();
    assert.match(ledger, /بازپرداخت/);
  } finally {
    await refunding.close();
  }
});

test('an operator gathers what is left, sends it, and writes down the bank’s reference', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/settlement', { waitUntil: 'load' });
    assert.match(await page.getByTestId('settlement-manual-note').innerText(), /بیرون از همزیست انجام می‌شود/);
    await page.getByTestId('settlement-queue').waitFor();

    // The operator's own entry lives behind a disclosure, which has to be
    // opened before anything inside it can be used.
    await page.locator('details').filter({ hasText: 'ثبت دستی در دفتر' }).first().locator('summary').click();
    // The sale's own money is still held until the return window closes,
    // which is a day away. A correction the operator records is settleable at
    // once, so the batch, the payment and its bank reference are exercised on
    // a real figure rather than on a clock the browser cannot move.
    await page.getByTestId('ledger-kind-' + shop.sellerId).selectOption('ADJUSTMENT');
    await page.getByTestId('ledger-amount-' + shop.sellerId).fill('300000');
    await page
      .getByTestId('ledger-reason-' + shop.sellerId)
      .fill('SYNTHETIC — اصلاح آزمایشی برای بررسی مسیر تسویه');
    await page.getByTestId('ledger-submit-' + shop.sellerId).click();
    await page
      .getByTestId('ledger-entry-result-' + shop.sellerId)
      .filter({ hasText: 'ثبت شد' })
      .waitFor();

    await page.goto(BASE_URL + '/market/settlement', { waitUntil: 'load' });
    await page.getByTestId('open-batch-' + shop.sellerId).click();
    // Once a batch exists the shop's row shows the batch instead of the
    // button, so the new state is what is waited for rather than a message
    // that left the page with the form that produced it.
    await page.locator('[data-testid^="batch-move-form-"]').first().waitFor();

    await page.goto(BASE_URL + '/market/settlement', { waitUntil: 'load' });
    const batchId = (await page
      .locator('[data-testid^="batch-move-form-"]')
      .first()
      .getAttribute('data-testid'))!.replace('batch-move-form-', '');

    await page.getByTestId('batch-move-select-' + batchId).selectOption('READY');
    await page.getByTestId('batch-move-submit-' + batchId).click();
    await page
      .getByTestId('settlement-batch-status-' + shop.sellerId)
      .filter({ hasText: 'آماده واریز' })
      .waitFor();

    // A payment without the bank's reference is not a recorded payment.
    await page.goto(BASE_URL + '/market/settlement', { waitUntil: 'load' });
    await page.getByTestId('batch-move-select-' + batchId).selectOption('PAID');
    await page.getByTestId('batch-move-submit-' + batchId).click();
    await expectText(page, 'شماره پیگیری بانکی را وارد کنید');

    // The refused submit re-rendered the form, so the choice and the
    // reference are both entered again before trying it properly.
    await page.getByTestId('batch-move-select-' + batchId).selectOption('PAID');
    await page.getByTestId('batch-reference-' + batchId).fill('SYN-BANK-' + RUN);
    await page.getByTestId('batch-move-submit-' + batchId).click();
    await page
      .getByTestId('settlement-batch-status-' + shop.sellerId)
      .filter({ hasText: 'واریزشده' })
      .waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'settlement-paid-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }

  // The shop sees the payment, with the reference it was sent under.
  const watching = await contextFor(shop.sellerState);
  try {
    const page = await watching.newPage();
    await page.goto(BASE_URL + '/account/seller/finance', { waitUntil: 'load' });
    await page.getByTestId('batches').waitFor();
    assert.match(await page.getByTestId('batches').innerText(), new RegExp('SYN-BANK-' + RUN));
    // And while it is on its way, the account is locked.
    assert.match(await page.getByTestId('account-locked').innerText(), /تغییر شماره شبا ممکن نیست/);
  } finally {
    await watching.close();
  }
});
