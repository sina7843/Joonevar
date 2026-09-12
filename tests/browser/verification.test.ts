/**
 * Document verification in the browser — Phase 2 PROMPT-014.
 *
 * A stranger with a code asks whether a document exists: the form answers, a
 * QR address answers the same way, a wrong code is told plainly that nothing
 * was found, and repeated guessing is stopped. What a real issued document
 * looks like is covered by the database suite, where a document can be issued
 * through the real Phase 1 flow.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, expectText } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-014');

let browser!: Browser;

/** The managed ceiling of §17, written the way the settings panel writes it. */
async function setAttemptLimit(value: number): Promise<void> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    await db.execute(
      sql`update product_setting set value = ${String(value)}::jsonb, version = version + 1, updated_at = now()
          where key = 'verification.attempt_hourly_limit'`,
    );
    await db.execute(sql`delete from verification_attempt`);
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
});

after(async () => {
  await setAttemptLimit(30).catch(() => undefined);
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

test('the public site links verification, and the page starts with an empty state', async () => {
  await setAttemptLimit(30);
  await asVisitor(MOBILE, async (page) => {
    await page.goto(BASE_URL + '/verify', { waitUntil: 'load' });
    await page.getByTestId('verify-form').waitFor();
    await expectText(page, 'هنوز کدی وارد نشده است');
    await expectText(page, 'اطلاعات مالک');
    await page.screenshot({ path: path.join(SHOTS, 'verify-empty-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
});

test('a code nobody issued is told plainly that nothing was found', async () => {
  await setAttemptLimit(30);
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/verify', { waitUntil: 'load' });
    await page.getByTestId('verify-code-input').fill('RS-ZZZZ2345');
    await Promise.all([page.waitForURL(/\/verify\?/), page.getByTestId('verify-submit').click()]);
    await page.getByTestId('verify-not-found').waitFor();
    // The answer never says whether some other code would have worked.
    assert.equal(await page.getByTestId('verify-result').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'verify-not-found.png'), fullPage: true });
  });
});

test('a QR address answers the same question as the form', async () => {
  await setAttemptLimit(30);
  await asVisitor(MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + '/verify/PD-ZZZZ2345', { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await page.getByTestId('verify-not-found').waitFor();
    await page.getByTestId('verify-another').click();
    await page.getByTestId('verify-form').waitFor();
  });
});

test('repeated guessing is stopped by the managed ceiling', async () => {
  await setAttemptLimit(2);
  await asVisitor(DESKTOP, async (page) => {
    for (const code of ['RS-AAAA2345', 'RS-BBBB2345']) {
      await page.goto(BASE_URL + '/verify?code=' + code, { waitUntil: 'load' });
      await page.getByTestId('verify-not-found').waitFor();
    }
    await page.goto(BASE_URL + '/verify?code=RS-CCCC2345', { waitUntil: 'load' });
    await page.getByTestId('verify-rate-limited').waitFor();
    await expectText(page, 'بیش از حد مجاز');
    await page.screenshot({ path: path.join(SHOTS, 'verify-rate-limited.png'), fullPage: true });
  });
  await setAttemptLimit(30);
});

test('the verification page is not indexed', async () => {
  await asVisitor(DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/verify', { waitUntil: 'load' });
    const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content')) ?? '';
    assert.match(robots, /noindex/);
  });
});
