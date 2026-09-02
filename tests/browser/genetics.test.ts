/**
 * Genetics centre workflow in a real browser — gate `genetics-browser`.
 *
 * The whole chain runs through the screens: registration sheet, receipt to the
 * fixed centre, the centre's review, the custodian's shipment, arrival,
 * processing and the recorded result. Fixtures are SYNTHETIC and on the
 * reserved 0999 range; no real tariff, account or card number is used.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-010');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC مرکز ژنتیکی ' + RUN;
const SHEET_FEE = '250000';
/** SYNTHETIC: a self-evident placeholder, never a plausible real account. */
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی ' + RUN;
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT-' + RUN;

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(3_000_000 + (chipCounter += 1)).padStart(8, '0');

const newSyntheticMobile = () => '0999' + String(randomInt(1_000_000, 9_999_999));

function syntheticNationalId(): string {
  const base = String(900_000_000 + randomInt(0, 99_000_000)).slice(0, 9);
  for (let d = 0; d < 10; d += 1) {
    const candidate = base + d;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(candidate[i]) * (10 - i);
    const remainder = sum % 11;
    const check = Number(candidate[9]);
    if (remainder < 2 ? check === remainder : check === 11 - remainder) return candidate;
  }
  throw new Error('no valid check digit');
}

let browser!: Browser;
let operatorState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let adminState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let vetState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let centreState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

async function lastCodeFor(mobile: string): Promise<string> {
  return withDb(async (db) => {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} order by created_at desc limit 1`,
    );
    const match = /(\d{6})/.exec(rows.rows[0]?.body ?? '');
    assert.ok(match, 'no code was sent to ' + mobile);
    return match![1]!;
  });
}

async function expectText(page: Page, needle: string, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction((text) => (document.body.innerText ?? '').includes(text), needle, { timeout })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 700));
    });
}

async function signIn(context: BrowserContext, mobile: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByTestId('verify-code').click(),
  ]);
  return page;
}

const contextFor = (state: Awaited<ReturnType<BrowserContext['storageState']>> | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

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

async function completeProfile(page: Page, lastName: string): Promise<void> {
  if (!page.url().includes('/account')) await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
  if ((await page.getByTestId('national-id').count()) === 0) return;
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill(lastName);
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
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
  if ((await page.locator('body').innerText()).includes('عضویت شما فعال است')) return;
  await page.getByTestId('pay-membership').click();
  await page.waitForURL('**/dev/gateway**');
  await page.getByTestId('gateway-pay').click();
  await page.waitForURL('**/membership/return**');
  await expectText(page, 'پرداخت تأیید شد');
}

/** Enters one managed value from the admin panel. */
async function setSetting(key: string, value: string): Promise<void> {
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/admin/settings', { waitUntil: 'load' });
    await page.getByTestId('setting-value-' + key).fill(value);
    await page.getByTestId('setting-reason-' + key).fill('SYNTHETIC — مقدار آزمایشی اجرای تست ' + RUN);
    await page.getByTestId('save-setting-' + key).click();
    await expectText(page, value === '' ? 'مقدار پاک شد' : 'مقدار ذخیره شد');
  } finally {
    await admin.close();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await withDb(async (db) => {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
    await db.execute(sql`update vet_location set is_active = false where name_fa like 'SYNTHETIC%'`);
  });
  browser = await chromium.launch();

  for (const [mobile, assign] of [
    [OPERATOR_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (operatorState = s)],
    [ADMIN_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (adminState = s)],
    [GENETICS_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (centreState = s)],
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
    await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک آزمایشی');
    await page.getByTestId('vet-council-code').fill('SYNTH-VET-BROWSER');
    await page.getByTestId('vet-phone').fill('02100000000');
    await page.getByTestId('save-vet').click();
    await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

    await page.getByTestId('add-location-form').waitFor();
    await page.getByTestId('location-vet').selectOption({ label: 'SYNTHETIC دامپزشک آزمایشی' });
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

  await setSetting('fee.registration_sheet_toman', SHEET_FEE);
  // The centre's payment details start unset, so the first test can prove it.
  await setSetting('genetics_centre.payment_account', '');
  await setSetting('genetics_centre.name', '');
});

after(async () => {
  await browser?.close();
});

async function newOwner() {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const page = await signIn(context, newSyntheticMobile());
  await completeProfile(page, 'مالک آزمایشی');
  await passKyc(page);
  await payMembership(page);
  return { context, page };
}

/** An animal taken all the way to an issued registration sheet. */
async function animalWithSheet(owner: Page, vet: Page, name: string) {
  await owner.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await owner.getByTestId('start-animal-draft').click();
  await owner.waitForURL('**/animals/**/edit**');
  const animalId = new URL(owner.url()).pathname.split('/')[2]!;

  await owner.getByTestId('animal-name').fill(name);
  await owner.getByTestId('animal-breed').selectOption({ index: 1 });
  await owner.getByTestId('step-1-continue').click();
  await owner.getByTestId('sex-MALE').waitFor();
  await owner.getByTestId('sex-MALE').check();
  await owner.getByTestId('animal-birth-date').fill('2022-05-05');
  await owner.getByTestId('step-2-continue').click();
  await owner.getByTestId('step-3-continue').waitFor();
  await owner.getByTestId('step-3-continue').click();
  await owner.getByTestId('step-4-continue').waitFor();
  await owner.getByTestId('step-4-continue').click();
  await owner.getByTestId('has-microchip-no').waitFor();
  await owner.getByTestId('has-microchip-no').check();
  await owner.getByTestId('step-5-continue').click();
  await owner.getByTestId('register-animal').waitFor();
  await Promise.all([
    owner.waitForURL((url) => url.pathname === '/animals/' + animalId),
    owner.getByTestId('register-animal').click(),
  ]);

  // Microchip and sample at the desk.
  await owner.goto(BASE_URL + '/requests/new?context=MICROCHIP', { waitUntil: 'load' });
  await owner.getByTestId('pick-animal-' + animalId).check();
  await owner.getByTestId('service-' + animalId + '-MICROCHIP_IMPLANT').check();
  await Promise.all([owner.waitForURL('**/vets**'), owner.getByTestId('choose-vet').click()]);
  await owner.getByTestId('choose-location').first().click();
  await owner.waitForURL('**/requests/new/review**');
  await Promise.all([
    owner.waitForURL((url) => url.pathname === '/requests'),
    owner.getByTestId('create-visit').click(),
  ]);
  const hrefs = await owner
    .locator('[data-testid="request-list"] a')
    .evaluateAll((nodes) =>
      nodes
        .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter((h) => h.startsWith('/requests/')),
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
  await vet.getByTestId('chip-read-number').fill(number);
  await vet.getByTestId('chip-read-submit').click();
  await expectText(vet, 'سریال پیش از کاشت ثبت شد');
  await vet.getByTestId('confirm-implant-submit').click();
  await expectText(vet, 'کاشت ثبت شد');
  await vet.getByTestId('chip-reread-number').fill(number);
  await vet.getByTestId('chip-reread-submit').click();
  await expectText(vet, 'شماره رسمی میکروچیپ');
  await vet.getByTestId('submit-sampling').click();
  await vet.getByTestId('sample-list').waitFor();
  const trackingCode = (await vet.getByTestId('sample-list').innerText()).match(/SM-[A-Z0-9]+/)![0];

  // Registration sheet, paid at the development gateway.
  await owner.goto(BASE_URL + '/registration/new', { waitUntil: 'load' });
  await owner.getByTestId('sheet-pick-' + animalId).check();
  await Promise.all([
    owner.waitForURL((url) => /^\/registration\/[0-9a-f-]{36}$/.test(url.pathname)),
    owner.getByTestId('create-sheet-request').click(),
  ]);
  await owner.getByTestId('pay-sheet-batch').click();
  await owner.waitForURL('**/dev/gateway**');
  await owner.getByTestId('gateway-pay').click();
  await owner.waitForURL('**/registration/**/return**');
  await expectText(owner, 'پرداخت تأیید شد');

  return { animalId, requestId, trackingCode };
}

test('the receipt path stays closed until the fixed centre is really configured', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const animal = await animalWithSheet(owner.page, vet, 'سگ مرکز');

    await owner.page.goto(BASE_URL + '/pedigree', { waitUntil: 'load' });
    await expectText(owner.page, 'اطلاعات پرداخت مرکز هنوز ثبت نشده است');
    assert.equal(await owner.page.getByTestId('create-receipt').isDisabled(), true);
    // There is no centre selector anywhere: one fixed centre, shown as information.
    await expectText(owner.page, 'یک مرکز ثابت وجود دارد و انتخاب مرکز در محصول نیست');
    await owner.page.screenshot({ path: path.join(SHOTS, 'centre-not-configured.png'), fullPage: true });

    await setSetting('genetics_centre.name', CENTRE_NAME);
    await setSetting('genetics_centre.payment_account', CENTRE_ACCOUNT);

    await owner.page.reload({ waitUntil: 'load' });
    await owner.page.getByTestId('centre-details').waitFor();
    const details = await owner.page.getByTestId('centre-details').innerText();
    assert.ok(details.includes(CENTRE_NAME));
    assert.ok(details.includes(CENTRE_ACCOUNT));
    // The animal is offered with the sample code already on record.
    await expectText(owner.page, animal.trackingCode);
    await owner.page.screenshot({ path: path.join(SHOTS, 'centre-details.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
  }
});

test('a receipt is corrected in place, then approved, and the custodian ships', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithSheet(owner.page, vet, 'سگ فیش');

    await owner.page.goto(BASE_URL + '/pedigree', { waitUntil: 'load' });
    await owner.page.getByTestId('pedigree-pick-' + animal.animalId).check();
    await Promise.all([
      owner.page.waitForURL((url) => url.pathname.startsWith('/pedigree/receipts/')),
      owner.page.getByTestId('create-receipt').click(),
    ]);
    const receiptId = new URL(owner.page.url()).pathname.split('/')[3]!;

    // The receipt is mapped to the exact sample code of this animal.
    await expectText(owner.page, animal.trackingCode);
    // It cannot be sent for review with no image.
    assert.equal(await owner.page.getByTestId('submit-receipt').isDisabled(), true);

    await owner.page
      .getByTestId('receipt-file')
      .setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await owner.page.getByTestId('upload-receipt').click();
    await expectText(owner.page, 'تصویر فیش بارگذاری شد');
    await owner.page.getByTestId('submit-receipt').click();
    await expectText(owner.page, 'در حال بررسی مرکز');
    await owner.page.screenshot({ path: path.join(SHOTS, 'receipt-submitted.png'), fullPage: true });

    // The centre sends it back with a reason.
    await centre.goto(BASE_URL + '/genetics/receipts', { waitUntil: 'load' });
    await centre.getByTestId('receipt-queue').waitFor();
    await centre.getByTestId('open-receipt').first().click();
    await centre.waitForURL('**/genetics/receipts/**');
    await expectText(centre, animal.trackingCode);
    await centre.getByTestId('receipt-decision-NEEDS_CORRECTION').check();
    await centre.getByTestId('receipt-review-reason').fill('تصویر فیش خوانا نیست.');
    await centre.getByTestId('submit-receipt-review').click();
    await expectText(centre, 'این فیش در انتظار بررسی نیست');
    await centre.screenshot({ path: path.join(SHOTS, 'centre-receipt-review.png'), fullPage: true });

    // The payer sees the reason on the same receipt and fixes it there.
    await owner.page.goto(BASE_URL + '/pedigree/receipts/' + receiptId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('receipt-status').textContent())?.trim(), 'نیازمند اصلاح');
    await expectText(owner.page, 'تصویر فیش خوانا نیست');
    await expectText(owner.page, 'فایل قبلی شما حفظ شده است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'receipt-needs-correction.png'), fullPage: true });

    await owner.page
      .getByTestId('receipt-file')
      .setInputFiles({ name: 'receipt2.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await owner.page.getByTestId('upload-receipt').click();
    await expectText(owner.page, 'تصویر فیش بارگذاری شد');
    await owner.page.getByTestId('submit-receipt').click();
    await expectText(owner.page, 'در حال بررسی مرکز');

    await centre.goto(BASE_URL + '/genetics/receipts', { waitUntil: 'load' });
    await centre.getByTestId('open-receipt').first().click();
    await centre.getByTestId('receipt-decision-APPROVED').check();
    await centre.getByTestId('submit-receipt-review').click();
    await expectText(centre, 'این فیش در انتظار بررسی نیست');

    // Approval is not a Hamzist payment, and it asks the custodian to send.
    await owner.page.goto(BASE_URL + '/pedigree/receipts/' + receiptId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('receipt-status').textContent())?.trim(), 'تأییدشده');
    await expectText(owner.page, 'تأیید فیش مرکز، پرداخت صدور شجره‌نامه در هم‌زیست نیست');
    await owner.page.screenshot({ path: path.join(SHOTS, 'receipt-approved.png'), fullPage: true });

    await vet.goto(BASE_URL + '/vet/samples', { waitUntil: 'load' });
    await expectText(vet, 'دستور ارسال صادر شد');
    await vet.getByTestId('shipment-reference').first().fill('پست پیشتاز ' + RUN);
    await vet.getByTestId('submit-shipment').first().click();
    await expectText(vet, 'ارسال روی همین کد رهگیری ثبت شد');
    await vet.screenshot({ path: path.join(SHOTS, 'custodian-shipment.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});

test('the centre receives, processes and records a result without any issuance payment', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithSheet(owner.page, vet, 'سگ نتیجه');

    await owner.page.goto(BASE_URL + '/pedigree', { waitUntil: 'load' });
    await owner.page.getByTestId('pedigree-pick-' + animal.animalId).check();
    await Promise.all([
      owner.page.waitForURL((url) => url.pathname.startsWith('/pedigree/receipts/')),
      owner.page.getByTestId('create-receipt').click(),
    ]);
    await owner.page
      .getByTestId('receipt-file')
      .setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await owner.page.getByTestId('upload-receipt').click();
    await expectText(owner.page, 'تصویر فیش بارگذاری شد');
    await owner.page.getByTestId('submit-receipt').click();
    await expectText(owner.page, 'در حال بررسی مرکز');

    await centre.goto(BASE_URL + '/genetics/receipts', { waitUntil: 'load' });
    await centre.getByTestId('open-receipt').first().click();
    await centre.getByTestId('receipt-decision-APPROVED').check();
    await centre.getByTestId('submit-receipt-review').click();
    await expectText(centre, 'این فیش در انتظار بررسی نیست');

    await vet.goto(BASE_URL + '/vet/samples', { waitUntil: 'load' });
    await vet.getByTestId('shipment-reference').first().fill('پست پیشتاز ' + RUN);
    await vet.getByTestId('submit-shipment').first().click();
    await expectText(vet, 'ارسال روی همین کد رهگیری ثبت شد');

    // The centre records arrival and starts processing, on the same code.
    // Other runs leave samples in this queue, so the row is found by its code.
    const centreRow = () =>
      centre.locator('[data-testid="centre-sample-list"] > li').filter({ hasText: animal.trackingCode });

    await centre.goto(BASE_URL + '/genetics/samples', { waitUntil: 'load' });
    await centre.getByTestId('centre-sample-list').waitFor();
    await expectText(centre, 'مرکز نمونه‌گیری نمی‌کند');
    // Wait for the action's own confirmation before navigating away, otherwise
    // the next request aborts the server action that is still running.
    // The row re-renders in place, so the new state is the confirmation.
    await centreRow().getByTestId('receive-sample').click();
    await centreRow().getByText('دریافت‌شده در مرکز').waitFor({ timeout: 45_000 });
    await centre.screenshot({ path: path.join(SHOTS, 'centre-received.png'), fullPage: true });
    await centreRow().getByTestId('start-processing').click();
    await centreRow().getByText('در حال پردازش').waitFor({ timeout: 45_000 });

    // No pedigree issuance payment has happened, and the result is recorded.
    await centre.goto(BASE_URL + '/genetics/results', { waitUntil: 'load' });
    await centre.getByTestId('processing-list').waitFor();
    await expectText(centre, 'حیوان G0: نتیجه مستقیم به همین حیوان نسبت داده می‌شود');
    await expectText(centre, 'هیچ خروجی موازی با نام DNA Profile');
    const resultRow = centre
      .locator('[data-testid="processing-list"] > li')
      .filter({ hasText: animal.trackingCode });
    await resultRow.getByTestId('result-note').fill('پردازش استاندارد.');
    await resultRow.getByTestId('submit-result').click();
    await expectText(centre, 'نتیجه نهایی ثبت شد');
    await centre.screenshot({ path: path.join(SHOTS, 'centre-result.png'), fullPage: true });

    // The owner sees the result even though no issuance payment exists.
    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('result-status').textContent())?.trim(), 'نتیجه نهایی');
    await expectText(owner.page, 'فقط صدور شجره‌نامه در انتظار پرداخت صدور می‌ماند');
    await owner.page.screenshot({ path: path.join(SHOTS, 'owner-result.png'), fullPage: true });

    await owner.page.goto(BASE_URL + '/animals/' + animal.animalId, { waitUntil: 'load' });
    await expectText(owner.page, 'نتیجه نهایی');
    await owner.page.screenshot({ path: path.join(SHOTS, 'animal-with-result.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});

test('a receipt belongs to its payer, and the centre queue is closed to everyone else', async () => {
  const owner = await newOwner();
  const stranger = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const animal = await animalWithSheet(owner.page, vet, 'سگ خصوصی');

    await owner.page.goto(BASE_URL + '/pedigree', { waitUntil: 'load' });
    await owner.page.getByTestId('pedigree-pick-' + animal.animalId).check();
    await Promise.all([
      owner.page.waitForURL((url) => url.pathname.startsWith('/pedigree/receipts/')),
      owner.page.getByTestId('create-receipt').click(),
    ]);
    const receiptUrl = owner.page.url();

    await stranger.page.goto(receiptUrl, { waitUntil: 'load' });
    await expectText(stranger.page, 'فیش پیدا نشد');

    // And the centre environment is not reachable from a public context.
    await stranger.page.goto(BASE_URL + '/genetics/receipts', { waitUntil: 'load' });
    await expectText(stranger.page, 'دسترسی مجاز نیست');
    await stranger.page.screenshot({ path: path.join(SHOTS, 'receipt-not-yours.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await stranger.context.close();
    await vetContext.close();
  }
});
