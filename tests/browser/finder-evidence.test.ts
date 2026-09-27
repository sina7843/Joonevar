/**
 * Phase 4 evidence — PHASE-4 PROMPT-008.
 *
 * Bounded measurements over the finder's pages, not a certification:
 *  - every owner-facing finder page at 360 px has no horizontal scroll, exactly
 *    one main landmark, a skip link as the first tab stop and a name on every
 *    visible control; the operator pages are checked for landmarks and names;
 *  - the compatibility disclosure is on the public profile and in match mode;
 *  - the confirmed contract PDF is an A4 document with embedded fonts and a
 *    small page count (readability is judged by structure, not by a reader);
 *  - discovery over a representative population answers within a loose
 *    budget, and the timings are printed for the report.
 * The population is SYNTHETIC; accessibility, legal and load certification
 * are explicitly out of scope.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import { SCORE_DISCLAIMER_FA } from '../../src/finder/compatibility.ts';
import { createRequest, respondToRequest } from '../../src/finder/requests.ts';
import { confirmContract, contractView, requestContractCode, startContract } from '../../src/finder/contracts.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, clearSyntheticOtp, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
const FLAGS = ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts'];
const POPULATION = 120;
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }));
const as = (id: string): Actor => ({ accountId: id as AccountId, context: 'USER', activeRoles: [] });
let browser!: Browser;
let ownerState!: State;
let adminState!: State;
let ownerAnimal = '';
let femaleProfile = '';
/** A public profile of the subscribed population; the contract pair is matched and not listed. */
let publicProfileId = '';
let requestId = '';
let contractId = '';
const previous = new Map<string, unknown>();
const timings: Array<{ path: string; ms: number; kb: number }> = [];

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

async function completeProfile(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
  if ((await page.getByTestId('national-id').count()) === 0) return;
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill('سنجش');
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی سنجش');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
}

before(async () => {
  await clearSyntheticOtp();
  browser = await chromium.launch();
  const mobiles = { a: newSyntheticMobile(), b: newSyntheticMobile() };
  for (const key of ['a', 'b'] as const) {
    const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
    try {
      await completeProfile(await signIn(context, mobiles[key]));
      if (key === 'a') ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  }
  const admin = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(admin, '09990000006');
    adminState = await admin.storageState();
  } finally {
    await admin.close();
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
    if (!(await db.execute(sql`select 1 from finder_contract_template where status = 'PUBLISHED'`)).rows.length) {
      const clauses = REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC متن آزمایشی بند ' + REQUIRED_CLAUSE_FA[key] }));
      await db.execute(sql`insert into finder_contract_template (version, title_fa, clauses, reason_fa) values (1, 'SYNTHETIC قالب آزمایشی', ${JSON.stringify(clauses)}::jsonb, 'SYNTHETIC')`);
    }
    const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, status, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('KENNEL', 12, 980, 'ARCHIVED', 'SYNTHETIC', 1000, 500, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
    const subscribe = (id: string) =>
      db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
        values (${id}::uuid, ${plan}::uuid, 'OWNER', 980, 12, 500, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
    const dog = async (owner: string, sex: 'MALE' | 'FEMALE', n: number) => {
      const animal = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
        values (${owner}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC سنجش ' + n}, ${breed}::uuid, ${sex}, '2022-06-01') returning id`)).rows[0]!.id;
      await db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${animal}::uuid, ${'98564' + String(Date.now()).slice(-7) + String(n).padStart(3, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${owner}::uuid)`);
      const profile = (await db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${animal}::uuid, ${owner}::uuid, 'READY', now() - (${n} || ' minutes')::interval) returning id`)).rows[0]!.id;
      return { animal, profile };
    };
    const ids: Record<'a' | 'b', string> = { a: '', b: '' };
    for (const key of ['a', 'b'] as const) {
      ids[key] = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${mobiles[key]}`)).rows[0]!.id;
      await db.execute(sql`insert into kyc_case (account_id, status) values (${ids[key]}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
    }
    await subscribe(ids.a);
    const male = await dog(ids.a, 'MALE', 0);
    const female = await dog(ids.b, 'FEMALE', 1);
    ownerAnimal = male.animal;
    femaleProfile = female.profile;
    // The representative population: one subscribed kennel-sized owner.
    const [bulk] = (await db.execute<{ id: string }>(sql`insert into account (mobile, status) values (${'0999' + String(Date.now()).slice(-7)}, 'ACTIVE') returning id`)).rows;
    await subscribe(bulk!.id);
    for (let n = 2; n < POPULATION; n += 1) {
      const d = await dog(bulk!.id, n % 2 === 0 ? 'FEMALE' : 'MALE', n);
      if (n === 2) publicProfileId = d.profile;
    }

    // A confirmed contract, through the services, for the PDF.
    const req = await createRequest(db, as(ids.a), {
      senderAnimalId: male.animal, receiverProfileId: female.profile, route: 'PERSONAL',
      windowFrom: todayCivil(), windowTo: addDays(todayCivil(), 20), cityFa: 'تهران', placeCategory: 'NEUTRAL',
      financialCategory: 'NO_PAYMENT', messageFa: null, specialConditionsFa: null, expiresInDays: null,
    });
    requestId = req.id;
    const accepted = await respondToRequest(db, as(ids.b), { requestId, expectedVersion: req.version, accept: true, reasonFa: null });
    await startContract(db, as(ids.a), { requestId, expectedVersion: accepted.version });
    const view = (await contractView(db, as(ids.a), requestId))!;
    contractId = view.contract.id;
    for (const key of ['a', 'b'] as const) {
      const { otpId } = await requestContractCode(db, as(ids[key]), sms, { contractId, number: view.current.number });
      const code = [...sink].reverse().find((m) => m.to === mobiles[key])!.text.slice(-6);
      await confirmContract(db, as(ids[key]), { contractId, number: view.current.number, contentHash: view.current.contentHash, otpId, code, ip: null, userAgent: 'evidence' });
    }
  });
});

after(async () => {
  await withDb(async (db) => {
    for (const [key, value] of previous) await db.execute(sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb where key = ${key}`);
  }).catch(() => undefined);
  await browser?.close();
  if (timings.length > 0) console.log('finder response evidence: ' + timings.map((t) => t.path + ' ' + t.ms + 'ms ' + t.kb + 'KB').join(' | '));
});

async function audit(state: State | null, pathname: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });
  try {
    const page = await context.newPage();
    const started = Date.now();
    const response = await page.goto(BASE_URL + pathname, { waitUntil: 'load' });
    const body = await response!.body();
    timings.push({ path: pathname.split('?')[0]!.replace(/[0-9a-f-]{36}/g, ':id') + (pathname.includes('?') ? '?…' : ''), ms: Date.now() - started, kb: Math.round(body.length / 1024) });
    assert.equal(response!.status(), 200, pathname);
    const facts = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('input, select, textarea')].filter((node) => {
        const input = node as HTMLInputElement;
        return input.type !== 'hidden' && input.offsetParent !== null;
      }) as HTMLElement[];
      const unnamed = controls
        .filter((input) => {
          const id = input.getAttribute('id');
          const label = id ? document.querySelector('label[for="' + id + '"]') : null;
          return !(label?.textContent?.trim() || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.closest('label')?.textContent?.trim());
        })
        .map((input) => input.getAttribute('name') ?? input.tagName);
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mains: document.querySelectorAll('main').length,
        dir: document.documentElement.getAttribute('dir'),
        unnamed,
        text: document.body.innerText,
      };
    });
    await page.keyboard.press('Tab');
    const firstStop = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('href') ?? '');
    return { ...facts, firstStop, page, context };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test('every owner-facing finder page holds at 360 px, with one main landmark, a skip link first and a name on every control', async () => {
  const pages: Array<[State | null, string]> = [
    [null, '/mating-finder'],
    [null, '/mating-finder/' + publicProfileId],
    [ownerState, '/mating-finder?for=' + ownerAnimal],
    [ownerState, '/account/mating-finder/profiles'],
    [ownerState, '/account/mating-finder/requests'],
    [ownerState, '/account/mating-finder/requests/' + requestId],
    [ownerState, '/account/mating-finder/blocks'],
    [ownerState, '/account/mating-finder/appeals'],
    [ownerState, '/account/mating-finder/favorites'],
    [ownerState, '/account/mating-finder/saved-searches'],
  ];
  for (const [state, pathname] of pages) {
    const result = await audit(state, pathname, MOBILE);
    try {
      assert.ok(result.overflow <= 0, pathname + ' scrolls sideways by ' + result.overflow + 'px');
      assert.equal(result.mains, 1, pathname + ' has one main landmark');
      assert.equal(result.dir, 'rtl', pathname + ' is right-to-left');
      assert.equal(result.firstStop, '#main', pathname + ': the first tab stop is the skip link');
      assert.deepEqual(result.unnamed, [], pathname + ' has unnamed controls');
    } finally {
      await result.context.close();
    }
  }
});

test('the operator finder pages are labelled and landmarked', async () => {
  for (const pathname of ['/market/finder', '/market/finder/reports', '/market/finder/feedback', '/market/finder/sanctions', '/admin/mating-finder']) {
    const result = await audit(adminState, pathname, DESKTOP);
    try {
      assert.equal(result.mains, 1, pathname);
      assert.deepEqual(result.unnamed, [], pathname + ' has unnamed controls');
    } finally {
      await result.context.close();
    }
  }
});

test('the compatibility disclosure is shown wherever a score is', async () => {
  for (const pathname of ['/mating-finder/' + publicProfileId, '/mating-finder?for=' + ownerAnimal]) {
    const result = await audit(pathname.includes('for=') ? ownerState : null, pathname, MOBILE);
    try {
      assert.ok(result.text.includes('تضمین') && (pathname.includes('for=') ? result.text.includes(SCORE_DISCLAIMER_FA) : true), pathname + ' discloses what the score is not');
    } finally {
      await result.context.close();
    }
  }
});

test('the contract PDF is an A4 document with embedded fonts and a few pages', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: ownerState });
  try {
    const response = await context.request.get(BASE_URL + '/api/finder/contracts/' + contractId + '/pdf');
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    const text = bytes.toString('latin1');
    assert.equal(text.slice(0, 4), '%PDF');
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.ok(pages >= 1 && pages <= 6, 'pages=' + pages);
    assert.match(text, /\/FontFile2|\/FontFile3/, 'the fonts are embedded, so Persian renders the same everywhere');
    assert.match(text, /\/MediaBox\s*\[\s*0\s+0\s+595(\.\d+)?\s+841(\.\d+)?|\/MediaBox\s*\[\s*0\s+0\s+595(\.\d+)?\s+842/, 'A4 pages');
    assert.ok(bytes.length < 2_000_000, 'size ' + bytes.length);
    console.log('contract pdf evidence: ' + pages + ' page(s), ' + Math.round(bytes.length / 1024) + 'KB');
  } finally {
    await context.close();
  }
});

test('discovery over a representative population answers within a loose budget', async () => {
  for (const [state, pathname] of [
    [null, '/mating-finder'],
    [ownerState, '/mating-finder?sex=FEMALE'],
    [ownerState, '/mating-finder?for=' + ownerAnimal],
  ] as const) {
    const result = await audit(state, pathname, DESKTOP);
    await result.context.close();
  }
  for (const entry of timings) assert.ok(entry.ms < 10_000, entry.path + ' took ' + entry.ms + 'ms');
});
