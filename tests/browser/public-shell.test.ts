/**
 * Public site shell and SEO — Phase 2 PROMPT-002.
 *
 * Runs against the isolated server of `tools/browser-tests.mjs`, whose SITE_URL
 * is that server's own origin and whose APP_ENV is development — so every page
 * must say noindex and robots.txt must close the site, which is exactly what a
 * staging deployment has to do.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-002');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

let browser!: Browser;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function withPage(
  viewport: { width: number; height: number },
  run: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR' });
  try {
    await run(await context.newPage(), context);
  } finally {
    await context.close();
  }
}

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

test('home and about render right to left without sideways scrolling on phone and desktop', async () => {
  for (const [label, viewport] of [
    ['mobile', MOBILE],
    ['desktop', DESKTOP],
  ] as const) {
    for (const [name, href] of [
      ['home', '/'],
      ['about', '/about'],
    ] as const) {
      await withPage(viewport, async (page) => {
        const response = await page.goto(BASE_URL + href, { waitUntil: 'load' });
        assert.equal(response?.status(), 200, href);
        assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
        assert.equal(await page.getAttribute('html', 'lang'), 'fa');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, href + ' scrolls sideways at ' + label + ' (' + overflow + 'px)');
        const main = await page.locator('main').boundingBox();
        assert.ok((main?.width ?? 0) >= viewport.width * 0.8, href + ' main column collapsed at ' + label);
        await page.screenshot({ path: path.join(SHOTS, name + '-' + label + '.png'), fullPage: true });
      });
    }
  }
});

test('metadata is absolute and canonical, and nothing is indexed outside production', async () => {
  await withPage(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/about?utm_source=test#x', { waitUntil: 'load' });
    const canonical = BASE_URL + '/about';
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonical);
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), canonical);
    assert.equal(await page.locator('meta[property="og:locale"]').getAttribute('content'), 'fa_IR');
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute('content'),
      BASE_URL + '/brand/logo-symbol.png',
    );
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
    assert.equal(await page.title(), 'درباره همزیست');

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')));
    const trail = blocks.find((block) => block?.['@type'] === 'BreadcrumbList');
    assert.ok(trail, 'BreadcrumbList is present');
    assert.deepEqual(
      trail.itemListElement.map((item: { item: string }) => item.item),
      [BASE_URL + '/', canonical],
    );
  });

  await withPage(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), BASE_URL + '/');
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')?.['@type']));
    assert.deepEqual([...types].sort(), ['Organization', 'WebSite']);
  });
});

test('the header links only built sections, marks the current one and offers sign-in', async () => {
  await withPage(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/about', { waitUntil: 'load' });
    const nav = page.locator('nav[aria-label="ناوبری سایت"] a');
    assert.deepEqual(await nav.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href'))), [
      '/',
      '/breeds',
      '/articles',
      '/news',
      '/about',
    ]);
    assert.equal(await nav.nth(4).getAttribute('aria-current'), 'page');
    assert.equal(await nav.nth(0).getAttribute('aria-current'), null);

    const account = page.getByTestId('site-account-link');
    assert.equal(await account.getAttribute('href'), '/login');
    assert.equal((await account.textContent())?.trim(), 'ورود / ثبت‌نام');

    // No link anywhere on the page leads into a section that is not built yet.
    for (const planned of ['/veterinarians', '/centers', '/associations', '/verify']) {
      assert.equal(await page.locator('a[href^="' + planned + '"]').count(), 0, planned);
    }

    // The breadcrumb reads right to left: home sits to the right of the page.
    const crumbs = page.locator('[data-testid="breadcrumbs"] li');
    const home = await crumbs.nth(0).boundingBox();
    const current = await crumbs.nth(1).boundingBox();
    assert.ok(home && current && home.x > current.x, 'the first crumb is on the right');
    assert.equal(await crumbs.nth(1).locator('[aria-current="page"]').count(), 1);
    await page.screenshot({ path: path.join(SHOTS, 'header-desktop.png') });
  });
});

test('the mobile menu opens and closes as a disclosure, on Escape and after navigating', async () => {
  await withPage(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    const toggle = page.getByTestId('site-menu-toggle');
    const menu = page.getByTestId('site-menu');

    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.isVisible(), false);
    const box = await toggle.boundingBox();
    assert.ok((box?.height ?? 0) >= 44 && (box?.width ?? 0) >= 44, 'the menu button meets the touch minimum');

    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await menu.isVisible(), true);
    await page.screenshot({ path: path.join(SHOTS, 'menu-open-mobile.png') });

    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'site-menu-toggle');

    await toggle.click();
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/about'),
      menu.getByRole('link', { name: 'درباره همزیست' }).click(),
    ]);
    await page.getByRole('heading', { level: 1, name: 'درباره همزیست' }).waitFor();
    assert.equal(await menu.isVisible(), false, 'the menu does not stay open over the next page');
  });
});

test('robots and the segmented sitemap are served on the configured origin', async () => {
  const context = await browser.newContext();
  try {
    const robots = await context.request.get(BASE_URL + '/robots.txt');
    assert.equal(robots.status(), 200);
    const robotsText = await robots.text();
    assert.match(robotsText, /User-Agent: \*/i);
    assert.match(robotsText, /Disallow: \/\s*$/m, 'a non-production site is closed to crawlers');

    const index = await context.request.get(BASE_URL + '/sitemap.xml');
    assert.equal(index.status(), 200);
    assert.match(index.headers()['content-type'] ?? '', /application\/xml/);
    const indexText = await index.text();
    assert.ok(indexText.includes('<loc>' + BASE_URL + '/sitemaps/pages.xml</loc>'), indexText);

    const pages = await (await context.request.get(BASE_URL + '/sitemaps/pages.xml')).text();
    assert.ok(pages.includes('<loc>' + BASE_URL + '/</loc>'));
    assert.ok(pages.includes('<loc>' + BASE_URL + '/about</loc>'));
    assert.ok(!pages.includes('/dashboard') && !pages.includes('/login'));

    assert.equal((await context.request.get(BASE_URL + '/sitemaps/unknown.xml')).status(), 404);
  } finally {
    await context.close();
  }
});

test('an unknown or unbuilt address answers 404 in Persian and is not indexed', async () => {
  for (const href of ['/veterinarians', '/no-such-page']) {
    await withPage(MOBILE, async (page) => {
      const response = await page.goto(BASE_URL + href, { waitUntil: 'load' });
      assert.equal(response?.status(), 404, href);
      await page.getByTestId('not-found').waitFor();
      assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
      assert.ok((await page.locator('h1').textContent())?.includes('پیدا نشد'));
      assert.match((await page.locator('meta[name="robots"]').first().getAttribute('content')) ?? '', /noindex/);
      if (href === '/veterinarians') await page.screenshot({ path: path.join(SHOTS, 'not-found-mobile.png') });
    });
  }
});

test('a signed-in visitor is offered their panel, and the application stays guarded for everyone else', async () => {
  await withPage(MOBILE, async (page) => {
    // Anonymous: the public site does not open the application.
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/dashboard');

    // A fresh synthetic account, so no other suite's send cap or state is involved.
    const mobile = '0999' + String(randomInt(1_000_000, 9_999_999));
    await page.getByTestId('mobile-input').fill(mobile);
    await page.getByTestId('send-code').click();
    await page.getByTestId('code-input').waitFor();
    await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login')),
      page.getByTestId('verify-code').click(),
    ]);

    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    const account = page.getByTestId('site-account-link');
    assert.equal(await account.getAttribute('href'), '/dashboard');
    assert.equal((await account.textContent())?.trim(), 'پنل من');
  });
});
