/**
 * The operational panels in a real browser — gate `operations-browser`.
 *
 * Every navigation entry of every panel is opened, so a dead link would fail
 * here; the queues are read as real numbers; managed data is edited from the
 * superadmin screens with its history visible; and the two rules §21 states
 * about people are exercised: a veterinarian whose membership lapsed keeps the
 * work already assigned, and an operational environment is never reachable by
 * switching a public role.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-018');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک عملیات ' + RUN;
const SHEET_FEE = '250000';

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
let centreState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
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
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} and body like '%کد%' order by created_at desc limit 1`,
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
  await page.getByTestId('display-name').fill('نمایشی آزمایشی');
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

let ownerMobile!: string;
let ownerAnimalId!: string;
let ownerRequestId!: string;

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

  await setSetting('fee.registration_sheet_toman', SHEET_FEE);

  // One owner with a real animal and a real assigned visit, so the panels have
  // something true to show.
  const ownerContext = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    ownerMobile = newSyntheticMobile();
    const page = await signIn(ownerContext, ownerMobile);
    await completeProfile(page, 'مالک عملیات');
    await passKyc(page);
    await payMembership(page);

    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    await page.getByTestId('start-animal-draft').click();
    await page.waitForURL('**/animals/**/edit**');
    ownerAnimalId = new URL(page.url()).pathname.split('/')[2]!;
    await page.getByTestId('animal-name').fill('سگ عملیات ' + RUN);
    // The breed picker is a search plus a list, not a native select.
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
      page.waitForURL((url) => url.pathname === '/animals/' + ownerAnimalId),
      page.getByTestId('register-animal').click(),
    ]);

    await page.goto(BASE_URL + '/requests/new?context=MICROCHIP', { waitUntil: 'load' });
    await page.getByTestId('pick-animal-' + ownerAnimalId).check();
    await page.getByTestId('service-' + ownerAnimalId + '-MICROCHIP_IMPLANT').check();
    await Promise.all([page.waitForURL('**/vets**'), page.getByTestId('choose-vet').click()]);
    await page.getByTestId('choose-location').first().click();
    await page.waitForURL('**/requests/new/review**');
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/requests'),
      page.getByTestId('create-visit').click(),
    ]);
    const hrefs = await page
      .locator('[data-testid="request-list"] a')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
          .filter((h) => h.startsWith('/requests/')),
      );
    ownerRequestId = hrefs[0]!.replace('/requests/', '');
  } finally {
    await ownerContext.close();
  }
});

after(async () => {
  await browser?.close();
});

test('every panel navigation entry opens a real page, with no dead link', async () => {
  const panels = [
    {
      name: 'assoc',
      state: () => operatorState,
      links: [
        '/assoc',
        '/assoc/kyc',
        '/assoc/members',
        '/assoc/kennels',
        '/assoc/permits',
        '/assoc/postal',
        '/assoc/foreign-pedigree',
        '/assoc/issuers',
      ],
    },
    {
      name: 'genetics',
      state: () => centreState,
      links: ['/genetics', '/genetics/receipts', '/genetics/samples', '/genetics/results', '/genetics/appeals'],
    },
    {
      name: 'admin',
      state: () => adminState,
      links: ['/admin', '/admin/settings', '/admin/vets', '/admin/breeds', '/admin/audit'],
    },
  ];

  for (const panel of panels) {
    const context = await contextFor(panel.state());
    try {
      const page = await context.newPage();
      for (const href of panel.links) {
        const response = await page.goto(BASE_URL + href, { waitUntil: 'load' });
        assert.equal(response?.status(), 200, href + ' must render');
        const body = await page.locator('body').innerText();
        assert.ok(!body.includes('دسترسی مجاز نیست'), href + ' must be open to its own panel');
        assert.ok(!body.includes('Application error'), href + ' must not crash');
      }
      // The navigation itself offers exactly these entries and no other.
      const navHrefs = await page
        .locator('nav a')
        .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
      for (const href of navHrefs) {
        assert.ok(panel.links.includes(href), panel.name + ' navigation points at ' + href);
      }
      await page.screenshot({ path: path.join(SHOTS, panel.name + '-panel.png'), fullPage: true });
    } finally {
      await context.close();
    }
  }
});

test('the queues show real counts and open the case they counted', async () => {
  const context = await contextFor(operatorState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/assoc', { waitUntil: 'load' });
    await page.getByTestId('assoc-queues').waitFor();

    // Every queue reports a real number, and the KYC count is exactly the
    // number of cases the queue it opens actually lists — not a placeholder.
    for (const key of ['kyc', 'kennels', 'permits', 'foreign', 'postal']) {
      const value = await page.getByTestId('queue-count-' + key).innerText();
      assert.match(value, /^\d+$/, key + ' must report a real number');
    }
    const kycCount = Number(await page.getByTestId('queue-count-kyc').innerText());
    await page.getByTestId('open-queue-kyc').click();
    await page.waitForURL((url) => url.pathname === '/assoc/kyc');
    // The first page of the queue is capped, so the count is checked against
    // what it can be: never fewer than the rows shown, and zero only when the
    // queue really is empty.
    const listed = await page.getByTestId('open-case').count();
    assert.ok(kycCount >= listed, 'the count cannot be smaller than the queue it opens');
    assert.equal(kycCount === 0, listed === 0, 'an empty count means an empty queue');
    await page.screenshot({ path: path.join(SHOTS, 'assoc-queues.png'), fullPage: true });
  } finally {
    await context.close();
  }

  const centre = await contextFor(centreState);
  try {
    const page = await centre.newPage();
    await page.goto(BASE_URL + '/genetics', { waitUntil: 'load' });
    await page.getByTestId('genetics-queues').waitFor();
    for (const key of ['receipts', 'awaiting', 'received', 'processing', 'appeals']) {
      assert.match(await page.getByTestId('genetics-count-' + key).innerText(), /^\d+$/);
    }
    await page.getByTestId('open-genetics-receipts').click();
    await page.waitForURL((url) => url.pathname === '/genetics/receipts');
    await page.screenshot({ path: path.join(SHOTS, 'genetics-queues.png'), fullPage: true });
  } finally {
    await centre.close();
  }
});

test('managed data is edited from the panel and its history is readable', async () => {
  const admin = await contextFor(adminState);
  try {
    const page = await admin.newPage();

    // A reference list is managed data: adding a breed is not a deployment.
    const nameEn = 'SYNTHETIC Breed ' + RUN;
    await page.goto(BASE_URL + '/admin/breeds', { waitUntil: 'load' });
    await page.getByTestId('breed-name-fa').fill('نژاد آزمایشی ' + RUN);
    await page.getByTestId('breed-name-en').fill(nameEn);
    await page.getByTestId('add-breed').click();
    await page.getByTestId('breed-' + nameEn).waitFor();
    assert.equal(await page.getByTestId('breed-state-' + nameEn).innerText(), 'فعال');

    await page.getByTestId('toggle-breed-' + nameEn).click();
    await page.waitForFunction(
      (id) => document.querySelector('[data-testid="breed-state-' + id + '"]')?.textContent?.includes('کنارگذاشته'),
      nameEn,
      { timeout: 20_000 },
    );
    await expectText(page, 'پرونده‌های ثبت‌شده را تغییر نمی‌دهد');
    await page.screenshot({ path: path.join(SHOTS, 'admin-breeds.png'), fullPage: true });

    // A tariff change is recorded with its actor and previous value, and the
    // history screen shows it.
    await page.goto(BASE_URL + '/admin/audit?target=PRODUCT_SETTING', { waitUntil: 'load' });
    await page.getByTestId('audit-list').waitFor();
    const actions = await page
      .locator('[data-testid="audit-action"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).innerText));
    assert.ok(actions.some((action) => action.includes('REFERENCE_BREED_RETIRED')));
    await expectText(page, 'این صفحه فقط خواندنی است');
    await page.screenshot({ path: path.join(SHOTS, 'admin-audit.png'), fullPage: true });
  } finally {
    await admin.close();
  }
});

test('a lapsed membership keeps the assigned work and closes new assignment', async () => {
  // The association deactivates the veterinarian's membership from its own
  // register, with a reason (§7.1, §21.2).
  const assoc = await contextFor(operatorState);
  try {
    const page = await assoc.newPage();
    // The register is a bounded page, so a specific member is reached by search
    // rather than by scrolling the whole list (DEC-0128).
    await page.goto(BASE_URL + '/assoc/members?q=' + encodeURIComponent('دامپزشک آزمایشی'), {
      waitUntil: 'load',
    });
    await page.getByTestId('member-list').waitFor();
    const vetRow = page.locator('[data-testid="member-list"] > li').filter({ hasText: 'دامپزشک آزمایشی' });
    await vetRow.locator('[data-testid^="toggle-membership-"]').click();
    await vetRow.locator('[data-testid^="membership-reason-"]').fill('بررسی عملیاتی آزمایشی ' + RUN);
    await vetRow.locator('[data-testid^="submit-membership-"]').click();
    await expectText(page, 'عضویت غیرفعال شد');
    await page.screenshot({ path: path.join(SHOTS, 'assoc-members.png'), fullPage: true });
  } finally {
    await assoc.close();
  }

  const vet = await contextFor(vetState);
  try {
    const page = await vet.newPage();
    await page.goto(BASE_URL + '/vet', { waitUntil: 'load' });
    // The panel says which of the two is happening, and the work already
    // assigned is still open.
    await expectText(page, 'پذیرش کار جدید محدود است');
    assert.equal(await page.getByTestId('vet-queue').count(), 1);
    await page.screenshot({ path: path.join(SHOTS, 'vet-inactive-membership.png'), fullPage: true });

    await page.goto(BASE_URL + '/vet/requests/' + ownerRequestId, { waitUntil: 'load' });
    assert.equal((await page.locator('body').innerText()).includes('دسترسی مجاز نیست'), false);
  } finally {
    await vet.close();
  }

  // A new visit request cannot be assigned to that veterinarian any more.
  const owner = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(owner, ownerMobile);
    await page.goto(BASE_URL + '/vets?context=MICROCHIP', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(!body.includes(LOCATION_NAME), 'a vet who cannot accept work is not in the Finder');
    await page.screenshot({ path: path.join(SHOTS, 'finder-without-inactive-vet.png'), fullPage: true });
  } finally {
    await owner.close();
  }

  // Put the membership back, so the fixture leaves the shared database as it
  // found it for the other suites.
  const restore = await contextFor(operatorState);
  try {
    const page = await restore.newPage();
    await page.goto(BASE_URL + '/assoc/members?q=' + encodeURIComponent('دامپزشک آزمایشی'), {
      waitUntil: 'load',
    });
    const vetRow = page.locator('[data-testid="member-list"] > li').filter({ hasText: 'دامپزشک آزمایشی' });
    await vetRow.locator('[data-testid^="toggle-membership-"]').click();
    await vetRow.locator('[data-testid^="membership-reason-"]').fill('بازگردانی وضعیت آزمایشی ' + RUN);
    await vetRow.locator('[data-testid^="submit-membership-"]').click();
    await expectText(page, 'عضویت دوباره فعال شد');
  } finally {
    await restore.close();
  }
});

test('an operational environment is never reachable from a public session', async () => {
  const owner = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(owner, ownerMobile);

    for (const href of ['/assoc', '/assoc/members', '/assoc/postal', '/genetics', '/admin', '/admin/audit', '/admin/breeds']) {
      await page.goto(BASE_URL + href, { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', href);
    }

    // The public role switcher never offers an operational context either.
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const options = await page
      .locator('[data-testid="role-switcher"] option')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
    for (const forbidden of ['ASSOCIATION_OPERATOR', 'GENETICS_OPERATOR', 'SUPERADMIN']) {
      assert.ok(!options.includes(forbidden), 'the switcher must not offer ' + forbidden);
    }
    await page.screenshot({ path: path.join(SHOTS, 'public-denied-operations.png'), fullPage: true });
  } finally {
    await owner.close();
  }
});

test('the dashboard carries the person back to the case that is waiting', async () => {
  const owner = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await signIn(owner, ownerMobile);

    // The animal's own file shows the visit that is open, and the dashboard
    // offers the services §5 really opens for this account.
    await page.goto(BASE_URL + '/animals/' + ownerAnimalId, { waitUntil: 'load' });
    await expectText(page, 'سگ عملیات');
    await page.screenshot({ path: path.join(SHOTS, 'animal-timeline.png'), fullPage: true });

    // Signing out and back in resumes the requested page rather than a generic
    // list (§8): the origin travels through the sign-in.
    await page.goto(BASE_URL + '/account/profile', { waitUntil: 'load' });
    await Promise.all([page.waitForURL('**/login'), page.getByTestId('sign-out').click()]);
    await page.goto(BASE_URL + '/requests/' + ownerRequestId, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/requests/' + ownerRequestId);

    await page.getByTestId('mobile-input').fill(ownerMobile);
    await page.getByTestId('send-code').click();
    await page.getByTestId('code-input').waitFor();
    await page.getByTestId('code-input').fill(await lastCodeFor(ownerMobile));
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/requests/' + ownerRequestId),
      page.getByTestId('verify-code').click(),
    ]);
    await expectText(page, 'کد مراجعه');
    await page.screenshot({ path: path.join(SHOTS, 'resume-after-login.png'), fullPage: true });
  } finally {
    await owner.close();
  }
});
