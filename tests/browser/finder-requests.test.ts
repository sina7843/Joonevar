/**
 * Request, conversation and contract in a real browser — PHASE-4 PROMPT-005.
 *
 * Two synthetic owners do the whole path through the pages: a request from the
 * public profile, acceptance, a message whose phone number is masked, the
 * contract, a one-time code for each side read from the development SMS
 * outbox, confirmation of the same version, and the stored PDF. KYC, chips and
 * the subscription are SYNTHETIC rows; their own suites cover them.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import { BASE_URL, DATABASE_URL, MOBILE, clearSyntheticOtp, expectText, lastCodeFor, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-005');
const FLAGS = ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts'];
let browser!: Browser;
const people: Record<'a' | 'b', { mobile: string; id: string; state: Awaited<ReturnType<BrowserContext['storageState']>> }> = {} as never;
let femaleProfile = '';
const previous = new Map<string, unknown>();

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

async function completeProfile(page: Page, last: string): Promise<void> {
  await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
  if ((await page.getByTestId('national-id').count()) === 0) return;
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill(last);
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی ' + last);
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  browser = await chromium.launch();
  for (const key of ['a', 'b'] as const) {
    const mobile = newSyntheticMobile();
    const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
    try {
      await completeProfile(await signIn(context, mobile), key === 'a' ? 'فرستنده' : 'گیرنده');
      people[key] = { mobile, id: '', state: await context.storageState() };
    } finally {
      await context.close();
    }
  }
  await withDb(async (db) => {
    for (const key of FLAGS) {
      previous.set(key, (await db.execute<{ value: unknown }>(sql`select value from product_setting where key = ${key}`)).rows[0]?.value ?? null);
      await db.execute(sql`update product_setting set value = 'true'::jsonb where key = ${key}`);
    }
    const breed = (await db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' and is_active order by sort_order limit 1`)).rows[0]!.id;
    for (const sex of ['MALE', 'FEMALE']) {
      const exists = (await db.execute(sql`select 1 from finder_breed_rule where breed_id = ${breed}::uuid and sex = ${sex} and status = 'PUBLISHED'`)).rows.length;
      if (!exists) {
        await db.execute(sql`insert into finder_breed_rule (species_code, breed_id, sex, version, min_age_months, max_age_months, cooldown_days, cooldown_months, reason_fa)
          values ('DOG', ${breed}::uuid, ${sex}, 1, 12, 120, ${sex === 'MALE' ? 14 : null}, ${sex === 'FEMALE' ? 6 : null}, 'SYNTHETIC')`);
      }
    }
    const hasTemplate = (await db.execute(sql`select 1 from finder_contract_template where status = 'PUBLISHED'`)).rows.length;
    if (!hasTemplate) {
      const clauses = REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC متن آزمایشی بند ' + REQUIRED_CLAUSE_FA[key] }));
      await db.execute(sql`insert into finder_contract_template (version, title_fa, clauses, reason_fa) values (1, 'SYNTHETIC قالب آزمایشی', ${JSON.stringify(clauses)}::jsonb, 'SYNTHETIC')`);
    }
    const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, status, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('KENNEL', 12, 950, 'ARCHIVED', 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
    for (const key of ['a', 'b'] as const) {
      const id = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${people[key].mobile}`)).rows[0]!.id;
      people[key].id = id;
      await db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
      await db.execute(sql`insert into residence (account_id, province, city, address) values (${id}::uuid, 'تهران', 'تهران', 'SYNTHETIC نشانی مخفی') on conflict (account_id) do nothing`);
      const sex = key === 'a' ? 'MALE' : 'FEMALE';
      const animal = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
        values (${id}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + (key === 'a' ? 'نر' : 'ماده')}, ${breed}::uuid, ${sex}, '2023-01-01') returning id`)).rows[0]!.id;
      await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${animal}::uuid, ${'98522' + String(Date.now()).slice(-10)}, 'MANUAL', 'EXISTING_UNREGISTERED', ${id}::uuid)`);
      const profile = (await db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${animal}::uuid, ${id}::uuid, 'READY', now()) returning id`)).rows[0]!.id;
      if (key === 'b') femaleProfile = profile;
    }
    await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${people.a.id}::uuid, ${plan}::uuid, 'OWNER', 950, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
  });
});

after(async () => {
  await withDb(async (db) => {
    for (const [key, value] of previous) await db.execute(sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb where key = ${key}`);
  }).catch(() => undefined);
  await browser?.close();
});

test('request, acceptance, a masked message, a two-sided contract confirmed with one-time codes, and its PDF', async () => {
  const ctxA = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.a.state });
  const ctxB = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.b.state });
  try {
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const today = new Date();
    const d = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10);

    await a.goto(BASE_URL + '/mating-finder/' + femaleProfile, { waitUntil: 'load' });
    await a.getByTestId('finder-request-form').waitFor();
    await a.getByTestId('req-sender').selectOption({ index: 1 });
    await a.getByTestId('req-from').fill(d(5));
    await a.getByTestId('req-to').fill(d(20));
    await a.getByTestId('req-city').fill('تهران');
    await a.getByTestId('req-message').fill('SYNTHETIC سلام، برای جفت‌گیری آماده‌ایم');
    await Promise.all([a.waitForURL('**/account/mating-finder/requests/**'), a.getByTestId('req-submit').click()]);
    const requestUrl = a.url();
    assert.match(await a.getByTestId('finder-request-status').innerText(), /در انتظار بررسی/);

    await b.goto(requestUrl, { waitUntil: 'load' });
    await b.getByTestId('finder-accept').click();
    await b.getByTestId('finder-message-form').waitFor();
    await b.getByTestId('finder-message-body').fill('شماره من ۰۹۱۲۱۲۳۴۵۶۷ است');
    await b.getByTestId('finder-message-send').click();
    await expectText(b, 'پنهان شد');

    await a.reload({ waitUntil: 'load' });
    const messages = await a.getByTestId('finder-messages').innerText();
    assert.ok(!messages.includes('۰۹۱۲۱۲۳۴۵۶۷') && !messages.includes('09121234567'), 'the phone number is masked before the contract');
    await a.getByTestId('finder-start-contract').click();
    await a.getByTestId('finder-contract-confirm').waitFor();
    await expectText(a, 'تأیید دوطرفه با کد یک‌بارمصرف');

    for (const [page, mobile] of [[a, people.a.mobile], [b, people.b.mobile]] as const) {
      await page.reload({ waitUntil: 'load' });
      await page.getByTestId('finder-contract-code').click();
      await page.getByTestId('finder-contract-otp').waitFor();
      await page.getByTestId('finder-contract-otp').fill(await lastCodeFor(mobile));
      await page.getByTestId('finder-contract-approve').click();
      await expectText(page, 'تأیید شما: بله');
    }
    await a.reload({ waitUntil: 'load' });
    assert.match(await a.getByTestId('finder-request-status').innerText(), /قرارداد تأییدشده/);
    assert.match(await a.getByTestId('finder-contact-hidden').innerText(), /پنهان/);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    await a.screenshot({ path: path.join(SHOTS, 'contract-confirmed-mobile.png'), fullPage: true });

    const pdf = await a.request.get(new URL(await a.getByTestId('finder-contract-pdf').getAttribute('href') ?? '', BASE_URL).toString());
    assert.equal(pdf.status(), 200);
    assert.equal(pdf.headers()['content-type'], 'application/pdf');
    assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');

    const stranger = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
    try {
      const page = await stranger.newPage();
      const response = await page.request.get(new URL(await a.getByTestId('finder-contract-pdf').getAttribute('href') ?? '', BASE_URL).toString());
      assert.notEqual(response.status(), 200, 'nobody else gets the PDF');
    } finally {
      await stranger.close();
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
