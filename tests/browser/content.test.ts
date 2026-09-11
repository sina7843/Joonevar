/**
 * CMS in the browser — Phase 2 PROMPT-004.
 *
 * A fresh account is made an author by the superadmin, writes education with a
 * source, a review date and an image, and publishes it; a visitor reads it.
 * Then scheduled news, moderation by the content admin that the author cannot
 * undo, an address that moves, an archived page, and the two environments
 * refused to everyone who does not hold their role.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-004');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const SUPERADMIN = '09990000006';
const CONTENT_ADMIN = '09990000008';
const RUN = String(randomInt(100_000, 999_999));
const AUTHOR_MOBILE = '0999' + String(randomInt(1_000_000, 9_999_999));
// A real 1×1 PNG, so the server's signature check accepts it and the browser can decode it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let browser!: Browser;
const states = new Map<string, State>();

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
  for (const [name, mobile] of [
    ['superadmin', SUPERADMIN],
    ['contentAdmin', CONTENT_ADMIN],
    ['author', AUTHOR_MOBILE],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(await context.newPage(), mobile);
      states.set(name, await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(
  who: 'superadmin' | 'contentAdmin' | 'author' | 'visitor',
  viewport: { width: number; height: number },
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    viewport,
    locale: 'fa-IR',
    storageState: who === 'visitor' ? undefined : states.get(who),
  });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page.waitForFunction(
    ([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false,
    [testId, text] as const,
  );
}

async function setStatus(page: Page, to: string, expected: string, reason?: string, publishAtLocal?: string) {
  await page.getByTestId('content-status-to').selectOption(to);
  if (publishAtLocal) await page.getByTestId('content-publish-at').fill(publishAtLocal);
  if (reason) await page.getByTestId('content-status-reason').fill(reason);
  await page.getByTestId('change-content-status').click();
  await waitForText(page, 'content-status-result', expected);
}

/** Creates a draft in the author environment and returns its editor address and public address. */
async function createDraft(page: Page, kind: 'ARTICLE' | 'NEWS', title: string) {
  await page.goto(BASE_URL + '/author/new', { waitUntil: 'load' });
  await page.getByTestId('content-kind').selectOption(kind);
  await page.getByTestId('content-title-new').fill(title);
  await Promise.all([
    page.waitForURL((url) => /^\/author\/content\/[0-9a-f-]{36}$/.test(url.pathname)),
    page.getByTestId('create-content').click(),
  ]);
  await page.getByTestId('content-fields-form').waitFor();
  return { id: new URL(page.url()).pathname.split('/').pop()!, slug: await page.getByTestId('content-slug').inputValue() };
}

async function writeBody(page: Page, withSources: boolean) {
  await page.getByTestId('content-summary').fill('SYNTHETIC خلاصه آزمایشی ' + RUN);
  await page.getByTestId('content-body').fill('SYNTHETIC بند اول ' + RUN + '\n\nبند دوم.');
  if (withSources) {
    await page.getByTestId('content-sources').fill('SYNTHETIC منبع ' + RUN + ' | https://example.org/synthetic-source');
    await page.getByTestId('content-reviewed-on').fill('2026-01-15');
  }
  await page.getByTestId('save-content').click();
  await waitForText(page, 'content-fields-result', 'ذخیره شد');
}

let article: { id: string; slug: string };

test('the superadmin grants authorship, and the author publishes education a visitor can read', async () => {
  await as('superadmin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/roles', { waitUntil: 'load' });
    await page.getByTestId('role-mobile').fill(AUTHOR_MOBILE);
    await page.getByTestId('role-name').selectOption('AUTHOR');
    await page.getByTestId('role-action').selectOption('GRANT');
    await page.getByTestId('role-reason').fill('SYNTHETIC نویسنده آموزش');
    await page.getByTestId('save-content-role').click();
    await waitForText(page, 'content-role-result', 'نقش فعال شد');
    await page.getByTestId('role-holder-' + AUTHOR_MOBILE + '-AUTHOR').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'admin-roles.png'), fullPage: true });
  });

  article = await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author', { waitUntil: 'load' });
    assert.ok((await page.locator('body').innerText()).includes('هنوز محتوایی نیست'));

    const draft = await createDraft(page, 'ARTICLE', 'آموزش آزمایشی ' + RUN);
    // Education cannot go public without a source.
    await page.getByTestId('content-summary').fill('خلاصه');
    await page.getByTestId('content-body').fill('متن');
    await page.getByTestId('save-content').click();
    await waitForText(page, 'content-fields-result', 'ذخیره شد');
    await setStatus(page, 'PUBLISHED', 'منبع');

    await writeBody(page, true);
    await page.getByTestId('content-image-file').setInputFiles({ name: 'puppy.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('content-image-alt-new').fill('SYNTHETIC توله در برف');
    await page.getByTestId('upload-content-image').click();
    await waitForText(page, 'content-image-result', 'تصویر ذخیره شد');
    await setStatus(page, 'PUBLISHED', 'وضعیت ثبت شد');
    await waitForText(page, 'content-public-state', 'در سایت دیده می‌شود');
    await page.screenshot({ path: path.join(SHOTS, 'author-editor.png'), fullPage: true });
    return draft;
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/articles', { waitUntil: 'load' });
    await page.getByTestId('content-card-' + article.slug).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'articles-mobile.png'), fullPage: true });
    await Promise.all([
      page.waitForURL((url) => decodeURIComponent(url.pathname) === '/articles/' + article.slug),
      page.getByTestId('content-card-' + article.slug).click(),
    ]);
    await page.getByTestId('content-page').waitFor();
    assert.equal((await page.locator('h1').textContent())?.trim(), 'آموزش آزمایشی ' + RUN);
    assert.ok((await page.getByTestId('content-meta').innerText()).includes('تیم همزیست'), 'an author who did not show a name is signed by the platform');

    const image = page.getByTestId('content-image');
    await image.waitFor();
    assert.ok(await image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0), 'the image is served');
    assert.equal(await page.getByTestId('content-sources').locator('a').getAttribute('rel'), 'nofollow noopener noreferrer');

    const ld = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? 'null')).find((d) => d?.['@type'] === 'Article'));
    assert.equal(ld.headline, 'آموزش آزمایشی ' + RUN);
    assert.equal(ld.author['@type'], 'Organization');
    assert.ok(String(ld.image?.[0] ?? '').startsWith(BASE_URL + '/media/'));
    assert.equal(
      decodeURIComponent((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? ''),
      BASE_URL + '/articles/' + article.slug,
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'the article scrolls sideways (' + overflow + 'px)');
    await page.screenshot({ path: path.join(SHOTS, 'article-mobile.png'), fullPage: true });
  });

  await as('visitor', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/articles/' + encodeURIComponent(article.slug), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(SHOTS, 'article-desktop.png'), fullPage: true });
  });
});

test('scheduled news stays out of sight, and content hidden by the content admin cannot be undone by its author', async () => {
  assert.ok(article, 'depends on the published article');

  const news = await as('author', DESKTOP, async (page) => {
    const draft = await createDraft(page, 'NEWS', 'خبر زمان‌بندی‌شده ' + RUN);
    await writeBody(page, false);
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local =
      future.getFullYear() + '-' + pad(future.getMonth() + 1) + '-' + pad(future.getDate()) + 'T' + pad(future.getHours()) + ':' + pad(future.getMinutes());
    await setStatus(page, 'PUBLISHED', 'انتشار زمان‌بندی شد', undefined, local);
    await waitForText(page, 'content-public-state', 'زمان‌بندی‌شده');
    return draft;
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/news/' + encodeURIComponent(news.slug), { waitUntil: 'load' });
    assert.equal(response?.status(), 404, 'scheduled news is not public yet');
    await page.goto(BASE_URL + '/news', { waitUntil: 'load' });
    await page.getByText('هنوز خبری منتشر نشده است').waitFor();
  });

  await as('contentAdmin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/content', { waitUntil: 'load' });
    await page.getByTestId('panel-item-' + article.id).waitFor();
    await page.goto(BASE_URL + '/content/' + article.id, { waitUntil: 'load' });
    await setStatus(page, 'HIDDEN', 'وضعیت ثبت شد', 'SYNTHETIC نیازمند بررسی منبع');
    await page.getByTestId('content-moderation-note').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'content-admin-hidden.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/articles/' + encodeURIComponent(article.slug), { waitUntil: 'load' });
    assert.equal(response?.status(), 404, 'hidden content is not public');
  });

  await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author/content/' + article.id, { waitUntil: 'load' });
    assert.equal((await page.getByTestId('content-moderation-note').textContent())?.trim(), 'SYNTHETIC نیازمند بررسی منبع');
    assert.equal(await page.getByTestId('save-content').isDisabled(), true, 'the author cannot edit hidden content');
    assert.equal(await page.getByTestId('content-status-form').count(), 0, 'nor change its status');
    await page.screenshot({ path: path.join(SHOTS, 'author-hidden.png'), fullPage: true });
  });

  await as('contentAdmin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/content/' + article.id, { waitUntil: 'load' });
    await setStatus(page, 'PUBLISHED', 'وضعیت ثبت شد', 'SYNTHETIC منبع تأیید شد');
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/articles/' + encodeURIComponent(article.slug), { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'restored by the content admin');
  });
});

test('a moved address redirects, an archived page keeps its notice, and each environment refuses everyone else', async () => {
  assert.ok(article, 'depends on the published article');
  const renamed = 'synthetic-article-' + RUN;

  const imagePath = await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author/content/' + article.id, { waitUntil: 'load' });
    await page.getByTestId('content-slug').fill(renamed);
    await page.getByTestId('save-content').click();
    await waitForText(page, 'content-fields-result', 'ذخیره شد');
    return (await page.getByTestId('content-image-preview').getAttribute('src'))!.replace('/api/files/', '/media/');
  });

  await as('visitor', MOBILE, async (page) => {
    const moved = await page.request.get(BASE_URL + '/articles/' + encodeURIComponent(article.slug), { maxRedirects: 0 });
    assert.equal(moved.status(), 308);
    assert.equal(new URL(moved.headers()['location'] ?? '', BASE_URL).pathname, '/articles/' + renamed);
    assert.equal((await page.request.get(BASE_URL + imagePath)).status(), 200, 'the image of visible content is public');
  });

  await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author/content/' + article.id, { waitUntil: 'load' });
    await setStatus(page, 'ARCHIVED', 'وضعیت ثبت شد', 'SYNTHETIC قدیمی شده');
  });

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/articles/' + renamed, { waitUntil: 'load' });
    await page.getByTestId('content-archived-notice').waitFor();
    assert.match((await page.locator('meta[name="robots"]').getAttribute('content')) ?? '', /noindex/);
    await page.goto(BASE_URL + '/articles', { waitUntil: 'load' });
    await page.getByTestId('breadcrumbs').waitFor();
    assert.equal(await page.getByTestId('content-card-' + renamed).count(), 0, 'an archived article is not listed');
    await page.screenshot({ path: path.join(SHOTS, 'article-archived-mobile.png'), fullPage: true });

    // Anonymous: sign in first, with the exact address carried along.
    await page.goto(BASE_URL + '/author/content/' + article.id, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname === '/login');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/author/content/' + article.id);
  });

  // A signed-in account without the role is refused by the server.
  await as('visitor', MOBILE, async (page) => {
    await signIn(page, '0999' + String(randomInt(1_000_000, 9_999_999)));
    for (const target of ['/author', '/content', '/author/content/' + article.id]) {
      await page.goto(BASE_URL + target, { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', target);
    }
  });
  await as('author', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/content/' + article.id, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', 'an author is not a content admin');
  });
  await as('contentAdmin', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/author', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', 'a content admin is not an author');
  });
});
