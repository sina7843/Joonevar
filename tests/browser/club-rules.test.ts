/**
 * A club's joining rules in a real browser — Phase 2.5 PROMPT-013.
 *
 * The owner writes the rules from the fixed list, publishes them, and somebody
 * else reads what the club asks, applies, and is accepted with a reason. The
 * club's own member screen is checked for what it must not show: the applicant's
 * reasons belong to the applicant.
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

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2.5', 'prompt-013');
const RUN = String(randomInt(100_000, 999_999));
const NAME = 'کلاب شرط‌دار SYNTHETIC ' + RUN;
const ACCOUNTS = { owner: '09990000001', applicant: '09990000002', assoc: '09990000004' } as const;
type Who = keyof typeof ACCOUNTS;

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let clubId = '';
let joinPath = '';

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
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: states.get(who) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a club is made, verified and published so it can take members', async () => {
  clubId = await as('owner', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs', { waitUntil: 'load' });
    await page.getByTestId('club-name').fill(NAME);
    await page.getByTestId('club-about').fill('کلاب آزمایشی برای بررسی شرط‌های عضویت.');
    await page.getByTestId('club-contact').fill('02155555555');
    await page.getByTestId('club-create-submit').click();
    await expectText(page, 'پیش‌نویس ساخته شد');
    await page.reload({ waitUntil: 'load' });
    const card = page.getByTestId('my-clubs').locator('a').filter({ hasText: NAME }).first();
    await card.waitFor();
    const href = (await card.getAttribute('href')) ?? '';
    await card.click();
    await page.getByTestId('club-submit').click();
    await expectText(page, 'در انتظار بررسی');
    return href.split('/').pop() ?? '';
  });
  assert.ok(clubId.length > 10);

  await as('assoc', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/clubs/' + clubId, { waitUntil: 'load' });
    await page.getByTestId('club-verification-reason').fill('برای آزمون شرط‌ها.');
    await page.getByTestId('club-verify').click();
    await expectText(page, 'فعال و تأییدشده');
  });

  joinPath = await as('owner', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId, { waitUntil: 'load' });
    await page.getByTestId('club-publication-submit').click();
    await expectText(page, 'منتشر شد');
    const link = page.locator('a[href^="/clubs/club-"]').first();
    await link.waitFor();
    return ((await link.getAttribute('href')) ?? '') + '/join';
  });
  assert.match(joinPath, /^\/clubs\/club-[0-9a-f]{10}\/join$/);
});

test('the owner writes the rules from the fixed list and publishes them', async () => {
  await as('owner', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId + '/rules', { waitUntil: 'load' });
    await expectText(page, 'شرایط عضویت این کلاب');
    await page.getByTestId('club-rule-ACCOUNT_ACTIVE').check();
    await page.getByTestId('club-rule-CLUB_APPROVAL').check();
    await page.getByTestId('club-terms-text').fill('عضو کلاب می‌پذیرد که در رویدادها شرکت کند.');
    await page.getByTestId('club-terms-version').fill('c' + RUN);
    await page.getByTestId('club-rules-save').click();
    await expectText(page, 'پیش‌نویس شرایط ذخیره شد');

    // The terms rule was not ticked, so the version field alone changes nothing:
    // what is published is exactly what the editor's list says.
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('club-rules-publish').click();
    // Publishing removes the draft, so the form goes with it: the state is what
    // is checked, not a banner that unmounts with its own card.
    await page.getByTestId('club-rules-publish').waitFor({ state: 'detached', timeout: 15_000 });
    await expectText(page, 'در اجرا');
    await expectText(page, 'تأیید دستی کلاب');
    await page.screenshot({ path: path.join(SHOTS, 'club-rules-desktop.png'), fullPage: true });
  });
});

test('somebody else reads what the club asks and applies', async () => {
  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + joinPath, { waitUntil: 'load' });
    await expectText(page, 'این کلاب چه می‌خواهد');
    await expectText(page, 'تأیید دستی کلاب');
    await page.screenshot({ path: path.join(SHOTS, 'club-join-mobile.png'), fullPage: true });
    await page.getByTestId('club-apply-submit').click();
    await expectText(page, 'در انتظار تصمیم کلاب');
  });
});

test('the club decides with a reason, and never sees the applicant’s own reasons', async () => {
  await as('owner', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId + '/members', { waitUntil: 'load' });
    await expectText(page, 'در انتظار تصمیم');
    const body = await page.locator('body').innerText();
    for (const leak of ['احراز هویت شما', 'عضویت معتبر انجمن لازم', 'شجره‌نامه صادرشده لازم']) {
      assert.equal(body.includes(leak), false, 'the club screen showed an applicant reason: ' + leak);
    }
    await page.screenshot({ path: path.join(SHOTS, 'club-members-desktop.png'), fullPage: true });

    const decision = page.getByTestId('club-membership-queue').locator('form').first();
    await decision.locator('input[name="reasonFa"]').fill('با معرفی یکی از اعضای کلاب.');
    await decision.getByRole('button', { name: 'پذیرش عضویت' }).click();
    // The decided application leaves the queue, which is the outcome worth pinning.
    await page.getByTestId('club-membership-queue').waitFor({ state: 'detached', timeout: 15_000 });
    await expectText(page, 'عضو فعال');
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + joinPath, { waitUntil: 'load' });
    await expectText(page, 'عضویت شما در این کلاب فعال است');
    await expectText(page, 'با معرفی یکی از اعضای کلاب.');
  });
});

test('a club’s rules are closed to somebody with no role in it', async () => {
  await as('applicant', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/account/clubs/' + clubId + '/rules', { waitUntil: 'load' });
    await expectText(page, 'اجازه نوشتن شرایط آن را ندارید');
    assert.equal(await page.getByTestId('club-rules-save').count(), 0);

    await page.goto(BASE_URL + '/account/clubs/' + clubId + '/members', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('club-membership-queue').count(), 0);
  });
});
