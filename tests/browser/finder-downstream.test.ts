/**
 * The personal downstream path in a real browser — PHASE-4 PROMPT-006.
 *
 * The request, acceptance and the OTP-confirmed contract are PROMPT-005's own
 * browser test; here they are reached through the same services with SYNTHETIC
 * data, and the pages take over from the confirmed contract: the consequence
 * screen and its acknowledgement, the personal record, a date proposed by one
 * owner and confirmed by the other, the timeline and the completed request.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import { createRequest, respondToRequest } from '../../src/finder/requests.ts';
import { confirmContract, contractView, requestContractCode, startContract } from '../../src/finder/contracts.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import { BASE_URL, DATABASE_URL, MOBILE, clearSyntheticOtp, expectText, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-006');
const FLAGS = ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts', 'finder.flag.official_handoff', 'finder.flag.personal_handoff'];
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }));
const as = (id: string): Actor => ({ accountId: id as AccountId, context: 'USER', activeRoles: [] });
let browser!: Browser;
const people: Record<'a' | 'b', { mobile: string; id: string; state: Awaited<ReturnType<BrowserContext['storageState']>> }> = {} as never;
let requestId = '';
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
      await completeProfile(await signIn(context, mobile), key === 'a' ? 'نر' : 'ماده');
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
    if (!(await db.execute(sql`select 1 from finder_contract_template where status = 'PUBLISHED'`)).rows.length) {
      const clauses = REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC متن آزمایشی بند ' + REQUIRED_CLAUSE_FA[key] }));
      await db.execute(sql`insert into finder_contract_template (version, title_fa, clauses, reason_fa) values (1, 'SYNTHETIC قالب آزمایشی', ${JSON.stringify(clauses)}::jsonb, 'SYNTHETIC')`);
    }
    const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, status, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('KENNEL', 12, 960, 'ARCHIVED', 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
    const animal: Record<'a' | 'b', string> = { a: '', b: '' };
    let femaleProfile = '';
    for (const key of ['a', 'b'] as const) {
      const id = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${people[key].mobile}`)).rows[0]!.id;
      people[key].id = id;
      await db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
      const sex = key === 'a' ? 'MALE' : 'FEMALE';
      animal[key] = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
        values (${id}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + (key === 'a' ? 'نر' : 'ماده')}, ${breed}::uuid, ${sex}, '2023-01-01') returning id`)).rows[0]!.id;
      await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${animal[key]}::uuid, ${'98562' + String(Date.now()).slice(-9) + (key === 'a' ? '1' : '2')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${id}::uuid)`);
      const profile = (await db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${animal[key]}::uuid, ${id}::uuid, 'READY', now()) returning id`)).rows[0]!.id;
      if (key === 'b') femaleProfile = profile;
    }
    await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${people.a.id}::uuid, ${plan}::uuid, 'OWNER', 960, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);

    // PROMPT-005's path, through its services: request, acceptance, contract, both codes.
    const req = await createRequest(db, as(people.a.id), {
      senderAnimalId: animal.a, receiverProfileId: femaleProfile, route: 'PERSONAL',
      windowFrom: todayCivil(), windowTo: addDays(todayCivil(), 20), cityFa: 'تهران', placeCategory: 'NEUTRAL',
      financialCategory: 'NO_PAYMENT', messageFa: null, specialConditionsFa: null, expiresInDays: null,
    });
    requestId = req.id;
    const accepted = await respondToRequest(db, as(people.b.id), { requestId, expectedVersion: req.version, accept: true, reasonFa: null });
    await startContract(db, as(people.a.id), { requestId, expectedVersion: accepted.version });
    const view = (await contractView(db, as(people.a.id), requestId))!;
    for (const key of ['a', 'b'] as const) {
      const { otpId } = await requestContractCode(db, as(people[key].id), sms, { contractId: view.contract.id, number: view.current.number });
      const code = [...sink].reverse().find((m) => m.to === people[key].mobile)!.text.slice(-6);
      await confirmContract(db, as(people[key].id), {
        contractId: view.contract.id, number: view.current.number, contentHash: view.current.contentHash, otpId, code, ip: null, userAgent: 'browser-fixture',
      });
    }
  });
});

after(async () => {
  await withDb(async (db) => {
    for (const [key, value] of previous) await db.execute(sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb where key = ${key}`);
  }).catch(() => undefined);
  await browser?.close();
});

test('consequence screen, personal record, a date proposed by one owner and confirmed by the other, and the completed request', async () => {
  const ctxA = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.a.state });
  const ctxB = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.b.state });
  try {
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const requestUrl = BASE_URL + '/account/mating-finder/requests/' + requestId;

    await a.goto(requestUrl, { waitUntil: 'load' });
    await a.getByTestId('finder-downstream').waitFor();
    assert.match(await a.getByTestId('finder-consequences').innerText(), /شماره مجوز/);
    // Without the acknowledgement nothing happens.
    await a.getByTestId('finder-handoff').click();
    await expectText(a, 'پیامدهای این مسیر');
    await a.getByTestId('finder-handoff-ack').check();
    await a.getByTestId('finder-handoff').click();
    await a.getByTestId('finder-downstream-status').waitFor();
    await Promise.all([a.waitForURL('**/account/mating-finder/personal/**'), a.getByTestId('finder-downstream-open').click()]);
    const personalUrl = a.url();

    const today = todayCivil();
    await a.getByTestId('mated-on').fill(today);
    await a.getByTestId('submit-date').click();
    await a.getByTestId('awaiting-counterparty').waitFor();

    await b.goto(personalUrl, { waitUntil: 'load' });
    assert.match(await b.getByTestId('pending-date-value').innerText(), new RegExp(today));
    await b.getByTestId('confirm-date').click();
    // The confirm form leaves the page once nothing is pending; the page state is the evidence.
    await expectText(b, 'جفت‌گیری تأییدشده');

    await a.reload({ waitUntil: 'load' });
    assert.match(await a.getByTestId('personal-basis').innerText(), /جفت‌گیری تأییدشده/);
    assert.match(await a.getByTestId('date-status-1').innerText(), /تأییدشده دوطرفه/);
    assert.match(await a.getByTestId('personal-cooldown').innerText(), /فقط هشدار/);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    await a.screenshot({ path: path.join(SHOTS, 'personal-date-confirmed-mobile.png'), fullPage: true });

    await a.goto(requestUrl, { waitUntil: 'load' });
    assert.match(await a.getByTestId('finder-request-status').innerText(), /جفت‌گیری انجام‌شده/);

    const stranger = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
    try {
      const page = await stranger.newPage();
      await page.goto(personalUrl, { waitUntil: 'load' });
      assert.equal(await page.getByTestId('personal-basis').count(), 0, 'nobody else sees the record');
    } finally {
      await stranger.close();
    }
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
