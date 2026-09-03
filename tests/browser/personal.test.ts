/**
 * The personal declaration in a real browser — gate `personal-browser`.
 *
 * §20 through the screens: an unpaid declaration between two existing records,
 * an invitation to the owner of the second one, that person signing in with the
 * invited number and answering for themselves, and the whole route staying
 * separate from the official permit. Fixtures are SYNTHETIC and on the reserved
 * 0999 range; the invitation goes to the development outbox, never to a person.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-017');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const OPERATOR_MOBILE = '09990000004';
const RUN = String(randomInt(100_000, 999_999));

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

/** The invitation message itself, as the product's SMS adapter recorded it. */
async function lastInvitationFor(mobile: string): Promise<string | null> {
  return withDb(async (db) => {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} and body like '%توافق شخصی%' order by created_at desc limit 1`,
    );
    return rows.rows[0]?.body ?? null;
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

/** A registered animal with no sheet and no pedigree — §20 needs no more. */
async function registerAnimal(page: Page, name: string): Promise<string> {
  await page.goto(BASE_URL + '/animals/new', { waitUntil: 'load' });
  await page.getByTestId('start-animal-draft').click();
  await page.waitForURL('**/animals/**/edit**');
  const animalId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByTestId('animal-name').fill(name);
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
    page.waitForURL((url) => url.pathname === '/animals/' + animalId),
    page.getByTestId('register-animal').click(),
  ]);
  return animalId;
}

/**
 * A SYNTHETIC microchip on a record, written directly to the database.
 *
 * The clinical path itself belongs to §12 and is covered by its own gate; here
 * the only thing that matters is that the counterparty's animal has a real
 * identifier that already exists in Hamzist.
 */
async function chipAnimal(animalId: string, number: string, boundBy: string): Promise<void> {
  await withDb(async (db) => {
    await db.execute(
      sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id)
          values (${animalId}::uuid, ${number}, 'MANUAL', 'EXISTING_UNREGISTERED', ${boundBy}::uuid)`,
    );
  });
}

async function accountIdOf(mobile: string): Promise<string> {
  return withDb(async (db) => {
    const rows = await db.execute<{ id: string }>(sql`select id from account where mobile = ${mobile} limit 1`);
    assert.ok(rows.rows[0], 'no account for ' + mobile);
    return rows.rows[0]!.id;
  });
}

interface Owner {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly mobile: string;
}

async function newOwner(lastName: string): Promise<Owner> {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  const mobile = newSyntheticMobile();
  const page = await signIn(context, mobile);
  await completeProfile(page, lastName);
  await passKyc(page);
  await payMembership(page);
  return { context, page, mobile };
}

let initiator!: Owner;
let counterparty!: Owner;
let counterpartyChip!: string;
let declarationId!: string;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await withDb(async (db) => {
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
  });
  browser = await chromium.launch();

  const operator = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(operator, OPERATOR_MOBILE);
    operatorState = await operator.storageState();
  } finally {
    await operator.close();
  }

  initiator = await newOwner('مالک آغازکننده');
  counterparty = await newOwner('مالک طرف مقابل');
  const theirAnimal = await registerAnimal(counterparty.page, 'سگ طرف مقابل ' + RUN);
  counterpartyChip = '9' + RUN.padStart(6, '0') + String(9_100_000).padStart(8, '0');
  await chipAnimal(theirAnimal, counterpartyChip, await accountIdOf(counterparty.mobile));
});

after(async () => {
  await initiator?.context.close();
  await counterparty?.context.close();
  await browser?.close();
});

test('a member with no animal record is told exactly what is missing', async () => {
  const owner = await newOwner('مالک بدون حیوان');
  try {
    await owner.page.goto(BASE_URL + '/declaration', { waitUntil: 'load' });
    // §20: the lock names the missing animal record, not a sheet or a pedigree.
    await expectText(owner.page, 'حیوان');
    const body = await owner.page.locator('body').innerText();
    assert.ok(!body.includes('برگه ثبتی'), 'no registration sheet is ever required here');
    assert.ok(!body.includes('شجره‌نامه'), 'no pedigree is ever required here');
    assert.equal(await owner.page.getByTestId('new-declaration').count(), 0);
    await owner.page.screenshot({ path: path.join(SHOTS, 'declaration-locked.png'), fullPage: true });
  } finally {
    await owner.context.close();
  }
});

test('the invitation needs a real record and the owner of that record', async () => {
  const page = initiator.page;
  await registerAnimal(page, 'سگ آغازکننده ' + RUN);

  await page.goto(BASE_URL + '/declaration', { waitUntil: 'load' });
  // Neither animal has a sheet or a pedigree, and the service is open anyway.
  await expectText(page, 'فقط «وجود توافق خارج از هم‌زیست»');
  await expectText(page, 'کارت توله نمی‌سازد و پرداختی ندارد');
  await page.getByTestId('new-declaration').click();
  await page.waitForURL((url) => url.pathname === '/declaration/new');
  await page.screenshot({ path: path.join(SHOTS, 'declaration-new.png'), fullPage: true });

  // A hand-typed animal is refused.
  await page.getByTestId('declaration-own-animal').selectOption({ index: 1 });
  await page.getByTestId('declaration-identifier').fill('سگ همسایه');
  await page.getByTestId('declaration-mobile').fill(counterparty.mobile);
  await page.getByTestId('submit-declaration').click();
  await expectText(page, 'حیوانی با این شناسه در هم‌زیست پیدا نشد');

  // A number that is not the owner of that record is refused, and nothing is sent.
  await page.getByTestId('declaration-own-animal').selectOption({ index: 1 });
  await page.getByTestId('declaration-identifier').fill(counterpartyChip);
  const stranger = newSyntheticMobile();
  await page.getByTestId('declaration-mobile').fill(stranger);
  await page.getByTestId('submit-declaration').click();
  await expectText(page, 'با مالک این حیوان یکی نیست');
  assert.equal(await lastInvitationFor(stranger), null, 'a mismatched invitation is never sent');
  await page.screenshot({ path: path.join(SHOTS, 'declaration-mismatch.png'), fullPage: true });

  // The correct pair opens the case and sends the invitation through the adapter.
  await page.getByTestId('declaration-own-animal').selectOption({ index: 1 });
  await page.getByTestId('declaration-identifier').fill(counterpartyChip);
  await page.getByTestId('declaration-mobile').fill(counterparty.mobile);
  await Promise.all([
    page.waitForURL((url) => /^\/declaration\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 }),
    page.getByTestId('submit-declaration').click(),
  ]);
  declarationId = new URL(page.url()).pathname.split('/')[2]!;
  assert.equal(
    await page.getByTestId('declaration-status').innerText(),
    'در انتظار تأیید طرف مقابل',
  );
  const invitation = await lastInvitationFor(counterparty.mobile);
  assert.ok(invitation?.includes(declarationId), 'the invitation names this case');
  // The initiator never sees the whole number back, only its tail.
  assert.match(await page.getByTestId('declaration-mobile-tail').innerText(), /^••••\d{4}$/);
  await page.screenshot({ path: path.join(SHOTS, 'declaration-pending.png'), fullPage: true });
});

test('the invited person signs in and answers for themselves, with no signing code', async () => {
  // A fresh session for the invited number: the sign-in code of §6 is the only
  // one-time code on this path, and it lands back on the same case.
  const fresh = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await fresh.newPage();
    await page.goto(BASE_URL + '/declaration/' + declarationId, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname.startsWith('/login'));
    await page.getByTestId('mobile-input').fill(counterparty.mobile);
    await page.getByTestId('send-code').click();
    await page.getByTestId('code-input').waitFor();
    await page.getByTestId('code-input').fill(await lastCodeFor(counterparty.mobile));
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login')),
      page.getByTestId('verify-code').click(),
    ]);
    // The pending origin survived the sign-in.
    assert.match(new URL(page.url()).pathname, /^\/declaration\/[0-9a-f-]{36}$/);
    await page.screenshot({ path: path.join(SHOTS, 'declaration-after-login.png'), fullPage: true });

    // Only the existence of the agreement is asked about. The page has no field
    // for a file, a signature, terms or a share — the scope sentence names those
    // as things Hamzist does not store, and no input exists for any of them.
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    assert.equal(await page.locator('textarea').count(), 0);
    for (const forbidden of ['signature', 'terms', 'contract', 'share', 'amount']) {
      assert.equal(
        await page.locator('[data-testid*="' + forbidden + '"], [name*="' + forbidden + '"]').count(),
        0,
        'the page must not have a ' + forbidden + ' field',
      );
    }
    // The only answer it accepts is yes or no about the existence.
    assert.equal(
      await page.getByTestId('respond-declaration-form').locator('input[type="radio"]').count(),
      2,
    );

    await page.getByTestId('declaration-decision-CONFIRM').check();
    await page.getByTestId('submit-declaration-response').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="declaration-status"]')?.textContent?.includes('تأیید شد'),
      undefined,
      { timeout: 20_000 },
    );
    assert.equal(await page.getByTestId('declaration-status').innerText(), 'وجود توافق تأیید شد');
    await page.screenshot({ path: path.join(SHOTS, 'declaration-confirmed.png'), fullPage: true });
  } finally {
    await fresh.close();
  }
});

test('a personal note stays UNVERIFIED and the route opens nothing official', async () => {
  const page = initiator.page;
  await page.goto(BASE_URL + '/declaration/' + declarationId, { waitUntil: 'load' });

  await page.getByTestId('note-kind').selectOption('MATING_DATE');
  await page.getByTestId('note-date').fill(day(-4));
  await page.getByTestId('note-text').fill('ثبت شخصی؛ خارج از جریان رسمی.');
  await page.getByTestId('submit-note').click();
  await page.getByTestId('personal-notes').waitFor();
  await expectText(page, 'UNVERIFIED');
  await expectText(page, 'مبنای رسمی Cooldown و Timeline را تغییر نمی‌دهند');
  await page.screenshot({ path: path.join(SHOTS, 'declaration-note.png'), fullPage: true });

  // §20: this route has no payment, and it opened no official service.
  const body = await page.locator('body').innerText();
  assert.ok(!body.includes('پرداخت هزینه'), 'no payment step exists on this route');
  await page.goto(BASE_URL + '/puppy-cards/checkout', { waitUntil: 'load' });
  await expectText(page, 'مجوز');
  assert.equal(await page.getByTestId('my-cards').count(), 0, 'a declaration issues no card');

  // The official route stays a different service with its own separate entry.
  await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
  const hrefs = await page
    .locator('a')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
  assert.ok(hrefs.includes('/declaration/new'), 'the personal route has its own entry');
  await expectText(page, 'مجوز جفت‌گیری');
  await expectText(page, 'اعلام توافق شخصی جفت‌گیری');
  await page.screenshot({ path: path.join(SHOTS, 'declaration-vs-official.png'), fullPage: true });
});
