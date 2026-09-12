/**
 * Global search in the browser — Phase 2 PROMPT-012.
 *
 * A visitor searches from the header, reads one ordered list over every public
 * section, narrows it by result type, and is told plainly which kinds a
 * geographic filter cannot answer. The page names the ranking rule it used.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, expectText, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-012');
const RUN = String(randomInt(100_000, 999_999));
const CLUB = 'کلاب جست‌وجو SYNTHETIC ' + RUN;
const ADMIN = '09990000006';

let browser!: Browser;
let adminState: Awaited<ReturnType<BrowserContext['storageState']>>;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, ADMIN);
    adminState = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
});

async function withPage<T>(
  viewport: { width: number; height: number },
  state: Awaited<ReturnType<BrowserContext['storageState']>> | null,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a published record becomes searchable across the public sections', async () => {
  await withPage(DESKTOP, adminState, async (page) => {
    await page.goto(BASE_URL + '/admin/communities', { waitUntil: 'load' });
    await page.getByTestId('community-name').fill(CLUB);
    await page.getByTestId('community-kind').selectOption('CLUB');
    await page.getByTestId('community-create-reason').fill('ثبت برای آزمون جست‌وجو');
    await page.getByTestId('create-community').click();
    await expectText(page, CLUB);

    await page.getByRole('link', { name: CLUB }).click();
    await page.getByTestId('community-profile-form').waitFor();
    await page.getByTestId('community-about').fill('کلاب آزمایشی برای آزمون جست‌وجوی سراسری.');
    await page.getByTestId('community-phone').fill('02100000000');
    await page.getByTestId('community-profile-reason').fill('تکمیل پرونده');
    await page.getByTestId('save-community-profile').click();
    await expectText(page, 'ذخیره شد');

    await page.getByTestId('community-status-reason').fill('انتشار برای آزمون');
    await page.getByTestId('change-community-status').click();
    await page.getByTestId('community-public-link').waitFor();
  });
});

test('a visitor searches from the header and the page names the rule that ordered the results', async () => {
  await withPage(DESKTOP, null, async (page) => {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.getByTestId('site-search-input').fill('کلاب جست‌وجو');
    await Promise.all([page.waitForURL(/\/search\?/), page.getByTestId('site-search-input').press('Enter')]);

    await page.getByTestId('search-results').waitFor();
    await expectText(page, CLUB);
    await expectText(page, 'نسخه رتبه‌بندی');
    assert.match((await page.getByTestId('ranking-version').textContent()) ?? '', /rank-\d{4}-\d{2}-[a-z]/);
    await page.screenshot({ path: path.join(SHOTS, 'search-desktop.png'), fullPage: true });

    // Narrowing by result type is a filter on the same list.
    await page.getByTestId('search-filter-kind').selectOption('COMMUNITY');
    await page.getByTestId('search-submit').click();
    await page.getByTestId('search-results').waitFor();
    await expectText(page, CLUB);
    assert.equal(await page.locator('[data-testid^="result-BREED-"]').count(), 0);
  });
});

test('a geographic filter says which kinds it cannot answer, and an empty result offers a way back', async () => {
  await withPage(MOBILE, null, async (page) => {
    await page.goto(BASE_URL + '/search?province=tehran', { waitUntil: 'load' });
    await page.getByTestId('search-skipped').waitFor();
    await expectText(page, 'جست‌وجو نمی‌شوند');
    await page.screenshot({ path: path.join(SHOTS, 'search-filtered-mobile.png'), fullPage: true });

    await page.goto(BASE_URL + '/search?q=' + encodeURIComponent('عبارتی که هیچ‌جا نیست ' + RUN), { waitUntil: 'load' });
    await expectText(page, 'نتیجه‌ای پیدا نشد');
    await page.screenshot({ path: path.join(SHOTS, 'search-empty-mobile.png'), fullPage: true });
  });
});

test('the search page is never indexed and the address carries the whole query', async () => {
  await withPage(DESKTOP, null, async (page) => {
    await page.goto(BASE_URL + '/search?q=' + encodeURIComponent('کلاب') + '&kind=COMMUNITY', { waitUntil: 'load' });
    const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content')) ?? '';
    assert.match(robots, /noindex/);
    // The filters survive in the address, so a search can be shared.
    assert.equal(await page.getByTestId('search-filter-kind').inputValue(), 'COMMUNITY');
    assert.equal(await page.getByTestId('search-input').inputValue(), 'کلاب');
  });
});
