/**
 * Building a real trading store in a real browser — PROMPT-009, PROMPT-010.
 *
 * Two suites need the same thing before they can test anything: a verified
 * member whose application was filled in, whose agreement was accepted, whose
 * store a reviewer approved, and whose plan period began because a payment was
 * verified at a gateway. None of that is written into the database, because a
 * store's right to sell is exactly what both suites depend on.
 */
import type { Browser, BrowserContext } from 'playwright';
import { approvedMember, BASE_URL, DESKTOP, expectText, signIn } from './support.ts';

export type State = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface ShopFixtureOptions {
  readonly browser: Browser;
  readonly adminState: State;
  readonly reasonFa: string;
  /** The published agreement version this run set, so accepting it can be waited for. */
  readonly agreementVersion: string;
}

const contextFor = (browser: Browser, state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

/** Sign one mobile in and keep its session, for a fixture to reuse. */
export async function stateFor(browser: Browser, mobile: string): Promise<State> {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, mobile);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

/** Set one managed setting through the operational screen, with its reason. */
export async function setMarketSetting(
  options: ShopFixtureOptions,
  key: string,
  value: string,
): Promise<void> {
  const admin = await contextFor(options.browser, options.adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market/settings', { waitUntil: 'load' });
    await page.getByTestId('market-setting-value-' + key).fill(value);
    await page.getByTestId('market-setting-reason-' + key).fill(options.reasonFa);
    await page.getByTestId('market-setting-save-' + key).click();
    await expectText(page, value === '' ? 'مقدار پاک شد' : 'مقدار ذخیره شد');
  } finally {
    await admin.close();
  }
}

/** Open one kill switch, which starts closed because nothing behind it is assumed. */
export async function openFlag(options: ShopFixtureOptions, key: string): Promise<void> {
  const admin = await contextFor(options.browser, options.adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    const button = page.getByTestId('flag-toggle-' + key);
    if ((await button.innerText()).includes('بستن')) return;
    await page.getByTestId('flag-reason-' + key).fill(options.reasonFa);
    await button.click();
    await expectText(page, 'مقدار ذخیره شد.');
  } finally {
    await admin.close();
  }
}

/** Publish one seller plan through the real operational screen. */
export async function publishPlan(
  options: ShopFixtureOptions,
  input: { code: string; labelFa: string; durationDays: number; productLimit: number; commissionBp: number; priceKey: string },
): Promise<void> {
  const admin = await contextFor(options.browser, options.adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market/plans', { waitUntil: 'load' });
    await page.getByTestId('plan-code').fill(input.code);
    await page.getByTestId('plan-label').fill(input.labelFa);
    await page.getByTestId('plan-duration').fill(String(input.durationDays));
    await page.getByTestId('plan-limit').fill(String(input.productLimit));
    await page.getByTestId('plan-commission').fill(String(input.commissionBp));
    await page.getByTestId('plan-price-key').fill(input.priceKey);
    await page.getByTestId('plan-note').fill(options.reasonFa);
    await page.getByTestId('plan-publish').click();
    await expectText(page, 'نسخه تازه پلن منتشر شد');
  } finally {
    await admin.close();
  }
}

export interface TradingStore {
  readonly sellerState: State;
  readonly sellerId: string;
  readonly displayNameFa: string;
}

/**
 * One store, taken all the way from a signed-in member to trading.
 *
 * The reviewer's approval and the plan payment are both real: the approval is
 * a decision made on the operational screen, and the period begins because the
 * gateway return verified a payment, not because anything said it had.
 */
export async function tradingStore(
  options: ShopFixtureOptions & { operatorState: State },
  input: { nameFa: string; identifier: string; iban: string; ownerLabelFa: string },
): Promise<TradingStore> {
  const member = await approvedMember(options.browser, options.operatorState, input.ownerLabelFa);
  let sellerState: State;
  try {
    sellerState = await member.context.storageState();
  } finally {
    await member.context.close();
  }

  const store = await contextFor(options.browser, sellerState);
  try {
    const page = await store.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page.getByTestId('seller-display-name').fill(input.nameFa);
    await page.getByTestId('start-seller-submit').click();
    await page.getByTestId('seller-status').waitFor();

    await page.getByTestId('field-legal-name').fill(input.nameFa);
    await page.getByTestId('field-business-type').fill('پت‌شاپ');
    await page.getByTestId('field-identifier').fill(input.identifier);
    await page.getByTestId('field-rep-name').fill('SYNTHETIC نماینده');
    await page.getByTestId('field-rep-phone').fill('02100000000');
    await page.getByTestId('field-province').selectOption({ index: 1 });
    await page.getByTestId('field-city').selectOption({ index: 1 });
    await page.getByTestId('field-address').fill('SYNTHETIC نشانی');
    await page.getByTestId('field-iban').fill(input.iban);
    await page.getByTestId('field-iban-holder').fill('SYNTHETIC صاحب حساب');
    await page.getByTestId('field-shipping').fill('SYNTHETIC ارسال');
    await page.getByTestId('field-return').fill('SYNTHETIC مرجوعی');
    await page.getByTestId('save-seller').click();
    await expectText(page, 'اطلاعات فروشگاه ذخیره شد');

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page.getByTestId('accept-agreement').click();
    // The accepted version appears on the page; submitting before it lands
    // would be submitting a store that has not agreed to anything.
    await expectText(page, options.agreementVersion);

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page.getByTestId('submit-seller').click();
    await page.getByTestId('seller-status').filter({ hasText: 'ارسال‌شده برای بررسی' }).waitFor();
  } finally {
    await store.close();
  }

  // The reviewer decides on the store that is actually waiting, found by the
  // name this fixture gave it rather than by whichever row happens to be first.
  const ops = await contextFor(options.browser, options.adminState);
  let sellerId: string;
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
    const row = page.locator('[data-testid^="seller-row-"]').filter({ hasText: input.nameFa }).first();
    sellerId = (await row.getAttribute('data-testid'))!.replace('seller-row-', '');
    for (const decision of ['UNDER_REVIEW', 'APPROVED'] as const) {
      await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
      await page.getByTestId('seller-decision-select-' + sellerId).selectOption(decision);
      await page.getByTestId('seller-decide-' + sellerId).click();
      await expectText(page, 'تصمیم ثبت شد');
    }
    // A person checks that the account belongs to this shop. Without it
    // nothing can ever be settled to it, so a fixture that stops short of
    // this builds a store that cannot be paid (PROMPT-011).
    await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
    const verify = page.getByTestId('verify-iban-submit-' + sellerId);
    if ((await verify.count()) > 0) {
      await page.getByTestId('verify-iban-note-' + sellerId).fill(options.reasonFa);
      await verify.click();
      await expectText(page, 'ثبت شد');
    }
  } finally {
    await ops.close();
  }

  const buying = await contextFor(options.browser, sellerState);
  try {
    const page = await buying.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    const planValues = await page
      .getByTestId('plan-select')
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
    await page.getByTestId('plan-select').selectOption(planValues[0]!);
    await page.getByTestId('buy-plan').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/seller/return**');
  } finally {
    await buying.close();
  }

  return { sellerState, sellerId, displayNameFa: input.nameFa };
}

/**
 * A product published and priced, ready to be bought.
 *
 * Every step is the seller's own screen and the reviewer's own screen: the
 * product is proposed, reviewed and published, and only then can an offer
 * carry a price and a quantity.
 */
export async function sellableProduct(
  options: ShopFixtureOptions,
  store: TradingStore,
  input: { nameFa: string; sku: string; priceToman: number; stock: number; imagePng: Buffer },
): Promise<{ productId: string; offerId: string }> {
  const seller = await contextFor(options.browser, store.sellerState);
  let productId: string;
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('product-category').selectOption({ label: 'غذای خشک' });
    await page.getByTestId('product-name').fill(input.nameFa);
    await page.getByTestId('product-brand').fill('SYNTHETIC برند');
    await page.getByTestId('product-species-DOG').check();
    await page.getByTestId('create-product').click();
    await expectText(page, 'کالا به‌عنوان پیش‌نویس ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    const form = page.locator('[data-testid^="variant-form-"]').first();
    productId = (await form.getAttribute('data-testid'))!.replace('variant-form-', '');

    await page.getByTestId('variant-weight').fill('۲ کیلو');
    await page.getByTestId('add-variant-' + productId).click();
    await expectText(page, 'تنوع تازه ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page
      .getByTestId('product-image-file-' + productId)
      .setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: input.imagePng });
    await page.getByTestId('product-image-alt-' + productId).fill('SYNTHETIC تصویر کالا');
    await page.getByTestId('add-product-image-' + productId).click();
    await expectText(page, 'تصویر کالا افزوده شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('submit-product-' + productId).click();
    await page.getByTestId('product-status-' + productId).filter({ hasText: 'در انتظار بررسی' }).waitFor();
  } finally {
    await seller.close();
  }

  const ops = await contextFor(options.browser, options.adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/catalog', { waitUntil: 'load' });
    await page.getByTestId('product-decision-select-' + productId).selectOption('PUBLISHED');
    await page.getByTestId('product-decide-' + productId).click();
    // A decided product leaves the review queue, taking its form — and the
    // message on it — with it, so the state is what is waited for.
    await page.getByTestId('product-decide-' + productId).waitFor({ state: 'detached' });
  } finally {
    await ops.close();
  }

  const pricing = await contextFor(options.browser, store.sellerState);
  let offerId: string;
  try {
    const page = await pricing.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('offer-product').selectOption(productId);
    await page.getByTestId('offer-shipping').selectOption('YES');
    await page.getByTestId('create-offer').click();
    await expectText(page, 'عرضه ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    const skuForm = page.locator('[data-testid^="sku-form-"]').first();
    offerId = (await skuForm.getAttribute('data-testid'))!.replace('sku-form-', '');
    await page.getByTestId('sku-variant-' + offerId).selectOption({ index: 1 });
    await page.getByTestId('sku-code-' + offerId).fill(input.sku);
    await page.getByTestId('sku-price-' + offerId).fill(String(input.priceToman));
    await page.getByTestId('sku-stock-' + offerId).fill(String(input.stock));
    await page.getByTestId('add-sku-' + offerId).click();
    await expectText(page, 'قیمت و موجودی ثبت شد');

    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('offer-move-active-' + offerId).click();
    await page.getByTestId('offer-status-' + offerId).filter({ hasText: 'در حال فروش' }).waitFor();
  } finally {
    await pricing.close();
  }

  return { productId, offerId };
}

/**
 * State one way this shop delivers — PROMPT-011.
 *
 * A shop that has stated none cannot be checked out from, so a fixture that
 * wants a basket to reach a gateway says how the parcel gets there, the way a
 * real shop would.
 */
export async function stateShippingTerms(
  options: ShopFixtureOptions,
  store: TradingStore,
  input: { feeToman: number; freeThresholdToman?: number | null; labelFa?: string },
): Promise<void> {
  const seller = await contextFor(options.browser, store.sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller/catalog', { waitUntil: 'load' });
    await page.getByTestId('method-label').fill(input.labelFa ?? 'SYNTHETIC پست');
    await page.getByTestId('method-kind').selectOption('POST');
    await page.getByTestId('method-coverage').selectOption('WHOLE_COUNTRY');
    await page.getByTestId('method-pricing').selectOption('FIXED');
    await page.getByTestId('method-base-fee').fill(String(input.feeToman));
    if (input.freeThresholdToman != null) {
      await page.getByTestId('method-free-threshold').fill(String(input.freeThresholdToman));
    }
    await page.getByTestId('method-preparation-days').fill('1');
    await page.getByTestId('method-save').click();
    await expectText(page, 'روش ارسال ثبت شد');
  } finally {
    await seller.close();
  }
}
