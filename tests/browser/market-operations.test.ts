/**
 * The marketplace operations shell in a real browser — Phase 3, PROMPT-002.
 *
 * Three things are worth a browser here and nothing else is: that the shell
 * really opens for a role that is not the superadmin, that a kill switch and a
 * species really change state and really leave a readable history, and that a
 * role which may open the shell is genuinely stopped at the work it was not
 * given — not merely shown fewer links.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, clearSyntheticOtp, DESKTOP, MOBILE, lastCodeFor } from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-3', 'prompt-002');

const MARKET_ADMIN = '09990000010';
const MODERATOR = '09990000011';
const FINANCE = '09990000012';
const PUBLIC_USER = '09990000001';

const RUN = String(randomInt(100_000, 999_999));
const REASON = 'SYNTHETIC — تغییر آزمایشی اجرای تست ' + RUN;

type State = Awaited<ReturnType<BrowserContext['storageState']>>;

let browser!: Browser;
let adminState: State | null = null;
let moderatorState: State | null = null;
let financeState: State | null = null;
let userState: State | null = null;

const contextFor = (state: State | null, viewport = DESKTOP) =>
  browser.newContext({ viewport, locale: 'fa-IR', storageState: state ?? undefined });

async function expectText(page: Page, needle: string, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction((text) => (document.body.innerText ?? '').includes(text), needle, { timeout })
    .catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error('page never showed: ' + needle + ' | body: ' + body.slice(0, 700));
    });
}

async function signIn(context: BrowserContext, mobile: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL + '/login', { waitUntil: 'load' });
  await page.getByTestId('mobile-input').fill(mobile);
  await page.getByTestId('send-code').click();
  await page.getByTestId('code-input').waitFor();
  await page.getByTestId('code-input').fill(await lastCodeFor(mobile));
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login')),
    page.getByTestId('verify-code').click(),
  ]);
  return page;
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  browser = await chromium.launch();

  for (const [mobile, assign] of [
    [MARKET_ADMIN, (s: State) => (adminState = s)],
    [MODERATOR, (s: State) => (moderatorState = s)],
    [FINANCE, (s: State) => (financeState = s)],
    [PUBLIC_USER, (s: State) => (userState = s)],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      assign(await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

test('the marketplace shell opens for its own role and says what is closed and unset', async () => {
  const context = await contextFor(adminState);
  try {
    const page = await context.newPage();
    const response = await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    assert.equal(response?.status(), 200);

    await expectText(page, 'عملیات بازار و فروشگاه');
    const readiness = await page.getByTestId('market-readiness').innerText();
    assert.match(readiness, /هیچ جریان بازار یا فروشگاهی هنوز ساخته نشده است/);
    assert.match(readiness, /مقدار مدیریت‌شده هنوز ثبت نشده است/);

    /*
     * Every switch is rendered with a state a person can read as words rather
     * than as an empty control. That every flag *starts* closed is a property
     * of a fresh database, and it is pinned where that holds — the database
     * suite. This suite shares one database with every other browser suite, and
     * PROMPT-003's journey legitimately opens the animal market in it.
     */
    const flags = await page.getByTestId('market-flags').innerText();
    for (const key of [
      'market.flag.animal_market_enabled',
      'market.flag.commerce_checkout_enabled',
      'market.flag.payout_enabled',
    ]) {
      assert.match(await page.getByTestId('flag-' + key).innerText(), /باز|بسته/, key);
    }
    assert.match(flags, /بسته/, 'the flows nothing has opened still read as closed');

    // The launch state is visible as a fact, not as a promise.
    await expectText(page, 'سگ — فعال');
    const catAnimal = await page.getByTestId('species-state-ANIMAL_SALE-CAT').innerText();
    assert.match(catAnimal, /گربه — غیرفعال/);
    const catShop = await page.getByTestId('species-state-MERCHANDISE-CAT').innerText();
    assert.match(catShop, /گربه — فعال/);

    await page.screenshot({ path: path.join(SHOTS, 'market-overview-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('a kill switch really opens and closes, and its history reads back as a diff', async () => {
  const key = 'market.flag.seller_onboarding_enabled';
  const context = await contextFor(adminState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });

    await page.getByTestId('flag-reason-' + key).fill(REASON + ' — باز');
    await page.getByTestId('flag-toggle-' + key).click();
    await expectText(page, 'مقدار ذخیره شد.');
    await expectText(page, 'بستن این مسیر');

    await page.goto(BASE_URL + '/market/settings/' + encodeURIComponent(key), { waitUntil: 'load' });
    const history = await page.getByTestId('setting-history').innerText();
    assert.match(history, /false/);
    assert.match(history, /true/);
    assert.match(history, new RegExp(RUN));
    await page.screenshot({ path: path.join(SHOTS, 'flag-history-desktop.png'), fullPage: true });

    // Close it again so the suite leaves the environment the way it found it.
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    await page.getByTestId('flag-reason-' + key).fill(REASON + ' — بستن دوباره');
    await page.getByTestId('flag-toggle-' + key).click();
    await expectText(page, 'مقدار ذخیره شد.');
    await expectText(page, 'باز کردن این مسیر');
  } finally {
    await context.close();
  }
});

test('a managed value is edited with a mandatory reason, and the empty field means تعیین‌نشده', async () => {
  const key = 'market.shop.return_window_days';
  const context = await contextFor(adminState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/market/settings?group=COMMERCE', { waitUntil: 'load' });
    await expectText(page, 'فروشگاه کالا');

    await page.getByTestId('market-setting-value-' + key).fill('7');
    await page.getByTestId('market-setting-reason-' + key).fill(REASON);
    await page.getByTestId('market-setting-save-' + key).click();
    await expectText(page, 'مقدار ذخیره شد.');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-value-' + key).innerText(), '7');

    // Clearing it returns the honest state, not a zero-day return window.
    await page.getByTestId('market-setting-value-' + key).fill('');
    await page.getByTestId('market-setting-reason-' + key).fill(REASON + ' — پاک کردن');
    await page.getByTestId('market-setting-save-' + key).click();
    await expectText(page, 'مقدار پاک شد و به «تعیین‌نشده» برگشت.');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('market-value-' + key).count(), 0);
    await expectText(page, 'تعیین‌نشده');

    await page.screenshot({ path: path.join(SHOTS, 'market-settings-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('opening a species is a decision with a reason, and it survives a reload', async () => {
  const context = await contextFor(adminState, MOBILE);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/market/species', { waitUntil: 'load' });
    await expectText(page, 'فعال کردن یک گونه یک تصمیم است');

    await page.getByTestId('species-reason-ANIMAL_SALE-CAT').fill(REASON + ' — باز کردن گربه');
    await page.getByTestId('species-toggle-ANIMAL_SALE-CAT').click();
    await expectText(page, 'این گونه فعال شد.');
    await page.reload({ waitUntil: 'load' });
    const row = await page.getByTestId('species-row-ANIMAL_SALE-CAT').innerText();
    assert.match(row, /فعال/);
    assert.match(row, new RegExp(RUN), 'the reason for the current state is on the row');
    await page.screenshot({ path: path.join(SHOTS, 'market-species-mobile.png'), fullPage: true });

    await page.getByTestId('species-reason-ANIMAL_SALE-CAT').fill(REASON + ' — بستن دوباره');
    await page.getByTestId('species-toggle-ANIMAL_SALE-CAT').click();
    await expectText(page, 'این گونه غیرفعال شد.');
  } finally {
    await context.close();
  }
});

test('a moderator opens the shell but is stopped at the work it was not given', async () => {
  const context = await contextFor(moderatorState);
  try {
    const page = await context.newPage();
    const response = await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'the shell opens for the moderator too');

    const capabilities = await page.getByTestId('market-capabilities').innerText();
    assert.match(capabilities, /ANIMAL_LISTING_MODERATE/);
    assert.ok(!capabilities.includes('MARKET_SETTINGS_WRITE'));
    assert.ok(!capabilities.includes('REFUND_ISSUE'));

    // No switch to press, and the page says why rather than hiding the section.
    assert.equal(await page.getByTestId('flag-toggle-market.flag.payout_enabled').count(), 0);
    await expectText(page, 'تغییر این کلید در نقش فعلی شما مجاز نیست.');

    // The settings it may read are read-only, and the settlement group it may
    // not read is not offered at all.
    await page.goto(BASE_URL + '/market/settings', { waitUntil: 'load' });
    await expectText(page, 'این گروه در نقش فعلی شما فقط خواندنی است.');
    assert.equal(await page.getByTestId('market-tab-SETTLEMENT').count(), 0);
    assert.equal(await page.getByTestId('market-tab-ANIMAL_MARKET').count(), 1);

    // Asking for the group by URL is refused on the server, not merely unlinked.
    await page.goto(BASE_URL + '/market/settings?group=SETTLEMENT', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(
      body.includes('دسترسی مجاز نیست') || body.includes('گروهی برای نمایش نیست'),
      'a group the role may not read is never rendered: ' + body.slice(0, 300),
    );

    // And the species page refuses the write outright.
    await page.goto(BASE_URL + '/market/species', { waitUntil: 'load' });
    await expectText(page, 'تغییر وضعیت گونه در نقش فعلی شما مجاز نیست.');
    assert.equal(await page.getByTestId('species-toggle-ANIMAL_SALE-DOG').count(), 0);
    await page.screenshot({ path: path.join(SHOTS, 'market-moderator-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('the finance operator reads the settlement figures and cannot change them', async () => {
  const context = await contextFor(financeState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/market/settings', { waitUntil: 'load' });
    await expectText(page, 'تسویه');
    assert.equal(await page.getByTestId('market-tab-SETTLEMENT').count(), 1);
    assert.equal(await page.getByTestId('market-tab-ANIMAL_MARKET').count(), 0, 'finance has no business here');
    await expectText(page, 'این گروه در نقش فعلی شما فقط خواندنی است.');
    assert.equal(
      await page.getByTestId('market-setting-form-market.settlement.minimum_payout_toman').count(),
      0,
    );
  } finally {
    await context.close();
  }
});

test('an ordinary account never reaches the marketplace shell', async () => {
  const context = await contextFor(userState);
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/market', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('دسترسی مجاز نیست'), 'the shell is closed to a public account: ' + body.slice(0, 300));
    // And it is not offered anywhere either: an operational shell is never a
    // chip in the public role switcher (D11).
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    assert.equal(await page.locator('[data-context="MARKETPLACE_ADMIN"]').count(), 0);
  } finally {
    await context.close();
  }
});
