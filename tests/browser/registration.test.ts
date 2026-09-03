/**
 * Registration sheets end to end — gate `registration-browser`.
 *
 * The whole path runs through the real screens: the tariff is entered in the
 * admin panel, the animals go through microchip and sampling at the desk, one
 * batch is paid at the development gateway, and each animal is issued or
 * blocked on its own. Fixtures are SYNTHETIC and on the reserved 0999 range.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-009');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC مرکز برگه ' + RUN;
/** SYNTHETIC tariff: the real registration-sheet fee has not been published. */
const SHEET_FEE = '250000';
const SHEET_FEE_FA = '۲۵۰٬۰۰۰ تومان';

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(1_000_000 + (chipCounter += 1)).padStart(8, '0');

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

/** Enters the tariff from the admin panel, as operational data would be. */
async function setSheetFee(value: string): Promise<void> {
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();
    await page.goto(BASE_URL + '/admin/settings', { waitUntil: 'load' });
    await page.getByTestId('setting-value-fee.registration_sheet_toman').fill(value);
    await page
      .getByTestId('setting-reason-fee.registration_sheet_toman')
      .fill('SYNTHETIC — مقدار آزمایشی اجرای تست ' + RUN);
    await page.getByTestId('save-setting-fee.registration_sheet_toman').click();
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

  // A licensed location for this run, entered from the superadmin registry.
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

  // The tariff starts unset, so the first test can prove that state.
  await setSheetFee('');
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

/** Registers an animal and returns its id. */
async function registerAnimal(page: Page, name: string): Promise<string> {
  await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await page.getByTestId('start-animal-draft').click();
  await page.waitForURL('**/animals/**/edit**');
  const animalId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByTestId('animal-name').fill(name);
  await page.getByTestId('animal-breed').selectOption({ index: 1 });
  await page.getByTestId('step-1-continue').click();
  await page.getByTestId('sex-MALE').waitFor();
  await page.getByTestId('sex-MALE').check();
  await page.getByTestId('animal-birth-date').fill('2022-05-05');
  await page.getByTestId('step-2-continue').click();
  await page.getByTestId('step-3-continue').waitFor();
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

/** Books a microchip visit, checks it in and completes chip and sample. */
async function throughTheDesk(owner: Page, vet: Page, animalId: string, options: { sample?: boolean } = {}) {
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

  if (options.sample !== false) {
    await vet.getByTestId('submit-sampling').click();
    await vet.getByTestId('sample-list').waitFor();
  }
  return { requestId, number };
}

test('an unset tariff opens no payment path, and an animal without a sample says why', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const animalId = await registerAnimal(owner.page, 'سگ بدون نمونه');
    await throughTheDesk(owner.page, vet, animalId, { sample: false });

    await owner.page.goto(BASE_URL + '/registration/new', { waitUntil: 'load' });
    await expectText(owner.page, 'تعرفه صدور برگه ثبتی هنوز ثبت نشده است');
    await expectText(owner.page, 'نمونه خون این حیوان هنوز ثبت نشده است');
    assert.equal(await owner.page.getByTestId('create-sheet-request').isDisabled(), true);
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-not-configured.png'), fullPage: true });

    // The association enters the real value; here it is clearly synthetic.
    await setSheetFee(SHEET_FEE);
    await owner.page.reload({ waitUntil: 'load' });
    assert.equal(await owner.page.getByTestId('sheet-fee-not-configured').count(), 0);
    // The animal is still not ready, because the sample step has not happened.
    assert.equal(await owner.page.getByTestId('sheet-pick-' + animalId).isDisabled(), true);
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-animal-not-ready.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
  }
});

test('two animals share one payment, and each one is issued or blocked on its own', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const first = await registerAnimal(owner.page, 'سگ صادرشونده');
    const second = await registerAnimal(owner.page, 'سگ متوقف');
    await throughTheDesk(owner.page, vet, first);
    const secondVisit = await throughTheDesk(owner.page, vet, second);

    await owner.page.goto(BASE_URL + '/registration/new', { waitUntil: 'load' });
    await owner.page.getByTestId('sheet-pick-' + first).check();
    await owner.page.getByTestId('sheet-pick-' + second).check();
    // `/registration/new` itself matches a loose glob, so wait for the batch id.
    await Promise.all([
      owner.page.waitForURL((url) => /^\/registration\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('create-sheet-request').click(),
    ]);
    const batchId = new URL(owner.page.url()).pathname.split('/')[2]!;

    // The breakdown names a price per animal and a total for the batch.
    const breakdown = await owner.page.getByTestId('sheet-breakdown').innerText();
    assert.equal(breakdown.split(SHEET_FEE_FA).length - 1, 2, 'one line per animal');
    assert.equal((await owner.page.getByTestId('sheet-total').textContent())?.trim(), '۵۰۰٬۰۰۰ تومان');
    await expectText(owner.page, 'مبلغ خدمت دامپزشک جدا است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-review.png'), fullPage: true });

    // Between the review and the payment, the second animal's sample is lost.
    await vet.goto(BASE_URL + '/vet/requests/' + secondVisit.requestId, { waitUntil: 'load' });
    await vet.getByTestId('unusable-status').selectOption('LOST');
    await vet.getByTestId('unusable-reason').fill('نمونه در انتقال مفقود شد.');
    await vet.getByTestId('submit-unusable').click();
    await expectText(vet, 'مفقود');

    await owner.page.getByTestId('pay-sheet-batch').click();
    await owner.page.waitForURL('**/dev/gateway**');
    assert.equal(await owner.page.getByTestId('gateway-amount-rial').textContent(), '5000000');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/registration/**/return**');
    await expectText(owner.page, 'پرداخت تأیید شد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-paid.png'), fullPage: true });

    await owner.page.goto(BASE_URL + '/registration/' + batchId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('batch-status').textContent())?.trim(), 'پرداخت تأییدشده');
    assert.equal((await owner.page.getByTestId('item-state-' + first).textContent())?.trim(), 'صادر شد');
    assert.equal((await owner.page.getByTestId('item-state-' + second).textContent())?.trim(), 'متوقف');
    // The blocked reason is the product's own, naming the missing prerequisite.
    await expectText(owner.page, 'نمونه این حیوان قابل استفاده نیست');
    await expectText(owner.page, 'پرداخت این قلم محفوظ است');
    await expectText(owner.page, 'نمونه خون دریافت شده؛ آزمایش Parentage هنوز انجام نشده است.');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-items.png'), fullPage: true });

    // The issued document is reachable and states what it is not.
    await owner.page.getByTestId('open-sheet-' + first).click();
    await owner.page.waitForURL('**/documents/**');
    const sheetNo = (await owner.page.getByTestId('sheet-no').innerText()).trim();
    const petId = (await owner.page.getByTestId('sheet-pet-id').innerText()).trim();
    assert.match(sheetNo, /RS-/);
    assert.match(petId, /PET-/);
    await expectText(owner.page, 'این برگه نتیجه ژنتیک یا شجره‌نامه نیست');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-document.png'), fullPage: true });

    // The PDF is produced by the local engine and is owner-scoped: the same URL
    // answers "not found" to anyone else and 401 to a visitor with no session
    // (DEC-0124). A redirect to the sign-in page would be the wrong answer for a
    // download, so the status code is what is asserted.
    const pdfUrl = new URL(owner.page.url()).pathname.replace(
      /^\/documents\/(.+)$/,
      '/api/documents/registration-sheet/$1/pdf',
    );
    const mine = await owner.context.request.get(BASE_URL + pdfUrl);
    assert.equal(mine.status(), 200);
    assert.equal(mine.headers()['content-type'], 'application/pdf');
    assert.equal((await mine.body()).subarray(0, 5).toString(), '%PDF-');

    const anonymous = await browser.newContext();
    try {
      assert.equal((await anonymous.request.get(BASE_URL + pdfUrl)).status(), 401);
    } finally {
      await anonymous.close();
    }

    // The animal now carries its Pet ID and links to its sheet.
    await owner.page.goto(BASE_URL + '/animals/' + first, { waitUntil: 'load' });
    assert.match((await owner.page.getByTestId('pet-id').textContent()) ?? '', new RegExp(petId));
    await expectText(owner.page, 'نمونه خون دریافت شده؛ آزمایش Parentage هنوز انجام نشده است.');
    await owner.page.screenshot({ path: path.join(SHOTS, 'animal-with-sheet.png'), fullPage: true });

    // The blocked animal is fixed at the desk and issued with no new payment.
    await vet.goto(BASE_URL + '/vet/requests/' + secondVisit.requestId, { waitUntil: 'load' });
    await vet.getByTestId('submit-resample').click();
    await vet.waitForTimeout(500);

    await owner.page.goto(BASE_URL + '/registration/' + batchId, { waitUntil: 'load' });
    // The result is the state itself: the retry form disappears once nothing
    // is blocked any more, so the item's own row is what is asserted.
    await owner.page.getByTestId('retry-issuance').click();
    await owner.page.getByTestId('open-sheet-' + second).waitFor();
    await owner.page.goto(BASE_URL + '/registration/' + batchId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('item-state-' + second).textContent())?.trim(), 'صادر شد');
    // The amounts are exactly the ones that were paid; no refund, no top-up.
    assert.equal((await owner.page.getByTestId('sheet-total').textContent())?.trim(), '۵۰۰٬۰۰۰ تومان');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-retry-issued.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
  }
});

test('a browser that returns without paying issues nothing, and the retry still works', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const animalId = await registerAnimal(owner.page, 'سگ بازگشت');
    await throughTheDesk(owner.page, vet, animalId);

    await owner.page.goto(BASE_URL + '/registration/new', { waitUntil: 'load' });
    await owner.page.getByTestId('sheet-pick-' + animalId).check();
    // `/registration/new` itself matches a loose glob, so wait for the batch id.
    await Promise.all([
      owner.page.waitForURL((url) => /^\/registration\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('create-sheet-request').click(),
    ]);
    const batchId = new URL(owner.page.url()).pathname.split('/')[2]!;

    await owner.page.getByTestId('pay-sheet-batch').click();
    await owner.page.waitForURL('**/dev/gateway**');
    const reference = new URL(owner.page.url()).searchParams.get('reference')!;

    // Coming back with the real reference but without paying proves nothing.
    await owner.page.goto(
      BASE_URL + '/registration/' + batchId + '/return?reference=' + encodeURIComponent(reference),
      { waitUntil: 'load' },
    );
    await expectText(owner.page, 'پرداخت تأیید نشد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-not-verified.png'), fullPage: true });

    await owner.page.goto(BASE_URL + '/registration/' + batchId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('item-state-' + animalId).textContent())?.trim(), 'در انتظار پرداخت');
    await expectText(owner.page, 'حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است');
    assert.equal((await owner.page.getByTestId('sheet-total').textContent())?.trim(), SHEET_FEE_FA);

    // The second, real attempt issues the document.
    await owner.page.getByTestId('pay-sheet-batch').click();
    await owner.page.waitForURL('**/dev/gateway**');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/registration/**/return**');
    await expectText(owner.page, 'پرداخت تأیید شد');
    await owner.page.goto(BASE_URL + '/registration/' + batchId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('item-state-' + animalId).textContent())?.trim(), 'صادر شد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'sheet-retry-payment.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
  }
});

test('a document belongs to its owner and to nobody else', async () => {
  const owner = await newOwner();
  const stranger = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    const animalId = await registerAnimal(owner.page, 'سگ سند خصوصی');
    await throughTheDesk(owner.page, vet, animalId);

    await owner.page.goto(BASE_URL + '/registration/new', { waitUntil: 'load' });
    await owner.page.getByTestId('sheet-pick-' + animalId).check();
    // `/registration/new` itself matches a loose glob, so wait for the batch id.
    await Promise.all([
      owner.page.waitForURL((url) => /^\/registration\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('create-sheet-request').click(),
    ]);
    await owner.page.getByTestId('pay-sheet-batch').click();
    await owner.page.waitForURL('**/dev/gateway**');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/registration/**/return**');

    await owner.page.goto(BASE_URL + '/registration', { waitUntil: 'load' });
    await owner.page.getByTestId('issued-sheets').waitFor();
    const href = await owner.page
      .locator('[data-testid="issued-sheets"] a')
      .first()
      .getAttribute('href');

    await stranger.page.goto(BASE_URL + href!, { waitUntil: 'load' });
    await expectText(stranger.page, 'برگه ثبتی پیدا نشد');
    assert.equal(await stranger.page.getByTestId('sheet-no').count(), 0);
    await stranger.page.screenshot({ path: path.join(SHOTS, 'sheet-not-yours.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await stranger.context.close();
    await vetContext.close();
  }
});
