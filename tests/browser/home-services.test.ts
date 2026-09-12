/**
 * Home and the service pages in the browser — Phase 2 PROMPT-013.
 *
 * A visitor reads what Hamzist does, opens one service, sees the fee that is
 * really recorded (and the plain statement where Hamzist charges nothing), is
 * told no appointment is promised, and is sent into the existing Phase 1 flow —
 * which asks them to sign in first, exactly as it did before.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, expectText } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-013');

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

test('home shows what Hamzist does, how it works and a way into the directories', async () => {
  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.getByTestId('home-services').waitFor();
    await expectText(page, 'ثبت رسمی و پیگیری سگ‌ها');
    await expectText(page, 'روش کار');

    // Every service on the home page has its own page.
    const cards = page.locator('[data-testid^="home-service-"]');
    assert.ok((await cards.count()) >= 6);
    await page.getByTestId('home-search-input').fill('دامپزشک');
    await Promise.all([page.waitForURL(/\/search\?/), page.getByTestId('home-search-input').press('Enter')]);
    await page.getByTestId('search-form').waitFor();
    await page.goBack({ waitUntil: 'load' });

    await page.screenshot({ path: path.join(SHOTS, 'home-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');
  });
});

test('a service page carries the steps and no figure and no promised time', async () => {
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/services', { waitUntil: 'load' });
    await page.getByTestId('service-list').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'services-desktop.png'), fullPage: true });

    await page.getByTestId('service-card-membership').click();
    await page.getByTestId('service-page').waitFor();
    /*
     * No tariff is printed on a public service page (DEC-0186). The figure still
     * lives in managed settings and appears where the payment happens, so what
     * this pins is the absence: neither a number nor a «not recorded» warning.
     */
    assert.equal(await page.getByTestId('service-fee').count(), 0);
    assert.equal(await page.getByTestId('service-fee-unconfigured').count(), 0);
    await page.getByTestId('service-prerequisites').waitFor();
    await page.getByTestId('service-steps').waitFor();
    await page.getByTestId('service-documents').waitFor();
    await page.getByTestId('service-faq').waitFor();
    await expectText(page, 'همزیست نوبت نمی‌دهد');
    await page.screenshot({ path: path.join(SHOTS, 'service-membership.png'), fullPage: true });
  });
});

test('a service whose price Hamzist does not set says where to ask, with the approved notice', async () => {
  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/services/vet-visit', { waitUntil: 'load' });
    await page.getByTestId('service-notice').waitFor();
    assert.equal(await page.getByTestId('service-fee').count(), 0);
    await expectText(page, 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.');
    await page.screenshot({ path: path.join(SHOTS, 'service-vet-visit-mobile.png'), fullPage: true });
  });
});

test('the call to action enters the existing flow, which still asks an anonymous visitor to sign in', async () => {
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/services/membership', { waitUntil: 'load' });
    const href = await page.getByTestId('service-cta').getAttribute('href');
    assert.equal(href, '/membership');

    await Promise.all([page.waitForURL(/\/login/), page.getByTestId('service-cta').click()]);
    // The guarded route sends the visitor to sign-in with the exact next path.
    assert.equal(new URL(page.url()).searchParams.get('next'), '/membership');
  });
});

test('an address nobody published answers a real 404', async () => {
  await asVisitor(DESKTOP, async (page) => {
    const response = await page.goto(BASE_URL + '/services/no-such-service', { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
    await page.getByTestId('not-found').waitFor();
  });
});
