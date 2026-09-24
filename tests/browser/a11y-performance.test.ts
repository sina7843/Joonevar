/**
 * Keyboard, screen-reader and performance evidence — Phase 2.5 §12 (PROMPT-016).
 *
 * Two things a delivery claim usually rests on and shouldn't: that the product
 * is usable without a mouse, and that it is fast. Both are measured here rather
 * than asserted in prose — the timings are printed so the report can quote real
 * numbers, and the thresholds are deliberately loose: this is evidence that
 * nothing is pathological, not a benchmark.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, signIn } from './support.ts';

let browser!: Browser;
let signedIn: Awaited<ReturnType<BrowserContext['storageState']>>;

/** Measured, then reported. Nothing here decides a pass on a millisecond. */
const timings: Array<{ path: string; ms: number; bytes: number }> = [];

before(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, '09990000001');
    signedIn = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
  if (timings.length > 0) {
    const rows = timings.map((entry) => entry.path + ' ' + Math.round(entry.ms) + 'ms ' + Math.round(entry.bytes / 1024) + 'KB');
    console.log('server response evidence: ' + rows.join(' | '));
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

test('a keyboard reaches the content, the navigation and the first action of a page', async () => {
  await visit('/', {}, async (page) => {
    // The first stop is the skip link, which is the keyboard's way past the nav.
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return { text: (active?.textContent ?? '').trim(), href: active?.getAttribute('href') ?? '' };
    });
    assert.equal(first.href, '#main', 'the first tab stop is the skip link, not the logo');
    assert.ok(first.text.length > 0, 'the skip link says what it does');

    // Every tab stop is focusable and visible, and focus never lands on nothing.
    const stops: string[] = [];
    for (let index = 0; index < 12; index += 1) {
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
      assert.equal(stop.hidden, false, 'focus landed on a hidden element: ' + stop.tag);
      assert.ok(stop.sized, 'focus landed on an element with no box: ' + stop.tag);
      assert.ok(stop.label.length > 0, 'a focused control with no words: ' + stop.tag);
      stops.push(stop.tag);
    }
    assert.ok(stops.length >= 5, 'the home page has a usable tab order');
  });
});

test('the skip link jumps to the main content and the page has one main landmark', async () => {
  await visit('/clubs', {}, async (page) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const focusedMain = await page.evaluate(() => {
      const main = document.querySelector('main');
      return { exists: main !== null, count: document.querySelectorAll('main').length, hash: window.location.hash };
    });
    assert.equal(focusedMain.exists, true);
    assert.equal(focusedMain.count, 1, 'exactly one main landmark');
    assert.equal(focusedMain.hash, '#main', 'the skip link actually moves to the content');
  });
});

test('a form control is named, and its error is announced rather than only coloured', async () => {
  await visit('/login', {}, async (page) => {
    const named = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input, select, textarea')].filter((node) => {
        // A hidden field is not a control anybody operates, so it carries no
        // label by design; the same goes for one the page has hidden.
        const input = node as HTMLInputElement;
        return input.type !== 'hidden' && input.offsetParent !== null;
      }) as HTMLElement[];
      return inputs.map((input) => {
        const id = input.getAttribute('id');
        const label = id ? document.querySelector('label[for="' + id + '"]') : null;
        return {
          type: input.getAttribute('type') ?? input.tagName,
          named: Boolean(label?.textContent?.trim() || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')),
        };
      });
    });
    assert.ok(named.length > 0, 'the sign-in page has a field');
    for (const field of named) assert.equal(field.named, true, 'an unnamed field: ' + field.type);

    // A refused entry is announced, not just outlined: the field marks itself
    // invalid, points at the message, and the message is a live region.
    const mobile = page.getByTestId('mobile-input');
    await mobile.fill('123');
    await page.getByTestId('send-code').click();
    // Waited for on the field itself rather than on whichever alert renders
    // first, so this does not race the re-render that carries the error.
    await page.locator('[data-testid="mobile-input"][aria-invalid="true"]').waitFor({ timeout: 15_000 });
    const describedBy = await mobile.getAttribute('aria-describedby');
    assert.ok(describedBy, 'the field points at its message');
    const announced = await page.locator('[role="alert"], [aria-live]').allInnerTexts();
    assert.ok(
      announced.some((text) => text.trim().length > 0),
      'the refusal is in a live region a screen reader reads',
    );
  });
});

test('the signed-in shell is reachable and labelled on a phone', async () => {
  await visit('/dashboard', { viewport: MOBILE, asUser: true }, async (page) => {
    const landmarks = await page.evaluate(() => ({
      main: document.querySelectorAll('main').length,
      navs: [...document.querySelectorAll('nav')].map((nav) => nav.getAttribute('aria-label') ?? ''),
      h1: document.querySelectorAll('h1').length,
    }));
    assert.equal(landmarks.main, 1);
    assert.ok(landmarks.navs.every((label) => label.length > 0), 'every navigation says what it is');
    assert.ok(landmarks.h1 <= 1, 'at most one h1 on a page');

    // The bottom navigation is operable from the keyboard too.
    const reachable = await page.evaluate(() => {
      const links = [...document.querySelectorAll('nav a')] as HTMLElement[];
      return links.every((link) => link.tabIndex >= 0);
    });
    assert.equal(reachable, true);
  });
});

test('the pages that matter answer quickly enough to be worth measuring', async () => {
  // Public pages, then a signed-in one. The numbers are printed after the run;
  // the assertion only catches something pathological.
  for (const path of ['/', '/clubs', '/veterinarians', '/articles', '/services']) {
    await visit(path, {}, async () => {});
  }
  await visit('/dashboard', { asUser: true }, async () => {});
  await visit('/payments', { asUser: true }, async () => {});

  for (const entry of timings) {
    assert.ok(entry.ms < 10_000, entry.path + ' took ' + entry.ms + 'ms');
    assert.ok(entry.bytes < 2_000_000, entry.path + ' sent ' + entry.bytes + ' bytes of HTML');
  }
  const slowest = [...timings].sort((a, b) => b.ms - a.ms)[0]!;
  assert.ok(slowest.ms < 10_000, 'slowest was ' + slowest.path);
});
