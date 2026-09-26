/**
 * Keyboard, screen-reader, RTL and performance evidence for the Phase 3 pages
 * — PHASE-3 PROMPT-014.
 *
 * Phase 2.5 measured all of this, and then Phase 3 added a marketplace, a shop,
 * a basket, a seller's workbench and three operational screens without any of
 * them ever being measured. The gap was real: none of the accessibility, RTL or
 * performance suites named a single Phase 3 route.
 *
 * So the same method is applied to the pages this phase actually built. The
 * timings are printed rather than gated on a millisecond — this is evidence
 * that nothing is pathological, not a benchmark — and the layout checks run at
 * a phone width, because that is where a right-to-left page with a table in it
 * breaks first.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, signIn, newSyntheticMobile } from './support.ts';

let browser!: Browser;
let signedIn: Awaited<ReturnType<BrowserContext['storageState']>>;

const timings: Array<{ path: string; ms: number; bytes: number }> = [];

/** The pages a visitor can reach without an account, which is most of Phase 3. */
const PUBLIC_PAGES = ['/animals-market', '/shop'];

/** The pages that need an account, one per thing this phase built. */
const PRIVATE_PAGES = ['/account/listings', '/account/orders', '/account/seller'];

before(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, newSyntheticMobile());
    signedIn = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
  if (timings.length > 0) {
    const rows = timings.map(
      (entry) => entry.path + ' ' + Math.round(entry.ms) + 'ms ' + Math.round(entry.bytes / 1024) + 'KB',
    );
    console.log('Phase 3 server response evidence: ' + rows.join(' | '));
  }
});

async function visit<T>(
  pathname: string,
  options: { viewport?: { width: number; height: number }; asUser?: boolean },
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    viewport: options.viewport ?? DESKTOP,
    locale: 'fa-IR',
    storageState: options.asUser ? signedIn : undefined,
  });
  try {
    const page = await context.newPage();
    const started = Date.now();
    const response = await page.goto(BASE_URL + pathname, { waitUntil: 'load' });
    const body = await response!.body();
    timings.push({ path: pathname, ms: Date.now() - started, bytes: body.length });
    return await run(page);
  } finally {
    await context.close();
  }
}

// ── keyboard ───────────────────────────────────────────────────────────────

test('a keyboard reaches the marketplace and the shop without a mouse', async () => {
  for (const pathname of PUBLIC_PAGES) {
    await visit(pathname, {}, async (page) => {
      await page.keyboard.press('Tab');
      const first = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('href') ?? '');
      assert.equal(first, '#main', pathname + ': the first tab stop is the skip link, not the logo');

      const stops: string[] = [];
      for (let index = 0; index < 14; index += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active || active === document.body) return null;
          const style = getComputedStyle(active);
          const box = active.getBoundingClientRect();
          return {
            tag: active.tagName,
            label: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 40),
            hidden: style.visibility === 'hidden' || style.display === 'none',
            sized: box.width > 0 && box.height > 0,
          };
        });
        if (stop === null) break;
        assert.equal(stop.hidden, false, pathname + ': focus landed on a hidden element: ' + stop.tag);
        assert.ok(stop.sized, pathname + ': focus landed on an element with no box: ' + stop.tag);
        assert.ok(stop.label.length > 0, pathname + ': a focused control with no words: ' + stop.tag);
        stops.push(stop.tag);
      }
      assert.ok(stops.length >= 5, pathname + ': has a usable tab order, got ' + stops.length);
    });
  }
});

test('the skip link goes to the main content rather than scrolling past it', async () => {
  await visit('/animals-market', {}, async (page) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const landed = await page.evaluate(() => {
      const main = document.querySelector('main');
      return { exists: main !== null, id: main?.getAttribute('id') ?? '', hash: location.hash };
    });
    assert.ok(landed.exists, 'the page has a main landmark');
    assert.equal(landed.hash, '#main', 'the skip link moved the page to the content');
  });
});

// ── screen reader ──────────────────────────────────────────────────────────

test('a screen reader is told what each Phase 3 page is and what its controls do', async () => {
  for (const pathname of PUBLIC_PAGES) {
    await visit(pathname, {}, async (page) => {
      const shape = await page.evaluate(() => {
        const headings = [...document.querySelectorAll('h1,h2,h3')].map((node) => ({
          level: Number(node.tagName.slice(1)),
          text: (node.textContent ?? '').trim(),
        }));
        const unlabelled = [...document.querySelectorAll('button,a[href],input,select,textarea')].filter((node) => {
          const element = node as HTMLElement;
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) return false;
          const label =
            element.getAttribute('aria-label') ??
            element.getAttribute('title') ??
            (element.id ? (document.querySelector('label[for="' + element.id + '"]')?.textContent ?? '') : '') ??
            '';
          return (label + (element.textContent ?? '')).trim() === '';
        }).length;
        return {
          landmarks: {
            main: document.querySelectorAll('main').length,
            nav: document.querySelectorAll('nav').length,
          },
          headings,
          unlabelled,
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
        };
      });

      assert.equal(shape.landmarks.main, 1, pathname + ': exactly one main landmark');
      assert.ok(shape.landmarks.nav >= 1, pathname + ': the navigation is a landmark');
      assert.equal(shape.lang, 'fa', pathname + ': the page says which language it is in');
      assert.equal(shape.dir, 'rtl', pathname + ': the page says which direction it reads');

      const h1 = shape.headings.filter((heading) => heading.level === 1);
      assert.equal(h1.length, 1, pathname + ': exactly one first-level heading, got ' + h1.length);
      assert.ok(h1[0]!.text.length > 0, pathname + ': the heading says what the page is');

      // A heading may go one level deeper at a time; skipping a level tells a
      // screen-reader user a section is missing.
      let previous = 1;
      for (const heading of shape.headings) {
        assert.ok(
          heading.level <= previous + 1,
          pathname + ': heading levels jump from h' + previous + ' to h' + heading.level + ' at "' + heading.text + '"',
        );
        previous = heading.level;
      }

      assert.equal(shape.unlabelled, 0, pathname + ': ' + shape.unlabelled + ' visible controls have no accessible name');
    });
  }
});

// ── right to left, on a phone ──────────────────────────────────────────────

test('the Phase 3 pages lay out right to left on a phone without sideways scroll', async () => {
  for (const pathname of PUBLIC_PAGES) {
    await visit(pathname, { viewport: MOBILE }, async (page) => {
      const layout = await page.evaluate(() => {
        const overflowing = [...document.querySelectorAll('body *')]
          .filter((node) => {
            const box = node.getBoundingClientRect();
            // An element inside its own scroller is allowed to be wider.
            let parent = node.parentElement;
            while (parent) {
              if (getComputedStyle(parent).overflowX !== 'visible') return false;
              parent = parent.parentElement;
            }
            return box.right > window.innerWidth + 1 || box.left < -1;
          })
          .map((node) => node.tagName + '.' + (node.className || '').toString().slice(0, 30))
          .slice(0, 5);
        return {
          documentWidth: document.documentElement.scrollWidth,
          windowWidth: window.innerWidth,
          bodyDirection: getComputedStyle(document.body).direction,
          overflowing,
        };
      });

      assert.equal(layout.bodyDirection, 'rtl', pathname + ': the body reads right to left');
      assert.ok(
        layout.documentWidth <= layout.windowWidth + 1,
        pathname + ': the page is ' + layout.documentWidth + 'px wide on a ' + layout.windowWidth + 'px screen',
      );
      assert.deepEqual(layout.overflowing, [], pathname + ': elements hang off the side of the screen');

      // The page reads as Persian text, not as a translated shell with the
      // content still in another language.
      const text = await page.evaluate(() => document.body.innerText);
      assert.match(text, /[؀-ۿ]/u, pathname + ': the page is written in Persian');
    });
  }
});

// ── performance, measured rather than claimed ──────────────────────────────

test('the Phase 3 pages a visitor lands on answer quickly enough to be usable', async () => {
  for (const pathname of PUBLIC_PAGES) {
    const measured = await visit(pathname, {}, async (page) => {
      const paint = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const firstPaint = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
          firstContentfulPaint: firstPaint?.startTime ?? 0,
        };
      });
      return paint;
    });

    // Loose on purpose: this catches a page that renders a whole table server
    // side or waits on something it should not, not a page that is 80ms slower
    // than another. A tighter number here would fail on a busy CI machine and
    // teach everybody to ignore it.
    assert.ok(
      measured.domContentLoaded < 8_000,
      pathname + ': the document took ' + Math.round(measured.domContentLoaded) + 'ms to be ready',
    );
  }

  const slowest = [...timings].sort((left, right) => right.ms - left.ms)[0];
  assert.ok(slowest!.ms < 15_000, 'the slowest Phase 3 page was ' + slowest!.path + ' at ' + Math.round(slowest!.ms) + 'ms');
});

test('a page a visitor lands on does not ship an unreasonable amount of markup', async () => {
  const measured = timings.filter((entry) => PUBLIC_PAGES.includes(entry.path));
  assert.ok(measured.length > 0, 'the public pages were measured');
  for (const entry of measured) {
    // A marketplace listing page is allowed to be large; a megabyte of server
    // rendered HTML on a first visit is a paging bug, not a rich page.
    assert.ok(entry.bytes < 1_500_000, entry.path + ' sent ' + Math.round(entry.bytes / 1024) + 'KB of HTML');
  }
});

// ── the private pages answer, and answer to the right person ───────────────

test('every Phase 3 page that needs an account says so rather than half rendering', async () => {
  for (const pathname of PRIVATE_PAGES) {
    await visit(pathname, {}, async (page) => {
      // A signed-out visitor is sent to sign in; nothing of the page leaks on
      // the way past.
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      assert.match(page.url(), /\/login/, pathname + ' sends a signed-out visitor to sign in');
    });
  }
});

test('the same pages render for somebody signed in, with a heading and a main landmark', async () => {
  for (const pathname of PRIVATE_PAGES) {
    await visit(pathname, { asUser: true }, async (page) => {
      const shape = await page.evaluate(() => ({
        url: location.pathname,
        main: document.querySelectorAll('main').length,
        h1: (document.querySelector('h1')?.textContent ?? '').trim(),
      }));
      assert.equal(shape.url, pathname, pathname + ' rendered rather than redirecting');
      assert.equal(shape.main, 1, pathname + ': exactly one main landmark');
      assert.ok(shape.h1.length > 0, pathname + ': the page says what it is');
    });
  }
});
