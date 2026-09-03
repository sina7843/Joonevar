/**
 * Breeder activation and kennels in a real browser — gate `kennel-browser`.
 *
 * The whole path runs through the screens: the «شروع ثبت کنل» entry, the form,
 * breed search, payment, submission, the association's decision and the breeder
 * context that appears afterwards. Fixtures are SYNTHETIC and on the reserved
 * 0999 range; no real tariff is used.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-012');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک کنل ' + RUN;
const SHEET_FEE = '250000';
const KENNEL_FEE = '150000';
const KENNEL_FEE_FA = '۱۵۰٬۰۰۰ تومان';

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(5_000_000 + (chipCounter += 1)).padStart(8, '0');

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
  await setSetting('fee.kennel_registration_toman', KENNEL_FEE);
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

/** One animal taken to an issued registration sheet, the kennel prerequisite. */
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
  return animalId;
}

test('without a registration sheet the kennel entry is locked with that exact reason', async () => {
  const owner = await newOwner();
  try {
    await owner.page.goto(BASE_URL + '/kennels', { waitUntil: 'load' });
    await expectText(owner.page, 'برگه ثبتی');
    assert.equal(await owner.page.getByTestId('start-kennel').count(), 0);
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-locked.png'), fullPage: true });

    // The activation page states the rule without asking for any document.
    await owner.page.goto(BASE_URL + '/breeder/activate', { waitUntil: 'load' });
    await expectText(owner.page, 'مدرک اضافه‌ای جز همان کارت ملی');
    await expectText(owner.page, 'پرداخت مستقلی با عنوان «فعال‌سازی نقش» وجود ندارد');
    assert.equal((await owner.page.getByTestId('breeder-status').textContent())?.trim(), 'شروع نشده');
    await owner.page.screenshot({ path: path.join(SHOTS, 'breeder-activation.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('the whole kennel path runs: form, breeds, payment, submission and approval', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const assocContext = await contextFor(operatorState);
  try {
    const vet = await vetContext.newPage();
    const assoc = await assocContext.newPage();
    await animalWithSheet(owner.page, vet, 'سگ کنل');

    await owner.page.goto(BASE_URL + '/kennels', { waitUntil: 'load' });
    // The entry carries the label the source names.
    assert.equal((await owner.page.getByTestId('start-kennel').textContent())?.trim(), 'شروع ثبت کنل');
    await Promise.all([
      owner.page.waitForURL((url) => /^\/kennels\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('start-kennel').click(),
    ]);
    const kennelId = new URL(owner.page.url()).pathname.split('/')[2]!;
    await expectText(owner.page, 'نشانی محل سکونت شما جدا و اختیاری است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-form.png'), fullPage: true });

    // Without an address and a breed, the file cannot go anywhere.
    await owner.page.getByTestId('kennel-name').fill('کنل نمونه ' + RUN);
    await owner.page.getByTestId('save-kennel').click();
    await expectText(owner.page, 'اطلاعات کنل ذخیره شد');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await expectText(owner.page, 'نشانی و موقعیت کنل برای ارسال لازم است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-missing-location.png'), fullPage: true });

    await owner.page.getByTestId('kennel-city').fill('تهران');
    await owner.page.getByTestId('kennel-address').fill('نشانی کنل ' + RUN);
    await owner.page.getByTestId('kennel-phone').fill('02100000000');
    await owner.page.getByTestId('save-kennel').click();
    await expectText(owner.page, 'اطلاعات کنل ذخیره شد');

    // Breeds: search in Persian, add one, see the count.
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await expectText(owner.page, 'حداقل یک نژاد پرورشی انتخاب کنید');
    await owner.page.getByTestId('breed-search').fill('ژرمن');
    const firstOption = owner.page.locator('[data-testid^="add-breed-"][data-testid$=""]').first();
    await owner.page.locator('[data-testid="breed-options"] button').first().click();
    await expectText(owner.page, 'نژاد به فهرست کنل اضافه شد');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await expectText(owner.page, '1 نژاد انتخاب شده است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-breeds.png'), fullPage: true });
    void firstOption;

    // Review and payment.
    assert.equal((await owner.page.getByTestId('kennel-fee').textContent())?.trim(), KENNEL_FEE_FA);
    await owner.page.getByTestId('pay-kennel').click();
    await owner.page.waitForURL('**/dev/gateway**');
    assert.equal(await owner.page.getByTestId('gateway-amount-rial').textContent(), '1500000');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/kennels/**/return**');
    await expectText(owner.page, 'پرداخت تأیید شد');
    await expectText(owner.page, 'تأیید نهایی با انجمن است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-paid.png'), fullPage: true });

    // Paying does not put it in the queue; sending it does.
    await assoc.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    assert.equal(
      (await assoc.locator('body').innerText()).includes('کنل نمونه ' + RUN),
      false,
      'a paid kennel is not in the queue until it is sent',
    );

    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('kennel-status').textContent())?.trim(), 'آماده ارسال');
    await owner.page.getByTestId('submit-kennel').click();
    await expectText(owner.page, 'در حال بررسی انجمن');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-submitted.png'), fullPage: true });

    // The association sends it back once, then approves it.
    await assoc.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    await assoc.getByTestId('kennel-queue').waitFor();
    const caseRow = assoc.locator('[data-testid="kennel-queue"] > li').filter({ hasText: 'کنل نمونه ' + RUN });
    await caseRow.getByTestId('open-kennel-case').click();
    await assoc.waitForURL('**/assoc/kennels/**');
    await expectText(assoc, 'نژادها (1)');
    await expectText(assoc, 'هیچ پرداخت جداگانه‌ای برای فعال‌سازی نقش وجود ندارد');
    await assoc.getByTestId('kennel-decision-NEEDS_CORRECTION').check();
    await assoc.getByTestId('kennel-review-reason').fill('نشانی کنل دقیق‌تر شود.');
    await assoc.getByTestId('submit-kennel-review').click();
    await expectText(assoc, 'این پرونده در انتظار بررسی نیست');
    await assoc.screenshot({ path: path.join(SHOTS, 'assoc-kennel-review.png'), fullPage: true });

    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('kennel-status').textContent())?.trim(), 'نیازمند اصلاح');
    await expectText(owner.page, 'نشانی کنل دقیق‌تر شود');
    await expectText(owner.page, 'پرداخت انجام‌شده حفظ شده است');
    // No second payment is offered for the correction.
    assert.equal(await owner.page.getByTestId('pay-kennel').count(), 0);
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-needs-correction.png'), fullPage: true });

    await owner.page.getByTestId('kennel-address').fill('نشانی دقیق‌تر کنل ' + RUN);
    await owner.page.getByTestId('save-kennel').click();
    await expectText(owner.page, 'اطلاعات کنل ذخیره شد');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await owner.page.getByTestId('submit-kennel').click();
    await expectText(owner.page, 'در حال بررسی انجمن');

    await assoc.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    await caseRow.getByTestId('open-kennel-case').click();
    await assoc.waitForURL('**/assoc/kennels/**');
    await assoc.getByTestId('kennel-decision-APPROVED').check();
    await assoc.getByTestId('submit-kennel-review').click();
    await expectText(assoc, 'این پرونده در انتظار بررسی نیست');

    // The breeder context is now real, and the role switcher offers it.
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    assert.equal((await owner.page.getByTestId('kennel-status').textContent())?.trim(), 'تأییدشده');
    await expectText(owner.page, 'نقش پرورش‌دهنده فعال است');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-approved.png'), fullPage: true });

    await owner.page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    await expectText(owner.page, 'پرورش‌دهنده');
    await owner.page.screenshot({ path: path.join(SHOTS, 'breeder-context.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
    await assocContext.close();
  }
});

test('breeds are edited after approval with no new payment and no second review', async () => {
  const owner = await newOwner();
  const vetContext = await contextFor(vetState);
  const assocContext = await contextFor(operatorState);
  try {
    const vet = await vetContext.newPage();
    const assoc = await assocContext.newPage();
    await animalWithSheet(owner.page, vet, 'سگ ویرایش نژاد');

    await owner.page.goto(BASE_URL + '/kennels', { waitUntil: 'load' });
    await Promise.all([
      owner.page.waitForURL((url) => /^\/kennels\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('start-kennel').click(),
    ]);
    const kennelId = new URL(owner.page.url()).pathname.split('/')[2]!;
    await owner.page.getByTestId('kennel-name').fill('کنل ویرایش ' + RUN);
    await owner.page.getByTestId('kennel-city').fill('تهران');
    await owner.page.getByTestId('kennel-address').fill('نشانی ' + RUN);
    await owner.page.getByTestId('save-kennel').click();
    await expectText(owner.page, 'اطلاعات کنل ذخیره شد');

    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await owner.page.locator('[data-testid="breed-options"] button').first().click();
    await expectText(owner.page, 'نژاد به فهرست کنل اضافه شد');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await owner.page.getByTestId('pay-kennel').click();
    await owner.page.waitForURL('**/dev/gateway**');
    await owner.page.getByTestId('gateway-pay').click();
    await owner.page.waitForURL('**/kennels/**/return**');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await owner.page.getByTestId('submit-kennel').click();
    await expectText(owner.page, 'در حال بررسی انجمن');

    await assoc.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    const caseRow = assoc
      .locator('[data-testid="kennel-queue"] > li')
      .filter({ hasText: 'کنل ویرایش ' + RUN });
    await caseRow.getByTestId('open-kennel-case').click();
    await assoc.waitForURL('**/assoc/kennels/**');
    await assoc.getByTestId('kennel-decision-APPROVED').check();
    await assoc.getByTestId('submit-kennel-review').click();
    await expectText(assoc, 'این پرونده در انتظار بررسی نیست');

    // One breed: the last one cannot be removed.
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await expectText(owner.page, '1 نژاد انتخاب شده است');
    await owner.page.locator('[data-testid^="remove-breed-form-"] button').first().click();
    await expectText(owner.page, 'حذف آخرین نژاد کنل مجاز نیست');
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-last-breed.png'), fullPage: true });

    // A second breed is added and removed; the kennel stays approved.
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await owner.page.locator('[data-testid="breed-options"] button').first().click();
    await expectText(owner.page, 'نژاد به فهرست کنل اضافه شد');
    await owner.page.goto(BASE_URL + '/kennels/' + kennelId, { waitUntil: 'load' });
    await expectText(owner.page, '2 نژاد انتخاب شده است');
    assert.equal((await owner.page.getByTestId('kennel-status').textContent())?.trim(), 'تأییدشده');
    assert.equal(await owner.page.getByTestId('pay-kennel').count(), 0, 'no new payment for an edit');

    await assoc.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    assert.equal(
      (await assoc.locator('body').innerText()).includes('کنل ویرایش ' + RUN),
      false,
      'editing breeds does not send the kennel back for review',
    );
    await owner.page.screenshot({ path: path.join(SHOTS, 'kennel-breed-edit.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vetContext.close();
    await assocContext.close();
  }
});

test('a kennel file belongs to its owner alone', async () => {
  const owner = await newOwner();
  const stranger = await newOwner();
  const vetContext = await contextFor(vetState);
  try {
    const vet = await vetContext.newPage();
    await animalWithSheet(owner.page, vet, 'سگ خصوصی کنل');

    await owner.page.goto(BASE_URL + '/kennels', { waitUntil: 'load' });
    await Promise.all([
      owner.page.waitForURL((url) => /^\/kennels\/[0-9a-f-]{36}$/.test(url.pathname)),
      owner.page.getByTestId('start-kennel').click(),
    ]);
    const kennelUrl = owner.page.url();

    await stranger.page.goto(kennelUrl, { waitUntil: 'load' });
    await expectText(stranger.page, 'پرونده کنل پیدا نشد');
    assert.equal(await stranger.page.getByTestId('kennel-status').count(), 0);

    // And the association environment stays closed to a public context.
    await stranger.page.goto(BASE_URL + '/assoc/kennels', { waitUntil: 'load' });
    await expectText(stranger.page, 'دسترسی مجاز نیست');
    await stranger.page.screenshot({ path: path.join(SHOTS, 'kennel-not-yours.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await stranger.context.close();
    await vetContext.close();
  }
});
