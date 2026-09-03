/**
 * Microchip, sampling and custody at the desk — gate `vet-service-browser`.
 *
 * Everything here is created through the screens a veterinarian actually uses,
 * with the reader integration deliberately unconfigured: manual entry has to
 * carry the whole visit. Fixtures are SYNTHETIC and on the reserved 0999 range.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-008');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OTHER_VET_MOBILE = '09990000007';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';
const GENETICS_MOBILE = '09990000005';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC درمانگاه ' + RUN;
/** SYNTHETIC transponder numbers: 15 digits, outside any issued range. */
const chipNumber = (n: number) => '9' + RUN.padStart(6, '0') + String(n).padStart(8, '0');

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
let otherVetState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
let geneticsState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;

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
  // A fixture that already has a profile lands on the profile page, where the
  // national id is not editable any more; there is nothing to complete there.
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

/** Signs a fixture veterinarian in and gets them ready to accept work. */
async function readyVet(mobile: string, lastName: string) {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  const page = await signIn(context, mobile);
  await completeProfile(page, lastName);
  await passKyc(page);
  await payMembership(page);
  const state = await context.storageState();
  await context.close();
  return state;
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await withDb(async (db) => {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
    await db.execute(sql`update vet_location set is_active = false where name_fa like 'SYNTHETIC%'`);
    // The second fixture veterinarian is not part of the seeded set.
    await db.execute(sql`
      insert into account_role (account_id, role, status, granted_at)
      select id, 'TRUSTED_VET', 'ACTIVE', now() from account where mobile = ${OTHER_VET_MOBILE}
      on conflict do nothing
    `);
  });
  browser = await chromium.launch();

  for (const [mobile, assign] of [
    [OPERATOR_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (operatorState = s)],
    [ADMIN_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (adminState = s)],
    [GENETICS_MOBILE, (s: Awaited<ReturnType<BrowserContext['storageState']>>) => (geneticsState = s)],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      assign(await context.storageState());
    } finally {
      await context.close();
    }
  }

  vetState = await readyVet(VET_MOBILE, 'دامپزشک آزمایشی');
  // The other veterinarian exists only to prove that assignment is real; the
  // account is created by signing in, so the role above may need a second pass.
  otherVetState = await readyVet(OTHER_VET_MOBILE, 'دامپزشک دوم آزمایشی');
  await withDb(async (db) => {
    await db.execute(sql`
      insert into account_role (account_id, role, status, granted_at)
      select id, 'TRUSTED_VET', 'ACTIVE', now() from account where mobile = ${OTHER_VET_MOBILE}
      on conflict do nothing
    `);
  });

  // The registry: an already-approved veterinarian and one licensed location.
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
});

after(async () => {
  await browser?.close();
});

/** An owner with an animal that has a photo, ready to send it to a visit. */
async function ownerWithAnimal(name: string, withPhoto = true) {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const page = await signIn(context, newSyntheticMobile());
  await completeProfile(page, 'مالک آزمایشی');
  await passKyc(page);
  await payMembership(page);

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
  if (withPhoto) {
    await page.getByTestId('animal-photo').setInputFiles({ name: 'dog.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await page.getByTestId('upload-photo').click();
    await expectText(page, 'تصویر حیوان ذخیره شد');
  }
  await page.getByTestId('step-4-continue').click();
  await page.getByTestId('has-microchip-no').waitFor();
  await page.getByTestId('has-microchip-no').check();
  await page.getByTestId('step-5-continue').click();
  await page.getByTestId('register-animal').waitFor();
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/animals/' + animalId),
    page.getByTestId('register-animal').click(),
  ]);

  return { context, page, animalId };
}

/** Creates a microchip visit through the approved screens and returns its code. */
async function bookVisit(
  page: Page,
  animalId: string,
  service: 'MICROCHIP_IMPLANT' | 'MICROCHIP_VERIFICATION',
): Promise<{ code: string; requestId: string }> {
  await page.goto(BASE_URL + '/requests/new?context=MICROCHIP', { waitUntil: 'load' });
  await page.getByTestId('pick-animal-' + animalId).check();
  await page.getByTestId('service-' + animalId + '-' + service).check();
  await Promise.all([page.waitForURL('**/vets**'), page.getByTestId('choose-vet').click()]);
  await page.getByTestId('choose-location').first().click();
  await page.waitForURL('**/requests/new/review**');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/requests'),
    page.getByTestId('create-visit').click(),
  ]);

  const href = await page
    .locator('[data-testid="request-list"] a')
    .evaluateAll((nodes) =>
      nodes
        .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter((h) => h.startsWith('/requests/')),
    );
  const requestId = href[0]!.replace('/requests/', '');
  await page.goto(BASE_URL + '/requests/' + requestId, { waitUntil: 'load' });
  const code = (await page.getByTestId('referral-code').innerText()).trim();
  return { code, requestId };
}

async function checkInAs(page: Page, code: string): Promise<void> {
  await page.goto(BASE_URL + '/vet/check-in', { waitUntil: 'load' });
  await page.getByTestId('check-in-location').selectOption({ label: LOCATION_NAME });
  await page.getByTestId('check-in-code').fill(code);
  await page.getByTestId('submit-check-in').click();
  await expectText(page, 'کد پذیرفته شد');
}

test('the desk shows the animal, the person and the service only after check-in', async () => {
  const owner = await ownerWithAnimal('سگ تصویر');
  const vet = await contextFor(vetState);
  try {
    const { code, requestId } = await bookVisit(owner.page, owner.animalId, 'MICROCHIP_IMPLANT');
    const page = await vet.newPage();

    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    await expectText(page, 'تا پذیرش کد مراجعه، اطلاعات حیوان و کاربر نمایش داده نمی‌شود');
    assert.equal(await page.getByTestId('vet-animal-photo').count(), 0);

    await checkInAs(page, code);
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    assert.equal((await page.getByTestId('vet-animal-name').textContent())?.trim(), 'سگ تصویر');
    assert.match((await page.getByTestId('vet-owner-name').textContent()) ?? '', /نمونه/);
    await expectText(page, 'کاشت میکروچیپ');
    await expectText(page, LOCATION_NAME);

    // The animal's photo is a private file; the assigned veterinarian may see it
    // during the visit and the request for it really returns the image.
    const photo = page.getByTestId('vet-animal-photo');
    await photo.waitFor();
    const src = await photo.getAttribute('src');
    const response = await page.request.get(BASE_URL + src!);
    assert.equal(response.status(), 200);
    await page.screenshot({ path: path.join(SHOTS, 'vet-visit-detail.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vet.close();
  }
});

test('another veterinarian can reach neither the visit nor the animal photo', async () => {
  const owner = await ownerWithAnimal('سگ خصوصی');
  const vet = await contextFor(vetState);
  const other = await contextFor(otherVetState);
  try {
    const { code, requestId } = await bookVisit(owner.page, owner.animalId, 'MICROCHIP_IMPLANT');
    const page = await vet.newPage();
    await checkInAs(page, code);
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    const photoSrc = await page.getByTestId('vet-animal-photo').getAttribute('src');

    const intruder = await other.newPage();
    await intruder.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    await expectText(intruder, 'درخواست مراجعه پیدا نشد');
    assert.equal(await intruder.getByTestId('vet-animal-name').count(), 0);

    // And the file itself is refused, not merely hidden on the page.
    const denied = await intruder.request.get(BASE_URL + photoSrc!);
    assert.equal(denied.status(), 403);
    await intruder.screenshot({ path: path.join(SHOTS, 'vet-not-assigned.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vet.close();
    await other.close();
  }
});

test('manual entry carries the whole implant alongside the keyboard-wedge reader', async () => {
  const owner = await ownerWithAnimal('سگ کاشت');
  const vet = await contextFor(vetState);
  try {
    const { code, requestId } = await bookVisit(owner.page, owner.animalId, 'MICROCHIP_IMPLANT');
    const page = await vet.newPage();
    await checkInAs(page, code);
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });

    // §13: the chip panel appears only once the identity has been certified.
    await certifyIdentity(page);

    // The Bluetooth reader types into the field like a keyboard (DEC-0126), so
    // the page says how it works instead of calling it unconfigured — and manual
    // entry is still one of the four methods, not a workaround.
    await expectText(page, 'ریدر بلوتوث مانند صفحه‌کلید عمل می‌کند');
    const number = chipNumber(1);
    await page.getByTestId('chip-read-method').selectOption('MANUAL');
    await page.getByTestId('chip-read-number').fill(number);
    await page.getByTestId('chip-read-submit').click();
    await expectText(page, 'سریال پیش از کاشت ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'chip-pre-read.png'), fullPage: true });

    // Nothing is bound yet.
    await owner.page.goto(BASE_URL + '/animals/' + owner.animalId, { waitUntil: 'load' });
    assert.equal(await owner.page.getByTestId('official-microchip').count(), 0);

    await page.getByTestId('confirm-implant-submit').click();
    await expectText(page, 'کاشت ثبت شد');

    // A serial that reads differently after the implant is a stop, not a fix.
    await page.getByTestId('chip-reread-number').fill(chipNumber(2));
    await page.getByTestId('chip-reread-submit').click();
    await expectText(page, 'سریال خوانده‌شده با رکورد نمی‌خواند');
    await expectText(page, 'هیچ اتصالی ثبت نشد');
    await page.screenshot({ path: path.join(SHOTS, 'chip-serial-mismatch.png'), fullPage: true });

    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    await page.getByTestId('chip-reread-number').fill(number);
    await page.getByTestId('chip-reread-submit').click();
    // The binding is the confirmation: the page now carries the official number.
    await expectText(page, 'شماره رسمی میکروچیپ');
    assert.match((await page.getByTestId('bound-chip-number').textContent()) ?? '', new RegExp(number));
    await expectText(page, 'این اتصال دائمی است و تعویض یا انتقال ندارد');
    await page.screenshot({ path: path.join(SHOTS, 'chip-bound.png'), fullPage: true });

    // The owner sees the official number on the animal's own record.
    await owner.page.goto(BASE_URL + '/animals/' + owner.animalId, { waitUntil: 'load' });
    assert.match((await owner.page.getByTestId('official-microchip').textContent()) ?? '', new RegExp(number));
    await owner.page.screenshot({ path: path.join(SHOTS, 'animal-official-chip.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vet.close();
  }
});

test('the sample code appears only after the sampling is recorded, and custody follows it', async () => {
  const owner = await ownerWithAnimal('سگ نمونه');
  const vet = await contextFor(vetState);
  const genetics = await contextFor(geneticsState);
  try {
    const { code, requestId } = await bookVisit(owner.page, owner.animalId, 'MICROCHIP_IMPLANT');
    const page = await vet.newPage();
    await checkInAs(page, code);
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });

    // No tracking code exists while the visit is still in progress.
    assert.equal(await page.getByTestId('sample-list').count(), 0);
    await owner.page.goto(BASE_URL + '/requests/' + requestId, { waitUntil: 'load' });
    assert.equal(await owner.page.getByTestId('owner-samples').count(), 0);

    const number = chipNumber(3);
    await certifyIdentity(page);
    await page.getByTestId('chip-read-number').fill(number);
    await page.getByTestId('chip-read-submit').click();
    await expectText(page, 'سریال پیش از کاشت ثبت شد');
    await page.getByTestId('confirm-implant-submit').click();
    await expectText(page, 'کاشت ثبت شد');
    await page.getByTestId('chip-reread-number').fill(number);
    await page.getByTestId('chip-reread-submit').click();
    await expectText(page, 'شماره رسمی میکروچیپ');

    await page.getByTestId('submit-sampling').click();
    await page.getByTestId('sample-list').waitFor();
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    await page.getByTestId('sample-list').waitFor();
    await expectText(page, 'نمونه انقضای خودکار ندارد');
    await page.screenshot({ path: path.join(SHOTS, 'sample-recorded.png'), fullPage: true });

    // The final review lists the source fields and says the signature is paper.
    await page.getByTestId('service-summary').waitFor();
    const summary = await page.getByTestId('service-summary').innerText();
    assert.ok(summary.includes(number), 'the summary carries the microchip number');
    assert.ok(summary.includes('SYNTH-VET-BROWSER'), 'and the veterinary council code');
    assert.ok(summary.includes(LOCATION_NAME));
    await expectText(page, 'هیچ امضای دیجیتالی لازم نیست');
    await page.screenshot({ path: path.join(SHOTS, 'service-summary.png'), fullPage: true });

    // The owner sees the tracking code, stated as a different identifier.
    await owner.page.goto(BASE_URL + '/requests/' + requestId, { waitUntil: 'load' });
    await owner.page.getByTestId('owner-samples').waitFor();
    await expectText(owner.page, 'کد رهگیری نمونه با کد مراجعه یکی نیست');
    await owner.page.screenshot({ path: path.join(SHOTS, 'owner-sample-code.png'), fullPage: true });

    // Custody stays with this veterinarian until the centre asks for it.
    await page.goto(BASE_URL + '/vet/samples', { waitUntil: 'load' });
    await page.getByTestId('custody-list').waitFor();
    await expectText(page, 'تا صدور دستور ارسال از مرکز ژنتیک، نمونه نزد شما می‌ماند');
    assert.equal(await page.getByTestId('shipment-reference').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'custody-list.png'), fullPage: true });

    const centre = await genetics.newPage();
    await centre.goto(BASE_URL + '/genetics/samples', { waitUntil: 'load' });
    await centre.getByTestId('centre-sample-list').waitFor();
    await centre.getByTestId('submit-instruct').first().click();
    await expectText(centre, 'دستور ارسال صادر شد');
    await centre.goto(BASE_URL + '/genetics/samples', { waitUntil: 'load' });
    await centre.screenshot({ path: path.join(SHOTS, 'genetics-instruct.png'), fullPage: true });

    await page.goto(BASE_URL + '/vet/samples', { waitUntil: 'load' });
    await page.getByTestId('shipment-reference').first().fill('پست پیشتاز ' + RUN);
    await page.getByTestId('submit-shipment').first().click();
    await expectText(page, 'ارسال روی همین کد رهگیری ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'sample-shipped.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vet.close();
    await genetics.close();
  }
});

test('resampling issues a new code on the same request and keeps the old one', async () => {
  const owner = await ownerWithAnimal('سگ نمونه‌گیری مجدد');
  const vet = await contextFor(vetState);
  try {
    const { code, requestId } = await bookVisit(owner.page, owner.animalId, 'MICROCHIP_VERIFICATION');
    const page = await vet.newPage();
    await checkInAs(page, code);
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });

    // A physical chip with no record binds only after the checks (§12.3).
    const number = chipNumber(4);
    await certifyIdentity(page);
    await page.getByTestId('chip-read-number').fill(number);
    await page.getByTestId('chip-read-submit').click();
    await expectText(page, 'چیپ فیزیکی بدون رکورد سیستمی');
    await page.getByTestId('bind-existing-submit').click();
    await expectText(page, 'شماره رسمی میکروچیپ');
    assert.match((await page.getByTestId('bound-chip-number').textContent()) ?? '', new RegExp(number));

    await page.getByTestId('submit-sampling').click();
    await page.getByTestId('sample-list').waitFor();
    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    const firstCode = (await page.getByTestId('sample-list').innerText()).match(/SM-[A-Z0-9]+/)![0];

    await page.getByTestId('unusable-status').selectOption('DAMAGED');
    await page.getByTestId('unusable-reason').fill('لوله در انتقال آسیب دید.');
    await page.getByTestId('submit-unusable').click();
    // The sample keeps its code and gains the reason; the resampling step opens.
    await expectText(page, 'خراب');
    await expectText(page, 'لوله در انتقال آسیب دید.');
    await page.screenshot({ path: path.join(SHOTS, 'sample-unusable.png'), fullPage: true });

    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    await expectText(page, 'کاشت دوباره میکروچیپ نیست');
    await page.getByTestId('submit-resample').click();
    await page.waitForTimeout(500);

    await page.goto(BASE_URL + '/vet/requests/' + requestId, { waitUntil: 'load' });
    const list = await page.getByTestId('sample-list').innerText();
    const codes = [...list.matchAll(/SM-[A-Z0-9]+/g)].map((m) => m[0]);
    assert.equal(new Set(codes).size, 2, 'the old code stays beside the new one');
    assert.ok(codes.includes(firstCode));
    assert.ok(list.includes('لوله در انتقال آسیب دید.'));
    await page.screenshot({ path: path.join(SHOTS, 'sample-resampled.png'), fullPage: true });
  } finally {
    await owner.context.close();
    await vet.close();
  }
});
