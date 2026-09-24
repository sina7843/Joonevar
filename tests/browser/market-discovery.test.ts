/**
 * The public marketplace, reporting and moderation in a real browser —
 * PROMPT-004.
 *
 * The advert under test is built the real way: a real account, real KYC, a real
 * membership, a real veterinary visit that binds a real microchip, three real
 * photos and a real publication. Only then is there something for a stranger to
 * find, report and have moderated.
 *
 * The setup repeats the animal-and-desk journey that `animal-listing.test.ts`
 * and `registration.test.ts` also walk; that duplication is the suite-local
 * fixture idiom this directory already uses.
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

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-004');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک بازار ' + RUN;
const REASON = 'SYNTHETIC — اجرای تست ' + RUN;
const DESCRIPTION =
  'SYNTHETIC توضیح آگهی عمومی آزمایشی که به‌اندازه کافی طولانی است تا شرط حداقل طول را برآورده کند.';
/** The synthetic listing moderator fixture account (PROMPT-002). */
const MODERATOR_MOBILE = '09990000011';

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

let browser!: Browser;
let operatorState: State | null = null;
let adminState: State | null = null;
let vetState: State | null = null;
let sellerState: State | null = null;
let sellerMobile = '';
let chippedAnimalId = '';
let listingId = '';
let moderatorState: State | null = null;

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
    [MODERATOR_MOBILE, (s: State) => (moderatorState = s)],
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
    await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک بازار');
    await page.getByTestId('vet-council-code').fill('SYNTH-VET-MARKET');
    await page.getByTestId('vet-phone').fill('02100000000');
    await page.getByTestId('save-vet').click();
    await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

    await page.getByTestId('add-location-form').waitFor();
    await page.getByTestId('location-vet').selectOption({ label: 'SYNTHETIC دامپزشک بازار' });
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
    chippedAnimalId = await registerAnimal(page, 'SYNTHETIC سگ بازار ' + RUN);

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

  // One published advert, built and published through the real screens.
  const seller = await contextFor(sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/listings', { waitUntil: 'load' });
    await Promise.all([
      page.waitForURL('**/account/listings/**'),
      page.getByTestId('start-listing-button-' + chippedAnimalId).click(),
    ]);
    listingId = new URL(page.url()).pathname.split('/').pop()!;
    const listingUrl = BASE_URL + '/account/listings/' + listingId;

    await page.getByTestId('listing-price-mode').selectOption('EXACT');
    await page.getByTestId('listing-price').fill('24000000');
    await page.getByTestId('listing-description').fill(DESCRIPTION);
    await page.getByTestId('listing-reason').fill('SYNTHETIC دلیل فروش آزمایشی');
    await page.getByTestId('listing-province').selectOption({ index: 1 });
    await page.getByTestId('listing-city').selectOption({ index: 1 });
    await page.getByTestId('listing-vaccination').selectOption('UNKNOWN');
    await page.getByTestId('listing-neuter').selectOption('NO');
    await page.getByTestId('listing-delivery-IN_PERSON').check();
    await page.getByTestId('save-listing').click();
    await expectText(page, 'اطلاعات آگهی ذخیره شد.');

    for (let i = 0; i < 3; i += 1) {
      await page.goto(listingUrl, { waitUntil: 'load' });
      await page
        .getByTestId('media-file-IMAGE')
        .setInputFiles({ name: 'photo' + i + '.png', mimeType: 'image/png', buffer: PNG });
      await page.getByTestId('media-alt-IMAGE').fill('SYNTHETIC تصویر ' + (i + 1));
      await page.getByTestId('upload-media-IMAGE').click();
      await expectText(page, 'تصویر افزوده شد.');
    }

    await page.goto(listingUrl, { waitUntil: 'load' });
    await page.getByTestId('move-PUBLISHED').click();
    // Matched on the badge: other copy on the page contains the same word.
    await page.getByTestId('listing-status').filter({ hasText: 'منتشرشده' }).waitFor();
  } finally {
    await seller.close();
  }
});



after(async () => {
  await browser?.close();
});

test('the public index shows the advert, filters narrow it and a query string cannot break it', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    // No account at all: reading the marketplace needs none.
    const response = await page.goto(BASE_URL + '/animals-market', { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await expectText(page, 'بازار فروش حیوان');
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 1);

    // The note about promoted results is always present, even with none shown.
    assert.match(await page.getByTestId('market-ad-note').innerText(), /تبلیغ/);
    assert.equal(await page.getByTestId('market-ad-label-' + listingId).count(), 0);

    // A filter that cannot match empties the page honestly.
    await page.goto(BASE_URL + '/animals-market?sex=FEMALE', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 0);
    await expectText(page, 'آگهی‌ای با این فیلترها پیدا نشد');

    // A filter that does match keeps it.
    await page.goto(BASE_URL + '/animals-market?sex=MALE&maxPrice=30000000', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 1);

    // A hostile query string is ignored rather than acted on, and the page still
    // renders: none of it reaches SQL as text.
    const hostile = await page.goto(
      BASE_URL + '/animals-market?q=%25%27%3B+drop+table+animal_listing%3B+--&page=999999&species=..%2F..%2Fetc',
      { waitUntil: 'load' },
    );
    assert.equal(hostile?.status(), 200);
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 0);

    // And the advert is still there afterwards.
    await page.goto(BASE_URL + '/animals-market', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 1);
    await page.screenshot({ path: path.join(SHOTS, 'market-index-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the sitemap section lists the advert at its canonical address', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    const sitemap = await page.goto(BASE_URL + '/sitemaps/animals-market.xml', { waitUntil: 'load' });
    assert.equal(sitemap?.status(), 200);
    const xml = await sitemap!.text();
    assert.ok(xml.includes('/animals-market/' + listingId), 'the published advert is listed');
    // A filtered permutation of the index is never a sitemap entry.
    assert.ok(!xml.includes('/animals-market?'), 'no filtered view reaches the sitemap');
    assert.ok(!xml.includes('/animals-market</loc>'), 'the index itself belongs to the pages section');

    /*
     * The other half of the policy — that a filtered view carries noindex — is
     * not observable here: outside production every page is noindex by design
     * (DEC-0152), so both views would look the same. It is pinned as a unit
     * test in tests/domain/market-discovery.test.ts instead.
     */
    const index = await page.goto(BASE_URL + '/animals-market', { waitUntil: 'load' });
    assert.equal(index?.status(), 200);
  } finally {
    await context.close();
  }
});

test('the public advert separates what Hamzist holds from what the seller says', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    const response = await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    assert.equal(response?.status(), 200);

    assert.equal(await page.getByTestId('listing-fact-chip').innerText(), 'ثبت‌شده');
    const declarations = await page.getByTestId('listing-declarations').innerText();
    assert.match(declarations, /نمی‌داند/, 'an unanswered question stays a «do not know»');
    assert.match(await page.getByTestId('listing-disclaimer').innerText(), /تأیید نشده/);
    assert.match(await page.getByTestId('listing-safety').innerText(), /بیرون از همزیست/);
    assert.equal(await page.getByTestId('listing-ad-label').count(), 0);

    // The pictures really are served while the advert is published.
    const src = await page.locator('[data-testid="listing-images"] img').first().getAttribute('src');
    assert.ok(src, 'a published advert shows its photo');
    await page.screenshot({ path: path.join(SHOTS, 'listing-public-mobile.png'), fullPage: true });

    // A stranger with no account is offered the report link but must sign in.
    await page.goto(BASE_URL + '/report/listing/' + listingId, { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('ورود') || body.includes('دسترسی مجاز نیست'), body.slice(0, 200));
  } finally {
    await context.close();
  }
});

test('a report reaches the queue, the decision hides the advert, and the appeal brings it back', async () => {
  // A buyer reports it.
  const buyer = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(buyer, newSyntheticMobile());
    await page.goto(BASE_URL + '/report/listing/' + listingId, { waitUntil: 'load' });
    await page.getByTestId('report-target').selectOption('ANIMAL_LISTING');
    await page.getByTestId('report-reason').selectOption('INCORRECT_INFO');
    await page.getByTestId('report-details').fill('SYNTHETIC اطلاعات آگهی با پرونده نمی‌خواند ' + RUN);
    await page.getByTestId('submit-market-report').click();
    await expectText(page, 'گزارش شما ثبت شد');

    // A second report about the same advert is a duplicate.
    await page.goto(BASE_URL + '/report/listing/' + listingId, { waitUntil: 'load' });
    await page.getByTestId('report-reason').selectOption('SPAM');
    await page.getByTestId('submit-market-report').click();
    await expectText(page, 'گزارش باز شما');
  } finally {
    await buyer.close();
  }

  // The moderator sees it, with the signals labelled as signals.
  const moderator = await contextFor(moderatorState);
  try {
    const page = await moderator.newPage();
    await page.goto(BASE_URL + '/market/listings', { waitUntil: 'load' });
    await expectText(page, 'آگهی‌های گزارش‌شده');
    assert.match(await page.getByTestId('signals-disclaimer').innerText(), /ثابت نمی‌کند/);
    const signals = await page.getByTestId('queue-signals-' + listingId).innerText();
    assert.match(signals, /گزارش باز/);
    await page.screenshot({ path: path.join(SHOTS, 'moderation-queue-desktop.png'), fullPage: true });

    await page.getByTestId('decision-' + listingId).selectOption('HIDE');
    await page.getByTestId('decision-reason-' + listingId).fill('SYNTHETIC توقف برای بررسی ' + RUN);
    await page.getByTestId('save-decision-' + listingId).click();
    /*
     * The confirmation a moderator actually reads is the queue emptying: once
     * the reports are closed the row is gone, and its own success message goes
     * with the form that carried it.
     */
    await page.getByTestId('queue-row-' + listingId).waitFor({ state: 'detached' });
    await expectText(page, 'گزارش بازی نیست');
  } finally {
    await moderator.close();
  }

  // The public can no longer reach it.
  const stranger = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await stranger.newPage();
    const gone = await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    assert.equal(gone?.status(), 404);
    await page.goto(BASE_URL + '/animals-market', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-card-' + listingId).count(), 0);
  } finally {
    await stranger.close();
  }

  // The seller objects, and the advert comes back when the objection is accepted.
  const seller = await contextFor(sellerState);
  try {
    const page = await seller.newPage();
    await page.goto(BASE_URL + '/account/listings/' + listingId, { waitUntil: 'load' });
    await expectText(page, 'اعتراض به تصمیم ناظر');
    const formId = await page
      .locator('[data-testid="appealable-reports"] form')
      .first()
      .getAttribute('data-testid');
    const id = formId!.replace('appeal-form-', '');
    await page.getByTestId('appeal-statement-' + id).fill('SYNTHETIC اطلاعات آگهی درست است ' + RUN);
    await page.getByTestId('submit-appeal-' + id).click();
    // The objection is recorded, so the decision stops being offered as
    // appealable and the seller sees it in their own list instead.
    await page.getByTestId('appeal-form-' + id).waitFor({ state: 'detached' });
    await page.goto(BASE_URL + '/account/listings/' + listingId, { waitUntil: 'load' });
    assert.match(await page.getByTestId('my-appeals').innerText(), /در انتظار بررسی/);
  } finally {
    await seller.close();
  }

  const reviewer = await contextFor(moderatorState);
  try {
    const page = await reviewer.newPage();
    await page.goto(BASE_URL + '/market/listings', { waitUntil: 'load' });
    await expectText(page, 'اعتراض‌ها');
    const rowId = await page.locator('[data-testid="appeal-queue"] li').first().getAttribute('data-testid');
    const appealId = rowId!.replace('appeal-row-', '');
    await page.getByTestId('appeal-outcome-' + appealId).selectOption('OVERTURN');
    await page.getByTestId('appeal-decision-reason-' + appealId).fill('SYNTHETIC مدرک پذیرفته شد ' + RUN);
    await page.getByTestId('save-appeal-' + appealId).click();
    await page.getByTestId('appeal-row-' + appealId).waitFor({ state: 'detached' });
    await expectText(page, 'اعتراض بازی نیست');
  } finally {
    await reviewer.close();
  }

  const back = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await back.newPage();
    const response = await page.goto(BASE_URL + '/animals-market/' + listingId, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'the advert is public again');
  } finally {
    await back.close();
  }
});
