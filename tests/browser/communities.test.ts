/**
 * Associations and clubs in the browser — Phase 2 PROMPT-010.
 *
 * The superadmin records a club, writes its profile, invites a manager, grants
 * the publishing permission and publishes the page; the invited account accepts
 * from its own screen; a visitor reads the directory on a phone, the club page
 * and one club post; the review operator hides the page and the visitor then
 * gets a real 404. The management environments stay closed to everyone else.
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
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, expectText, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-010');
const RUN = String(randomInt(100_000, 999_999));
const NAME = 'کلاب آزمایشی SYNTHETIC ' + RUN;
const ACCOUNTS = { admin: '09990000006', reviewer: '09990000009', user: '09990000001' } as const;
type Who = keyof typeof ACCOUNTS | 'visitor';

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let communityId = '';
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

test('the superadmin records a club, writes its profile and invites a manager', async () => {
  communityId = await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/communities', { waitUntil: 'load' });
    await page.getByTestId('community-name').fill(NAME);
    await page.getByTestId('community-kind').selectOption('CLUB');
    await page.getByTestId('community-scope').selectOption('BREED');
    await page.getByTestId('community-create-reason').fill('ثبت برای آزمون مرورگر');
    await page.getByTestId('create-community').click();
    await expectText(page, NAME);

    await page.getByRole('link', { name: NAME }).click();
    await page.getByTestId('community-profile-form').waitFor();
    const id = new URL(page.url()).pathname.split('/').pop()!;

    // A breed scope without a breed is refused, and the message says so.
    await page.getByTestId('community-about').fill('کلاب آزمایشی برای آزمون خودکار همزیست.');
    await page.getByTestId('community-profile-reason').fill('تکمیل پرونده');
    await page.getByTestId('save-community-profile').click();
    await expectText(page, 'نژاد');

    const breed = page.locator('[data-testid^="community-breed-"]').first();
    await breed.check();
    await page.getByTestId('community-phone').fill('02100000000');
    await page.getByTestId('community-membership').fill('عضویت از دفتر کلاب انجام می‌شود.');
    await page.getByTestId('community-profile-reason').fill('تکمیل پرونده');
    await page.getByTestId('save-community-profile').click();
    await expectText(page, 'ذخیره شد');

    await page.getByTestId('manager-mobile').fill(ACCOUNTS.user);
    await page.getByTestId('manager-role').fill('دبیر کلاب');
    await page.getByTestId('manager-invite-reason').fill('مدیر معرفی‌شده');
    await page.getByTestId('invite-manager').click();
    await expectText(page, 'در انتظار پذیرش');
    await page.screenshot({ path: path.join(SHOTS, 'admin-community.png'), fullPage: true });
    return id;
  });
  assert.match(communityId, /^[0-9a-f-]{36}$/);
});

test('the invited account accepts from its own screen and is then a manager', async () => {
  await as('user', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/communities', { waitUntil: 'load' });
    await expectText(page, NAME);
    await page.getByTestId('community-invitations').getByRole('button', { name: 'پذیرش' }).click();
    // The answered invitation leaves the list; the record does not reach it, because accepting is not owning.
    await page.getByTestId('community-invitations').waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(SHOTS, 'manager-invitation.png'), fullPage: true });
  });

  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/communities/' + communityId, { waitUntil: 'load' });
    await expectText(page, 'تأییدشده');
  });
});

test('a club post needs the permission first, and then the page and the post go public', async () => {
  publicPath = await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/communities/' + communityId, { waitUntil: 'load' });
    // Until the superadmin grants it, there is no writing surface at all.
    await page.getByTestId('community-posting-blocked').waitFor();
    await page.getByTestId('community-publisher-reason').fill('کلاب شناخته‌شده است');
    await page.getByTestId('set-community-publisher').click();
    await page.getByTestId('post-create-form').waitFor();

    await page.getByTestId('post-title').fill('گزارش تمرین ماهانه ' + RUN);
    await page.getByTestId('create-post').click();
    await expectText(page, 'گزارش تمرین ماهانه ' + RUN);

    const postForm = page.locator('[data-testid^="post-form-"]').first();
    const postId = (await postForm.getAttribute('data-testid'))!.replace('post-form-', '');
    await page.getByTestId('post-summary-' + postId).fill('خلاصه گزارش تمرین‌های ماه گذشته.');
    await page.getByTestId('post-body-' + postId).fill('متن کامل گزارش تمرین‌های ماه گذشته کلاب آزمایشی.');
    await page.getByTestId('save-post-' + postId).click();
    await expectText(page, 'ذخیره شد');
    await page.getByTestId('change-post-status-' + postId).click();
    await expectText(page, 'منتشرشده');

    await page.getByTestId('event-title').fill('تمرین باز ' + RUN);
    await page.getByTestId('event-starts').fill('2030-05-20');
    await page.getByTestId('event-status').selectOption('PUBLISHED');
    await page.getByTestId('add-event').click();
    await expectText(page, 'تمرین باز ' + RUN);

    await page.getByTestId('community-status-reason').fill('پرونده کامل است');
    await page.getByTestId('change-community-status').click();
    await page.getByTestId('community-public-link').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'club-posts.png'), fullPage: true });
    return (await page.getByTestId('community-public-link').getAttribute('href'))!;
  });
  assert.match(publicPath, /^\/associations\/club-[0-9a-f]{10}$/);
});

test('a visitor finds the club in the directory and reads its page and its post on a phone', async () => {
  await as('visitor', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/associations?kind=CLUB', { waitUntil: 'load' });
    await expectText(page, NAME);
    await page.screenshot({ path: path.join(SHOTS, 'directory-mobile.png'), fullPage: true });

    await page.getByRole('link', { name: NAME }).first().click();
    await page.getByTestId('community-page').waitFor();
    await expectText(page, 'عضویت را خودِ کلاب ثبت و تأیید می‌کند');
    await expectText(page, 'تمرین باز ' + RUN);
    await page.screenshot({ path: path.join(SHOTS, 'community-public.png'), fullPage: true });

    // The post keeps its Persian slug, so the address arrives percent-encoded: the page must still answer it.
    const postHref = await page.locator('[data-testid^="community-post-"]').first().getAttribute('href');
    const postResponse = await page.goto(BASE_URL + postHref, { waitUntil: 'load' });
    assert.equal(postResponse?.status(), 200, 'the club post address answered ' + postResponse?.status() + ' at ' + postHref);
    await expectText(page, 'گزارش تمرین ماهانه ' + RUN);
    await page.getByTestId('community-post-body').waitFor();
    await expectText(page, 'متن کامل گزارش تمرین‌های ماه گذشته کلاب آزمایشی.');
    await page.screenshot({ path: path.join(SHOTS, 'community-post.png'), fullPage: true });
  });
});

test('the review operator hides the page and the address then answers a real 404', async () => {
  await as('reviewer', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/review/communities', { waitUntil: 'load' });
    await expectText(page, NAME);
    await page.getByRole('link', { name: NAME }).click();
    await page.getByTestId('community-status-form').waitFor();
    await page.getByTestId('community-status-reason').fill('گزارش اطلاعات نادرست');
    await page.getByTestId('change-community-status').click();
    await expectText(page, 'پنهان');
    await page.screenshot({ path: path.join(SHOTS, 'review-hidden.png'), fullPage: true });
  });

  await as('visitor', MOBILE, async (page) => {
    const response = await page.goto(BASE_URL + publicPath, { waitUntil: 'load' });
    assert.equal(response?.status(), 404);
  });
});

test('the management environments stay closed to an ordinary account', async () => {
  await as('user', DESKTOP, async (page) => {
    for (const route of ['/admin/communities', '/review/communities']) {
      await page.goto(BASE_URL + route, { waitUntil: 'load' });
      await expectText(page, 'دسترسی');
      assert.equal(await page.getByTestId('community-create-form').count(), 0);
    }
    await page.screenshot({ path: path.join(SHOTS, 'forbidden.png'), fullPage: true });
  });
});
