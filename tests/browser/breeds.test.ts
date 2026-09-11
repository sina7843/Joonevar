/**
 * Breed bank in the browser — Phase 2 PROMPT-003.
 *
 * The superadmin builds a breed page in the operational shell and a visitor
 * reads it on the public site: search, FCI filter, facts, a medical claim with
 * its source and review date, breadcrumb and canonical. Then the states a
 * public record can be in — renamed, archived, duplicate, draft — and the
 * editor refused to anyone outside the superadmin environment.
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

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-003');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const SUPERADMIN = '09990000006';
const RUN = String(randomInt(100_000, 999_999));

let browser!: Browser;
let adminState: Awaited<ReturnType<BrowserContext['storageState']>>;

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

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
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

async function asAdmin<T>(run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR', storageState: adminState });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function asVisitor<T>(viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR' });
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

/** Adds a breed from the register and opens its editor; returns its id and address. */
async function createBreed(
  page: Page,
  label: string,
  latin: string,
): Promise<{ id: string; slug: string; nameFa: string; nameEn: string }> {
  const nameFa = label + ' ' + RUN;
  const nameEn = 'SYNTHETIC ' + latin + ' ' + RUN;
  await page.goto(BASE_URL + '/admin/breeds', { waitUntil: 'load' });
  await page.getByTestId('breed-name-fa').fill(nameFa);
  await page.getByTestId('breed-name-en').fill(nameEn);
  await page.getByTestId('add-breed').click();
  await page.getByTestId('edit-breed-' + nameEn).waitFor();
  await Promise.all([
    page.waitForURL((url) => /^\/admin\/breeds\/[0-9a-f-]{36}$/.test(url.pathname)),
    page.getByTestId('edit-breed-' + nameEn).click(),
  ]);
  await page.getByTestId('breed-profile-form').waitFor();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const slug = await page.getByTestId('profile-slug').inputValue();
  return { id, slug, nameFa, nameEn };
}

async function writeHistoryAndPublish(page: Page, history: string): Promise<void> {
  await page.getByTestId('profile-history').fill(history);
  await page.getByTestId('save-breed-profile').click();
  await waitForText(page, 'breed-profile-result', 'پرونده نژاد ذخیره شد');
  await setStatus(page, 'PUBLISHED', 'منتشر شد');
}

async function setStatus(page: Page, to: string, expected: string): Promise<void> {
  await page.getByTestId('breed-status-to').selectOption(to);
  await page.getByTestId('breed-status-reason').fill('SYNTHETIC دلیل آزمایشی');
  await page.getByTestId('change-breed-status').click();
  await waitForText(page, 'breed-status-result', expected);
}

let showcase: { id: string; slug: string; nameFa: string; nameEn: string };

test('the superadmin builds a breed page and a visitor finds and reads it', async () => {
  const alias = 'Synthetic Alias ' + RUN;
  showcase = await asAdmin(async (page) => {
    const breed = await createBreed(page, 'نژاد نمایشی', 'Showcase');
    await page.getByTestId('profile-group').selectOption({ index: 8 });
    await page.getByTestId('profile-country').fill('IR');
    await page.getByTestId('profile-size').selectOption('MEDIUM');
    await page.getByTestId('profile-energy').selectOption('HIGH');
    await page.getByTestId('profile-alt-names').fill(alias);
    await page.getByTestId('profile-standard').fill('SYNTHETIC خلاصه استاندارد آزمایشی برای بررسی صفحه عمومی.');

    // A medical claim with its source and review date.
    await page.getByTestId('claim-kind').selectOption('SUGGESTED_GENETIC_TEST');
    await page.getByTestId('claim-title').fill('SYNTHETIC آزمایش پیشنهادی ' + RUN);
    await page.getByTestId('claim-source').fill('SYNTHETIC منبع ' + RUN);
    await page.getByTestId('claim-source-url').fill('https://example.org/synthetic-source');
    await page.getByTestId('claim-reviewed-on').fill('2026-01-15');
    await page.getByTestId('add-claim').click();
    await waitForText(page, 'claim-result', 'با منبع و تاریخ بازبینی ثبت شد');

    await writeHistoryAndPublish(page, 'SYNTHETIC تاریخچه آزمایشی ' + RUN);
    await page.screenshot({ path: path.join(SHOTS, 'admin-breed-editor.png'), fullPage: true });
    return breed;
  });

  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/breeds?q=' + encodeURIComponent(alias), { waitUntil: 'load' });
    await page.getByTestId('breed-card-' + showcase.slug).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'breeds-search-mobile.png'), fullPage: true });

    await page.goto(BASE_URL + '/breeds?group=8&q=' + RUN, { waitUntil: 'load' });
    // The list streams behind its loading boundary: wait for what is shown, not for what is in the DOM.
    await page.getByTestId('breed-card-' + showcase.slug).waitFor();
    await page.goto(BASE_URL + '/breeds?group=1&q=' + RUN, { waitUntil: 'load' });
    await page.getByText('نژادی با این جست‌وجو پیدا نشد').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'breeds-no-result-mobile.png'), fullPage: true });

    await page.goto(BASE_URL + '/breeds?q=' + RUN, { waitUntil: 'load' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/breeds/' + showcase.slug),
      page.getByTestId('breed-card-' + showcase.slug).click(),
    ]);
    assert.equal((await page.locator('h1').textContent())?.trim(), showcase.nameFa);
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    const facts = await page.getByTestId('breed-facts').innerText();
    for (const expected of ['گروه ۸', 'ایران', 'متوسط', 'زیاد']) assert.ok(facts.includes(expected), expected);

    const claim = await page.getByTestId('breed-claim').innerText();
    assert.ok(claim.includes('SYNTHETIC منبع ' + RUN), 'the source is shown');
    assert.ok((await page.getByTestId('breed-claim-reviewed').innerText()).trim().length > 0, 'the review date is shown');
    assert.equal(await page.getByTestId('breed-claim').locator('a').getAttribute('rel'), 'nofollow noopener noreferrer');

    const canonical = BASE_URL + '/breeds/' + showcase.slug;
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonical);
    const trail = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')).find((d) => d?.['@type'] === 'BreadcrumbList'));
    assert.deepEqual(
      trail.itemListElement.map((item: { item: string }) => item.item),
      [BASE_URL + '/', BASE_URL + '/breeds', canonical],
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'the breed page scrolls sideways (' + overflow + 'px)');
    await page.screenshot({ path: path.join(SHOTS, 'breed-page-mobile.png'), fullPage: true });
  });

  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/breeds/' + showcase.slug, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(SHOTS, 'breed-page-desktop.png'), fullPage: true });
    await page.goto(BASE_URL + '/breeds?q=' + RUN, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(SHOTS, 'breeds-desktop.png'), fullPage: true });
  });
});

test('a renamed, archived, duplicate or draft breed behaves as its state says', async () => {
  assert.ok(showcase, 'depends on the published showcase breed');
  const renamed = showcase.slug + '-renamed';

  const { duplicate, draft } = await asAdmin(async (page) => {
    // Renaming the address keeps the old one working.
    await page.goto(BASE_URL + '/admin/breeds/' + showcase.id, { waitUntil: 'load' });
    await page.getByTestId('profile-slug').fill(renamed);
    await page.getByTestId('save-breed-profile').click();
    await waitForText(page, 'breed-profile-result', 'پرونده نژاد ذخیره شد');

    // A second record of the same breed is published, then recorded as its duplicate.
    const duplicateBreed = await createBreed(page, 'نژاد تکراری', 'Second Record');
    await writeHistoryAndPublish(page, 'SYNTHETIC تاریخچه تکراری ' + RUN);
    await page.getByTestId('duplicate-primary').selectOption({ label: showcase.nameFa + ' — ' + showcase.nameEn });
    await page.getByTestId('duplicate-reason').fill('SYNTHETIC همان نژاد');
    await page.getByTestId('mark-duplicate').click();
    await waitForText(page, 'breed-duplicate-of', showcase.nameFa);
    await page.screenshot({ path: path.join(SHOTS, 'admin-breed-duplicate.png'), fullPage: true });

    // A draft is never published.
    const draftBreed = await createBreed(page, 'نژاد پیش‌نویس', 'Unpublished');
    return { duplicate: duplicateBreed, draft: draftBreed };
  });

  await asVisitor(MOBILE, async (page) => {
    // A real permanent redirect, not a client-side hop after a 200 page.
    const moved = await page.request.get(BASE_URL + '/breeds/' + showcase.slug, { maxRedirects: 0 });
    assert.equal(moved.status(), 308);
    assert.equal(new URL(moved.headers()['location'] ?? '', BASE_URL).pathname, '/breeds/' + renamed);

    const response = await page.goto(BASE_URL + '/breeds/' + showcase.slug, { waitUntil: 'load' });
    assert.equal(new URL(page.url()).pathname, '/breeds/' + renamed, 'the old address redirects to the new one');
    assert.equal(response?.status(), 200);

    await page.goto(BASE_URL + '/breeds/' + duplicate.slug, { waitUntil: 'load' });
    await page.getByTestId('breed-duplicate-notice').waitFor();
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), BASE_URL + '/breeds/' + renamed);
    assert.equal(
      await page.getByTestId('breed-duplicate-notice').locator('a').getAttribute('href'),
      '/breeds/' + renamed,
    );
    await page.goto(BASE_URL + '/breeds?q=' + RUN, { waitUntil: 'load' });
    await page.getByTestId('breed-card-' + renamed).waitFor();
    assert.equal(await page.getByTestId('breed-card-' + duplicate.slug).count(), 0, 'a duplicate is not listed');
    await page.screenshot({ path: path.join(SHOTS, 'breed-duplicate-mobile.png'), fullPage: true });

    const draftResponse = await page.goto(BASE_URL + '/breeds/' + draft.slug, { waitUntil: 'load' });
    assert.equal(draftResponse?.status(), 404, 'a draft has no public page');
    await page.getByTestId('not-found').waitFor();
  });

  await asAdmin(async (page) => {
    await page.goto(BASE_URL + '/admin/breeds/' + showcase.id, { waitUntil: 'load' });
    await setStatus(page, 'ARCHIVED', 'بایگانی شد');
  });

  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/breeds/' + renamed, { waitUntil: 'load' });
    await page.getByTestId('breed-archived-notice').waitFor();
    assert.match((await page.locator('meta[name="robots"]').getAttribute('content')) ?? '', /noindex/);
    await page.screenshot({ path: path.join(SHOTS, 'breed-archived-mobile.png'), fullPage: true });
    await page.goto(BASE_URL + '/breeds?q=' + RUN, { waitUntil: 'load' });
    // With nothing published at all the page shows the empty-bank state, so wait for the rendered page itself.
    await page.getByTestId('breed-search').waitFor();
    assert.equal(await page.getByTestId('breed-card-' + renamed).count(), 0, 'an archived breed is not listed');
    await page.screenshot({ path: path.join(SHOTS, 'breeds-empty-mobile.png'), fullPage: true });
  });
});

test('the breed editor belongs to the superadmin environment alone', async () => {
  assert.ok(showcase, 'depends on the showcase breed');
  const target = BASE_URL + '/admin/breeds/' + showcase.id;

  await asVisitor(MOBILE, async (page) => {
    await page.goto(target, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/admin/breeds/' + showcase.id);

    // A signed-in ordinary account is refused by the server, not just unlinked.
    await signIn(page, '0999' + String(randomInt(1_000_000, 9_999_999)));
    await page.goto(target, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN');
  });

  // An address that is not a breed id is a 404 inside the shell, not an error page.
  await asAdmin(async (page) => {
    const response = await page.goto(BASE_URL + '/admin/breeds/not-a-breed', { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
  });
});
