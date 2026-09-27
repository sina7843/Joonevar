/**
 * Finder operations in a real browser — PHASE-4 PROMPT-007.
 *
 * Two SYNTHETIC owners with an accepted request (reached through the services;
 * PROMPT-005's own browser test covers that path). The pages take over: a report
 * with private evidence from the request page, the listing moderator taking and
 * deciding it on the queue (the evidence opens for them and for nobody else),
 * the affected owner appealing on their decisions page, and a block that makes
 * the profile vanish for the other person.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { createRequest, respondToRequest } from '../../src/finder/requests.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, clearSyntheticOtp, expectText, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-007');
const FLAGS = ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat'];
const MODERATOR_MOBILE = '09990000011';
const as = (id: string): Actor => ({ accountId: id as AccountId, context: 'USER', activeRoles: [] });
type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let browser!: Browser;
const people: Record<'a' | 'b', { mobile: string; id: string; state: State }> = {} as never;
let moderatorState!: State;
let requestId = '';
let femaleProfile = '';
let evidencePath = '';
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
  evidencePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'hz-ev-')), 'evidence.jpg');
  await fs.writeFile(evidencePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]));
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
  const mod = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(mod, MODERATOR_MOBILE);
    moderatorState = await mod.storageState();
  } finally {
    await mod.close();
  }
  await withDb(async (db) => {
    for (const key of FLAGS) {
      previous.set(key, (await db.execute<{ value: unknown }>(sql`select value from product_setting where key = ${key}`)).rows[0]?.value ?? null);
      await db.execute(sql`update product_setting set value = 'true'::jsonb where key = ${key}`);
    }
    const breed = (await db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' and is_active order by sort_order limit 1`)).rows[0]!.id;
    for (const sex of ['MALE', 'FEMALE']) {
      if (!(await db.execute(sql`select 1 from finder_breed_rule where breed_id = ${breed}::uuid and sex = ${sex} and status = 'PUBLISHED'`)).rows.length) {
        await db.execute(sql`insert into finder_breed_rule (species_code, breed_id, sex, version, min_age_months, max_age_months, cooldown_days, cooldown_months, reason_fa)
          values ('DOG', ${breed}::uuid, ${sex}, 1, 12, 120, ${sex === 'MALE' ? 14 : null}, ${sex === 'FEMALE' ? 6 : null}, 'SYNTHETIC')`);
      }
    }
    const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, status, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('KENNEL', 12, 970, 'ARCHIVED', 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
    const animal: Record<'a' | 'b', string> = { a: '', b: '' };
    for (const key of ['a', 'b'] as const) {
      const id = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${people[key].mobile}`)).rows[0]!.id;
      people[key].id = id;
      await db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
      const sex = key === 'a' ? 'MALE' : 'FEMALE';
      animal[key] = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
        values (${id}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + sex}, ${breed}::uuid, ${sex}, '2023-01-01') returning id`)).rows[0]!.id;
      await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${animal[key]}::uuid, ${'98563' + String(Date.now()).slice(-9) + (key === 'a' ? '1' : '2')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${id}::uuid)`);
      const profile = (await db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${animal[key]}::uuid, ${id}::uuid, 'READY', now()) returning id`)).rows[0]!.id;
      if (key === 'b') femaleProfile = profile;
    }
    await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${people.a.id}::uuid, ${plan}::uuid, 'OWNER', 970, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
    const req = await createRequest(db, as(people.a.id), {
      senderAnimalId: animal.a, receiverProfileId: femaleProfile, route: 'PERSONAL',
      windowFrom: todayCivil(), windowTo: addDays(todayCivil(), 20), cityFa: 'تهران', placeCategory: 'NEUTRAL',
      financialCategory: 'NO_PAYMENT', messageFa: null, specialConditionsFa: null, expiresInDays: null,
    });
    requestId = req.id;
    await respondToRequest(db, as(people.b.id), { requestId, expectedVersion: req.version, accept: true, reasonFa: null });
  });
});

after(async () => {
  await withDb(async (db) => {
    for (const [key, value] of previous) await db.execute(sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb where key = ${key}`);
  }).catch(() => undefined);
  await browser?.close();
});

test('report with evidence, moderator decision, appeal by the affected owner, and a block that hides the profile', async () => {
  const ctxA = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.a.state });
  const ctxB = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: people.b.state });
  const ctxM = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR', storageState: moderatorState });
  try {
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const m = await ctxM.newPage();
    const requestUrl = BASE_URL + '/account/mating-finder/requests/' + requestId;

    // B reports the person, with a private picture as evidence.
    await b.goto(requestUrl, { waitUntil: 'load' });
    await b.getByText('گزارش کاربر مقابل').click();
    await b.getByTestId('finder-report-account-category').selectOption('HARASSMENT');
    await b.getByTestId('finder-report-account-details').fill('SYNTHETIC پیام‌های مزاحم پس از رد');
    await b.locator('[data-testid="finder-report-account-form"] input[type="file"]').setInputFiles(evidencePath);
    await b.getByTestId('finder-report-account-submit').click();
    await expectText(b, 'گزارش شما ثبت شد');

    // The moderator takes it, opens the evidence, and decides with a reason.
    await m.goto(BASE_URL + '/market/finder/reports', { waitUntil: 'load' });
    const card = m.locator('[data-testid^="finder-report-"]', { hasText: 'مزاحمت یا رفتار نامناسب' }).first();
    await card.waitFor();
    const reportId = ((await card.getAttribute('data-testid')) ?? '').replace('finder-report-', '');
    const evidenceHref = await card.getByTestId('finder-evidence-link').first().getAttribute('href');
    const asModerator = await m.request.get(new URL(evidenceHref!, BASE_URL).toString());
    assert.equal(asModerator.status(), 200);
    const asOwner = await a.request.get(new URL(evidenceHref!, BASE_URL).toString());
    assert.equal(asOwner.status(), 404, 'the evidence is not the reported person\'s to see');
    await m.getByTestId('finder-take-' + reportId).click();
    await m.getByTestId('finder-decide-action-' + reportId).waitFor();
    await m.getByTestId('finder-decide-action-' + reportId).selectOption('WARN_ONLY');
    await m.getByTestId('finder-decide-reason-' + reportId).fill('SYNTHETIC تخلف تأیید شد؛ اخطار');
    await m.getByTestId('finder-decide-' + reportId).click();
    await m.getByTestId('finder-decide-' + reportId).waitFor({ state: 'detached' });
    await m.screenshot({ path: path.join(SHOTS, 'report-queue-desktop.png'), fullPage: true });

    // A, the person the decision affected, appeals it.
    await a.goto(BASE_URL + '/account/mating-finder/appeals', { waitUntil: 'load' });
    await a.getByTestId('finder-decision-' + reportId).waitFor();
    await a.getByTestId('finder-appeal-text').fill('SYNTHETIC پیام‌های من مزاحمت نبود');
    await a.getByTestId('finder-appeal-submit').click();
    await a.getByTestId('finder-appeal-status').waitFor();
    assert.match(await a.getByTestId('finder-appeal-status').innerText(), /در حال بررسی/);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    await a.screenshot({ path: path.join(SHOTS, 'appeal-mobile.png'), fullPage: true });

    // B blocks A: the profile vanishes for A exactly like a missing one.
    await b.goto(requestUrl, { waitUntil: 'load' });
    await b.getByTestId('finder-block-person').click();
    await expectText(b, 'مسدود شد');
    const gone = await a.goto(BASE_URL + '/mating-finder/' + femaleProfile, { waitUntil: 'load' });
    assert.equal(gone?.status(), 404);
    await b.goto(BASE_URL + '/account/mating-finder/blocks', { waitUntil: 'load' });
    await b.getByTestId('finder-blocks').waitFor();
    assert.ok(!(await b.getByTestId('finder-blocks').innerText()).includes(people.a.mobile), 'a masked label only');
  } finally {
    await ctxA.close();
    await ctxB.close();
    await ctxM.close();
  }
});
