/**
 * The club journey in a real browser — Phase 2.5 PROMPT-012.
 *
 * A person makes a club from their own account, sends it for verification, the
 * association verifies it, the owner publishes it and a visitor on a phone finds
 * it at /clubs. Somebody with no role in that club gets nothing from its
 * management shell, and an unverified club has no public address at all.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, expectText, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2.5', 'prompt-012');
const RUN = String(randomInt(100_000, 999_999));
const NAME = 'کلاب آزمایشی SYNTHETIC ' + RUN;
const DRAFT_NAME = 'کلاب تأییدنشده SYNTHETIC ' + RUN;
const ACCOUNTS = { owner: '09990000001', outsider: '09990000002', assoc: '09990000004' } as const;
type Who = keyof typeof ACCOUNTS | 'visitor';

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let clubId = '';
let publicPath = '';

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();
  for (const [who, mobile] of Object.entries(ACCOUNTS) as [Who, string][]) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
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
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: who === 'visitor' ? undefined : states.get(who) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a person makes a club and sends it to the association', async () => {
  clubId = await as('owner', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/clubs', { waitUntil: 'load' });
    await page.getByTestId('club-name').fill(NAME);
    await page.getByTestId('club-about').fill('کلاب آزمایشی برای بررسی مسیر تأیید.');
    await page.getByTestId('club-contact').fill('02100000000');
    await page.getByTestId('club-create-submit').click();
    await expectText(page, 'پیش‌نویس ساخته شد');

    // A second, deliberately unverified club, used below to prove it has no page.
    await page.getByTestId('club-name').fill(DRAFT_NAME);
    await page.getByTestId('club-create-submit').click();
    await page.reload({ waitUntil: 'load' });

    const card = page.getByTestId('my-clubs').locator('a').filter({ hasText: NAME }).first();
    await card.waitFor();
    const href = (await card.getAttribute('href')) ?? '';
    await card.click();
    await expectText(page, 'ارسال برای بررسی انجمن');
    await page.screenshot({ path: path.join(SHOTS, 'club-management-mobile.png'), fullPage: true });
    await page.getByTestId('club-submit').click();
    await expectText(page, 'در انتظار بررسی');
    return href.split('/').pop() ?? '';
  });
  assert.ok(clubId.length > 10, 'the club id was read from the management link');
});

test('a role in another club is no role here', async () => {
  await as('outsider', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId, { waitUntil: 'load' });
    await expectText(page, 'در آن نقشی ندارید');
    assert.equal(await page.getByTestId('club-submit').count(), 0);
    assert.equal(await page.getByTestId('club-role-form').count(), 0);
  });
});

test('the association verifies the club and the owner publishes it', async () => {
  await as('assoc', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/clubs', { waitUntil: 'load' });
    await expectText(page, NAME);
    await page.getByTestId('club-queue-' + clubId).click();
    await page.getByTestId('club-verification-reason').fill('معرفی و راه ارتباطی کامل است.');
    await page.getByTestId('club-verify').click();
    await expectText(page, 'فعال و تأییدشده');
    await page.screenshot({ path: path.join(SHOTS, 'club-verification-desktop.png'), fullPage: true });
  });

  publicPath = await as('owner', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId, { waitUntil: 'load' });
    await expectText(page, 'تأیید شده است');
    await page.getByTestId('club-publication-submit').click();
    await expectText(page, 'منتشر شد');
    const link = page.locator('a[href^="/clubs/"]').first();
    await link.waitFor();
    return (await link.getAttribute('href')) ?? '';
  });
  assert.match(publicPath, /^\/clubs\/club-[0-9a-f]{10}$/);
});

test('a visitor finds the verified club and nothing else', async () => {
  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/clubs', { waitUntil: 'load' });
    await expectText(page, NAME);
    const body = await page.locator('body').innerText();
    assert.equal(body.includes(DRAFT_NAME), false, 'an unverified club is not listed');
    await page.screenshot({ path: path.join(SHOTS, 'clubs-directory-mobile.png'), fullPage: true });

    await page.goto(BASE_URL + publicPath, { waitUntil: 'load' });
    await expectText(page, 'تأیید انجمن');
    await expectText(page, 'گزارش این کلاب');
    await page.screenshot({ path: path.join(SHOTS, 'club-page-mobile.png'), fullPage: true });

    // The report form itself needs an account: an anonymous visitor is sent to sign in.
    await page.getByTestId('club-report-link').click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});

test('the association can suspend the club and the page goes with it', async () => {
  await as('assoc', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/clubs/' + clubId, { waitUntil: 'load' });
    await page.getByTestId('club-standing-reason-suspended').fill('بررسی گزارش‌های دریافتی.');
    await page.getByTestId('club-standing-submit-suspended').click();
    await expectText(page, 'تعلیق‌شده');
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + publicPath, { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
  });
});
