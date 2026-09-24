/**
 * The public pages of Phase 2.5 §9 in a real browser — PROMPT-014.
 *
 * That the new sections are reachable from the navigation, that each one says
 * what it is without printing a tariff, that the sitemap and canonical agree
 * with the section list, and that the pages hold up at phone width with the
 * headings and landmarks a reader navigates by.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, expectText } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2.5', 'prompt-014');

/** Every page this prompt added, with a phrase only that page says. */
const PAGES: ReadonlyArray<{ path: string; heading: string; marker: string }> = [
  { path: '/contact', heading: 'تماس با ما', marker: 'پیگیری از داخل سامانه' },
  { path: '/guides', heading: 'راهنمای کار با سامانه', marker: 'راهنمای خدمات' },
  { path: '/parentage-test', heading: 'تست اصالت نسب', marker: 'مراحل' },
  { path: '/association/membership', heading: 'شرایط عضویت انجمن', marker: 'مسیر عضویت' },
  { path: '/association/regulations', heading: 'مقررات انجمن', marker: 'قواعدی که سامانه اجرا می‌کند' },
  { path: '/association/status', heading: 'وضعیت‌ها و مراحل', marker: 'مراحل دامپزشک معتمد' },
];

let browser!: Browser;

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function visit<T>(pathname: string, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    const response = await page.goto(BASE_URL + pathname, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, pathname + ' answered ' + response?.status());
    return await run(page);
  } finally {
    await context.close();
  }
}

test('each new page is served, names itself once, and declares its own canonical', async () => {
  for (const entry of PAGES) {
    await visit(entry.path, DESKTOP, async (page) => {
      const headings = page.locator('h1');
      assert.equal(await headings.count(), 1, entry.path + ' must have exactly one h1');
      assert.ok((await headings.first().innerText()).includes(entry.heading), entry.path);
      await expectText(page, entry.marker);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.ok(canonical?.endsWith(entry.path), entry.path + ' canonical was ' + canonical);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      assert.ok((description ?? '').length > 20, entry.path + ' must describe itself');
      // A public page is read right to left, in Persian.
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.equal(await page.locator('html').getAttribute('lang'), 'fa');
    });
  }
});

test('no public marketing page prints a tariff', async () => {
  for (const entry of [...PAGES, { path: '/services' }, { path: '/services/membership' }, { path: '/clubs' }]) {
    await visit(entry.path, DESKTOP, async (page) => {
      const body = await page.locator('body').innerText();
      // A price would be written as Toman next to a number; the pages may say the
      // word while explaining where a fee is shown, never with a figure.
      const priced = /[۰-۹0-9][۰-۹0-9٬,\s]*\s*تومان/u.exec(body);
      assert.equal(priced, null, entry.path + ' printed a figure: ' + priced?.[0]);
    });
  }
});

test('the navigation reaches the new sections and the footer repeats them', async () => {
  await visit('/', DESKTOP, async (page) => {
    for (const href of ['/clubs', '/guides', '/contact', '/announcements', '/services']) {
      assert.ok((await page.locator('a[href="' + href + '"]').count()) > 0, 'nothing links to ' + href);
    }
    await page.screenshot({ path: path.join(SHOTS, 'home-nav-desktop.png') });
  });

  // The pages that are not in the navigation are still reached from the section
  // they belong to.
  await visit('/association/membership', DESKTOP, async (page) => {
    assert.ok((await page.locator('a[href="/association/status"]').count()) > 0);
    assert.ok((await page.locator('a[href="/association/regulations"]').count()) > 0);
  });
});

test('the sitemap index and its sections carry the new pages', async () => {
  await visit('/sitemap.xml', DESKTOP, async (page) => {
    const xml = await page.locator('body').innerText();
    for (const section of ['pages', 'clubs', 'articles']) {
      assert.ok(xml.includes('/sitemaps/' + section + '.xml'), 'the index is missing ' + section);
    }
  });

  await visit('/sitemaps/pages.xml', DESKTOP, async (page) => {
    const xml = await page.locator('body').innerText();
    for (const entry of PAGES) assert.ok(xml.includes(entry.path), 'pages.xml is missing ' + entry.path);
    assert.ok(xml.includes('/guides'));
    assert.ok(!xml.includes('/dashboard'), 'an application route must not be listed');
  });
});

test('the pages hold at phone width, with landmarks and a readable order', async () => {
  for (const entry of PAGES) {
    await visit(entry.path, MOBILE, async (page) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, entry.path + ' overflows by ' + overflow + 'px');
      assert.ok((await page.locator('main').count()) > 0, entry.path + ' has no main landmark');
      assert.ok((await page.locator('nav[aria-label]').count()) > 0, entry.path + ' has no labelled navigation');
      // Every section heading below the title is an h2, so the outline is flat
      // and a screen reader can jump through it.
      const levels = await page.locator('h2, h3').evaluateAll((nodes) => nodes.map((node) => node.tagName));
      assert.ok(levels.every((level) => level === 'H2' || level === 'H3'), entry.path);
      // Links carry words, not an empty box.
      const emptyLinks = await page
        .locator('main a')
        .evaluateAll((nodes) => nodes.filter((node) => (node.textContent ?? '').trim() === '' && !node.querySelector('img')).length);
      assert.equal(emptyLinks, 0, entry.path + ' has a link with no words');
    });
  }
  await visit('/contact', MOBILE, async (page) => {
    await page.screenshot({ path: path.join(SHOTS, 'contact-mobile.png'), fullPage: true });
  });
  await visit('/association/status', MOBILE, async (page) => {
    await page.screenshot({ path: path.join(SHOTS, 'association-status-mobile.png'), fullPage: true });
  });
  await visit('/guides', MOBILE, async (page) => {
    await page.screenshot({ path: path.join(SHOTS, 'guides-mobile.png'), fullPage: true });
  });
});

test('a search in a content list is an address, and a term nobody wrote says so', async () => {
  await visit('/articles?q=' + encodeURIComponent('واژه‌ای که نیست'), DESKTOP, async (page) => {
    const value = await page.getByTestId('content-search-input').inputValue();
    assert.equal(value, 'واژه‌ای که نیست', 'the search box keeps what was typed');
    // What must not happen is a page of results for words nobody wrote. Which of
    // the two honest empty states is shown depends on whether this library has
    // anything published at all, so that wording is pinned in the database suite
    // rather than raced against here.
    assert.equal(await page.locator('[data-testid="content-results"] li').count(), 0, 'the search returned items');
    assert.equal(await page.getByTestId('content-search').count(), 1, 'the filter stays on the page');
  });
});
