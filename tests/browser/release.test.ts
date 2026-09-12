/**
 * Release readiness of the public site — PROMPT-020.
 *
 * The handover claims two things a document cannot prove on its own: that the
 * addresses the site publishes actually answer, and that the health endpoint
 * describes the running system rather than a hopeful one. Both are checked here
 * against the real server.
 *
 * What is deliberately not repeated: `public-shell.test.ts` already owns robots,
 * the sitemap index, the Persian 404 and the header link rules; `a11y.test.ts`
 * owns the keyboard and image behaviour. This suite follows the links those
 * suites only assert exist.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { BASE_URL, DESKTOP } from './support.ts';

let browser!: Browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/** Addresses that need an account. A sitemap that lists one of these is a leak, not a link. */
const GUARDED_PREFIXES = [
  '/dashboard',
  '/account',
  '/admin',
  '/assoc',
  '/genetics',
  '/review',
  '/content',
  '/author',
  '/vet',
  '/login',
  '/requests',
  '/animals',
  '/api',
];

const locations = (xml: string): string[] =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);

test('every address the sitemap publishes really answers, and none of them is guarded', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const index = await context.request.get(BASE_URL + '/sitemap.xml');
    assert.equal(index.status(), 200);
    const sections = locations(await index.text());
    assert.ok(sections.length > 0, 'the sitemap index names no section');

    const seen = new Set<string>();
    for (const section of sections) {
      const response = await context.request.get(section);
      assert.equal(response.status(), 200, section + ' is listed but does not answer');
      for (const url of locations(await response.text())) seen.add(url);
    }
    assert.ok(seen.size > 0, 'no public address is published at all');

    for (const url of seen) {
      const path = new URL(url).pathname;
      const guarded = GUARDED_PREFIXES.find((prefix) => path === prefix || path.startsWith(prefix + '/'));
      assert.equal(guarded, undefined, url + ' is guarded and must not be published');

      // A published address that answers 404 is the broken link this prompt asks about.
      const page = await context.request.get(url);
      assert.equal(page.status(), 200, url + ' is published in the sitemap but answers ' + page.status());
    }
  } finally {
    await context.close();
  }
});

test('the links a visitor can actually click all lead somewhere', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await context.newPage();
    const checked = new Set<string>();
    for (const start of ['/', '/about', '/services', '/places', '/associations', '/breeds']) {
      await page.goto(BASE_URL + start, { waitUntil: 'load' });
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? ''));

      for (const href of hrefs) {
        // Only internal page links: a mail link, an anchor or an outside address
        // is not this site's to answer for.
        if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/#')) continue;
        const path = href.split('#')[0]!;
        if (checked.has(path)) continue;
        checked.add(path);

        const response = await context.request.get(BASE_URL + path);
        const guarded = GUARDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
        if (guarded) {
          // A guarded link is offered on purpose; it must ask for sign-in, never break.
          assert.notEqual(response.status(), 404, path + ' is offered on ' + start + ' and is missing');
          continue;
        }
        assert.equal(response.status(), 200, path + ' is linked from ' + start + ' and answers ' + response.status());
      }
    }
    assert.ok(checked.size >= 6, 'the public pages offered almost no links: ' + checked.size);
  } finally {
    await context.close();
  }
});

test('the health endpoint describes the running system, including what is still unset', async () => {
  const context = await browser.newContext();
  try {
    const response = await context.request.get(BASE_URL + '/api/health');
    assert.equal(response.status(), 200);
    const report = (await response.json()) as {
      status: string;
      database: { reachable: boolean; migrationsApplied: number | null };
      settings: { total: number; notConfigured: string[] };
      taxonomies: { name: string; version: number }[];
      adapters: { status: string }[];
    };

    assert.equal(report.database.reachable, true);
    assert.ok((report.database.migrationsApplied ?? 0) >= 30, 'every migration is applied');
    assert.ok(report.settings.total > 0);
    /*
     * Nobody has entered the real tariffs or provider credentials, so the only
     * honest answer is `degraded` with the missing keys named. A report that
     * said `ok` here would be the success screen §26 forbids.
     */
    assert.equal(report.status, 'degraded');
    assert.ok(report.settings.notConfigured.length > 0, 'the unset values are named');

    // The taxonomy generations of DEC-0179, so an operator can read what is installed.
    const names = report.taxonomies.map((entry) => entry.name);
    for (const expected of ['species', 'province', 'city', 'vet_specialty', 'centre_type']) {
      assert.ok(names.includes(expected), 'the health report does not mention ' + expected);
    }
    assert.ok(
      report.taxonomies.every((entry) => Number.isInteger(entry.version) && entry.version >= 1),
      'every taxonomy reports a real generation',
    );
  } finally {
    await context.close();
  }
});
