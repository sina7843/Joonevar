/**
 * Finder, referral codes and check-in in a real browser — gate `finder-browser`.
 *
 * The registry is entered from the superadmin environment, because there is no
 * public veterinarian onboarding in this phase. Everything the test creates is
 * prefixed SYNTHETIC and lives on the reserved 0999 mobile range.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-007');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** SYNTHETIC — 0999 is not an assigned mobile range. */
const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک ' + RUN;
const NEIGHBORHOOD = 'محله آزمایشی ' + RUN;

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
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 600));
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

function contextFor(state: Awaited<ReturnType<BrowserContext['storageState']>> | null, viewport = DESKTOP) {
  return browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });
}

/** Approves whatever KYC case is currently at the top of the association queue. */
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

/** Real payment through the development gateway; no state is written behind the app's back. */
async function payMembership(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
  if ((await page.locator('body').innerText()).includes('عضویت شما فعال است')) return;
  await page.getByTestId('pay-membership').click();
  await page.waitForURL('**/dev/gateway**');
  await page.getByTestId('gateway-pay').click();
  await page.waitForURL('**/membership/return**');
  await expectText(page, 'پرداخت تأیید شد');
}

async function completeProfile(page: Page, lastName: string): Promise<void> {
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

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await withDb(async (db) => {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
    // Locations left by an earlier run must not make the empty Finder
    // unreachable. They are deactivated rather than deleted, because live
    // requests reference them.
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

  // The trusted veterinarian: an already-approved professional who still needs
  // an active membership to be assigned new work (§7.1).
  const vetContext = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await signIn(vetContext, VET_MOBILE);
    await passKyc(page);
    await payMembership(page);
    vetState = await vetContext.storageState();
  } finally {
    await vetContext.close();
  }
});

after(async () => {
  await browser?.close();
});

/** A fresh owner with approved KYC, an active membership and registered animals. */
async function ownerWithAnimals(names: readonly string[]) {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const page = await signIn(context, newSyntheticMobile());
  await completeProfile(page, 'مالک آزمایشی');
  await passKyc(page);
  await payMembership(page);

  const animals: string[] = [];
  for (const name of names) {
    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    await page.getByTestId('start-animal-draft').click();
    await page.waitForURL('**/animals/**/edit**');
    animals.push(new URL(page.url()).pathname.split('/')[2]!);

    await page.getByTestId('animal-name').fill(name);
    await page.getByTestId('animal-breed').selectOption({ index: 1 });
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
    // Wait for the profile itself: `**/animals/**` already matches the edit
    // page, so it would return before the registration had happened and the
    // next navigation would abort the action.
    const animalId = animals[animals.length - 1]!;
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/animals/' + animalId),
      page.getByTestId('register-animal').click(),
    ]);
  }
  return { context, page, animals };
}

/** Walks the approved order: animals and services, then Finder, then review. */
async function createVisit(
  page: Page,
  picks: ReadonlyArray<{ animalId: string; service: 'MICROCHIP_IMPLANT' | 'MICROCHIP_VERIFICATION' }>,
) {
  await page.goto(BASE_URL + '/requests/new?context=MICROCHIP', { waitUntil: 'load' });
  for (const pick of picks) {
    await page.getByTestId('pick-animal-' + pick.animalId).check();
    await page.getByTestId('service-' + pick.animalId + '-' + pick.service).check();
  }
  await Promise.all([page.waitForURL('**/vets**'), page.getByTestId('choose-vet').click()]);
  await page.getByTestId('choose-location').first().click();
  await page.waitForURL('**/requests/new/review**');
  await page.getByTestId('review-items').waitFor();
  // The review page is itself under /requests, so wait for the list route.
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/requests'),
    page.getByTestId('create-visit').click(),
  ]);
}

async function codesOnRequestsPage(page: Page): Promise<readonly string[]> {
  await page.goto(BASE_URL + '/requests', { waitUntil: 'load' });
  await page.getByTestId('request-list').waitFor();
  const hrefs = await page.locator('[data-testid="request-list"] a').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''),
  );
  const codes: string[] = [];
  for (const href of hrefs.filter((h) => h.startsWith('/requests/'))) {
    await page.goto(BASE_URL + href, { waitUntil: 'load' });
    codes.push((await page.getByTestId('referral-code').innerText()).trim());
  }
  return codes;
}

/** One desk attempt: the location is chosen every time, as a person would. */
async function attemptCheckIn(page: Page, code: string): Promise<void> {
  await page.goto(BASE_URL + '/vet/check-in', { waitUntil: 'load' });
  await page.getByTestId('check-in-location').selectOption({ label: LOCATION_NAME });
  await page.getByTestId('check-in-code').fill(code);
  await page.getByTestId('submit-check-in').click();
}

test('the Finder is empty until the superadmin records a licensed location', async () => {
  const owner = await ownerWithAnimals([]);
  try {
    await owner.page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });
    await expectText(owner.page, 'مرکزی با این فیلترها پیدا نشد');
    await owner.page.screenshot({ path: path.join(SHOTS, 'finder-empty.png'), fullPage: true });

    const admin = await contextFor(adminState);
    try {
      const page = await admin.newPage();
      await page.goto(BASE_URL + '/admin/vets', { waitUntil: 'load' });
      await expectText(page, 'این صفحه فرم درخواست معتمدشدن نیست');

      await page.getByTestId('vet-mobile').fill(VET_MOBILE);
      await page.getByTestId('vet-name').fill('SYNTHETIC دامپزشک آزمایشی');
      await page.getByTestId('vet-council-code').fill('SYNTH-VET-BROWSER');
      await page.getByTestId('vet-phone').fill('02100000000');
      await page.getByTestId('save-vet').click();
      await expectText(page, 'پرونده حرفه‌ای دامپزشک ثبت شد');

      await page.getByTestId('add-location-form').waitFor();
      await page.getByTestId('location-vet').selectOption({ index: 1 });
      await page.getByTestId('location-name').fill(LOCATION_NAME);
      await page.getByTestId('location-city').fill('تهران');
      await page.getByTestId('location-neighborhood').fill(NEIGHBORHOOD);
      await page.getByTestId('location-address').fill('نشانی آزمایشی ' + RUN);
      await page.getByTestId('location-phone').fill('02100000000');
      await page.getByTestId('location-licence-number').fill('SYNTH-LIC-' + RUN);

      // A location with only part of the mandatory facilities stays out.
      await page.getByTestId('cap-implant').check();
      await page.getByTestId('location-licence-status').selectOption('VALID');
      await page.getByTestId('add-location').click();
      await expectText(page, 'مرکز ثبت شد');
      await page.screenshot({ path: path.join(SHOTS, 'admin-vet-registry.png'), fullPage: true });
      await expectText(page, 'امکانات اجباری این خدمت در این مرکز کامل نیست');

      await owner.page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });
      await expectText(owner.page, 'مرکزی با این فیلترها پیدا نشد');
      await owner.page.screenshot({ path: path.join(SHOTS, 'finder-partial-capability.png'), fullPage: true });

      // Completing the mandatory facilities is what brings it into Finder.
      await page.goto(BASE_URL + '/admin/vets', { waitUntil: 'load' });
      // The page lists every location of this veterinarian, including ones left
      // by earlier runs, so the form is found by the name it was created with.
      const locationId = await page.evaluate((name) => {
        for (const form of document.querySelectorAll('[data-testid^="edit-location-"]')) {
          const field = form.querySelector('input[name="nameFa"]') as HTMLInputElement | null;
          if (field?.value === name) return (form.getAttribute('data-testid') ?? '').replace('edit-location-', '');
        }
        return '';
      }, LOCATION_NAME);
      assert.notEqual(locationId, '', 'the location just created must be editable here');
      await page.getByTestId('licence-' + locationId).selectOption('VALID');
      await page.getByTestId('cap-blood-' + locationId).check();
      await page.getByTestId('save-location-' + locationId).click();
      await expectText(page, 'اطلاعات مرکز به‌روزرسانی شد');
    } finally {
      await admin.close();
    }

    await owner.page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });
    await owner.page.getByTestId('finder-results').waitFor();
    const body = await owner.page.locator('body').innerText();
    assert.ok(body.includes(LOCATION_NAME));
    assert.ok(body.includes('SYNTH-VET-BROWSER'), 'the council code is shown beside the veterinarian');

    // The approved cost sentence, and a contact CTA rather than a booking.
    assert.equal(
      (await owner.page.getByTestId('finder-price-note').first().textContent())?.trim(),
      'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.',
    );
    assert.ok((await owner.page.getByTestId('finder-contact').count()) > 0);
    // No appointment concept exists anywhere on this screen.
    assert.ok(!/نوبت خالی|زودترین نوبت|تقویم|انتخاب ساعت/.test(body));
    await owner.page.screenshot({ path: path.join(SHOTS, 'finder-results.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('the supported filters narrow the list and a dead end explains how to widen it', async () => {
  const owner = await ownerWithAnimals([]);
  try {
    const { page } = owner;
    await page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });

    await page.getByTestId('finder-term').fill(NEIGHBORHOOD);
    await Promise.all([page.waitForURL('**/vets**'), page.getByTestId('finder-search').click()]);
    await page.getByTestId('finder-results').waitFor();
    assert.ok((await page.locator('body').innerText()).includes(LOCATION_NAME));

    await page.getByTestId('finder-term').fill('عبارتی که وجود ندارد ' + RUN);
    await Promise.all([page.waitForURL('**/vets**'), page.getByTestId('finder-search').click()]);
    await expectText(page, 'مرکزی با این فیلترها پیدا نشد');
    await expectText(page, 'محدوده فاصله را بازتر کنید');
    await page.screenshot({ path: path.join(SHOTS, 'finder-no-results.png'), fullPage: true });

    // The location page keeps the contact route and states the missing map
    // rather than drawing an invented position.
    await page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });
    await page.getByTestId('open-location').first().click();
    await page.waitForURL('**/vets/location/**');
    await expectText(page, LOCATION_NAME);
    assert.equal((await page.getByTestId('location-eligibility').textContent())?.trim(), 'پذیرای میکروچیپ');
    assert.equal(
      (await page.getByTestId('location-price-note').textContent())?.trim(),
      'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.',
    );
    assert.equal(await page.getByTestId('location-contact').count(), 1);
    await expectText(page, 'نمونه‌گیری خون');
    await expectText(page, 'نقشه هنوز در دسترس نیست');
    await page.screenshot({ path: path.join(SHOTS, 'location-detail.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('two animals in one group get two independent codes and deadlines', async () => {
  const owner = await ownerWithAnimals(['سگ اول', 'سگ دوم']);
  try {
    const { page, animals } = owner;
    await createVisit(page, [
      { animalId: animals[0]!, service: 'MICROCHIP_IMPLANT' },
      { animalId: animals[1]!, service: 'MICROCHIP_VERIFICATION' },
    ]);

    await page.goto(BASE_URL + '/requests', { waitUntil: 'load' });
    const listBody = await page.locator('body').innerText();
    assert.ok(listBody.includes('کاشت میکروچیپ'));
    assert.ok(listBody.includes('تأیید میکروچیپ'), 'the service is per animal, not per group');
    await page.screenshot({ path: path.join(SHOTS, 'requests-list.png'), fullPage: true });

    const codes = await codesOnRequestsPage(page);
    assert.equal(codes.length, 2);
    assert.notEqual(codes[0], codes[1], 'each animal has its own code');

    // The deadline shown is the one stored on the code.
    const expiry = await page.getByTestId('referral-expiry').textContent();
    assert.match(expiry ?? '', /[۰-۹]{4}/, 'the Persian date carries a year');
    assert.equal((await page.getByTestId('referral-status').textContent())?.trim(), 'فعال');
    await expectText(page, 'QR و ورود دستی دو نمایش از همین یک کد هستند');
    await page.screenshot({ path: path.join(SHOTS, 'referral-code.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('the desk accepts a typed code once and refuses everything else', async () => {
  const owner = await ownerWithAnimals(['سگ پذیرش']);
  const vet = await contextFor(vetState);
  try {
    await createVisit(owner.page, [{ animalId: owner.animals[0]!, service: 'MICROCHIP_IMPLANT' }]);
    const code = (await codesOnRequestsPage(owner.page))[0]!;

    const page = await vet.newPage();
    await page.goto(BASE_URL + '/vet', { waitUntil: 'load' });
    await page.getByTestId('vet-queue').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'vet-queue.png'), fullPage: true });

    // Before the code is accepted the queue is a work item, not a directory.
    await page.getByTestId('open-vet-request').first().click();
    await page.waitForURL('**/vet/requests/**');
    await expectText(page, 'تا پذیرش کد مراجعه، اطلاعات حیوان و کاربر نمایش داده نمی‌شود');

    await attemptCheckIn(page, 'HZ-NOTAREALCODE');
    await expectText(page, 'این کد مراجعه معتبر نیست');
    await page.screenshot({ path: path.join(SHOTS, 'check-in-invalid.png'), fullPage: true });

    await attemptCheckIn(page, code);
    await expectText(page, 'کد پذیرفته شد');
    await expectText(page, 'نمونه‌گیری خون');
    await page.screenshot({ path: path.join(SHOTS, 'check-in-accepted.png'), fullPage: true });

    // A second desk attempt with the same code is refused.
    await attemptCheckIn(page, code);
    await expectText(page, 'این کد قبلاً استفاده شده است');
    await page.screenshot({ path: path.join(SHOTS, 'check-in-consumed.png'), fullPage: true });

    // The owner sees the accepted state and is notified about it.
    await owner.page.goto(BASE_URL + '/requests', { waitUntil: 'load' });
    await expectText(owner.page, 'پذیرش‌شده');
    await owner.page.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    await expectText(owner.page, 'مراجعه شما ثبت شد');
  } finally {
    await owner.context.close();
    await vet.close();
  }
});

test('correcting the observed service replaces one animal and leaves the other alone', async () => {
  const owner = await ownerWithAnimals(['سگ اصلاح', 'سگ همراه']);
  const vet = await contextFor(vetState);
  try {
    await createVisit(owner.page, [
      { animalId: owner.animals[0]!, service: 'MICROCHIP_IMPLANT' },
      { animalId: owner.animals[1]!, service: 'MICROCHIP_IMPLANT' },
    ]);
    const codes = await codesOnRequestsPage(owner.page);

    const page = await vet.newPage();
    await attemptCheckIn(page, codes[0]!);
    await expectText(page, 'کد پذیرفته شد');
    await page.getByTestId('open-checked-in-request').click();
    await page.waitForURL('**/vet/requests/**');

    await page.getByTestId('correct-service-type').selectOption('MICROCHIP_VERIFICATION');
    await page.getByTestId('correct-reason').fill('حیوان از قبل میکروچیپ داشت.');
    await page.getByTestId('submit-correction').click();
    // The old request is superseded and points at its replacement.
    await expectText(page, 'این درخواست جایگزین شد');
    await expectText(page, 'حیوان از قبل میکروچیپ داشت.');
    await page.screenshot({ path: path.join(SHOTS, 'service-corrected.png'), fullPage: true });

    // The corrected request is a fresh one that still has to be checked in.
    await page.getByTestId('open-replacement-request').click();
    await page.waitForURL('**/vet/requests/**');
    await expectText(page, 'تأیید میکروچیپ');
    await expectText(page, 'تا پذیرش کد مراجعه، اطلاعات حیوان و کاربر نمایش داده نمی‌شود');

    // The superseded request stays visible with its own code marked as replaced,
    // and the other animal of the group is untouched.
    const after = await codesOnRequestsPage(owner.page);
    assert.ok(after.includes(codes[1]!), 'the other animal in the group keeps its code');
    assert.equal(after.length, 3, 'the replacement is an extra request, not an edit of the old one');

    await owner.page.goto(BASE_URL + '/requests', { waitUntil: 'load' });
    await expectText(owner.page, 'جایگزین‌شده');

    await owner.page.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    await expectText(owner.page, 'نوع خدمت این حیوان اصلاح شد');
  } finally {
    await owner.context.close();
    await vet.close();
  }
});

test('an expired code can be replaced, and the old one stays in the record', async () => {
  const owner = await ownerWithAnimals(['سگ تمدید']);
  try {
    const { page } = owner;
    await createVisit(page, [{ animalId: owner.animals[0]!, service: 'MICROCHIP_IMPLANT' }]);
    const code = (await codesOnRequestsPage(page))[0]!;

    // Move the stored deadline into the past; the app is left to notice it.
    await withDb(async (db) => {
      await db.execute(sql`update referral_code set expires_at = now() - interval '1 day' where code = ${code}`);
    });

    await page.reload({ waitUntil: 'load' });
    await expectText(page, 'مهلت این کد گذشته است');
    assert.equal((await page.getByTestId('referral-status').textContent())?.trim(), 'منقضی');
    await page.screenshot({ path: path.join(SHOTS, 'referral-expired.png'), fullPage: true });

    await page.getByTestId('renew-referral').click();
    await expectText(page, 'کد مراجعه جدید صادر شد');
    await page.reload({ waitUntil: 'load' });
    const fresh = (await page.getByTestId('referral-code').innerText()).trim();
    assert.notEqual(fresh, code);
    assert.equal((await page.getByTestId('referral-status').textContent())?.trim(), 'فعال');
    await page.screenshot({ path: path.join(SHOTS, 'referral-renewed.png'), fullPage: true });

    const history = await withDb(async (db) =>
      db.execute<{ status: string }>(
        sql`select status from referral_code where request_id = (select request_id from referral_code where code = ${code})`,
      ),
    );
    assert.equal(history.rows.length, 2, 'the previous code is kept as history');
  } finally {
    await owner.context.close();
  }
});
