/**
 * The admin console — Phase 2 PROMPT-016.
 *
 * The superadmin sees the review queues they may open, merges one duplicate
 * record into another, and the merged record then leaves the public list while
 * its own address still answers. An ordinary account reaches none of it.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, expectText, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2', 'prompt-016');
const RUN = String(randomInt(100_000, 999_999));
const DUPLICATE = 'کلاب تکراری SYNTHETIC ' + RUN;
const PRIMARY = 'کلاب اصلی SYNTHETIC ' + RUN;
const ACCOUNTS = { admin: '09990000006', user: '09990000001' } as const;
type Who = keyof typeof ACCOUNTS;

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();

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

async function as<T>(who: Who | 'visitor', run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    viewport: DESKTOP,
    locale: 'fa-IR',
    storageState: who === 'visitor' ? undefined : states.get(who),
  });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** One published club, through the real admin screens. */
async function publishClub(page: Page, nameFa: string): Promise<void> {
  await page.goto(BASE_URL + '/admin/communities', { waitUntil: 'load' });
  await page.getByTestId('community-name').fill(nameFa);
  await page.getByTestId('community-kind').selectOption('CLUB');
  await page.getByTestId('community-create-reason').fill('ثبت برای آزمون ادغام');
  await page.getByTestId('create-community').click();
  await expectText(page, nameFa);

  await page.getByRole('link', { name: nameFa }).click();
  await page.getByTestId('community-profile-form').waitFor();
  await page.getByTestId('community-about').fill('کلاب آزمایشی برای آزمون ادغام رکورد تکراری.');
  await page.getByTestId('community-phone').fill('02100000000');
  await page.getByTestId('community-profile-reason').fill('تکمیل پرونده');
  await page.getByTestId('save-community-profile').click();
  await expectText(page, 'ذخیره شد');
  await page.getByTestId('community-status-reason').fill('انتشار برای آزمون');
  await page.getByTestId('change-community-status').click();
  await page.getByTestId('community-public-link').waitFor();
}

test('the overview shows the queues this role may open', async () => {
  await as('admin', async (page) => {
    await page.goto(BASE_URL + '/admin', { waitUntil: 'load' });
    await page.getByTestId('queue-board').waitFor();
    // The superadmin may read every review queue.
    for (const key of ['vet-applications', 'centre-claims', 'suggestions']) {
      await page.getByTestId('queue-' + key).waitFor();
    }
    await expectText(page, 'صف بسته‌شده صفر نشان داده نمی‌شود');
    await page.screenshot({ path: path.join(SHOTS, 'admin-overview.png'), fullPage: true });
  });
});

test('the superadmin merges a duplicate, and the public list drops it while its address still answers', async () => {
  const duplicatePath = await as('admin', async (page) => {
    await publishClub(page, PRIMARY);
    await publishClub(page, DUPLICATE);
    const href = (await page.getByTestId('community-public-link').getAttribute('href'))!;

    await page.goto(BASE_URL + '/admin/merge?kind=COMMUNITY', { waitUntil: 'load' });
    await page.getByTestId('merge-form').waitFor();
    await page.getByTestId('merge-reason').fill('هر دو یک کلاب‌اند');
    await page.getByTestId('merge-duplicate').selectOption({ label: DUPLICATE });
    await page.getByTestId('merge-primary').selectOption({ label: PRIMARY });
    await page.getByTestId('merge-submit').click();
    /*
     * A successful merge revalidates this route, which remounts the form and
     * clears its banner. The proof is therefore the list that stays: the record
     * now appears among the merged ones, pointing at the primary.
     */
    await page.getByTestId('merged-records').waitFor({ timeout: 20_000 });
    await expectText(page, DUPLICATE);
    await expectText(page, PRIMARY);
    await page.screenshot({ path: path.join(SHOTS, 'admin-merge.png'), fullPage: true });
    return href;
  });

  await as('visitor', async (page) => {
    await page.goto(BASE_URL + '/associations', { waitUntil: 'load' });
    await expectText(page, PRIMARY);
    // The duplicate is gone from the list…
    assert.equal(await page.getByText(DUPLICATE, { exact: true }).count(), 0);

    // …but its own address still answers and names the primary record.
    const response = await page.goto(BASE_URL + duplicatePath, { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await expectText(page, PRIMARY);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    assert.ok(canonical?.includes('/associations/'), 'the duplicate points at a public address');
    await page.screenshot({ path: path.join(SHOTS, 'merged-public-page.png'), fullPage: true });
  });
});

test('an ordinary account reaches neither the console nor the merge screen', async () => {
  await as('user', async (page) => {
    for (const route of ['/admin', '/admin/merge']) {
      await page.goto(BASE_URL + route, { waitUntil: 'load' });
      await expectText(page, 'دسترسی');
      assert.equal(await page.getByTestId('merge-form').count(), 0, route);
      assert.equal(await page.getByTestId('queue-board').count(), 0, route);
    }
    await page.screenshot({ path: path.join(SHOTS, 'admin-forbidden.png'), fullPage: true });
  });
});
