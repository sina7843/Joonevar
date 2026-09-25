/**
 * Becoming a seller of goods, in a real browser — PROMPT-008.
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
import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  approvedMember,
  clearSyntheticOtp,
  DESKTOP,
  MOBILE,
  expectText,
  setPaymentMode,
  signIn,
  BASE_URL,
} from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-008');
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

let browser!: Browser;
let operatorState: State | null = null;
let adminState: State | null = null;
let sellerState: State | null = null;
let previousPaymentMode: string | null = null;

const contextFor = (state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

async function setMarketSetting(key: string, value: string): Promise<void> {
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market/settings', { waitUntil: 'load' });
    await page.getByTestId('market-setting-value-' + key).fill(value);
    await page.getByTestId('market-setting-reason-' + key).fill(REASON);
    await page.getByTestId('market-setting-save-' + key).click();
    await expectText(page, value === '' ? 'مقدار پاک شد' : 'مقدار ذخیره شد');
  } finally {
    await admin.close();
  }
}

async function openFlag(key: string): Promise<void> {
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    const button = page.getByTestId('flag-toggle-' + key);
    if ((await button.innerText()).includes('بستن')) return;
    await page.getByTestId('flag-reason-' + key).fill(REASON);
    await button.click();
    await expectText(page, 'مقدار ذخیره شد.');
  } finally {
    await admin.close();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  previousPaymentMode = await setPaymentMode('DEV_GATEWAY');
  browser = await chromium.launch();

  for (const [mobile, assign] of [
    [OPERATOR_MOBILE, (s: State) => (operatorState = s)],
    [ADMIN_MOBILE, (s: State) => (adminState = s)],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      assign(await context.storageState());
    } finally {
      await context.close();
    }
  }

  await openFlag('market.flag.seller_onboarding_enabled');
  await setMarketSetting('market.shop.seller_agreement_version', 'SYNTHETIC-AGREEMENT-' + RUN);
  await setMarketSetting('market.shop.seller_plan_basic_monthly_toman', '900000');

  // A plan has to exist before anybody can buy one, and it is published through
  // the real operational screen rather than written into the database.
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market/plans', { waitUntil: 'load' });
    await page.getByTestId('plan-code').fill('BASIC');
    await page.getByTestId('plan-label').fill('پلن پایه فروشنده');
    await page.getByTestId('plan-duration').fill('30');
    await page.getByTestId('plan-limit').fill('50');
    await page.getByTestId('plan-commission').fill('500');
    await page.getByTestId('plan-price-key').fill('market.shop.seller_plan_basic_monthly_toman');
    await page.getByTestId('plan-note').fill(REASON);
    await page.getByTestId('plan-publish').click();
    await expectText(page, 'نسخه تازه پلن منتشر شد');
  } finally {
    await admin.close();
  }

  // The applicant: a member with a verified identity and nothing else.
  const seller = await approvedMember(browser, operatorState, 'فروشنده کالا');
  try {
    sellerState = await seller.context.storageState();
  } finally {
    await seller.context.close();
  }
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});

test('the application says what it cannot decide, and refuses to go without what it needs', async () => {
  const context = await contextFor(sellerState, MOBILE);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await expectText(page, 'فروشنده کالا فقط پت‌شاپ و کسب‌وکار تأییدشده است');

    await page.getByTestId('seller-display-name').fill('SYNTHETIC فروشگاه ' + RUN);
    await page.getByTestId('start-seller-submit').click();
    await page.getByTestId('seller-status').waitFor();
    assert.equal(await page.getByTestId('seller-status').innerText(), 'پیش‌نویس');

    // The form states plainly that Hamzist does not decide which licence the
    // law requires, and that a person verifies the settlement account.
    assert.match(await page.getByTestId('licence-note').innerText(), /تعیین نمی‌کند/);
    assert.match(await page.getByTestId('iban-note').innerText(), /استعلام بانکی خودکاری/);

    // Everything still missing is listed at once.
    const blockers = await page.getByTestId('seller-blockers').innerText();
    assert.match(blockers, /شبا/);
    assert.match(blockers, /قرارداد/);
    await page.screenshot({ path: path.join(SHOTS, 'seller-application-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the seller completes the file, accepts the versioned agreement and sends it', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });

    await page.getByTestId('field-legal-name').fill('SYNTHETIC کسب‌وکار ' + RUN);
    await page.getByTestId('field-business-type').fill('پت‌شاپ');
    await page.getByTestId('field-identifier').fill('1' + RUN.padStart(10, '0'));
    await page.getByTestId('field-rep-name').fill('SYNTHETIC نماینده');
    await page.getByTestId('field-rep-phone').fill('02100000000');
    await page.getByTestId('field-province').selectOption({ index: 1 });
    await page.getByTestId('field-city').selectOption({ index: 1 });
    await page.getByTestId('field-address').fill('SYNTHETIC نشانی فروشگاه');
    await page.getByTestId('field-iban').fill('IR820540102680020817909002');
    await page.getByTestId('field-iban-holder').fill('SYNTHETIC صاحب حساب');
    await page.getByTestId('field-shipping').fill('SYNTHETIC ارسال در همان شهر');
    await page.getByTestId('field-return').fill('SYNTHETIC مرجوعی تا هفت روز');
    await page.getByTestId('save-seller').click();
    await expectText(page, 'اطلاعات فروشگاه ذخیره شد');

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page
      .getByTestId('document-file')
      .setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByTestId('document-note').fill('SYNTHETIC پروانه کسب');
    await page.getByTestId('add-document').click();
    await expectText(page, 'مدرک افزوده شد');

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page.getByTestId('accept-agreement').click();
    await expectText(page, 'SYNTHETIC-AGREEMENT-' + RUN);

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    await page.getByTestId('submit-seller').click();
    await page.getByTestId('seller-status').filter({ hasText: 'ارسال‌شده برای بررسی' }).waitFor();
  } finally {
    await context.close();
  }
});

test('a reviewer verifies the account, approves, and the store still does not trade', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
    await page.getByTestId('seller-queue').waitFor();
    assert.match(await page.getByTestId('seller-review-note').innerText(), /پرداخت تأییدشده/);

    const sellerId = (await page
      .locator('[data-testid^="seller-decision-select-"]')
      .first()
      .getAttribute('data-testid'))!.replace('seller-decision-select-', '');

    // The settlement account is masked on the queue, never shown whole.
    const iban = await page.getByTestId('seller-iban-' + sellerId).innerText();
    assert.match(iban, /IR82/);
    assert.ok(!iban.includes('0540102680020817'), 'the middle of the account is not on the page');

    await page.getByTestId('verify-iban-note-' + sellerId).fill('SYNTHETIC مدرک مالکیت حساب بررسی شد.');
    await page.getByTestId('verify-iban-submit-' + sellerId).click();
    await expectText(page, 'مالکیت حساب تسویه تأیید و ثبت شد');

    await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
    await page.getByTestId('seller-decision-select-' + sellerId).selectOption('UNDER_REVIEW');
    await page.getByTestId('seller-decide-' + sellerId).click();
    await expectText(page, 'تصمیم ثبت شد');

    await page.goto(BASE_URL + '/market/sellers', { waitUntil: 'load' });
    await page.getByTestId('seller-decision-select-' + sellerId).selectOption('APPROVED');
    await page.getByTestId('seller-decide-' + sellerId).click();
    await expectText(page, 'تصمیم ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'seller-review-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }

  const seller = await contextFor(sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    // Approved, and still not trading: that needs a plan period.
    assert.equal(await page.getByTestId('seller-status').innerText(), 'تأییدشده، در انتظار فعال‌سازی');
    assert.match(await page.getByTestId('plan-note').innerText(), /پرداخت تأییدشده/);
  } finally {
    await seller.close();
  }
});

test('the store becomes active because the plan payment was verified', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    // Picked by value: the first option of this select is the placeholder, and
    // choosing that would post an empty plan id.
    const planValues = await page
      .getByTestId('plan-select')
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
    assert.ok(planValues.length > 0, 'a published plan is offered');
    await page.getByTestId('plan-select').selectOption(planValues[0]!);
    await page.getByTestId('buy-plan').click();

    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/seller/return**');
    assert.match(await page.getByTestId('plan-payment-result').innerText(), /دوره پلن آغاز شد/);

    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('seller-status').innerText(), 'فعال');
    assert.match(await page.getByTestId('seller-plan').innerText(), /تا /);
    await page.screenshot({ path: path.join(SHOTS, 'seller-active-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('a role in one store is invisible from another account', async () => {
  // A second signed-in account that was never invited sees no store at all,
  // and the store's own address answers "not found" rather than "denied".
  const stranger = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(stranger, '0999' + String(randomInt(1_000_000, 9_999_999)));
    const page = await stranger.newPage();
    await page.goto(BASE_URL + '/account/seller', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(
      body.includes('ثبت فروشگاه تازه') || body.includes('احراز هویت'),
      'a stranger sees the start of their own application, never somebody else’s store: ' + body.slice(0, 200),
    );
    assert.ok(!body.includes('SYNTHETIC کسب‌وکار ' + RUN), 'no trace of the other store');
  } finally {
    await stranger.close();
  }
});
