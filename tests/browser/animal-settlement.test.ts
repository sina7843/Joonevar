/**
 * Cancelling, refunding and arbitrating, in a real browser — PROMPT-006.
 *
 * The whole journey through the screens people actually use: a buyer asks on
 * the public advert, the two sides agree a price, the seller accepts, the buyer
 * pays the deposit at the development gateway, and the animal is reserved.
 *
 * The seller fixture repeats the animal-and-desk journey that
 * `tests/browser/animal-listing.test.ts` also walks. That duplication is the
 * suite-local fixture idiom this directory already uses: nothing about
 * eligibility may be written straight into the database, because the point is
 * that the answer comes from the real records.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import {
  approveMembershipApplication,
  approvedMember,
  certifyIdentity,
  clearSyntheticOtp,
  configureMembershipSettings,
  DESKTOP,
  MOBILE,
  expectText,
  setPaymentMode,
  signIn,
  syntheticNationalId,
  newSyntheticMobile,
  BASE_URL,
  DATABASE_URL,
} from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-006');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک تسویه ' + RUN;
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const PRICE = '18000000';

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

let browser!: Browser;
let operatorState: State | null = null;
let adminState: State | null = null;
let vetState: State | null = null;
let sellerState: State | null = null;
let buyerState: State | null = null;
let listingId = '';
let inquiryId = '';
let previousPaymentMode: string | null = null;

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(1_000_000 + (chipCounter += 1)).padStart(8, '0');

const contextFor = (state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

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

async function completeProfile(page: Page, lastName: string): Promise<void> {
  if (!page.url().includes('/account')) await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
  if (!new URL(page.url()).pathname.startsWith('/account/complete')) return;
  if ((await page.getByTestId('national-id').count()) === 0) return;
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill(lastName);
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی آزمایشی');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
}

async function approveTopKyc(): Promise<void> {
  const context = await contextFor(operatorState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    await page.getByTestId('open-case').first().click();
    await page.getByTestId('review-form').waitFor();
    await page.getByTestId('decision-APPROVED').check();
    await page.getByTestId('submit-review').click();
    await expectText(page, 'این پرونده در انتظار بررسی نیست');
  } finally {
    await context.close();
  }
}

async function passKyc(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });
  if ((await page.locator('body').innerText()).includes('احراز هویت شما تأیید شده است')) return;
  await page.getByTestId('kyc-file').setInputFiles({ name: 'card.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await page.getByTestId('upload-kyc').click();
  await expectText(page, 'تصویر کارت ملی بارگذاری شد');
  await page.getByTestId('submit-kyc').click();
  await expectText(page, 'پرونده شما در حال بررسی است');
  await approveTopKyc();
}

async function payMembership(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
  if ((await page.getByTestId('membership-status').textContent()) === 'فعال') return;
  await approveMembershipApplication(browser, page, operatorState);
  await page.getByTestId('pay-membership').click();
  await page.waitForURL('**/dev/gateway**');
  await page.getByTestId('gateway-pay').click();
  await page.waitForURL('**/membership/return**');
  await expectText(page, 'پرداخت تأیید شد');
}

async function registerAnimal(page: Page, name: string): Promise<string> {
  await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await page.getByTestId('start-animal-draft').click();
  await page.waitForURL('**/animals/**/edit**');
  const animalId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByTestId('animal-name').fill(name);
  await page.getByTestId('animal-breed-list').locator('button').first().click();
  await page.getByTestId('step-1-continue').click();
  await page.getByTestId('sex-MALE').waitFor();
  await page.getByTestId('sex-MALE').check();
  await page.getByTestId('animal-birth-date').fill('2022-05-05');
  await page.getByTestId('step-2-continue').click();
  await page.getByTestId('step-3-continue').waitFor();
  await page.getByTestId('animal-color').fill('قهوه‌ای');
  await page.getByTestId('animal-markings').fill('بدون نشانه خاص');
  await page.getByTestId('step-3-continue').click();
  await page.getByTestId('step-4-continue').waitFor();
  await page.getByTestId('step-4-continue').click();
  await page.getByTestId('has-microchip-no').waitFor();
  await page.getByTestId('has-microchip-no').check();
  await page.getByTestId('step-5-continue').click();
  await page.getByTestId('register-animal').waitFor();
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/animals/' + animalId),
    page.getByTestId('register-animal').click(),
  ]);
  return animalId;
}

/** Books the visit, checks it in and binds a real chip at the desk. */
async function throughTheDesk(owner: Page, vet: Page, animalId: string): Promise<void> {
  await owner.goto(BASE_URL + '/requests/new?context=MICROCHIP', { waitUntil: 'load' });
  await owner.getByTestId('pick-animal-' + animalId).check();
  await owner.getByTestId('service-' + animalId + '-MICROCHIP_IMPLANT').check();
  await Promise.all([owner.waitForURL('**/vets**'), owner.getByTestId('choose-vet').click()]);
  await owner
    .locator('li')
    .filter({ has: owner.getByTestId('finder-location-name').filter({ hasText: LOCATION_NAME }) })
    .getByTestId('choose-location')
    .click();
  await owner.waitForURL('**/requests/new/review**');
  await Promise.all([
    owner.waitForURL((url) => url.pathname === '/requests'),
    owner.getByTestId('create-visit').click(),
  ]);

  const hrefs = await owner
    .locator('[data-testid="request-list"] a')
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '').filter((h) => h.startsWith('/requests/')),
    );
  const requestId = hrefs[0]!.replace('/requests/', '');
  await owner.goto(BASE_URL + '/requests/' + requestId, { waitUntil: 'load' });
  const code = (await owner.getByTestId('referral-code').innerText()).trim();

  await vet.goto(BASE_URL + '/vet/check-in', { waitUntil: 'load' });
  await vet.getByTestId('check-in-location').selectOption({ label: LOCATION_NAME });
  await vet.getByTestId('check-in-code').fill(code);
  await vet.getByTestId('submit-check-in').click();
  await expectText(vet, 'کد پذیرفته شد');

  await vet.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
  const number = nextChip();
  await certifyIdentity(vet);
  await vet.getByTestId('chip-read-number').fill(number);
  await vet.getByTestId('chip-read-submit').click();
  await expectText(vet, 'سریال پیش از کاشت ثبت شد');
  await vet.getByTestId('confirm-implant-submit').click();
  await expectText(vet, 'کاشت ثبت شد');
  await vet.getByTestId('chip-reread-number').fill(number);
  await vet.getByTestId('chip-reread-submit').click();
  await expectText(vet, 'شماره رسمی میکروچیپ');
}

/** A published advert at an exact price: the deal itself is not what is under test here. */
async function publishListing(page: Page, animalId: string): Promise<string> {
  await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
  await Promise.all([
    page.waitForURL('**/account/listings/**'),
    page.getByTestId('start-listing-button-' + animalId).click(),
  ]);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const url = BASE_URL + '/account/listings/' + id;

  await page.getByTestId('listing-price-mode').selectOption('EXACT');
  await page.getByTestId('listing-price').fill(PRICE);
  await page
    .getByTestId('listing-description')
    .fill('SYNTHETIC توضیح آگهی آزمایشی که به‌اندازه کافی طولانی است تا شرط حداقل طول را برآورده کند.');
  await page.getByTestId('listing-reason').fill('SYNTHETIC دلیل فروش آزمایشی');
  await page.getByTestId('listing-province').selectOption({ index: 1 });
  await page.getByTestId('listing-city').selectOption({ index: 1 });
  await page.getByTestId('listing-vaccination').selectOption('UNKNOWN');
  await page.getByTestId('listing-neuter').selectOption('NO');
  await page.getByTestId('listing-delivery-IN_PERSON').check();
  await page.getByTestId('save-listing').click();
  await expectText(page, 'اطلاعات آگهی ذخیره شد.');

  for (let index = 0; index < 3; index += 1) {
    await page.goto(url, { waitUntil: 'load' });
    await page
      .getByTestId('media-file-IMAGE')
      .setInputFiles({ name: 'photo' + index + '.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('media-alt-IMAGE').fill('SYNTHETIC تصویر ' + (index + 1));
    await page.getByTestId('upload-media-IMAGE').click();
    await expectText(page, 'تصویر افزوده شد.');
  }

  await page.goto(url, { waitUntil: 'load' });
  await page.getByTestId('move-PUBLISHED').click();
  await page.getByTestId('listing-status').filter({ hasText: 'منتشرشده' }).waitFor();
  return id;
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  await withDb(async (db) => {
    await db.execute(sql`update vet_location set is_active = false where name_fa like 'SYNTHETIC%'`);
  });
  await configureMembershipSettings();
  // The deposit is paid at the development gateway, like every other payment
  // this suite makes, so the verification is a real server-side verify call.
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

  const vetContext = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await signIn(vetContext, VET_MOBILE);
    await completeProfile(page, 'دامپزشک آزمایشی');
    await passKyc(page);
    await payMembership(page);
    vetState = await vetContext.storageState();
  } finally {
    await vetContext.close();
  }

  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/admin/vets', { waitUntil: 'load' });
    await page.getByTestId('vet-mobile').fill(VET_MOBILE);
    await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک تسویه');
    await page.getByTestId('vet-council-code').fill('SYNTH-VET-SETTLE');
    await page.getByTestId('vet-phone').fill('02100000000');
    await page.getByTestId('save-vet').click();
    await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

    await page.getByTestId('add-location-form').waitFor();
    await page.getByTestId('location-vet').selectOption({ label: 'SYNTHETIC دامپزشک تسویه' });
    await page.getByTestId('location-name').fill(LOCATION_NAME);
    await page.getByTestId('location-city').fill('تهران');
    await page.getByTestId('location-address').fill('نشانی آزمایشی ' + RUN);
    await page.getByTestId('location-phone').fill('02100000000');
    await page.getByTestId('location-licence-status').selectOption('VALID');
    await page.getByTestId('cap-implant').check();
    await page.getByTestId('cap-blood').check();
    await page.getByTestId('add-location').click();
    await expectText(page, 'مرکز ثبت شد');
  } finally {
    await admin.close();
  }

  await openFlag('market.flag.animal_market_enabled');
  await openFlag('market.flag.animal_listing_creation_enabled');
  await setMarketSetting('market.animal.listing_duration_days', '30');
  // The money of a deal, entered through the real admin screens.
  await setMarketSetting('market.animal.commission_fixed_toman', '100000');
  await setMarketSetting('market.animal.commission_percent_bp', '250');
  await setMarketSetting('market.animal.request_payment_window_hours', '48');
  await setMarketSetting('market.animal.cancellation_policy_version', 'SYNTHETIC-POLICY-' + RUN);
  // A quarter of the deposit, so the buyer's own cancellation has a real figure.
  await setMarketSetting('market.animal.buyer_cancellation_penalty_bp', '2500');

  // The seller: a real member whose animal went through the desk.
  const sellerContext = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await signIn(sellerContext, newSyntheticMobile());
    await completeProfile(page, 'فروشنده آزمایشی');
    await passKyc(page);
    await payMembership(page);
    const animalId = await registerAnimal(page, 'SYNTHETIC سگ خرید ' + RUN);

    const vet = await contextFor(vetState);
    try {
      await throughTheDesk(page, await vet.newPage(), animalId);
    } finally {
      await vet.close();
    }
    listingId = await publishListing(page, animalId);
    sellerState = await sellerContext.storageState();
  } finally {
    await sellerContext.close();
  }

  // The buyer needs a verified identity and nothing else: buying is not selling.
  const buyer = await approvedMember(browser, operatorState, 'خریدار آزمایشی');
  try {
    buyerState = await buyer.context.storageState();
  } finally {
    await buyer.context.close();
  }

  // One reserved deal, made the real way: a request, the seller's acceptance and
  // a deposit paid at the development gateway and verified on the server.
  const buyerContext = await contextFor(buyerState);
  try {
    const page = await buyerContext.newPage();
    await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    await page.getByTestId('inquiry-message').fill('SYNTHETIC سلام، همین را می‌خواهم.');
    await Promise.all([
      page.waitForURL('**/account/purchases/**'),
      page.getByTestId('ask-to-buy-submit').click(),
    ]);
    inquiryId = new URL(page.url()).pathname.split('/').pop()!;
  } finally {
    await buyerContext.close();
  }

  const seller = await contextFor(sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    await page.getByTestId('accept-inquiry-button-' + inquiryId).click();
    await page.getByTestId('inquiry-status').filter({ hasText: 'در انتظار پرداخت بیعانه' }).waitFor();
  } finally {
    await seller.close();
  }

  const payer = await contextFor(buyerState);
  try {
    const page = await payer.newPage();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    await page.getByTestId('pay-deposit-button').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/purchases/**/return**');
  } finally {
    await payer.close();
  }
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});


test('the buyer cancels, sees what the frozen policy cost them, and the advert returns', async () => {
  const buyer = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    // The deposit of this deal: 100,000 fixed plus 2.5% of 18,000,000.
    assert.match(await page.getByTestId('deposit-amount').innerText(), /۵۵۰٬۰۰۰/);

    await page.getByTestId('cancel-reason').selectOption('BUYER_CANCELLED');
    await page.getByTestId('cancel-statement').fill('SYNTHETIC شرایطم عوض شد و منصرف شدم.');
    await page.getByTestId('cancel-deal-submit').click();
    await page.getByTestId('cancellation-facts').waitFor();

    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('cancellation-outcome').innerText(), 'استرداد بیعانه پس از کسر جریمه');
    // A quarter of 550,000 stays with Hamzist; the rest comes back.
    assert.match(await page.getByTestId('cancellation-penalty').innerText(), /۱۳۷٬۵۰۰/);
    assert.match(await page.getByTestId('cancellation-refund').innerText(), /۴۱۲٬۵۰۰/);
    assert.match(await page.getByTestId('refund-status').innerText(), /در انتظار اجرا/);
    await page.screenshot({ path: path.join(SHOTS, 'cancelled-deal-mobile.png'), fullPage: true });
  } finally {
    await buyer.close();
  }

  // The animal is on the market again, and takes requests again.
  const anonymous = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('listing-reserved').count(), 0);
    await page.getByTestId('ask-to-buy').waitFor();
  } finally {
    await anonymous.close();
  }
});

test('the refund is owed until a provider pays it, and then it says who did', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/refunds', { waitUntil: 'load' });
    await page.getByTestId('refund-queue').waitFor();
    assert.match(await page.getByTestId('refund-policy-note').innerText(), /شماره پیگیری/);

    const refundId = await page
      .locator('[data-testid^="retry-refund-button-"]')
      .first()
      .getAttribute('data-testid');
    const id = refundId!.replace('retry-refund-button-', '');
    assert.equal(await page.getByTestId('refund-status-' + id).innerText(), 'در انتظار اجرا');
    await page.screenshot({ path: path.join(SHOTS, 'refund-queue-desktop.png'), fullPage: true });

    /*
     * The confirmation an operator actually reads is the queue itself: a paid
     * refund leaves the list of what is still owed, taking its own form — and
     * that form's success message — with it. Asserted on the resulting state
     * rather than on a toast that is gone by the time the page re-renders.
     */
    await page.getByTestId('retry-refund-button-' + id).click();
    await page.getByTestId('refund-status-' + id).waitFor({ state: 'detached' });

    await page.goto(BASE_URL + '/market/refunds', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('refund-status-' + id).count(), 0);
  } finally {
    await ops.close();
  }

  // And the buyer's own page says so too.
  const buyer = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.match(await page.getByTestId('refund-status').innerText(), /پرداخت شد/);
  } finally {
    await buyer.close();
  }
});

test('the arbitration queue states its own limits', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/disputes', { waitUntil: 'load' });
    const note = await page.getByTestId('dispute-scope-note').innerText();
    assert.match(note, /بیعانه/);
    assert.match(note, /داوری نمی‌کند/);
    await page.screenshot({ path: path.join(SHOTS, 'dispute-queue-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }
});

test('the commission formula is published by version, and the market says what applies', async () => {
  const ops = await contextFor(adminState);
  try {
    const page = await ops.newPage();
    await page.goto(BASE_URL + '/market/commission', { waitUntil: 'load' });
    await page.getByTestId('commission-rule-form').waitFor();

    await page.getByTestId('rule-species').selectOption('DOG');
    await page.getByTestId('rule-seller-kind').selectOption('OWNER');
    await page.getByTestId('rule-fixed').fill('70000');
    await page.getByTestId('rule-percent').fill('300');
    await page.getByTestId('rule-note').fill('SYNTHETIC نسخه آزمایشی قاعده کارمزد ' + RUN);
    await page.getByTestId('rule-publish').click();
    await page.getByTestId('commission-rule-result').waitFor();

    await page.goto(BASE_URL + '/market/commission', { waitUntil: 'load' });
    const history = await page.getByTestId('commission-history').innerText();
    assert.match(history, /منتشرشده/);
    assert.match(history, /۳٪/);
    await page.screenshot({ path: path.join(SHOTS, 'commission-rules-desktop.png'), fullPage: true });
  } finally {
    await ops.close();
  }
});
