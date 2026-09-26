/**
 * Mating discovery in a real browser — PHASE-4 PROMPT-004.
 *
 * The population is SYNTHETIC rows. What the browser proves: the closed switch
 * says so, the GET filter form works without scripts, match mode shows its
 * explanation and disclaimer, the empty state speaks, every control has a
 * name, the layout holds at 360 px, and favourites and saved searches work.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import { BASE_URL, DATABASE_URL, MOBILE, clearSyntheticOtp, expectText, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-004');
let browser!: Browser;
let viewerState: Awaited<ReturnType<BrowserContext['storageState']>>;
let myAnimal = '';
let breedId = '';
const previous = new Map<string, unknown>();
const FLAGS = ['finder.flag.discovery', 'finder.flag.free_pool_visibility'];

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
  await page.getByTestId('last-name').fill('جست‌وجو');
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی آزمایشی');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  browser = await chromium.launch();
  const mobile = newSyntheticMobile();
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    await completeProfile(await signIn(context, mobile));
    viewerState = await context.storageState();
  } finally {
    await context.close();
  }
  await withDb(async (db) => {
    for (const key of FLAGS) previous.set(key, (await db.execute<{ value: unknown }>(sql`select value from product_setting where key = ${key}`)).rows[0]?.value ?? null);
    const viewer = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${mobile}`)).rows[0]!.id;
    breedId = (await db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' and is_active order by sort_order limit 1`)).rows[0]!.id;
    for (const sex of ['MALE', 'FEMALE']) {
      const exists = (await db.execute(sql`select 1 from finder_breed_rule where breed_id = ${breedId}::uuid and sex = ${sex} and status = 'PUBLISHED'`)).rows.length;
      if (!exists) {
        await db.execute(sql`insert into finder_breed_rule (species_code, breed_id, sex, version, min_age_months, max_age_months, cooldown_days, cooldown_months, reason_fa)
          values ('DOG', ${breedId}::uuid, ${sex}, 1, 12, 120, ${sex === 'MALE' ? 14 : null}, ${sex === 'FEMALE' ? 6 : null}, 'SYNTHETIC')`);
      }
    }
    const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, status, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('KENNEL', 12, 900, 'ARCHIVED', 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
    const owner = (await db.execute<{ id: string }>(sql`insert into account (mobile, status) values (${newSyntheticMobile()}, 'ACTIVE') returning id`)).rows[0]!.id;
    await db.execute(sql`insert into residence (account_id, province, city) values (${owner}::uuid, 'تهران', 'تهران')`);
    await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${owner}::uuid, ${plan}::uuid, 'OWNER', 900, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
    for (let i = 0; i < 3; i += 1) {
      const a = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
        values (${owner}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ماده ' + i}, ${breedId}::uuid, 'FEMALE', '2023-03-01') returning id`)).rows[0]!.id;
      await db.execute(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${a}::uuid, ${owner}::uuid, 'READY', now())`);
    }
    myAnimal = (await db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
      values (${viewer}::uuid, 'REGISTERED', 'DOG', 'SYNTHETIC نر من', ${breedId}::uuid, 'MALE', '2022-06-01') returning id`)).rows[0]!.id;
    await db.execute(sql`update product_setting set value = 'false'::jsonb where key = 'finder.flag.discovery'`);
  });
});

after(async () => {
  await withDb(async (db) => {
    for (const [key, value] of previous) await db.execute(sql`update product_setting set value = ${value === null ? null : JSON.stringify(value)}::jsonb where key = ${key}`);
  }).catch(() => undefined);
  await browser?.close();
});

test('a closed search says so; an open one filters by GET, explains matches and holds at 360 px', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: viewerState });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/mating-finder', { waitUntil: 'load' });
    await page.getByTestId('finder-search-closed').waitFor();
    await withDb((db) => db.execute(sql`update product_setting set value = 'true'::jsonb where key = 'finder.flag.discovery'`));

    await page.goto(BASE_URL + '/mating-finder', { waitUntil: 'load' });
    await page.getByTestId('finder-filters').waitFor();
    // Every control in the filter form has an accessible name.
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="finder-filters"] select, [data-testid="finder-filters"] input')].filter(
        (el) => !(el.id && document.querySelector('label[for="' + el.id + '"]')),
      ).length,
    );
    assert.equal(unnamed, 0);

    await page.getByTestId('finder-filter-for').selectOption(myAnimal);
    await Promise.all([page.waitForURL('**/mating-finder?**'), page.getByTestId('finder-search-submit').click()]);
    await page.getByTestId('finder-match-mode').waitFor();
    await expectText(page, 'تضمین باروری، آبستنی، سلامت یا کیفیت توله نیست');
    assert.ok((await page.locator('[data-testid^="finder-evaluation-"]').count()) >= 3);
    assert.ok(new URL(page.url()).searchParams.get('for') === myAnimal);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    await page.screenshot({ path: path.join(SHOTS, 'match-mode-mobile.png'), fullPage: true });

    // Favourite the first result, save the search.
    const first = page.locator('[data-testid^="finder-favorite-"]').first();
    await first.click();
    await expectText(page, 'به علاقه‌مندی‌ها افزوده شد');
    await page.getByTestId('finder-save-search-name').fill('SYNTHETIC جفت برای نر من');
    await page.getByTestId('finder-save-search-submit').click();
    await expectText(page, 'جست‌وجو ذخیره شد');
    await page.goto(BASE_URL + '/account/mating-finder/saved-searches', { waitUntil: 'load' });
    await expectText(page, 'SYNTHETIC جفت برای نر من');
    await page.goto(BASE_URL + '/account/mating-finder/favorites', { waitUntil: 'load' });
    assert.equal(await page.locator('[data-testid^="finder-fav-"]').count() > 0, true);
  } finally {
    await context.close();
  }
});

test('a visitor sees subscribed owners’ profiles, an impossible filter gives a written empty state, and a hostile query changes nothing', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/mating-finder?breed=' + breedId, { waitUntil: 'load' });
    assert.ok((await page.locator('[data-testid^="finder-result-"]').count()) >= 3);
    assert.equal(await page.locator('[data-testid^="finder-favorite-"]').count(), 0, 'no favourite button for a visitor');
    await page.goto(BASE_URL + '/mating-finder?breed=' + breedId + '&city=' + encodeURIComponent('شهری که نیست'), { waitUntil: 'load' });
    await expectText(page, 'پروفایلی با این فیلترها پیدا نشد');
    const response = await page.goto(BASE_URL + "/mating-finder?breed=x'%20or%201=1&availability=INACTIVE&for=zz&cursor=%%%", { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await page.getByTestId('finder-filters').waitFor();
  } finally {
    await context.close();
  }
});
