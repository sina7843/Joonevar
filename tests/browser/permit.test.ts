/**
 * The official mating permit in a real browser — gate `permit-browser`.
 *
 * Two different owners, each with a genuinely pedigreed animal, go through the
 * screens of §16: choose one's own animal, enter the counterparty's pedigree
 * code, resolve, invite, confirm from the other person's own session, record
 * the allocation rule, review, pay, submit, and let the association issue the
 * permit. Fixtures are SYNTHETIC and on the reserved 0999 range; no real tariff
 * or account number is used.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-013');
/** The date screens belong to PROMPT-014, so their evidence is stored there. */
const DATE_SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-014');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const VET_MOBILE = '09990000003';
const OPERATOR_MOBILE = '09990000004';
const GENETICS_MOBILE = '09990000005';
const ADMIN_MOBILE = '09990000006';

const RUN = String(randomInt(100_000, 999_999));
const LOCATION_NAME = 'SYNTHETIC کلینیک مجوز ' + RUN;
const SHEET_FEE = '250000';
const PEDIGREE_FEE = '400000';
const PERMIT_FEE = '300000';
const PERMIT_FEE_FA = '۳۰۰٬۰۰۰ تومان';
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی ' + RUN;
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT-' + RUN;

let chipCounter = 0;
const nextChip = () => '9' + RUN.padStart(6, '0') + String(6_000_000 + (chipCounter += 1)).padStart(8, '0');

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
  // by earlier runs, and approving one of those would prove nothing here.
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

interface Pair {
  readonly first: { context: BrowserContext; page: Page; animalId: string; pedigreeCode: string };
  readonly second: { context: BrowserContext; page: Page; animalId: string; pedigreeCode: string };
}

let pair!: Pair;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await fs.mkdir(DATE_SHOTS, { recursive: true });
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
  await setSetting('fee.pedigree_toman', PEDIGREE_FEE);
  await setSetting('genetics_centre.name', CENTRE_NAME);
  await setSetting('genetics_centre.payment_account', CENTRE_ACCOUNT);
  // The permit tariff starts unset, so the first test can prove that state.
  await setSetting('fee.mating_permit_toman', '');

  const vet = await contextFor(vetState);
  const centre = await contextFor(centreState);
  try {
    const vetPage = await vet.newPage();
    const centrePage = await centre.newPage();
    const first = await newOwner('مالک نر آزمایشی');
    const maleAnimal = await pedigreedAnimal(first.page, vetPage, centrePage, 'سگ نر مجوز', 'MALE');
    const second = await newOwner('مالک ماده آزمایشی');
    const femaleAnimal = await pedigreedAnimal(second.page, vetPage, centrePage, 'سگ ماده مجوز', 'FEMALE');
    pair = {
      first: { context: first.context, page: first.page, ...maleAnimal },
      second: { context: second.context, page: second.page, ...femaleAnimal },
    };
  } finally {
    await vet.close();
    await centre.close();
  }
});

after(async () => {
  await pair?.first.context.close();
  await pair?.second.context.close();
  await browser?.close();
});

test('the permit route resolves the counterparty, and both sides act from their own session', async () => {
  const owner = pair.first.page;
  const other = pair.second.page;

  // The dashboard offers the official route and the personal declaration as two
  // separate services (§16, §20, A-015).
  await owner.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
  const hrefs = await owner
    .locator('a')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
  assert.ok(hrefs.includes('/mating/permits/new'), 'the official route has its own entry');
  assert.ok(hrefs.includes('/declaration/new'), 'the personal declaration stays a separate route');

  await owner.goto(BASE_URL + '/mating/permits/new', { waitUntil: 'load' });
  await owner.getByTestId('own-animal').selectOption({ index: 1 });
  await owner.getByTestId('counterparty-code').fill('PD-NOSUCHCODE');
  await owner.getByTestId('resolve-party').click();
  await expectText(owner, 'پیدا نشد');
  assert.equal(await owner.getByTestId('invite-party').count(), 0, 'nothing is invited by a wrong code');

  await owner.getByTestId('counterparty-code').fill(pair.second.pedigreeCode);
  await owner.getByTestId('resolve-party').click();
  await owner.getByTestId('resolved-party').waitFor();
  assert.match(await owner.getByTestId('resolved-owner').innerText(), /نمونه/);
  await owner.screenshot({ path: path.join(SHOTS, 'permit-resolve.png'), fullPage: true });

  await Promise.all([
    owner.waitForURL((url) => /^\/mating\/permits\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 }),
    owner.getByTestId('invite-party').click(),
  ]);
  const permitId = new URL(owner.url()).pathname.split('/')[3]!;
  assert.equal(await owner.getByTestId('permit-status').innerText(), 'در انتظار تأیید طرف مقابل');
  // The initiator cannot answer on the other side's behalf.
  assert.equal(await owner.getByTestId('confirm-party-form').count(), 0);
  await owner.screenshot({ path: path.join(SHOTS, 'permit-awaiting.png'), fullPage: true });

  // The invitation reaches the resolved owner and resumes into the same case.
  await other.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
  await expectText(other, 'دعوت به مجوز رسمی جفت‌گیری');
  await other.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
  await other.getByTestId('party-decision-ACCEPT').check();
  await other.getByTestId('submit-party-decision').click();
  await expectText(other, 'در انتظار پرداخت');
  await other.screenshot({ path: path.join(SHOTS, 'permit-confirmed.png'), fullPage: true });

  // A third person cannot open the case at all.
  const stranger = await newOwner('مالک بیگانه آزمایشی');
  try {
    await stranger.page.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
    await expectText(stranger.page, 'پیدا نشد');
    await stranger.page.screenshot({ path: path.join(SHOTS, 'permit-stranger.png'), fullPage: true });
  } finally {
    await stranger.context.close();
  }
});

test('the rule, the payment, the submission and the issuance happen in the order §16 sets', async () => {
  const owner = pair.first.page;
  const other = pair.second.page;

  await owner.goto(BASE_URL + '/mating/permits', { waitUntil: 'load' });
  await owner.getByTestId('open-permit').first().click();
  await owner.waitForURL((url) => /^\/mating\/permits\/[0-9a-f-]{36}$/.test(url.pathname));
  const permitId = new URL(owner.url()).pathname.split('/')[3]!;

  // The tariff is not entered yet: the payment path stays closed and no amount
  // is assumed (§22).
  await expectText(owner, 'تعرفه مجوز جفت‌گیری هنوز ثبت نشده است');
  assert.equal(await owner.getByTestId('pay-permit').count(), 0);
  await owner.screenshot({ path: path.join(SHOTS, 'permit-fee-not-configured.png'), fullPage: true });
  await setSetting('fee.mating_permit_toman', PERMIT_FEE);

  // §16 step 5: a percentage rule that does not add up is refused on the screen.
  await owner.reload({ waitUntil: 'load' });
  await owner.getByTestId('rule-type-PERCENTAGE').check();
  await owner.getByTestId('sire-percent').fill('60');
  await owner.getByTestId('dam-percent').fill('60');
  await owner.getByTestId('save-rule').click();
  await expectText(owner, 'مجموع درصد سهم دو طرف باید ۱۰۰ باشد.');

  await owner.getByTestId('rule-type-MIXED').check();
  await owner.getByTestId('sire-fixed').fill('1');
  await owner.getByTestId('dam-fixed').fill('2');
  await owner.getByTestId('sire-percent').fill('40');
  await owner.getByTestId('dam-percent').fill('60');
  await owner.getByTestId('rule-note').fill('توافق آزمایشی اجرای ' + RUN);
  await owner.getByTestId('save-rule').click();
  await owner.getByTestId('permit-rule-summary').waitFor();
  assert.match(await owner.getByTestId('share-SIRE_SIDE').innerText(), /1 توله ثابت و 40٪/);
  // The pre-birth agreement is never presented as ownership of a puppy (§19).
  await expectText(owner, 'مالکیت هیچ توله مشخصی را نهایی نمی‌کند');
  // A warning is never manufactured without a mutually confirmed date (§17.2).
  await expectText(owner, 'تاریخ‌های جفت‌گیری تأییدشده دوطرفه');
  await owner.screenshot({ path: path.join(SHOTS, 'permit-review.png'), fullPage: true });

  // §16 step 7: no submit before the payment.
  assert.equal(await owner.getByTestId('submit-permit').count(), 0);
  await expectText(owner, PERMIT_FEE_FA);
  await owner.getByTestId('pay-permit').click();
  await owner.waitForURL('**/dev/gateway**');
  await owner.getByTestId('gateway-pay').click();
  await owner.waitForURL('**/mating/permits/**/return**');
  await expectText(owner, 'پرداخت تأیید شد');
  await owner.screenshot({ path: path.join(SHOTS, 'permit-paid.png'), fullPage: true });

  // A verified payment opens the submit and nothing else: no permit number yet.
  await owner.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
  assert.equal(await owner.getByTestId('permit-status').innerText(), 'آماده ارسال');
  assert.equal(await owner.getByTestId('permit-no').count(), 0, 'paying is not issuing');
  await owner.getByTestId('submit-permit').click();
  await expectText(owner, 'در حال بررسی');

  // §16 steps 8 and 9: the association decides and the permit is issued.
  const assoc = await contextFor(operatorState);
  try {
    const page = await assoc.newPage();
    await page.goto(BASE_URL + '/assoc/permits', { waitUntil: 'load' });
    // The submitted case really is in the queue; the review then opens exactly
    // that one rather than whichever row happens to be first.
    assert.equal(await page.locator('a[href="/assoc/permits/' + permitId + '"]').count(), 1);
    await page.goto(BASE_URL + '/assoc/permits/' + permitId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('assoc-permit-payment').innerText(), 'تأییدشده روی سرور');
    assert.equal(await page.getByTestId('assoc-party-confirmed').innerText(), 'ثبت شده');
    // Nothing on this screen asks for a pregnancy, a birth, a veterinary
    // confirmation or a signature (§12.5, D13): the decision has exactly the
    // three options §16 allows and no such field exists at all.
    for (const absent of ['pregnancy', 'birth', 'signature', 'vet-confirm']) {
      assert.equal(
        await page.locator('[data-testid*="' + absent + '"]').count(),
        0,
        'the review screen must not ask for ' + absent,
      );
    }
    assert.equal(await page.getByTestId('permit-review-form').locator('input[type="radio"]').count(), 3);
    assert.ok(!(await page.locator('body').innerText()).includes('امضای دیجیتال'));
    await page.screenshot({ path: path.join(SHOTS, 'permit-assoc-review.png'), fullPage: true });

    await page.getByTestId('permit-decision-ISSUED').check();
    await page.getByTestId('submit-permit-review').click();
    await expectText(page, 'این پرونده در صف تصمیم نیست');
    await page.screenshot({ path: path.join(SHOTS, 'permit-issued-assoc.png'), fullPage: true });
  } finally {
    await assoc.close();
  }

  // Both sides see the issued permit and its own number in the same case.
  for (const page of [owner, other]) {
    await page.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('permit-status').innerText(), 'مجوز صادر شد');
    assert.match(await page.getByTestId('permit-no').innerText(), /MP-[A-Z0-9]{8}/);
    await expectText(page, 'پرونده رسمی جفت‌گیری');
  }
  await owner.screenshot({ path: path.join(SHOTS, 'permit-issued-owner.png'), fullPage: true });
});

/**
 * Official dates on the issued permit — §17.1, §17.2.
 *
 * The screens are exercised by both participants in their own sessions: a
 * declaration, a correction that retires the pending approval, a conflict that
 * keeps both values, the confirmation that sets the official basis, and the
 * advisory warning that appears afterwards without ever removing the continue.
 */
test('both sides declare, correct, disagree and confirm a date on the real screens', async () => {
  const owner = pair.first.page;
  const other = pair.second.page;

  await owner.goto(BASE_URL + '/mating/permits', { waitUntil: 'load' });
  await owner.getByTestId('open-permit').first().click();
  await owner.waitForURL((url) => /^\/mating\/permits\/[0-9a-f-]{36}$/.test(url.pathname));
  const permitId = new URL(owner.url()).pathname.split('/')[3]!;

  // The dates page is reachable from the issued case.
  await owner.getByTestId('open-dates').click();
  await owner.waitForURL((url) => url.pathname.endsWith('/dates'));
  await expectText(owner, 'هنوز تاریخ تأییدشده‌ای نیست');
  await expectText(owner, 'تا ثبت چنین تاریخی، هیچ تاریخ فرضی ساخته نمی‌شود');
  await owner.screenshot({ path: path.join(DATE_SHOTS, 'dates-empty.png'), fullPage: true });

  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  // A future date is refused on the screen, with its reason.
  await owner.getByTestId('mated-on').fill(day(1));
  await owner.getByTestId('submit-date').click();
  await expectText(owner, 'نمی‌تواند در آینده باشد');

  await owner.getByTestId('mated-on').fill(day(-6));
  await owner.getByTestId('submit-date').click();
  await owner.getByTestId('date-version-1').waitFor();
  assert.equal(await owner.getByTestId('date-status-1').innerText(), 'در انتظار تأیید طرف مقابل');

  // A correction appends version 2 and retires the pending approval.
  await owner.getByTestId('mated-on-correction').fill(day(-5));
  await owner.getByTestId('submit-date-correction').click();
  await owner.getByTestId('date-version-2').waitFor();
  assert.equal(await owner.getByTestId('date-status-1').innerText(), 'جایگزین‌شده با نسخه جدید');
  await owner.screenshot({ path: path.join(DATE_SHOTS, 'dates-correction.png'), fullPage: true });

  // The other side answers with a different date: both values stay visible.
  await other.goto(BASE_URL + '/mating/permits/' + permitId + '/dates', { waitUntil: 'load' });
  await expectText(other, 'پاسخ شما به نسخه 2');
  await other.getByTestId('toggle-different-date').click();
  await other.getByTestId('different-mated-on').fill(day(-4));
  await other.getByTestId('submit-different-date').click();
  await other.getByTestId('date-version-3').waitFor();
  assert.equal(await other.getByTestId('date-status-2').innerText(), 'مغایرت تاریخ (DATE_CONFLICT)');
  const historyText = await other.getByTestId('date-history').innerText();
  assert.ok(historyText.includes(day(-5)) && historyText.includes(day(-4)), 'both values stay readable');
  await other.screenshot({ path: path.join(DATE_SHOTS, 'dates-conflict.png'), fullPage: true });

  // The first side confirms the counter-proposal; that version becomes the basis.
  await owner.goto(BASE_URL + '/mating/permits/' + permitId + '/dates', { waitUntil: 'load' });
  await expectText(owner, 'پاسخ شما به نسخه 3');
  await owner.getByTestId('confirm-date').click();
  await owner.getByTestId('basis-marker').waitFor();
  assert.equal(await owner.getByTestId('date-status-3').innerText(), 'تأییدشده دوطرفه');

  // §17.2: the warning now appears, says so plainly, and blocks nothing.
  await expectText(owner, 'این هشدار مانع ادامه مسیر نیست');
  assert.equal(await owner.getByTestId('cooldown-warning').count(), 1);
  assert.equal(await owner.getByTestId('submit-date').count(), 1, 'the continue action stays available');
  await owner.screenshot({ path: path.join(DATE_SHOTS, 'dates-confirmed-warning.png'), fullPage: true });

  // The same warning at the permit entry, and the animal file carries the date.
  await owner.goto(BASE_URL + '/mating/permits/' + permitId, { waitUntil: 'load' });
  assert.equal(await owner.getByTestId('cooldown-warning').count(), 1);
  await owner.goto(BASE_URL + '/animals/' + pair.first.animalId, { waitUntil: 'load' });
  await expectText(owner, 'تاریخ‌های جفت‌گیری');
  assert.ok((await owner.getByTestId('animal-mating-dates').innerText()).includes(day(-4)));
  await owner.screenshot({ path: path.join(DATE_SHOTS, 'animal-mating-dates.png'), fullPage: true });
});
