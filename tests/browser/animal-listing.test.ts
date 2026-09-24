/**
 * Selling an animal, in a real browser — PROMPT-003.
 *
 * The journey is the real one: a real account, real KYC, a real membership, a
 * real veterinary visit that binds a real microchip, and only then an advert.
 * Nothing about eligibility is written into the database by the test, because
 * the thing under test is exactly that the answer comes from those records.
 *
 * The setup below repeats the animal-and-desk journey that
 * `tests/browser/registration.test.ts` also walks. That duplication is the
 * suite-local fixture idiom this directory already uses; sharing it would mean
 * refactoring a green suite in the middle of another prompt.
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
  certifyIdentity,
  clearSyntheticOtp,
  configureMembershipSettings,
  DESKTOP,
  MOBILE,
  expectText,
  signIn,
  syntheticNationalId,
  newSyntheticMobile,
  BASE_URL,
  DATABASE_URL,
} from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-003');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک آگهی ' + RUN;
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

let browser!: Browser;
let operatorState: State | null = null;
let adminState: State | null = null;
let vetState: State | null = null;
let sellerState: State | null = null;
let sellerMobile = '';
let chippedAnimalId = '';
let plainAnimalId = '';

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

/** Managed marketplace values, entered through the real admin screens. */
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

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  await withDb(async (db) => {
    await db.execute(sql`update vet_location set is_active = false where name_fa like 'SYNTHETIC%'`);
  });
  await configureMembershipSettings();
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

  // The veterinarian and a licensed location of this run.
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
    await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک آگهی');
    await page.getByTestId('vet-council-code').fill('SYNTH-VET-LISTING');
    await page.getByTestId('vet-phone').fill('02100000000');
    await page.getByTestId('save-vet').click();
    await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

    await page.getByTestId('add-location-form').waitFor();
    await page.getByTestId('location-vet').selectOption({ label: 'SYNTHETIC دامپزشک آگهی' });
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

  // The seller: a real member with two registered animals, one of them chipped.
  const sellerContext = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    sellerMobile = newSyntheticMobile();
    const page = await signIn(sellerContext, sellerMobile);
    await completeProfile(page, 'فروشنده آزمایشی');
    await passKyc(page);
    await payMembership(page);
    chippedAnimalId = await registerAnimal(page, 'SYNTHETIC سگ فروشی');
    plainAnimalId = await registerAnimal(page, 'SYNTHETIC سگ بدون چیپ');

    const vet = await contextFor(vetState);
    try {
      await throughTheDesk(page, await vet.newPage(), chippedAnimalId);
    } finally {
      await vet.close();
    }
    sellerState = await sellerContext.storageState();
  } finally {
    await sellerContext.close();
  }

  await openFlag('market.flag.animal_market_enabled');
  await openFlag('market.flag.animal_listing_creation_enabled');
  await setMarketSetting('market.animal.listing_duration_days', '30');
});

after(async () => {
  await browser?.close();
});

test('an animal with no registered chip is listed as blocked, with the reason and the way out', async () => {
  const context = await contextFor(sellerState, MOBILE);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    await expectText(page, 'آگهی‌های فروش من');

    const blockers = await page.getByTestId('animal-blockers').first().innerText();
    assert.match(blockers, /میکروچیپ ثبت‌شده لازم است/);
    assert.match(blockers, /خوداظهاری کافی نیست/);
    // The chipped one is offered instead.
    await expectText(page, 'آماده برای آگهی');
    assert.equal(await page.getByTestId('start-listing-button-' + chippedAnimalId).count(), 1);
    assert.equal(await page.getByTestId('start-listing-button-' + plainAnimalId).count(), 0);

    await page.screenshot({ path: path.join(SHOTS, 'listings-dashboard-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the advert is built, refuses to publish until it is complete, and then goes live', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    await Promise.all([
      page.waitForURL('**/account/listings/**'),
      page.getByTestId('start-listing-button-' + chippedAnimalId).click(),
    ]);
    const listingId = new URL(page.url()).pathname.split('/').pop()!;

    // The facts come from the animal record and are not editable here.
    const facts = await page.getByTestId('derived-facts').innerText();
    assert.match(facts, /سگ/);
    assert.equal(await page.getByTestId('fact-microchip').innerText(), 'ثبت‌شده');

    // Everything is still missing, and it is all said at once.
    const blockers = await page.getByTestId('publication-blockers').innerText();
    assert.match(blockers, /نوع قیمت/);
    assert.match(blockers, /تصویر/);

    await page.getByTestId('listing-price-mode').selectOption('EXACT');
    await page.getByTestId('listing-price').fill('18000000');
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

    // Navigated rather than reloaded throughout: a reload after a server action
    // re-submits it, which would upload the same photo twice and quietly make
    // the "below the minimum" case untestable.
    const listingUrl = BASE_URL + '/account/listings/' + listingId;
    const addPhoto = async (index: number) => {
      await page.goto(listingUrl, { waitUntil: 'load' });
      await page
        .getByTestId('media-file-IMAGE')
        .setInputFiles({ name: 'photo' + index + '.png', mimeType: 'image/png', buffer: PNG });
      await page.getByTestId('media-alt-IMAGE').fill('SYNTHETIC تصویر ' + (index + 1));
      await page.getByTestId('upload-media-IMAGE').click();
      await expectText(page, 'تصویر افزوده شد.');
    };

    await addPhoto(0);
    await addPhoto(1);

    // Two photos is below the managed minimum of three. The refusal appears on
    // the publish form itself, and the advert stays a draft.
    await page.goto(listingUrl, { waitUntil: 'load' });
    assert.match(await page.getByTestId('publication-blockers').innerText(), /تصویر/);
    await page.getByTestId('move-PUBLISHED').click();
    await page.getByTestId('move-result-PUBLISHED').waitFor();
    assert.match(await page.getByTestId('move-result-PUBLISHED').innerText(), /حداقل/);
    assert.equal(await page.getByTestId('listing-status').innerText(), 'پیش‌نویس');

    await addPhoto(2);
    await page.goto(listingUrl, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('publication-blockers').count(), 0);
    await page.getByTestId('move-PUBLISHED').click();
    // The confirmation a seller actually reads is the status itself: once the
    // advert is published, the publish form is gone and so is its own message.
    await expectText(page, 'منتشرشده');
    await page.goto(listingUrl, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('listing-status').innerText(), 'منتشرشده');

    // The revision history holds every step, oldest at the bottom.
    const revisions = await page.getByTestId('listing-revisions').innerText();
    assert.match(revisions, /CREATED/);
    assert.match(revisions, /EDITED/);
    assert.match(revisions, /PUBLISHED/);

    await page.screenshot({ path: path.join(SHOTS, 'listing-published-desktop.png'), fullPage: true });

    // The pictures are public only while the advert is: pausing takes them down.
    const media = await page
      .locator('[data-testid="listing-media"] li')
      .evaluateAll((nodes) => nodes.length);
    assert.equal(media, 3);

    await page.getByTestId('move-reason-PAUSED').fill(REASON);
    await page.getByTestId('move-PAUSED').click();
    await expectText(page, 'متوقف‌شده توسط فروشنده');
    await page.goto(listingUrl, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('listing-status').innerText(), 'متوقف‌شده توسط فروشنده');
    assert.equal(await page.getByTestId('listing-status-reason').innerText(), REASON);

    // Back to published, so the later tests see a live advert.
    await page.getByTestId('move-PUBLISHED').click();
    await expectText(page, 'منتشرشده');
  } finally {
    await context.close();
  }
});

test('an advert may be published before the minimum handover age, and the page says so', async () => {
  const context = await contextFor(sellerState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    await page.getByTestId('listing-row-' + (await firstListingId(page))).click();
    await page.waitForURL('**/account/listings/**');
    const note = await page.getByTestId('handover-note').innerText();
    // The fixture animal was born in 2022, so it is past the age; what matters
    // is that the page states the date rather than staying silent about it.
    assert.match(note, /تحویل/);
    assert.match(note, /زودترین تاریخ تحویل/);
  } finally {
    await context.close();
  }
});

async function firstListingId(page: Page): Promise<string> {
  const href = await page
    .locator('[data-testid="my-listings"] a')
    .first()
    .getAttribute('href');
  return href!.split('/').pop()!;
}

test('another account cannot open the advert, and the market banner is honest when it is shut', async () => {
  const seller = await contextFor(sellerState);
  let listingId = '';
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    listingId = await firstListingId(page);
  } finally {
    await seller.close();
  }

  // A different signed-in account: the advert answers "not found", not "denied",
  // so one seller cannot probe for another's identifiers.
  const otherContext = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(otherContext, newSyntheticMobile());
    const page = await otherContext.newPage();
    await page.goto(BASE_URL + '/account/listings/' + listingId, { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(
      body.includes('پیدا نشد') || body.includes('دسترسی مجاز نیست'),
      'another account must not read the advert: ' + body.slice(0, 300),
    );
  } finally {
    await otherContext.close();
  }

  // Closing the market says so on the seller's own page, and leaves the advert.
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    await page.getByTestId('flag-reason-market.flag.animal_market_enabled').fill(REASON + ' — بستن');
    await page.getByTestId('flag-toggle-market.flag.animal_market_enabled').click();
    await expectText(page, 'مقدار ذخیره شد.');
  } finally {
    await admin.close();
  }

  const sellerAgain = await contextFor(sellerState, MOBILE);
  try {
    const page = await sellerAgain.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    await expectText(page, 'بازار فروش حیوان در حال حاضر بسته است');
    assert.match(await page.getByTestId('market-closed').innerText(), /حذف نمی‌شوند/);
    // The advert itself is still there.
    assert.ok((await page.getByTestId('my-listings').innerText()).length > 0);
    await page.screenshot({ path: path.join(SHOTS, 'market-closed-mobile.png'), fullPage: true });
  } finally {
    await sellerAgain.close();
  }

  await openFlag('market.flag.animal_market_enabled');
});
