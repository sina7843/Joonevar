/**
 * Local pages and the map in the browser — Phase 2 PROMPT-015.
 *
 * A visitor opens a province, walks to a city, and finds either the lists
 * filtered by that place or a plain statement that nothing is published there
 * yet. No map is drawn while none is configured, and no private address appears.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, expectText } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-015');

let browser!: Browser;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function asVisitor<T>(viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR' });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('every province has a page, and the list says which of them hold anything', async () => {
  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/places', { waitUntil: 'load' });
    await page.getByTestId('province-list').waitFor();
    assert.equal(await page.locator('[data-testid^="province-"]').count(), 32, '31 provinces plus the list itself');
    await expectText(page, 'نشانی دقیق و محل غیرعمومی هیچ‌جا منتشر نمی‌شود');
    await page.screenshot({ path: path.join(SHOTS, 'places-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
});

test('a province page lists its cities and, while empty, is not offered to search engines', async () => {
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/places/tehran', { waitUntil: 'load' });
    await page.getByTestId('province-page').waitFor();
    await page.getByTestId('city-list').waitFor();
    await expectText(page, 'استان تهران');

    // On a fresh database nothing is published, so §19 keeps the page out of the index.
    const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content')) ?? '';
    assert.match(robots, /noindex/);
    await expectText(page, 'هنوز در این استان رکورد منتشرشده‌ای نیست');
    await page.screenshot({ path: path.join(SHOTS, 'province-empty.png'), fullPage: true });
  });
});

test('a city page answers at its Persian address and keeps the privacy note', async () => {
  await asVisitor(MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/places/tehran/' + encodeURIComponent('تهران'), { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await page.getByTestId('city-page').waitFor();
    await expectText(page, 'استان تهران');
    await page.getByTestId('city-privacy-note').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'city-mobile.png'), fullPage: true });
  });
});

test('an address nobody published answers a real 404', async () => {
  await asVisitor(DESKTOP, async (page) => {
    for (const address of ['/places/no-such-province', '/places/tehran/' + encodeURIComponent('شهر-ناموجود')]) {
      const response = await page.goto(BASE_URL + address, { waitUntil: 'load' });
      assert.equal(response?.status(), 404, address);
      await page.getByTestId('not-found').waitFor();
    }
  });
});

test('no map is drawn while no map service is configured', async () => {
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/centers', { waitUntil: 'load' });
    // Whatever the directory holds, no iframe may appear without a template.
    assert.equal(await page.locator('iframe').count(), 0);
  });
});
