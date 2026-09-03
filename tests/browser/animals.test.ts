/**
 * Animal registration, lineage and foreign pedigree in a real browser.
 *
 * Runs the approved six-step form end to end against the built application,
 * then the internal G1+ route, the missing-parent detour and the foreign
 * pedigree review, so the rules are exercised through the screens people
 * actually use rather than only through the services.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-006');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

/** Pedigree codes are unique for all time, so each run needs its own. */
const RUN = String(randomInt(100_000, 999_999));
const code = (name: string): string => 'HZ-BR-' + name + '-' + RUN;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);

/** SYNTHETIC: 0999 is not an assigned mobile range. */
const newSyntheticMobile = () => '0999' + String(randomInt(1_000_000, 9_999_999));

/** SYNTHETIC national ids start at 900000000, outside the issued range. */
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

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
    // Synthetic issuers from an earlier run must not make the empty-registry
    // screen unreachable. They are kept (cases reference them) but deactivated.
    await db.execute(sql`update pedigree_issuer set is_active = false where name like 'SYNTHETIC%'`);
  } finally {
    await pool.end();
  }
  browser = await chromium.launch();

  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, '09990000004');
    operatorState = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
});

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
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 500));
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

async function operatorPage(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: DESKTOP,
    locale: 'fa-IR',
    storageState: operatorState ?? undefined,
  });
  return { context, page: await context.newPage() };
}

/** A fresh owner account with approved KYC and no membership at all. */
async function approvedOwner(): Promise<{ context: BrowserContext; page: Page; mobile: string }> {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const mobile = newSyntheticMobile();
  const page = await signIn(context, mobile);

  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill('مالک آزمایشی');
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی آزمایشی');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

  await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });
  await page.getByTestId('kyc-file').setInputFiles({ name: 'card.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await page.getByTestId('upload-kyc').click();
  await expectText(page, 'تصویر کارت ملی بارگذاری شد');
  await page.getByTestId('submit-kyc').click();
  await expectText(page, 'پرونده شما در حال بررسی است');

  const ops = await operatorPage();
  try {
    await ops.page.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
    await ops.page.getByTestId('open-case').first().click();
    await ops.page.getByTestId('review-form').waitFor();
    await ops.page.getByTestId('decision-APPROVED').check();
    await ops.page.getByTestId('submit-review').click();
    await expectText(ops.page, 'این پرونده در انتظار بررسی نیست');
  } finally {
    await ops.context.close();
  }

  return { context, page, mobile };
}

/** Walks the six approved steps and registers the animal. */
async function registerAnimalThroughForm(
  page: Page,
  input: { name: string; sex?: 'MALE' | 'FEMALE'; microchip?: string | null },
): Promise<string> {
  await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await page.getByTestId('start-animal-draft').click();
  await page.waitForURL('**/animals/**/edit**');
  const animalId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByTestId('animal-name').fill(input.name);
  // The breed picker is a search plus a list, not a native select.
  await page.getByTestId('animal-breed-list').locator('button').first().click();
  await page.getByTestId('step-1-continue').click();

  await page.getByTestId('sex-' + (input.sex ?? 'MALE')).waitFor();
  await page.getByTestId('sex-' + (input.sex ?? 'MALE')).check();
  await page.getByTestId('animal-birth-date').fill('2022-03-15');
  await page.getByTestId('step-2-continue').click();

  await page.getByTestId('animal-color').waitFor();
  await page.getByTestId('animal-color').fill('قهوه‌ای');
  await page.getByTestId('animal-markings').fill('لکه سفید روی سینه');
  await page.getByTestId('step-3-continue').click();

  await page.getByTestId('step-4-continue').waitFor();
  await page.getByTestId('step-4-continue').click();

  await page.getByTestId('has-microchip-no').waitFor();
  if (input.microchip) {
    await page.getByTestId('has-microchip-yes').check();
    await page.getByTestId('declared-microchip').fill(input.microchip);
  } else {
    await page.getByTestId('has-microchip-no').check();
  }
  await page.getByTestId('step-5-continue').click();

  await page.getByTestId('register-animal').waitFor();
  await Promise.all([page.waitForURL('**/animals/**'), page.getByTestId('register-animal').click()]);
  return animalId;
}

/** SYNTHETIC pedigree code: issuance belongs to a later prompt. */
async function seedPedigreeCode(animalId: string, code: string, generation: number): Promise<void> {
  await withDb(async (db) => {
    await db.execute(
      sql`update animal set pedigree_code = ${code}, generation = ${generation} where id = ${animalId}::uuid`,
    );
  });
}

test('an owner with approved KYC registers a G0 animal without membership or an address', async () => {
  const owner = await approvedOwner();
  try {
    const { page } = owner;

    // Nothing about membership is required to get here.
    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    await expectText(page, 'برای ثبت حیوان، عضویت انجمن لازم نیست');
    await page.screenshot({ path: path.join(SHOTS, 'animal-new-entry.png'), fullPage: true });

    const animalId = await registerAnimalThroughForm(page, { name: 'سگ نمونه', microchip: '985141000000001' });

    await page.goto(BASE_URL + '/animals/' + animalId, { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('سگ نمونه'), body.slice(0, 600));
    assert.equal(await page.getByTestId('animal-generation').textContent(), 'G0');
    assert.equal(await page.getByTestId('animal-origin').textContent(), 'بدون اسناد هویتی');
    // An initial record is not a registration sheet, a Pet ID or a pedigree.
    assert.match((await page.getByTestId('pet-id').textContent()) ?? '', /تا صدور برگه ثبتی/);
    // The declared chip number is recorded but explicitly not official yet.
    assert.ok(body.includes('میکروچیپ اعلامی'));
    assert.ok(body.includes('تا اسکن و تأیید دامپزشک معتمد رسمی نیست'));
    await page.screenshot({ path: path.join(SHOTS, 'animal-profile-g0.png'), fullPage: true });

    // Membership is still inactive, and it never came up.
    await page.goto(BASE_URL + '/membership', { waitUntil: 'load' });
    assert.ok(!(await page.locator('body').innerText()).includes('عضویت شما فعال است'));
  } finally {
    await owner.context.close();
  }
});

test('an account without approved KYC is refused the registration route', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const mobile = newSyntheticMobile();
    const page = await signIn(context, mobile);
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('بدون احراز');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1991-01-01');
    await page.getByTestId('display-name').fill('نمایشی آزمایشی');
    await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);

    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('start-animal-draft').count(), 0);
    await expectText(page, 'برای ثبت حیوان هم‌زیست، احراز هویت لازم است');
    await page.screenshot({ path: path.join(SHOTS, 'animal-new-locked.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('G1+ computes the generation from resolved parents and never offers to set it', async () => {
  const owner = await approvedOwner();
  try {
    const { page } = owner;

    const sireId = await registerAnimalThroughForm(page, { name: 'پدر نمونه' });
    const damId = await registerAnimalThroughForm(page, { name: 'مادر نمونه', sex: 'FEMALE' });
    // SYNTHETIC codes: pedigree issuance is built in a later prompt.
    await seedPedigreeCode(sireId, code('SIRE'), 0);
    await seedPedigreeCode(damId, code('DAM'), 0);

    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    await page.getByTestId('start-animal-draft').click();
    await page.waitForURL('**/animals/**/edit**');
    const childId = new URL(page.url()).pathname.split('/')[2]!;

    await page.getByTestId('animal-name').fill('فرزند نمونه');
    // The breed picker is a search plus a list, not a native select.
    await page.getByTestId('animal-breed-list').locator('button').first().click();
    await page.getByTestId('step-1-continue').click();
    await page.getByTestId('sex-MALE').waitFor();
    await page.getByTestId('sex-MALE').check();
    await page.getByTestId('animal-birth-date').fill('2023-04-04');
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

    await page.getByTestId('origin-INTERNAL_G1PLUS').waitFor();
    await page.getByTestId('origin-INTERNAL_G1PLUS').check();
    // The origin choice saves itself; there is no separate button.
    await page.getByTestId('sire-pedigree-code').waitFor();

    // There is no generation input anywhere on the form (§9.3).
    assert.equal(await page.locator('input[name="generation"], select[name="generation"]').count(), 0);

    await page.getByTestId('sire-pedigree-code').fill(code('SIRE'));
    await page.getByTestId('dam-pedigree-code').fill(code('DAM'));
    await page.getByTestId('resolve-lineage').click();
    await expectText(page, 'نسل از رکورد والدین محاسبه شد');
    await page.screenshot({ path: path.join(SHOTS, 'lineage-computed.png'), fullPage: true });

    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('computed-generation').textContent(), 'G1');

    await Promise.all([page.waitForURL('**/animals/**'), page.getByTestId('register-animal').click()]);
    await page.goto(BASE_URL + '/animals/' + childId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('animal-generation').textContent(), 'G1');
    assert.equal(await page.getByTestId('animal-origin').textContent(), 'نسب ثبت‌شده در هم‌زیست');
    assert.match((await page.getByTestId('family-sire').textContent()) ?? '', /پدر نمونه/);
    assert.match((await page.getByTestId('family-dam').textContent()) ?? '', /مادر نمونه/);
    await page.screenshot({ path: path.join(SHOTS, 'animal-profile-g1.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('a missing parent gives G0 with a CTA, and the return rematches the same animal', async () => {
  const owner = await approvedOwner();
  try {
    const { page } = owner;

    const sireId = await registerAnimalThroughForm(page, { name: 'پدر موجود' });
    await seedPedigreeCode(sireId, code('P2'), 1);

    await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
    await page.getByTestId('start-animal-draft').click();
    await page.waitForURL('**/animals/**/edit**');
    const childId = new URL(page.url()).pathname.split('/')[2]!;

    await page.getByTestId('animal-name').fill('فرزند بی‌مادر');
    // The breed picker is a search plus a list, not a native select.
    await page.getByTestId('animal-breed-list').locator('button').first().click();
    await page.getByTestId('step-1-continue').click();
    await page.getByTestId('sex-MALE').waitFor();
    await page.getByTestId('sex-MALE').check();
    await page.getByTestId('animal-birth-date').fill('2023-08-08');
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

    await page.getByTestId('origin-INTERNAL_G1PLUS').waitFor();
    await page.getByTestId('origin-INTERNAL_G1PLUS').check();
    // The origin choice saves itself; there is no separate button.
    await page.getByTestId('sire-pedigree-code').waitFor();
    await page.getByTestId('sire-pedigree-code').fill(code('P2'));
    await page.getByTestId('dam-pedigree-code').fill(code('NOBODY'));
    await page.getByTestId('resolve-lineage').click();

    await expectText(page, 'فعلاً این حیوان G0 ثبت می‌شود');
    await page.screenshot({ path: path.join(SHOTS, 'lineage-parent-missing.png'), fullPage: true });

    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('computed-generation').textContent(), 'G0');
    // The typed codes survived.
    assert.equal(await page.getByTestId('sire-pedigree-code').inputValue(), code('P2'));
    assert.equal(await page.getByTestId('dam-pedigree-code').inputValue(), code('NOBODY'));

    // Leaving to register the missing parent opens a different draft.
    await Promise.all([
      page.waitForURL('**/edit?parentOf=' + childId),
      page.getByTestId('register-missing-parent').click(),
    ]);
    const parentDraftId = new URL(page.url()).pathname.split('/')[2]!;
    assert.notEqual(parentDraftId, childId, 'the detour must not reuse the child draft');
    await expectText(page, 'ثبت والد گمشده');
    await page.screenshot({ path: path.join(SHOTS, 'register-missing-parent.png'), fullPage: true });

    await page.getByTestId('animal-name').fill('مادر تازه');
    // The breed picker is a search plus a list, not a native select.
    await page.getByTestId('animal-breed-list').locator('button').first().click();
    await page.getByTestId('step-1-continue').click();
    await page.getByTestId('sex-FEMALE').waitFor();
    await page.getByTestId('sex-FEMALE').check();
    await page.getByTestId('animal-birth-date').fill('2020-02-02');
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
    await Promise.all([page.waitForURL('**/animals/**'), page.getByTestId('register-animal').click()]);
    await seedPedigreeCode(parentDraftId, code('NOBODY'), 3);

    // Back on the child, the rematch updates the same record.
    await page.goto(BASE_URL + '/animals/' + childId + '/edit', { waitUntil: 'load' });
    await page.getByTestId('resolve-lineage').waitFor();
    await page.getByTestId('resolve-lineage').click();
    await expectText(page, 'نسل از رکورد والدین محاسبه شد');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('computed-generation').textContent(), 'G2');

    // No duplicate child was created.
    await page.goto(BASE_URL + '/animals', { waitUntil: 'load' });
    const names = await page.locator('body').innerText();
    assert.equal(names.split('فرزند بی‌مادر').length - 1, 1);
  } finally {
    await owner.context.close();
  }
});

test('the foreign pedigree route runs through the association and writes a read-only generation', async () => {
  const owner = await approvedOwner();
  const ops = await operatorPage();
  try {
    const { page } = owner;
    const animalId = await registerAnimalThroughForm(page, { name: 'دارای مدرک خارجی' });

    // With an empty registry the owner cannot even choose an issuer.
    await page.goto(BASE_URL + '/animals/' + animalId + '/foreign-pedigree', { waitUntil: 'load' });
    await expectText(page, 'فهرست صادرکنندگان موردتأیید هنوز تکمیل نشده است');
    await page.screenshot({ path: path.join(SHOTS, 'foreign-no-issuers.png'), fullPage: true });

    // The association enters a real issuer. SYNTHETIC name for the test only.
    const issuerName = 'SYNTHETIC — صادرکننده آزمایشی ' + randomInt(1000, 9999);
    await ops.page.goto(BASE_URL + '/assoc/issuers', { waitUntil: 'load' });
    await ops.page.getByTestId('issuer-name').fill(issuerName);
    await ops.page.getByTestId('issuer-country').fill('IR');
    await ops.page.getByTestId('add-issuer').click();
    await expectText(ops.page, 'صادرکننده به فهرست موردتأیید اضافه شد');
    await ops.page.screenshot({ path: path.join(SHOTS, 'assoc-issuers.png'), fullPage: true });

    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('foreign-issuer').selectOption({ label: issuerName });
    await page.getByTestId('foreign-document-code').fill('FP-BR-' + RUN);
    await page.getByTestId('save-foreign-details').click();
    await expectText(page, 'اطلاعات مدرک ذخیره شد');

    // Front and back are two independent uploads.
    await page.getByTestId('foreign-front-file').setInputFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await page.getByTestId('upload-foreign-front').click();
    await expectText(page, 'تصویر روی برگه بارگذاری شد');
    await page.getByTestId('foreign-back-file').setInputFiles({ name: 'back.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByTestId('upload-foreign-back').click();
    await expectText(page, 'تصویر پشت برگه بارگذاری شد');
    await page.screenshot({ path: path.join(SHOTS, 'foreign-uploads.png'), fullPage: true });

    await page.getByTestId('submit-foreign').click();
    await expectText(page, 'پرونده شما در صف بررسی انجمن است');

    // The association sends it back for correction, with a reason.
    await ops.page.goto(BASE_URL + '/assoc/foreign-pedigree', { waitUntil: 'load' });
    await expectText(ops.page, 'دارای مدرک خارجی');
    await ops.page.getByTestId('open-foreign-case').first().click();
    await ops.page.getByTestId('foreign-review-form').waitFor();
    assert.equal(await ops.page.getByTestId('case-issuer').textContent(), issuerName);
    await ops.page.getByTestId('foreign-decision-NEEDS_CORRECTION').check();
    await ops.page.getByTestId('foreign-review-reason').fill('تصویر پشت برگه خوانا نیست.');
    await ops.page.getByTestId('submit-foreign-review').click();
    await expectText(ops.page, 'این پرونده در انتظار بررسی نیست');
    await ops.page.screenshot({ path: path.join(SHOTS, 'assoc-foreign-review.png'), fullPage: true });

    // The owner sees the reason and keeps both files.
    await page.reload({ waitUntil: 'load' });
    await expectText(page, 'تصویر پشت برگه خوانا نیست');
    assert.ok((await page.locator('body').innerText()).includes('فایل قبلی شما حفظ شده است'));
    await page.screenshot({ path: path.join(SHOTS, 'foreign-needs-correction.png'), fullPage: true });

    await page.getByTestId('submit-foreign').click();
    await expectText(page, 'پرونده شما در صف بررسی انجمن است');

    // Approving writes the generation read from the document.
    await ops.page.goto(BASE_URL + '/assoc/foreign-pedigree', { waitUntil: 'load' });
    await ops.page.getByTestId('open-foreign-case').first().click();
    await ops.page.getByTestId('foreign-decision-APPROVED').check();
    await ops.page.getByTestId('extracted-generation-input').fill('3');
    await ops.page.getByTestId('submit-foreign-review').click();
    await expectText(ops.page, 'این پرونده در انتظار بررسی نیست');

    await page.goto(BASE_URL + '/animals/' + animalId, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('animal-generation').textContent(), 'G3');
    assert.equal(await page.getByTestId('animal-origin').textContent(), 'Export Pedigree');
    await page.screenshot({ path: path.join(SHOTS, 'animal-profile-foreign.png'), fullPage: true });

    // And the owner was notified, back into the same case.
    await page.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    await expectText(page, 'Export Pedigree شما تأیید شد');
  } finally {
    await owner.context.close();
    await ops.context.close();
  }
});

test('one owner cannot open another owner animal or its documents', async () => {
  const first = await approvedOwner();
  const second = await approvedOwner();
  try {
    const animalId = await registerAnimalThroughForm(first.page, { name: 'خصوصی' });

    await second.page.goto(BASE_URL + '/animals/' + animalId, { waitUntil: 'load' });
    await expectText(second.page, 'پرونده حیوان پیدا نشد');

    await second.page.goto(BASE_URL + '/animals/' + animalId + '/edit', { waitUntil: 'load' });
    await expectText(second.page, 'پرونده حیوان پیدا نشد');
  } finally {
    await first.context.close();
    await second.context.close();
  }
});
