/**
 * Dashboards, notifications and receipts in a real browser — Phase 2.5 PROMPT-015.
 *
 * What a person is shown about their own account, what an operator is shown
 * about the queues they answer for, and the two rules that hold on both sides:
 * opening a notification marks it read, and a payment belongs to one account.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { createNotification } from '../../src/notifications/service.ts';
import { accounts } from '../../src/db/schema/core.ts';
import { BASE_URL, DATABASE_URL, DESKTOP, MOBILE, expectText, signIn } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-2.5', 'prompt-015');
const ACCOUNTS = { user: '09990000001', assoc: '09990000004', admin: '09990000006' } as const;
type Who = keyof typeof ACCOUNTS;

let browser!: Browser;
const states = new Map<Who, Awaited<ReturnType<BrowserContext['storageState']>>>();
let seededTitle = '';

/**
 * One real notification for the fixture account, written the way the domain
 * writes one — so the read-state test has something to open rather than
 * depending on whichever other suite happened to run first.
 */
async function seedNotification(): Promise<string> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, ACCOUNTS.user)).limit(1);
    const titleFa = 'اعلان آزمایشی داشبورد ' + Date.now();
    await db.transaction((tx) =>
      createNotification(tx, {
        recipientAccountId: account!.id,
        kind: 'DASHBOARD_BROWSER_TEST',
        titleFa,
        bodyFa: 'برای آزمون خوانده‌شدن اعلان.',
        // A resume route points at the case, never at a generic list: the domain
        // refuses '/dashboard' outright, which is the rule this seed respects.
        resume: { entity: { type: 'ACCOUNT', id: account!.id }, step: 'PAYMENTS', originRoute: '/payments' },
      }),
    );
    return titleFa;
  } finally {
    await pool.end();
  }
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  seededTitle = await seedNotification();
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

test('the dashboard shows this account’s own payments and links to the receipts', async () => {
  await as('user', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    await expectText(page, 'پرداخت‌ها و رسیدها');
    assert.ok((await page.locator('a[href="/payments"]').count()) > 0, 'the dashboard links to the payment list');
    await page.screenshot({ path: path.join(SHOTS, 'dashboard-mobile.png'), fullPage: true });
  });
});

test('the payments page answers for this account and refuses an id that is not its own', async () => {
  await as('user', DESKTOP, async (page) => {
    const response = await page.goto(BASE_URL + '/payments', { waitUntil: 'load' });
    assert.equal(response?.status(), 200);
    await expectText(page, 'پرداخت‌ها و رسیدها');
    // Nothing on this page prints a tariff from the settings catalogue; the only
    // figures are the ones frozen on a real payment.
    const body = await page.locator('body').innerText();
    assert.equal(body.includes('تعرفه'), false);

    // A receipt that belongs to nobody is a plain 404, not a hint.
    const missing = await page.goto(BASE_URL + '/payments/00000000-0000-4000-8000-000000000000', { waitUntil: 'load' });
    assert.equal(missing?.status(), 404);
  });
});

test('opening a notification marks it read and returns to the case', async () => {
  await as('user', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    await expectText(page, seededTitle);
    const row = page.locator('li').filter({ hasText: seededTitle }).first();
    assert.ok((await row.innerText()).includes('خوانده‌نشده'), 'it starts unread');
    const link = row.locator('a[href^="/notifications/"]').first();
    const href = (await link.getAttribute('href')) ?? '';
    await link.click();
    // The open route redirects on to the case the notification is about.
    await page.waitForURL((url) => !url.pathname.startsWith('/notifications/'), { timeout: 15_000 });

    assert.match(href, /^\/notifications\/[0-9a-f-]{36}$/);
    // Read again in a page of its own, so what is asserted is what the server
    // renders now rather than anything the first page had already fetched.
    const fresh = await page.context().newPage();
    await fresh.goto(BASE_URL + '/notifications', { waitUntil: 'load' });
    const after = fresh.locator('li').filter({ hasText: seededTitle }).first();
    assert.ok((await after.innerText()).includes('خوانده‌شده'), 'the notification is now marked read');
    await fresh.screenshot({ path: path.join(SHOTS, 'notifications-mobile.png'), fullPage: true });
  });
});

test('the association dashboard counts the Phase 2.5 queues it answers for', async () => {
  await as('assoc', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc', { waitUntil: 'load' });
    for (const key of ['vet-trusted', 'clubs', 'club-ownership', 'members']) {
      assert.ok((await page.getByTestId('queue-count-' + key).count()) > 0, 'the queue ' + key + ' is missing');
    }
    // Every queue links somewhere that exists.
    const links = await page.locator('a[data-testid^="open-queue-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    for (const href of links) assert.ok(href?.startsWith('/assoc'), 'a queue pointed at ' + href);
    await page.screenshot({ path: path.join(SHOTS, 'assoc-queues-desktop.png'), fullPage: true });
  });
});

test('the outbox dashboard says whether messages may leave, and shows the approved wording', async () => {
  await as('admin', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/admin/notifications', { waitUntil: 'load' });
    await expectText(page, 'صف ارسال اعلان‌ها');
    await expectText(page, 'متن‌های تأییدشده');
    // The channel ships off, so the page says so rather than implying messages go out.
    assert.equal(await page.getByTestId('outbox-channel-off').count(), 1);
    const templates = await page.getByTestId('outbox-templates').innerText();
    assert.ok(templates.includes('همزیست:'), 'the approved sentences are shown');
    assert.equal(/\{|\$\{/.test(templates), false, 'no template interpolates a record value');
    await page.screenshot({ path: path.join(SHOTS, 'outbox-desktop.png'), fullPage: true });
  });
});

test('the operator dashboards stay closed to an ordinary account', async () => {
  await as('user', DESKTOP, async (page) => {
    for (const route of ['/assoc', '/admin/notifications']) {
      await page.goto(BASE_URL + route, { waitUntil: 'load' });
      const body = await page.locator('body').innerText();
      assert.equal(body.includes('صف ارسال اعلان‌ها'), false, route + ' was readable');
      assert.equal(body.includes('queue-count'), false);
    }
  });
});
