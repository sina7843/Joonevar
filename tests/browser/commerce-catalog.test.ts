/**
 * The catalogue, in a real browser — PROMPT-009.
 *
 * A real account with real KYC fills the application, accepts the versioned
 * agreement, uploads a document and sends it for review; a reviewer verifies
 * the settlement account and approves; and the store starts trading only after
 * a plan payment the server verified.
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
  setPaymentMode,
  BASE_URL,
} from './support.ts';
import {
  openFlag,
  publishPlan,
  setMarketSetting,
  stateFor,
  tradingStore,
  type ShopFixtureOptions,
  type State,
} from './shop-fixture.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-009');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const AGREEMENT = 'SYNTHETIC-AGREEMENT-' + RUN;

let browser!: Browser;
let adminState!: State;
let sellerState!: State;
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
  await setMarketSetting(fixture, 'market.shop.seller_agreement_version', AGREEMENT);
  await setMarketSetting(fixture, 'market.shop.seller_plan_basic_monthly_toman', '900000');
  await publishPlan(fixture, {
    code: 'BASIC',
    labelFa: 'پلن پایه فروشنده',
    durationDays: 30,
    productLimit: 50,
    commissionBp: 500,
    priceKey: 'market.shop.seller_plan_basic_monthly_toman',
  });

  // The store is taken all the way to trading, because nothing can be listed
  // until a plan period has begun.
  const store = await tradingStore(fixture, {
    nameFa: 'SYNTHETIC فروشگاه کاتالوگ ' + RUN,
    identifier: '2' + RUN.padStart(10, '0'),
    iban: 'IR060540102680020817909002',
    ownerLabelFa: 'فروشنده کاتالوگ',
  });
  sellerState = store.sellerState;
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});

test('a seller builds a product, its variant, its picture and sends it for review', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });

    // The categories this phase does not sell are named, with the reason.
    assert.match(await page.getByTestId('blocked-categories').innerText(), /تصمیم حقوقی/);

    // And medicine is not among the categories a seller can choose.
    const categories = await page
      .getByTestId('product-category')
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
    assert.ok(!categories.includes('دارو'), 'a blocked category is not offered: ' + categories.join('،'));

    await page.getByTestId('product-category').selectOption({ label: 'غذای خشک' });
    await page.getByTestId('product-name').fill('SYNTHETIC غذای خشک سگ ' + RUN);
    await page.getByTestId('product-brand').fill('SYNTHETIC برند');
    await page.getByTestId('product-species-DOG').check();
    await page.getByTestId('create-product').click();
    await expectText(page, 'کالا به‌عنوان پیش‌نویس ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    const productId = (await page
      .locator('[data-testid^="variant-form-"]')
      .first()
      .getAttribute('data-testid'))!.replace('variant-form-', '');

    await page.getByTestId('variant-weight').fill('۲ کیلو');
    await page.getByTestId('add-variant-' + productId).click();
    await expectText(page, 'تنوع تازه ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page
      .getByTestId('product-image-file-' + productId)
      .setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('product-image-alt-' + productId).fill('SYNTHETIC تصویر کالا');
    await page.getByTestId('add-product-image-' + productId).click();
    await expectText(page, 'تصویر کالا افزوده شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('submit-product-' + productId).click();
    await page.getByTestId('product-status-' + productId).filter({ hasText: 'در انتظار بررسی' }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'seller-catalog-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('a reviewer publishes it, and only then can it be offered and priced', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/catalog', { waitUntil: 'load' });
    await page.getByTestId('catalog-queue').waitFor();
    assert.match(await page.getByTestId('catalog-blocked-note').innerText(), /دارو/);

    const productId = (await page
      .locator('[data-testid^="product-decision-select-"]')
      .first()
      .getAttribute('data-testid'))!.replace('product-decision-select-', '');
    assert.match(await page.getByTestId('catalog-variants-' + productId).innerText(), /۲ کیلو/);

    await page.screenshot({ path: path.join(SHOTS, 'catalog-review-desktop.png'), fullPage: true });

    /*
     * The confirmation a reviewer actually reads is the queue itself: a decided
     * product leaves the list of what is waiting, taking its own form — and
     * that form's message — with it. Asserted on the resulting state rather
     * than on a toast that is gone by the time the page re-renders.
     */
    await page.getByTestId('product-decision-select-' + productId).selectOption('PUBLISHED');
    await page.getByTestId('product-decide-' + productId).click();
    await page.getByTestId('product-decision-select-' + productId).waitFor({ state: 'detached' });
  } finally {
    await ops.close();
  }

  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('offer-product').selectOption({ index: 1 });
    await page.getByTestId('offer-shipping').selectOption('YES');
    await page.getByTestId('create-offer').click();
    await expectText(page, 'عرضه ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    const offerId = (await page
      .locator('[data-testid^="sku-form-"]')
      .first()
      .getAttribute('data-testid'))!.replace('sku-form-', '');
    await page.getByTestId('sku-variant-' + offerId).selectOption({ index: 1 });
    await page.getByTestId('sku-code-' + offerId).fill('BAG-2KG');
    await page.getByTestId('sku-price-' + offerId).fill('480000');
    await page.getByTestId('sku-stock-' + offerId).fill('6');
    await page.getByTestId('add-sku-' + offerId).click();
    await expectText(page, 'قیمت و موجودی ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('offer-move-active-' + offerId).click();
    await page.getByTestId('offer-status-' + offerId).filter({ hasText: 'در حال فروش' }).waitFor();
  } finally {
    await context.close();
  }
});

test('the public shop shows it, compares the offers, and says what it does not yet do', async () => {
  const anonymous = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await page.goto(BASE_URL + '/shop', { waitUntil: 'load' });
    await page.getByTestId('shop-results').waitFor();
    assert.match(await page.getByTestId('shop-blocked-note').innerText(), /دارو/);

    const href = (await page.locator('[data-testid^="shop-item-"]').first().getAttribute('href'))!;
    await page.goto(BASE_URL + href, { waitUntil: 'load' });
    assert.match(await page.getByTestId('product-price').innerText(), /۴۸۰٬۰۰۰/);
    assert.match(await page.getByTestId('product-offers').innerText(), /موجود/);
    // A visitor is told how to buy rather than shown a button that cannot work;
    // the basket itself belongs to somebody, so it needs an account (PROMPT-010).
    assert.match(await page.getByTestId('product-order-note').innerText(), /وارد حساب خود شوید/);
    await page.screenshot({ path: path.join(SHOTS, 'shop-product-mobile.png'), fullPage: true });
  } finally {
    await anonymous.close();
  }
});

test('a stock correction is written into the ledger with its reason', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    const skuId = (await page
      .locator('[data-testid^="stock-form-"]')
      .first()
      .getAttribute('data-testid'))!.replace('stock-form-', '');
    assert.match(await page.getByTestId('sku-stock-value-' + skuId).innerText(), /۶/);

    await page.getByTestId('stock-kind-' + skuId).selectOption('ADJUST');
    await page.getByTestId('stock-quantity-' + skuId).fill('-2');
    await page.getByTestId('stock-reason-' + skuId).fill('SYNTHETIC شمارش انبار');
    await page.getByTestId('stock-submit-' + skuId).click();
    await expectText(page, 'تغییر موجودی در دفتر ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    assert.match(await page.getByTestId('sku-stock-value-' + skuId).innerText(), /۴/);
  } finally {
    await context.close();
  }
});
