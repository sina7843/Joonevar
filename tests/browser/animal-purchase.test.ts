/**
 * Buying an animal, in a real browser — PROMPT-005.
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

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-005');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک خرید ' + RUN;
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

/** A published advert with a negotiable price, so the ladder can be walked. */
async function publishNegotiableListing(page: Page, animalId: string): Promise<string> {
  await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
  await Promise.all([
    page.waitForURL('**/account/listings/**'),
    page.getByTestId('start-listing-button-' + animalId).click(),
  ]);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const url = BASE_URL + '/account/listings/' + id;

  await page.getByTestId('listing-price-mode').selectOption('NEGOTIABLE');
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
    await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک خرید');
    await page.getByTestId('vet-council-code').fill('SYNTH-VET-PURCHASE');
    await page.getByTestId('vet-phone').fill('02100000000');
    await page.getByTestId('save-vet').click();
    await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

    await page.getByTestId('add-location-form').waitFor();
    await page.getByTestId('location-vet').selectOption({ label: 'SYNTHETIC دامپزشک خرید' });
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
    listingId = await publishNegotiableListing(page, animalId);
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
});

after(async () => {
  await browser?.close();
  if (previousPaymentMode) await setPaymentMode(previousPaymentMode as 'MOCK_AUTO' | 'DEV_GATEWAY');
});

test('the advert is readable without an account, and the request needs one', async () => {
  const anonymous = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    // Reading is public: the price and the safety note are both there.
    assert.equal(await page.getByTestId('listing-price').innerText(), 'قیمت توافقی');
    assert.match(await page.getByTestId('listing-safety').innerText(), /بیعانه/);
    await page.getByTestId('ask-to-buy').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'public-advert-mobile.png'), fullPage: true });
  } finally {
    await anonymous.close();
  }
});

test('a buyer asks, the two sides agree a price, and the seller accepts one of them', async () => {
  const buyer = await contextFor(buyerState, MOBILE);
  let threadUrl = '';
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    await page.getByTestId('inquiry-message').fill('SYNTHETIC سلام، هنوز موجود است؟ شماره‌ام 09121234567');
    await page.getByTestId('inquiry-offer').fill('15000000');
    await Promise.all([
      page.waitForURL('**/account/purchases/**'),
      page.getByTestId('ask-to-buy-submit').click(),
    ]);
    threadUrl = page.url();

    // The opening message went through the policy: the number is not there.
    const transcript = await page.getByTestId('thread-messages').innerText();
    assert.ok(!transcript.includes('09121234567'), 'the number must not be stored: ' + transcript);
    await expectText(page, 'اطلاعات تماس یا پرداخت در پیام حذف شد');
    assert.match(
      await page.getByTestId('counterpart-contact').innerText(),
      /پس از تأیید بیعانه/,
      'contact stays withheld until the deposit is verified',
    );
    await page.screenshot({ path: path.join(SHOTS, 'buyer-thread-mobile.png'), fullPage: true });
  } finally {
    await buyer.close();
  }

  // The seller counters from their own queue.
  const seller = await contextFor(sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/listings/' + listingId + '/requests', { waitUntil: 'load' });
    const href = await page.locator('[data-testid="listing-requests"] a').first().getAttribute('href');
    const inquiryId = href!.split('/').pop()!;
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });

    await page.getByTestId('offer-amount').fill(PRICE);
    await page.getByTestId('offer-submit').click();
    await expectText(page, 'پیشنهاد قیمت ثبت شد');

    // Acceptance is not offered while the price is still open.
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('accept-inquiry-button-' + inquiryId).count(), 0);
  } finally {
    await seller.close();
  }

  const buyerAgain = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyerAgain.newPage();
    await page.goto(threadUrl, { waitUntil: 'load' });
    await page.getByTestId('offer-accept').click();
    await expectText(page, 'قیمت نهایی قفل شد');
  } finally {
    await buyerAgain.close();
  }

  const sellerAgain = await contextFor(sellerState);
  try {
    const page = await sellerAgain.newPage();
    const inquiryId = threadUrl.split('/').pop()!;
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.match(await page.getByTestId('final-price').innerText(), /۱۸٬۰۰۰٬۰۰۰/);
    // The deposit is the commission: 2.5% of the price plus the fixed part.
    assert.match(await page.getByTestId('deposit-amount').innerText(), /۵۵۰٬۰۰۰/);

    await page.getByTestId('accept-inquiry-button-' + inquiryId).click();
    await page.getByTestId('inquiry-status').filter({ hasText: 'در انتظار پرداخت بیعانه' }).waitFor();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.notEqual(await page.getByTestId('payment-deadline').innerText(), '—');
    await page.screenshot({ path: path.join(SHOTS, 'seller-accepted-desktop.png'), fullPage: true });
  } finally {
    await sellerAgain.close();
  }
});

test('the verified deposit reserves the animal and opens the contact details', async () => {
  const buyer = await contextFor(buyerState, MOBILE);
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/purchases', { waitUntil: 'load' });
    const href = await page.locator('[data-testid="my-inquiries"] a').first().getAttribute('href');
    const inquiryId = href!.split('/').pop()!;
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });

    await page.getByTestId('pay-deposit-button').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.waitForURL('**/account/purchases/**/return**');
    assert.match(await page.getByTestId('deposit-result').innerText(), /رزرو شد/);

    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('inquiry-status').innerText(), 'بیعانه پرداخت شد و رزرو انجام شد');
    // The one moment contact details appear, and they are the real ones.
    assert.match(await page.getByTestId('counterpart-contact').innerText(), /^0999/);
    // The transcript is frozen: a deal is what a dispute is argued from.
    assert.equal(await page.getByTestId('message-form').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'reserved-thread-mobile.png'), fullPage: true });
  } finally {
    await buyer.close();
  }

  // The advert says so publicly, and takes no new requests.
  const anonymous = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await anonymous.newPage();
    await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('listing-reserved').innerText(), 'رزروشده');
    assert.equal(await page.getByTestId('ask-to-buy').count(), 0);
    await page.getByTestId('listing-reserved-notice').waitFor();
  } finally {
    await anonymous.close();
  }
});

test('a third account cannot read the transcript', async () => {
  const buyer = await contextFor(buyerState);
  let inquiryId = '';
  try {
    const page = await buyer.newPage();
    await page.goto(BASE_URL + '/account/purchases', { waitUntil: 'load' });
    const href = await page.locator('[data-testid="my-inquiries"] a').first().getAttribute('href');
    inquiryId = href!.split('/').pop()!;
  } finally {
    await buyer.close();
  }

  const stranger = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(stranger, newSyntheticMobile());
    const page = await stranger.newPage();
    await page.goto(BASE_URL + '/account/purchases/' + inquiryId, { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(
      body.includes('پیدا نشد') || body.includes('دسترسی مجاز نیست'),
      'a stranger must not read the thread: ' + body.slice(0, 300),
    );
  } finally {
    await stranger.close();
  }
});
