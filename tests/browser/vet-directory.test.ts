/**
 * Veterinary directory in the browser — Phase 2 PROMPT-006.
 *
 * A Phase 1 veterinarian (profile and location rows as the registry records
 * them) gets a public page: the superadmin places the location in a city,
 * writes the profile with consent and publishes it; a visitor filters the
 * directory on a phone and reads the page; hiding makes it 404; the editor is
 * closed to anyone outside the superadmin environment.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { accountRoles, accounts } from '../../src/db/schema/core.ts';
import { vetLocations, vetProfiles } from '../../src/db/schema/vets.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-006');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const SUPERADMIN = '09990000006';
/** A signed-in account outside the superadmin environment. */
const AUTHOR = '09990000007';
const RUN = String(randomInt(100_000, 999_999));

let browser!: Browser;
let adminState: Awaited<ReturnType<BrowserContext['storageState']>>;
let vet: { accountId: string; locationId: string; name: string };
let slug = '';

async function lastCodeFor(mobile: string): Promise<string> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} order by created_at desc limit 1`,
    );
    const match = /(\d{6})/.exec(rows.rows[0]?.body ?? '');
    assert.ok(match, 'no code was sent to ' + mobile);
    return match![1]!;
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page, mobile: string): Promise<void> {
  await page.goto(BASE_URL + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByTestId('verify-code').click(),
  ]);
}

/** The Phase 1 rows a veterinarian already has: role, verified council code and a licensed location. */
async function seedPhaseOneVet(): Promise<typeof vet> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const name = 'دامپزشک SYNTHETIC ' + RUN;
    const [account] = await db
      .insert(accounts)
      .values({ mobile: '0999' + String(randomInt(1_000_000, 9_999_999)), status: 'ACTIVE' })
      .returning({ id: accounts.id });
    await db.insert(accountRoles).values({ accountId: account!.id, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await db.insert(vetProfiles).values({
      accountId: account!.id,
      displayNameFa: name,
      councilCode: 'SYN-BR-' + RUN,
      councilVerifiedAt: new Date(),
      phone: '02100000000',
    });
    const [location] = await db
      .insert(vetLocations)
      .values({
        vetAccountId: account!.id,
        nameFa: 'کلینیک SYNTHETIC ' + RUN,
        provinceFa: 'فارس',
        cityFa: 'شیراز',
        addressFa: 'نشانی آزمایشی ' + RUN,
        phone: '07100000000',
        licenceStatus: 'VALID',
      })
      .returning({ id: vetLocations.id });
    return { accountId: account!.id, locationId: location!.id, name };
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  vet = await seedPhaseOneVet();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(await context.newPage(), SUPERADMIN);
    adminState = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
});

async function withContext<T>(
  options: { viewport: { width: number; height: number }; storageState?: typeof adminState },
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ locale: 'fa-IR', ...options });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** A form's result line changes in place, so wait for the text rather than the element. */
async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page.waitForFunction(
    ([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false,
    [testId, text] as const,
  );
}

const textOf = async (page: Page, testId: string): Promise<string> => ((await page.getByTestId(testId).textContent()) ?? '').trim();

test('the superadmin places the location, writes the profile and publishes it', async () => {
  await withContext({ viewport: DESKTOP, storageState: adminState }, async (page) => {
    await page.goto(BASE_URL + '/admin/vets', { waitUntil: 'load' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/admin/vets/' + vet.accountId),
      page.getByTestId('directory-edit-' + vet.accountId).click(),
    ]);
    await page.getByTestId('directory-axes').waitFor();
    assert.equal(await textOf(page, 'directory-public-status'), 'پیش‌نویس');
    // Each axis on its own line.
    assert.match(await textOf(page, 'axis-verification'), /تأییدشده$/);
    assert.match(await textOf(page, 'axis-trusted'), /فعال$/);
    assert.doesNotMatch(await textOf(page, 'axis-trusted'), /غیرفعال$/);
    assert.match(await textOf(page, 'axis-advertising'), /بسته فعالی ندارد/);
    await page.getByTestId('directory-blockers').waitFor();

    // Too early: refused with what is missing.
    await page.getByTestId('directory-status-reason').fill('SYNTHETIC انتشار زودهنگام');
    await page.getByTestId('change-directory-status').click();
    await waitForText(page, 'directory-status-result', 'پیش از انتشار');

    const id = vet.locationId;
    await page.getByTestId('location-province-' + id).selectOption('fars');
    await page.getByTestId('location-city-' + id).selectOption({ label: 'شیراز' });
    await page.getByTestId('location-hours-' + id).fill('شنبه تا پنجشنبه، ۱۶ تا ۲۱');
    await page.getByTestId('location-public-' + id).check();
    await page.getByTestId('location-reason-' + id).fill('SYNTHETIC نشانی بررسی‌شده');
    await page.getByTestId('save-location-public-' + id).click();
    await waitForText(page, 'location-public-result-' + id, 'محل کار ذخیره شد');

    await page.getByTestId('directory-headline').fill('دامپزشک حیوانات کوچک');
    await page.getByTestId('directory-bio').fill('SYNTHETIC معرفی آزمایشی برای بررسی صفحه عمومی دامپزشک.');
    await page.getByTestId('directory-specialty-SURGERY').check();
    await page.getByTestId('directory-species-CAT').check();
    await page.getByTestId('directory-show-phone').check();
    await page.getByTestId('directory-profile-reason').fill('SYNTHETIC اطلاعات اعلام‌شده');
    await page.getByTestId('save-directory-profile').click();
    await waitForText(page, 'directory-profile-result', 'پروفایل عمومی ذخیره شد');

    // What was saved is what the refreshed page shows (DEC-0157).
    assert.ok(await page.getByTestId('directory-specialty-SURGERY').isChecked());
    assert.ok(await page.getByTestId('location-public-' + id).isChecked());
    assert.equal(
      await page.getByTestId('location-city-' + id).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent),
      'شیراز',
    );

    await page.getByTestId('directory-status-reason').fill('SYNTHETIC آماده انتشار');
    await page.getByTestId('change-directory-status').click();
    await waitForText(page, 'directory-status-result', 'پروفایل منتشر شد');
    await page.getByTestId('directory-public-link').waitFor();
    slug = (await page.getByTestId('directory-public-link').getAttribute('href'))!.split('/').pop()!;
    assert.match(slug, /^vet-[0-9a-f]{10}$/);
    assert.equal(await textOf(page, 'directory-public-status'), 'منتشرشده');
    await page.screenshot({ path: path.join(SHOTS, 'editor-published.png'), fullPage: true });
  });
});

test('a visitor filters the directory on a phone and reads the profile', async () => {
  assert.ok(slug, 'the profile was published by the previous test');
  await withContext({ viewport: MOBILE }, async (page) => {
    await page.goto(BASE_URL + '/veterinarians', { waitUntil: 'load' });
    await page.getByTestId('vet-search').waitFor();
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.getByTestId('vet-filter-specialty').selectOption('SURGERY');
    await page.getByTestId('vet-filter-province').selectOption('fars');
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('province') === 'fars'),
      page.getByTestId('vet-search-submit').click(),
    ]);
    const card = page.getByTestId('vet-card-' + slug);
    await card.waitFor();
    const cardText = (await card.textContent()) ?? '';
    assert.match(cardText, /کد نظام تأییدشده/);
    assert.match(cardText, /معتمد همزیست/);
    assert.match(cardText, /شیراز/);
    assert.match(cardText, /جراحی/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
    await page.screenshot({ path: path.join(SHOTS, 'directory-filtered-mobile.png'), fullPage: true });

    await Promise.all([page.waitForURL((url) => url.pathname === '/veterinarians/' + slug), card.click()]);
    await page.getByTestId('vet-page').waitFor();
    assert.equal((await page.locator('h1').textContent())?.trim(), vet.name);
    await page.getByTestId('vet-verified').waitFor();
    await page.getByTestId('vet-trusted').waitFor();
    assert.equal(await textOf(page, 'vet-phone'), '02100000000');
    assert.equal(await page.getByTestId('vet-council-code').count(), 0, 'no consent, no council code');
    assert.equal(await textOf(page, 'vet-species'), 'گربه');
    assert.match(await textOf(page, 'vet-location-hours'), /۱۶ تا ۲۱/);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), BASE_URL + '/veterinarians/' + slug);
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')?.['@type']));
    assert.ok(types.includes('Person') && types.includes('BreadcrumbList'), types.join(','));
    await page.screenshot({ path: path.join(SHOTS, 'profile-mobile.png'), fullPage: true });
  });

  await withContext({ viewport: DESKTOP }, async (page) => {
    // A filter that matches nobody says so and offers the whole list.
    await page.goto(BASE_URL + '/veterinarians?q=' + encodeURIComponent(vet.name) + '&species=DOG', { waitUntil: 'load' });
    await page.getByText('دامپزشکی با این جست‌وجو پیدا نشد').waitFor();
    await page.goto(BASE_URL + '/veterinarians', { waitUntil: 'load' });
    await page.getByTestId('vet-card-' + slug).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'directory-desktop.png'), fullPage: true });
    const sitemap = await page.request.get(BASE_URL + '/sitemaps/veterinarians.xml');
    assert.equal(sitemap.status(), 200);
    assert.ok((await sitemap.text()).includes('/veterinarians/' + slug));
  });
});

test('a hidden profile is not found, and the editor stays in the superadmin environment', async () => {
  assert.ok(slug, 'the profile was published by the first test');
  await withContext({ viewport: DESKTOP, storageState: adminState }, async (page) => {
    await page.goto(BASE_URL + '/admin/vets/' + vet.accountId, { waitUntil: 'load' });
    await page.getByTestId('directory-status-form').waitFor();
    assert.equal(await page.getByTestId('directory-status-to').inputValue(), 'HIDDEN');
    await page.getByTestId('directory-status-reason').fill('SYNTHETIC پنهان‌سازی آزمایشی');
    await page.getByTestId('change-directory-status').click();
    await waitForText(page, 'directory-status-result', 'پروفایل پنهان شد');
    assert.equal(await textOf(page, 'directory-public-status'), 'پنهان');
  });

  await withContext({ viewport: MOBILE }, async (page) => {
    const response = await page.goto(BASE_URL + '/veterinarians/' + slug, { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
    await page.getByTestId('not-found').waitFor();
    await page.goto(BASE_URL + '/veterinarians?q=' + encodeURIComponent(vet.name), { waitUntil: 'load' });
    await page.getByTestId('vet-search').waitFor();
    assert.equal(await page.getByTestId('vet-card-' + slug).count(), 0);

    // Anonymous: sign in first, then back to this veterinarian's editor.
    await page.goto(BASE_URL + '/admin/vets/' + vet.accountId, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/admin/vets/' + vet.accountId);
  });

  await withContext({ viewport: MOBILE }, async (page) => {
    await signIn(page, AUTHOR);
    await page.goto(BASE_URL + '/admin/vets/' + vet.accountId, { waitUntil: 'load' });
    assert.equal(await textOf(page, 'denial-code'), 'FORBIDDEN');
  });
});
