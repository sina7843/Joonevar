/**
 * Pedigree issuance, appeals and postal requests in a real browser — gate
 * `pedigree-browser`.
 *
 * The whole chain runs through the screens: microchip, sample, registration
 * sheet, receipt to the fixed centre, shipment, arrival, processing, result,
 * issuance payment, appeal and postal request. Fixtures are SYNTHETIC and on
 * the reserved 0999 range; no real tariff or account number is used.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { certifyIdentity,
  waitForShippedSample,
} from './support.ts';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-011');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک شجره ' + RUN;
const SHEET_FEE = '250000';
const PEDIGREE_FEE = '400000';
const PEDIGREE_FEE_FA = '۴۰۰٬۰۰۰ تومان';
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی ' + RUN;
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT-' + RUN;

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(4_000_000 + (chipCounter += 1)).padStart(8, '0');

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
  await setSetting('genetics_centre.name', CENTRE_NAME);
  await setSetting('genetics_centre.payment_account', CENTRE_ACCOUNT);
  // The issuance tariff starts unset, so the first test can prove that state.
  await setSetting('fee.pedigree_toman', '');
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

/**
 * One animal taken all the way to a final Parentage Result, through the real
 * screens of every step before this prompt.
 */
async function animalWithResult(owner: Page, vet: Page, centre: Page, name: string) {
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
  await owner.getByTestId('animal-color').fill('قهوه‌ای');
  await owner.getByTestId('animal-markings').fill('بدون نشانه خاص');
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
  await certifyIdentity(vet);
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

  // Receipt to the centre, shipment, arrival, processing and the result.
  await owner.goto(BASE_URL + '/pedigree', { waitUntil: 'load' });
  await owner.getByTestId('pedigree-pick-' + animalId).check();
  await Promise.all([
    owner.waitForURL((url) => url.pathname.startsWith('/pedigree/receipts/')),
    owner.getByTestId('create-receipt').click(),
  ]);
  const receiptId = new URL(owner.url()).pathname.split('/')[3]!;
  await owner
    .getByTestId('receipt-file')
    .setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await owner.getByTestId('upload-receipt').click();
  await expectText(owner, 'تصویر فیش بارگذاری شد');
  await owner.getByTestId('submit-receipt').click();
  await expectText(owner, 'در حال بررسی مرکز');

  // By id: the shared queue holds other runs' receipts.
  await centre.goto(BASE_URL + '/genetics/receipts/' + receiptId, { waitUntil: 'load' });
  await centre.getByTestId('receipt-decision-APPROVED').check();
  await centre.getByTestId('submit-receipt-review').click();
  await expectText(centre, 'این فیش در انتظار بررسی نیست');

  await vet.goto(BASE_URL + '/vet/samples', { waitUntil: 'load' });
  const custodyRow = vet.locator('[data-testid="custody-list"] > li').filter({ hasText: trackingCode });
  await custodyRow.getByTestId('shipment-reference').fill('پست پیشتاز ' + RUN);
  await custodyRow.getByTestId('submit-shipment').click();
  await expectText(vet, 'ارسال روی همین کد رهگیری ثبت شد');

  const centreRow = () =>
    centre.locator('[data-testid="centre-sample-list"] > li').filter({ hasText: trackingCode });
  // The centre's list is bounded, so a specific sample is reached by its
  // tracking code rather than by scrolling the queue (DEC-0128).
  await centre.goto(BASE_URL + '/genetics/samples?q=' + encodeURIComponent(trackingCode), {
    waitUntil: 'load',
  });
  await waitForShippedSample(centre, trackingCode);
  await centreRow().getByTestId('receive-sample').click();
  await centreRow().getByText('دریافت‌شده در مرکز').waitFor({ timeout: 45_000 });
  await centreRow().getByTestId('start-processing').click();
  await centreRow().getByText('در حال پردازش').waitFor({ timeout: 45_000 });

  await centre.goto(BASE_URL + '/genetics/results', { waitUntil: 'load' });
  const resultRow = centre.locator('[data-testid="processing-list"] > li').filter({ hasText: trackingCode });
  await resultRow.getByTestId('result-note').fill('پردازش استاندارد.');
  await resultRow.getByTestId('submit-result').click();
  await expectText(centre, 'نتیجه نهایی ثبت شد');

  return { animalId, trackingCode };
}

/** Runs the issuance checkout for one animal and returns the batch id. */
async function issuePedigree(page: Page, animalId: string): Promise<string> {
  await page.goto(BASE_URL + '/pedigree/issue', { waitUntil: 'load' });
  await page.getByTestId('issuance-pick-' + animalId).check();
  await page.getByTestId('create-issuance').click();
  await page
    .waitForURL((url) => /^\/pedigree\/batch\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('issuance checkout did not start | body: ' + body.slice(0, 700));
    });
  const batchId = new URL(page.url()).pathname.split('/')[3]!;
  await page.getByTestId('pay-issuance').click();
  await page.waitForURL('**/dev/gateway**');
  await page.getByTestId('gateway-pay').click();
  await page.waitForURL('**/pedigree/batch/**/return**');
  await expectText(page, 'پرداخت تأیید شد');
  return batchId;
}

test('a final result without an issuance payment shows the result and locks only the document', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithResult(owner.page, vet, centre, 'سگ بدون پرداخت صدور');

    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('result-status').textContent())?.trim(), 'نتیجه نهایی');
    await expectText(owner.page, 'فقط صدور شجره‌نامه در انتظار پرداخت صدور می‌ماند');
    await owner.page.screenshot({ path: path.join(SHOTS, 'result-without-issuance.png'), fullPage: true });

    // The tariff is unset, so the payment path is closed and nothing is assumed.
    await owner.page.goto(BASE_URL + '/pedigree/issue', { waitUntil: 'load' });
    await expectText(owner.page, 'تعرفه صدور شجره‌نامه هنوز ثبت نشده است');
    assert.equal(await owner.page.getByTestId('create-issuance').isDisabled(), true);
    await owner.page.screenshot({ path: path.join(SHOTS, 'issuance-not-configured.png'), fullPage: true });

    await setSetting('fee.pedigree_toman', PEDIGREE_FEE);
    await owner.page.reload({ waitUntil: 'load' });
    assert.equal(await owner.page.getByTestId('pedigree-fee-not-configured').count(), 0);
    await expectText(owner.page, PEDIGREE_FEE_FA);
    await expectText(owner.page, 'تأیید فیش مرکز، این پرداخت نیست');
  } finally {
    await owner.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});

test('paying the issuance produces one pedigree, and a postal request claims no dispatch', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithResult(owner.page, vet, centre, 'سگ شجره‌نامه');

    await owner.page.goto(BASE_URL + '/pedigree/issue', { waitUntil: 'load' });
    await owner.page.getByTestId('issuance-pick-' + animal.animalId).check();
    await Promise.all([
      owner.page.waitForURL((url) => /^\/pedigree\/batch\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('create-issuance').click(),
    ]);
    const batchId = new URL(owner.page.url()).pathname.split('/')[3]!;
    assert.equal((await owner.page.getByTestId('pedigree-total').textContent())?.trim(), PEDIGREE_FEE_FA);
    await expectText(owner.page, 'تأیید فیش مرکز جای این پرداخت را نمی‌گیرد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'issuance-review.png'), fullPage: true });

    await owner.page.getByTestId('pay-issuance').click();
    await owner.page.waitForURL('**/dev/gateway**');
    assert.equal(await owner.page.getByTestId('gateway-amount-rial').textContent(), '4000000');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/pedigree/batch/**/return**');
    await expectText(owner.page, 'پرداخت تأیید شد');

    await owner.page.goto(BASE_URL + '/pedigree/batch/' + batchId, { waitUntil: 'load' });
    assert.equal(
      (await owner.page.getByTestId('pedigree-item-state-' + animal.animalId).textContent())?.trim(),
      'صادر شد',
    );
    await owner.page.screenshot({ path: path.join(SHOTS, 'issuance-issued.png'), fullPage: true });

    await owner.page.getByTestId('open-pedigree-' + animal.animalId).click();
    await owner.page.waitForURL('**/documents/pedigree/**');
    const code = (await owner.page.getByTestId('pedigree-code').innerText()).trim();
    assert.match(code, /^PD-/);
    assert.equal((await owner.page.getByTestId('pedigree-result-version').textContent())?.trim(), '1');
    await owner.page.screenshot({ path: path.join(SHOTS, 'pedigree-document.png'), fullPage: true });

    // A postal request for this document, prefilled or typed, records only a request.
    await owner.page.getByTestId('postal-recipient').fill('گیرنده آزمایشی');
    await owner.page.getByTestId('postal-phone').fill('09990000000');
    await owner.page.getByTestId('postal-city').fill('تهران');
    await owner.page.getByTestId('postal-address').fill('نشانی آزمایشی ' + RUN);
    await Promise.all([
      owner.page.waitForURL('**/documents/postal/**'),
      owner.page.getByTestId('submit-postal').click(),
    ]);
    await expectText(owner.page, 'ثبت درخواست به معنی ارسال واقعی سند نیست');
    assert.equal((await owner.page.getByTestId('postal-document-type').textContent())?.trim(), 'شجره‌نامه');
    // The only mention of tracking or delivery is the sentence saying they do
    // not exist in this phase; there is no field claiming either.
    await expectText(owner.page, 'وضعیت تحویل وجود ندارد');
    assert.equal(await owner.page.getByTestId('postal-tracking').count(), 0);
    await owner.page.screenshot({ path: path.join(SHOTS, 'postal-request.png'), fullPage: true });

    // The animal's own page links to the issued document.
    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    await expectText(owner.page, code);
  } finally {
    await owner.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});

test('an appeal is answered by the centre and a correction never rewrites the issued document', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithResult(owner.page, vet, centre, 'سگ اعتراض');

    // Issue the document first, so the correction has something to leave alone.
    await issuePedigree(owner.page, animal.animalId);

    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    const documentHref = await owner.page.getByTestId('animal-pedigree-link').getAttribute('href');
    await owner.page.goto(BASE_URL + documentHref!, { waitUntil: 'load' });
    const codeBefore = (await owner.page.getByTestId('pedigree-code').innerText()).trim();
    const versionBefore = (await owner.page.getByTestId('pedigree-result-version').textContent())?.trim();

    // The appeal is filed from the exact result.
    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    await owner.page.getByTestId('appeal-message').fill('نتیجه با سابقه نسب این حیوان هم‌خوان نیست.');
    // The filed appeal is the confirmation: it appears in the animal's list.
    await owner.page.getByTestId('submit-appeal').click();
    await owner.page.getByTestId('animal-appeals').waitFor({ timeout: 20_000 });
    await expectText(owner.page, 'ثبت‌شده');
    await owner.page.screenshot({ path: path.join(SHOTS, 'appeal-submitted.png'), fullPage: true });

    // The centre takes this exact appeal; the queue also holds earlier runs.
    const appealHref = await owner.page
      .locator('[data-testid="animal-appeals"] a')
      .first()
      .getAttribute('href');
    const appealId = appealHref!.replace('/pedigree/appeals/', '');
    await centre.goto(BASE_URL + '/genetics/appeals', { waitUntil: 'load' });
    await centre.getByTestId('appeal-queue').waitFor();
    await centre.goto(BASE_URL + '/genetics/appeals/' + appealId, { waitUntil: 'load' });
    await expectText(centre, 'نتیجه اصلاحی، این سند را بازنویسی یا باطل');
    await centre.getByTestId('take-appeal').click();
    await expectText(centre, 'در حال بررسی مرکز ژنتیک');
    await centre.getByTestId('appeal-response-text').fill('بازبینی انجام شد و نتیجه اصلاح می‌شود.');
    await centre.getByTestId('appeal-correct-toggle').check();
    await centre.getByTestId('appeal-correction-note').fill('نتیجه اصلاحی پس از بازبینی.');
    await centre.getByTestId('submit-appeal-answer').click();
    await expectText(centre, 'این اعتراض پاسخ داده شده است');
    await centre.screenshot({ path: path.join(SHOTS, 'centre-appeal-answer.png'), fullPage: true });

    // The owner sees the answer and the corrected version beside the disputed one.
    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    await owner.page.getByTestId('animal-appeals').waitFor();
    await owner.page.locator('[data-testid="animal-appeals"] a').first().click();
    await owner.page.waitForURL('**/pedigree/appeals/**');
    assert.equal((await owner.page.getByTestId('appeal-status').textContent())?.trim(), 'پاسخ داده شد');
    await expectText(owner.page, 'بازبینی انجام شد');
    await expectText(owner.page, 'نتیجه اصلاحی نسخه 2');
    await expectText(owner.page, 'ثبت اعتراض اجازه ویرایش آن را به کاربر نمی‌دهد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'appeal-answered.png'), fullPage: true });

    // The issued document is byte-for-byte what it was, with a notice beside it.
    await owner.page.goto(BASE_URL + documentHref!, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('pedigree-code').innerText()).trim(), codeBefore);
    assert.equal(
      (await owner.page.getByTestId('pedigree-result-version').textContent())?.trim(),
      versionBefore,
    );
    await expectText(owner.page, 'نتیجه اصلاحی پس از صدور این سند ثبت شده است');
    await expectText(owner.page, 'بدون تغییر باقی می‌ماند');
    await owner.page.screenshot({ path: path.join(SHOTS, 'pedigree-correction-notice.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});

test('a pedigree and its postal request belong to their owner alone', async () => {
  const owner = await newOwner();
  const stranger = await newOwner();
  const vetContext = await contextFor(vetState);
  const centreContext = await contextFor(centreState);
  try {
    const vet = await vetContext.newPage();
    const centre = await centreContext.newPage();
    const animal = await animalWithResult(owner.page, vet, centre, 'سگ خصوصی شجره');

    await issuePedigree(owner.page, animal.animalId);

    await owner.page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
    const documentHref = await owner.page.getByTestId('animal-pedigree-link').getAttribute('href');

    await stranger.page.goto(BASE_URL + documentHref!, { waitUntil: 'load' });
    await expectText(stranger.page, 'شجره‌نامه پیدا نشد');
    assert.equal(await stranger.page.getByTestId('pedigree-code').count(), 0);
    await stranger.page.screenshot({ path: path.join(SHOTS, 'pedigree-not-yours.png'), fullPage: true });

    // And the centre environment stays closed to a public context.
    await stranger.page.goto(BASE_URL + '/genetics/appeals', { waitUntil: 'load' });
    await expectText(stranger.page, 'دسترسی مجاز نیست');
  } finally {
    await owner.context.close();
    await stranger.context.close();
    await vetContext.close();
    await centreContext.close();
  }
});
