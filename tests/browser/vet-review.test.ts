/**
 * The association review workbench in the browser — Phase 2.5 PROMPT-007.
 *
 * A student applies. The association finds the case in the workbench by type and
 * student number, claims it, records a failed check with a note, is refused an
 * approval because of it, and asks for a correction instead. The private card is
 * previewed inline and served with a sandboxing policy. The workbench fits a
 * phone and stays closed to an account outside the association.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, newSyntheticMobile, signIn } from './support.ts';

const OPERATOR = '09990000004';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const STUDENT_NUMBER = '9913' + String(Math.floor(Math.random() * 9000) + 1000);

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let browser!: Browser;
const states: Record<'student' | 'operator' | 'stranger', State> = {} as never;

before(async () => {
  browser = await chromium.launch();
  for (const [who, mobile] of [
    ['student', newSyntheticMobile()],
    ['operator', OPERATOR],
    ['stranger', newSyntheticMobile()],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      states[who] = await context.storageState();
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(who: keyof typeof states, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: states[who] });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

async function waitForText(page: Page, testId: string, text: string): Promise<void> {
  await page
    .waitForFunction(([id, expected]) => document.querySelector('[data-testid="' + id + '"]')?.textContent?.includes(expected) ?? false, [testId, text] as const)
    .catch(async () => {
      const actual = (await page.locator('[data-testid="' + testId + '"]').first().textContent().catch(() => null)) ?? '(no such element)';
      throw new Error(testId + ' never said "' + text + '"; it said: ' + actual.trim().slice(0, 300));
    });
}

async function openFromWorkbench(page: Page, claim = ''): Promise<void> {
  await page.goto(BASE_URL + '/assoc/vet-review', { waitUntil: 'load' });
  await page.getByTestId('review-filter-type').selectOption('STUDENT');
  if (claim) await page.getByTestId('review-filter-claim').selectOption(claim);
  await page.getByTestId('review-filter-q').fill(STUDENT_NUMBER);
  await Promise.all([page.waitForURL('**/assoc/vet-review?**q=' + STUDENT_NUMBER + '**'), page.getByTestId('review-filter-submit').click()]);
  const items = page.locator('[data-testid="review-queue"] > li');
  assert.equal(await items.count(), 1, 'the filters find exactly this case');
  await Promise.all([page.waitForURL('**/assoc/vet-students/**'), items.first().getByTestId('open-review-case').click()]);
}

test('a student applies, and the case appears in the association workbench', async () => {
  await as('student', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await Promise.all([page.waitForURL('**/account/vet-profile?path=student'), page.getByTestId('path-student').click()]);
    await page.getByTestId('student-name').fill('دانشجوی میز بررسی');
    await page.getByTestId('student-number').fill(STUDENT_NUMBER);
    await page.getByTestId('student-university').fill('دانشگاه آزمایشی');
    await page.getByTestId('student-card').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('submit-student').click();
    await waitForText(page, 'student-case-status', 'ارسال‌شده');
  });
});

test('the reviewer claims the case, a failed check blocks approval, and a correction is requested instead', async () => {
  await as('operator', DESKTOP, async (page) => {
    await openFromWorkbench(page);
    await waitForText(page, 'review-claim-state', 'هیچ بررسی‌کننده‌ای');
    await page.getByTestId('review-claim').click();
    await waitForText(page, 'review-claim-state', 'در دست شماست');

    // The preview loads only when opened, and the file is served for sandboxed viewing.
    const preview = page.getByTestId('student-document-preview');
    await preview.locator('summary').click();
    const src = await preview.locator('iframe').getAttribute('src');
    const file = await page.request.get(BASE_URL + src!);
    assert.equal(file.status(), 200);
    assert.match(file.headers()['content-security-policy'] ?? '', /sandbox/);
    assert.equal(file.headers()['x-frame-options'], 'SAMEORIGIN');
    assert.equal(file.headers()['cache-control'], 'no-store, private');

    const checks = page.getByTestId('review-checks-form');
    await checks.getByTestId('review-check-STUDENT_NUMBER_MATCHES-FAIL').check();
    await checks.getByTestId('review-check-note-STUDENT_NUMBER_MATCHES').fill('SYNTHETIC شماره با کارت نمی‌خواند');
    await checks.getByTestId('review-check-IDENTITY_MATCHES_ACCOUNT-PASS').check();
    await checks.getByTestId('review-record-checks').click();
    await waitForText(page, 'review-checks-result', 'ثبت شد');

    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getByTestId('review-check-STUDENT_NUMBER_MATCHES-FAIL').isChecked(), true, 'the recorded check is what the page shows again');

    await page.getByTestId('student-decision-VERIFY').check();
    await page.getByTestId('student-decision-reason').fill('SYNTHETIC تأیید');
    await page.getByTestId('submit-student-decision').click();
    await page.getByText('با این وضعیت تأیید ممکن نیست').first().waitFor();
    await waitForText(page, 'review-claim-state', 'در دست شماست');

    await page.getByTestId('student-decision-REQUEST_CORRECTION').check();
    await page.getByTestId('student-decision-reason').fill('SYNTHETIC شماره دانشجویی را اصلاح کنید');
    await page.getByTestId('submit-student-decision').click();
    await waitForText(page, 'student-case-status', 'نیازمند اصلاح');
    assert.equal(await page.getByTestId('review-panel').count(), 0, 'a decided case offers no claim or checks');
  });

  await as('student', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'student-review-note', 'شماره دانشجویی را اصلاح کنید');
  });
});

test('the workbench fits a phone, and an account outside the association cannot open it', async () => {
  await as('operator', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-review?view=ALL&q=' + STUDENT_NUMBER, { waitUntil: 'load' });
    await page.getByTestId('review-queue').waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, 'no horizontal scroll at phone width (' + overflow + 'px)');
  });
  await as('stranger', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-review', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('review-filters').count(), 0);
    assert.equal(await page.getByTestId('review-queue').count(), 0);
  });
});
