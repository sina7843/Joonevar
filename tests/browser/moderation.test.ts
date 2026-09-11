/**
 * Reports and moderation in the browser — Phase 2 PROMPT-005.
 *
 * A signed-in reader reports a news item; the content admin works the queue:
 * a correction request the author answers by saving, a report that hides the
 * page, a publisher restriction that stops publishing until it is lifted. The
 * report page asks an anonymous visitor to sign in, and the queue refuses
 * everyone but the content admin.
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
const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-005');
const MOBILE = { width: 360, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const AUTHOR = '09990000007';
const CONTENT_ADMIN = '09990000008';
const READER = '0999' + String(randomInt(1_000_000, 9_999_999));
const RUN = String(randomInt(100_000, 999_999));

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
type Who = 'author' | 'contentAdmin' | 'reader' | 'visitor';
let browser!: Browser;
const states = new Map<Who, State>();

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
  for (const [who, mobile] of [
    ['author', AUTHOR],
    ['contentAdmin', CONTENT_ADMIN],
    ['reader', READER],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(await context.newPage(), mobile);
      states.set(who, await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(who: Who, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: states.get(who) });
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

/** The author writes and publishes a news item; returns its id and address. */
async function publishNews(page: Page, title: string): Promise<{ id: string; slug: string }> {
  await page.goto(BASE_URL + '/author/new', { waitUntil: 'load' });
  await page.getByTestId('content-kind').selectOption('NEWS');
  await page.getByTestId('content-title-new').fill(title);
  await Promise.all([
    page.waitForURL((url) => /^\/author\/content\/[0-9a-f-]{36}$/.test(url.pathname)),
    page.getByTestId('create-content').click(),
  ]);
  await page.getByTestId('content-summary').fill('SYNTHETIC خلاصه خبر ' + RUN);
  await page.getByTestId('content-body').fill('SYNTHETIC متن خبر ' + RUN);
  await page.getByTestId('save-content').click();
  await waitForText(page, 'content-fields-result', 'ذخیره شد');
  await page.getByTestId('content-status-to').selectOption('PUBLISHED');
  await page.getByTestId('change-content-status').click();
  await waitForText(page, 'content-status-result', 'وضعیت ثبت شد');
  return { id: new URL(page.url()).pathname.split('/').pop()!, slug: await page.getByTestId('content-slug').inputValue() };
}

async function reportAs(page: Page, contentId: string, reason: string, details: string, expected: string): Promise<void> {
  await page.goto(BASE_URL + '/report/content/' + contentId, { waitUntil: 'load' });
  await page.getByTestId('report-reason-' + reason).check();
  await page.getByTestId('report-details').fill(details);
  await page.getByTestId('submit-report').click();
  await waitForText(page, 'report-result', expected);
}

async function decide(page: Page, contentId: string, decision: string, reason: string, untilLocal?: string): Promise<void> {
  await page.goto(BASE_URL + '/content/reports/' + contentId, { waitUntil: 'load' });
  await page.getByTestId('decision').selectOption(decision);
  if (untilLocal) await page.getByTestId('restrict-until').fill(untilLocal);
  await page.getByTestId('decision-reason').fill(reason);
  await page.getByTestId('submit-decision').click();
  await waitForText(page, 'decision-result', 'ثبت شد');
}

let news: { id: string; slug: string };

test('a signed-in reader reports a news item, and the content admin asks its author for a correction', async () => {
  news = await as('author', DESKTOP, (page) => publishNews(page, 'خبر گزارش‌شده ' + RUN));

  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/news/' + encodeURIComponent(news.slug), { waitUntil: 'load' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/login'),
      page.getByTestId('report-content-link').click(),
    ]);
    assert.equal(new URL(page.url()).searchParams.get('next'), '/report/content/' + news.id, 'sign in, then back to the report');
  });

  await as('reader', MOBILE, async (page) => {
    await reportAs(page, news.id, 'HEALTH_MISINFORMATION', 'SYNTHETIC بند دوم توصیه نادرستی دارد', 'گزارش شما ثبت شد');
    await page.screenshot({ path: path.join(SHOTS, 'report-submitted-mobile.png'), fullPage: true });
    await reportAs(page, news.id, 'SPAM', 'دوباره', 'هنوز در حال بررسی');
  });

  await as('contentAdmin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/content/reports', { waitUntil: 'load' });
    await page.getByTestId('report-queue-item-' + news.id).waitFor();
    assert.ok((await page.getByTestId('report-queue-item-' + news.id).innerText()).includes('ادعای سلامت نادرست'));
    assert.ok(!(await page.locator('body').innerText()).includes(READER), 'the reporter is not shown');
    await page.screenshot({ path: path.join(SHOTS, 'report-queue.png'), fullPage: true });

    await decide(page, news.id, 'REQUEST_CORRECTION', 'SYNTHETIC منبع توصیه را اضافه کنید');
    await page.getByTestId('pending-correction').waitFor();
    assert.equal(await page.getByTestId('open-report').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'report-decided.png'), fullPage: true });
  });

  await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author/content/' + news.id, { waitUntil: 'load' });
    assert.equal((await page.getByTestId('content-correction-note').textContent())?.trim(), 'SYNTHETIC منبع توصیه را اضافه کنید');
    await page.getByTestId('content-body').fill('SYNTHETIC متن اصلاح‌شده با منبع ' + RUN);
    await page.getByTestId('save-content').click();
    await waitForText(page, 'content-fields-result', 'ذخیره شد');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('content-correction-note').count(), 0, 'saving answers the request');
  });
});

test('a report that hides the page takes it down, and a restricted author cannot publish until lifted', async () => {
  assert.ok(news, 'depends on the published news');

  await as('reader', MOBILE, (page) => reportAs(page, news.id, 'SPAM', 'SYNTHETIC تبلیغ پنهان', 'گزارش شما ثبت شد'));
  await as('contentAdmin', DESKTOP, (page) => decide(page, news.id, 'HIDE', 'SYNTHETIC تبلیغ پنهان تأیید شد'));
  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/news/' + encodeURIComponent(news.slug), { waitUntil: 'load' });
    assert.equal(response?.status(), 404, 'hidden content is not public');
  });

  const second = await as('author', DESKTOP, (page) => publishNews(page, 'خبر دوم ' + RUN));
  await as('reader', MOBILE, (page) => reportAs(page, second.id, 'OFFENSIVE', 'SYNTHETIC لحن توهین‌آمیز', 'گزارش شما ثبت شد'));
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const untilLocal =
    future.getFullYear() + '-' + pad(future.getMonth() + 1) + '-' + pad(future.getDate()) + 'T' + pad(future.getHours()) + ':' + pad(future.getMinutes());
  await as('contentAdmin', DESKTOP, (page) => decide(page, second.id, 'RESTRICT_PUBLISHER', 'SYNTHETIC تکرار محتوای نامناسب', untilLocal));

  const blocked = await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/author/new', { waitUntil: 'load' });
    await page.getByTestId('content-kind').selectOption('NEWS');
    await page.getByTestId('content-title-new').fill('خبر در زمان محدودیت ' + RUN);
    await Promise.all([
      page.waitForURL((url) => /^\/author\/content\/[0-9a-f-]{36}$/.test(url.pathname)),
      page.getByTestId('create-content').click(),
    ]);
    await page.getByTestId('content-summary').fill('خلاصه');
    await page.getByTestId('content-body').fill('متن');
    await page.getByTestId('save-content').click();
    await waitForText(page, 'content-fields-result', 'ذخیره شد');
    await page.getByTestId('content-restriction').waitFor();
    await page.getByTestId('content-status-to').selectOption('PUBLISHED');
    await page.getByTestId('change-content-status').click();
    await waitForText(page, 'content-status-result', 'محدود شده است');
    await page.screenshot({ path: path.join(SHOTS, 'author-restricted.png'), fullPage: true });
    return new URL(page.url()).pathname;
  });

  await as('contentAdmin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/content/restrictions', { waitUntil: 'load' });
    const form = page.locator('form[data-testid^="lift-restriction-form-"]').first();
    await form.waitFor();
    const restrictionId = (await form.getAttribute('data-testid'))!.replace('lift-restriction-form-', '');
    await page.screenshot({ path: path.join(SHOTS, 'restrictions.png'), fullPage: true });
    await page.getByTestId('lift-reason-' + restrictionId).fill('SYNTHETIC نویسنده توضیح داد');
    await page.getByTestId('lift-restriction-' + restrictionId).click();
    // Once lifted the restriction is no longer active and its form goes; the entry itself says what happened.
    await waitForText(page, 'restriction-' + restrictionId, 'برداشته‌شده');
  });

  await as('author', DESKTOP, async (page) => {
    await page.goto(BASE_URL + blocked, { waitUntil: 'load' });
    assert.equal(await page.getByTestId('content-restriction').count(), 0);
    await page.getByTestId('content-status-to').selectOption('PUBLISHED');
    await page.getByTestId('change-content-status').click();
    await waitForText(page, 'content-status-result', 'وضعیت ثبت شد');
  });
});

test('the report queue and restrictions belong to the content admin alone', async () => {
  for (const who of ['reader', 'author'] as const) {
    await as(who, MOBILE, async (page) => {
      for (const target of ['/content/reports', '/content/restrictions']) {
        await page.goto(BASE_URL + target, { waitUntil: 'load' });
        assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', who + ' ' + target);
      }
    });
  }
  await as('reader', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/report/content/00000000-0000-4000-8000-000000000000', { waitUntil: 'load' });
    assert.equal(response?.status(), 404, 'an unknown item cannot be reported');
  });
});
