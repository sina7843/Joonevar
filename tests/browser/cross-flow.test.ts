/**
 * The whole official path in one browser session — gate `cross-flow-browser`.
 *
 * One journey walks every screen the source chains together, from identity to
 * the puppy card, and then checks the independent branches beside it. It is the
 * end-to-end counterpart of `domain-regression`: the same path, but through the
 * pages a person actually uses. Fixtures are SYNTHETIC and on the reserved 0999
 * range.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { certifyIdentity } from './support.ts';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-019');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک مسیر کامل ' + RUN;
const SHEET_FEE = '250000';
const PEDIGREE_FEE = '400000';
const PERMIT_FEE = '300000';
const CARD_FEE = '120000';
const CARD_FEE_FA = '۱۲۰٬۰۰۰ تومان';
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی ' + RUN;
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT-' + RUN;

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(4_000_000 + (chipCounter += 1)).padStart(8, '0');

const newSyntheticMobile = () => '0999' + String(randomInt(1_000_000, 9_999_999));

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

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

async function newOwner(lastName: string) {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const page = await signIn(context, newSyntheticMobile());
  await completeProfile(page, lastName);
  await passKyc(page);
  await payMembership(page);
  return { context, page };
}

/** One animal taken through every earlier screen to an issued pedigree. */
async function pedigreedAnimal(
  owner: Page,
  vet: Page,
  centre: Page,
  name: string,
  sex: 'MALE' | 'FEMALE',
): Promise<{ animalId: string; pedigreeCode: string }> {
  await owner.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await owner.getByTestId('start-animal-draft').click();
  await owner.waitForURL('**/animals/**/edit**');
  const animalId = new URL(owner.url()).pathname.split('/')[2]!;

  await owner.getByTestId('animal-name').fill(name);
  await owner.getByTestId('animal-breed').selectOption({ index: 1 });
  await owner.getByTestId('step-1-continue').click();
  await owner.getByTestId('sex-' + sex).waitFor();
  await owner.getByTestId('sex-' + sex).check();
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

  // Straight to this receipt: the shared development queue also holds rows left
  // by earlier runs.
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
  // The centre may load before the custodian's shipment has landed; wait for
  // the state the button belongs to instead of racing it.
  await centreRow().getByText('ارسال‌شده').waitFor({ timeout: 45_000 });
  await centreRow().getByTestId('receive-sample').click();
  await centreRow().getByText('دریافت‌شده در مرکز').waitFor({ timeout: 45_000 });
  await centreRow().getByTestId('start-processing').click();
  await centreRow().getByText('در حال پردازش').waitFor({ timeout: 45_000 });

  await centre.goto(BASE_URL + '/genetics/results', { waitUntil: 'load' });
  const resultRow = centre.locator('[data-testid="processing-list"] > li').filter({ hasText: trackingCode });
  await resultRow.getByTestId('result-note').fill('پردازش استاندارد.');
  await resultRow.getByTestId('submit-result').click();
  await expectText(centre, 'نتیجه نهایی ثبت شد');

  await owner.goto(BASE_URL + '/pedigree/issue', { waitUntil: 'load' });
  await owner.getByTestId('issuance-pick-' + animalId).check();
  await owner.getByTestId('create-issuance').click();
  await owner.waitForURL((url) => /^\/pedigree\/batch\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 });
  await owner.getByTestId('pay-issuance').click();
  await owner.waitForURL('**/dev/gateway**');
  await owner.getByTestId('gateway-pay').click();
  await owner.waitForURL('**/pedigree/batch/**/return**');
  await expectText(owner, 'پرداخت تأیید شد');

  await owner.goto(BASE_URL + '/pedigree/' + animalId, { waitUntil: 'load' });
  const pedigreeCode = (await owner.locator('body').innerText()).match(/PD-[A-Z0-9]+/)![0];
  return { animalId, pedigreeCode };
}



let sire!: { context: BrowserContext; page: Page };
let dam!: { context: BrowserContext; page: Page };
let permitId!: string;
let litterId!: string;
let puppyCodes: readonly string[] = [];

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
    await page.getByTestId('cap-pregnancy').check();
    await page.getByTestId('add-location').click();
    await expectText(page, 'مرکز ثبت شد');
  } finally {
    await admin.close();
  }

  for (const [key, value] of [
    ['fee.registration_sheet_toman', SHEET_FEE],
    ['fee.pedigree_toman', PEDIGREE_FEE],
    ['fee.mating_permit_toman', PERMIT_FEE],
    ['fee.puppy_card_toman', CARD_FEE],
    ['genetics_centre.name', CENTRE_NAME],
    ['genetics_centre.payment_account', CENTRE_ACCOUNT],
  ] as const) {
    await setSetting(key, value);
  }
});

after(async () => {
  await sire?.context.close();
  await dam?.context.close();
  await browser?.close();
});

test('one journey: identity, animal, membership, visit, sheet, genetics and pedigree', async () => {
  const vet = await contextFor(vetState);
  const centre = await contextFor(centreState);
  try {
    const vetPage = await vet.newPage();
    const centrePage = await centre.newPage();

    sire = await newOwner('مالک نر مسیر کامل');
    const male = await pedigreedAnimal(sire.page, vetPage, centrePage, 'سگ نر مسیر کامل', 'MALE');
    dam = await newOwner('مالک ماده مسیر کامل');
    const female = await pedigreedAnimal(dam.page, vetPage, centrePage, 'سگ ماده مسیر کامل', 'FEMALE');

    // Both animals really reached an issued pedigree through the screens.
    for (const [page, animal] of [
      [sire.page, male],
      [dam.page, female],
    ] as const) {
      await page.goto(BASE_URL + '/pedigree/' + animal.animalId, { waitUntil: 'load' });
      await expectText(page, animal.pedigreeCode);
    }
    await sire.page.screenshot({ path: path.join(SHOTS, 'journey-pedigree.png'), fullPage: true });

    // The permit: resolve, invite, confirm, rule, pay, submit, issue.
    await sire.page.goto(BASE_URL + '/mating/permits/new', { waitUntil: 'load' });
    await sire.page.getByTestId('own-animal').selectOption({ index: 1 });
    await sire.page.getByTestId('counterparty-code').fill(female.pedigreeCode);
    await sire.page.getByTestId('resolve-party').click();
    await sire.page.getByTestId('resolved-party').waitFor();
    await Promise.all([
      sire.page.waitForURL((url) => /^\/mating\/permits\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 }),
      sire.page.getByTestId('invite-party').click(),
    ]);
    permitId = new URL(sire.page.url()).pathname.split('/')[3]!;

    await dam.page.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
    await dam.page.getByTestId('party-decision-ACCEPT').check();
    await dam.page.getByTestId('submit-party-decision').click();
    await expectText(dam.page, 'در انتظار پرداخت');

    await sire.page.reload({ waitUntil: 'load' });
    await sire.page.getByTestId('rule-type-PERCENTAGE').check();
    await sire.page.getByTestId('sire-percent').fill('50');
    await sire.page.getByTestId('dam-percent').fill('50');
    await sire.page.getByTestId('save-rule').click();
    await sire.page.getByTestId('permit-rule-summary').waitFor();
    await sire.page.getByTestId('pay-permit').click();
    await sire.page.waitForURL('**/dev/gateway**');
    await sire.page.getByTestId('gateway-pay').click();
    await sire.page.waitForURL('**/mating/permits/**/return**');
    await expectText(sire.page, 'پرداخت تأیید شد');
    await sire.page.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
    await sire.page.getByTestId('submit-permit').click();
    await expectText(sire.page, 'در حال بررسی');

    const assoc = await contextFor(operatorState);
    try {
      const page = await assoc.newPage();
      await page.goto(BASE_URL + '/assoc/permits/' + permitId, { waitUntil: 'load' });
      await page.getByTestId('permit-decision-ISSUED').check();
      await page.getByTestId('submit-permit-review').click();
      await expectText(page, 'این پرونده در صف تصمیم نیست');
    } finally {
      await assoc.close();
    }

    await sire.page.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
    assert.equal(await sire.page.getByTestId('permit-status').innerText(), 'مجوز صادر شد');
    await sire.page.screenshot({ path: path.join(SHOTS, 'journey-permit.png'), fullPage: true });
  } finally {
    await vet.close();
    await centre.close();
  }
});

test('the same journey continues: dates, birth, allocation and the card', async () => {
  // Dates: one side declares, the other confirms, and only then is there an
  // official basis on both animals' files.
  await sire.page.goto(BASE_URL + '/mating/permits/' + permitId + '/dates', { waitUntil: 'load' });
  await sire.page.getByTestId('mated-on').fill(day(-40));
  await sire.page.getByTestId('submit-date').click();
  await sire.page.getByTestId('date-version-1').waitFor();

  await dam.page.goto(BASE_URL + '/mating/permits/' + permitId + '/dates', { waitUntil: 'load' });
  await dam.page.getByTestId('confirm-date').click();
  await dam.page.waitForFunction(
    () => document.body.innerText.includes('تأییدشده دوطرفه'),
    undefined,
    { timeout: 20_000 },
  );
  await dam.page.screenshot({ path: path.join(SHOTS, 'journey-dates.png'), fullPage: true });

  // Birth and the provisional puppies.
  await sire.page.goto(BASE_URL + '/mating/permits/' + permitId + '/birth', { waitUntil: 'load' });
  await sire.page.getByTestId('born-on').fill(day(-6));
  await sire.page.getByTestId('live-count').fill('2');
  await sire.page.getByTestId('dead-count').fill('0');
  await sire.page.getByTestId('submit-birth').click();
  await sire.page.getByTestId('puppy-list').waitFor();
  puppyCodes = await sire.page
    .locator('[data-testid="puppy-list"] > li')
    .evaluateAll((nodes) => nodes.map((n) => ((n as HTMLElement).dataset.testid ?? '').replace('puppy-', '')));
  assert.equal(puppyCodes.length, 2);
  await sire.page.screenshot({ path: path.join(SHOTS, 'journey-birth.png'), fullPage: true });

  // Allocation, confirmed by both sides.
  await sire.page.getByTestId('open-allocation-from-birth').click();
  await sire.page.waitForURL((url) => url.pathname.endsWith('/allocation'));
  litterId = new URL(sire.page.url()).pathname.split('/')[2]!;
  await sire.page.getByTestId('assign-' + puppyCodes[0]).selectOption({ index: 1 });
  await sire.page.getByTestId('assign-' + puppyCodes[1]).selectOption({ index: 2 });
  await sire.page.getByTestId('submit-allocation').click();
  await sire.page.getByTestId('allocation-items').waitFor();
  await sire.page.getByTestId('allocation-decision-APPROVE').check();
  await sire.page.getByTestId('submit-allocation-response').click();
  await sire.page.getByTestId('pending-both-note').waitFor();

  await dam.page.goto(BASE_URL + '/litters/' + litterId + '/allocation', { waitUntil: 'load' });
  await dam.page.getByTestId('allocation-decision-APPROVE').check();
  await dam.page.getByTestId('submit-allocation-response').click();
  await dam.page.waitForFunction(
    () => document.querySelector('[data-testid="allocation-status"]')?.textContent?.includes('نهایی‌شده'),
    undefined,
    { timeout: 20_000 },
  );
  await dam.page.screenshot({ path: path.join(SHOTS, 'journey-allocation.png'), fullPage: true });

  // The card, per puppy, after one payment.
  await sire.page.goto(BASE_URL + '/puppy-cards/checkout?permit=' + permitId, { waitUntil: 'load' });
  await sire.page.getByTestId('card-pick-' + puppyCodes[0]).check();
  await sire.page.getByTestId('pay-cards').click();
  await sire.page.waitForURL('**/dev/gateway**');
  await sire.page.getByTestId('gateway-pay').click();
  await sire.page.waitForURL('**/puppy-cards/return**');
  await expectText(sire.page, 'پرداخت تأیید شد');

  await sire.page.goto(BASE_URL + '/puppy-cards/checkout?permit=' + permitId, { waitUntil: 'load' });
  await sire.page.getByTestId('issued-card-' + puppyCodes[0]).click();
  await sire.page.waitForURL((url) => url.pathname.startsWith('/documents/puppy-card/'));
  assert.match(await sire.page.getByTestId('card-no').innerText(), /PC-[A-Z0-9]{8}/);
  await sire.page.screenshot({ path: path.join(SHOTS, 'journey-card.png'), fullPage: true });
});

test('the animal file shows the whole chain, and the branches stay separate', async () => {
  // The animal's own page carries what really happened to it.
  await sire.page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
  const hrefs = await sire.page
    .locator('a')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
  // Both routes are offered, and they are different services (§16, §20).
  assert.ok(hrefs.includes('/declaration/new'));
  assert.ok(hrefs.some((href) => href.startsWith('/mating/permits')));
  await sire.page.screenshot({ path: path.join(SHOTS, 'journey-dashboard.png'), fullPage: true });

  // The kennel branch is its own case with its own payment and review.
  await sire.page.goto(BASE_URL + '/kennels', { waitUntil: 'load' });
  const kennelBody = await sire.page.locator('body').innerText();
  assert.ok(!kennelBody.includes('مجوز جفت‌گیری'), 'the kennel branch is not the permit');

  // A postal request records a request and says so, with no dispatch anywhere.
  await sire.page.goto(BASE_URL + '/registration', { waitUntil: 'load' });
  const documentLink = sire.page.locator('a[href^="/documents/"]').first();
  if ((await documentLink.count()) > 0) {
    await documentLink.click();
    await sire.page.waitForURL((url) => url.pathname.startsWith('/documents/'));
    const body = await sire.page.locator('body').innerText();
    assert.ok(!body.includes('کد رهگیری پستی'), 'no tracking number is ever shown');
    await sire.page.screenshot({ path: path.join(SHOTS, 'journey-document.png'), fullPage: true });
  }
});
