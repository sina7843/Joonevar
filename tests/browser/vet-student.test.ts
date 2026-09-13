/**
 * The veterinary student path in the browser — Phase 2.5 PROMPT-004.
 *
 * A new ordinary account chooses the student path, applies with a student number
 * and university and a private card; the association operator asks for a
 * correction with a reason; the student reads the reason and history and answers;
 * the operator verifies; the student then sees the one student tag, and neither
 * a directory editor nor the trusted veterinarian panel opens for them.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BASE_URL, DESKTOP, MOBILE, newSyntheticMobile, signIn } from './support.ts';

const OPERATOR = '09990000004';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const STUDENT_NUMBER = '9912' + String(Math.floor(Math.random() * 9000) + 1000);

let browser!: Browser;
let student!: Awaited<ReturnType<BrowserContext['storageState']>>;
let operator!: Awaited<ReturnType<BrowserContext['storageState']>>;

before(async () => {
  browser = await chromium.launch();
  for (const [mobile, keep] of [
    [newSyntheticMobile(), (state: typeof student) => (student = state)],
    [OPERATOR, (state: typeof student) => (operator = state)],
  ] as const) {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
    try {
      await signIn(context, mobile);
      keep(await context.storageState());
    } finally {
      await context.close();
    }
  }
});

after(async () => {
  await browser?.close();
});

async function as<T>(state: typeof student, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: state });
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

/*
 * A successful action changes what the page is: the decision form belongs to a
 * waiting case and the application form to an account without one, so both
 * unmount with their result banner. Waiting for the banner waits for an element
 * that no longer exists. What proves the action is the persisted state the
 * re-rendered page shows — the same thing the KYC suites wait for.
 */
async function decideAsOperator(decision: 'VERIFY' | 'REQUEST_CORRECTION', reason: string, expectedStatus: string): Promise<void> {
  await as(operator, DESKTOP, async (page) => {
    const view = 'OPEN';
    await page.goto(BASE_URL + '/assoc/vet-students?view=' + view, { waitUntil: 'load' });
    const card = page.locator('[data-testid="student-queue"] > li').filter({ hasText: STUDENT_NUMBER });
    await card.getByTestId('open-student-case').click();
    await page.getByTestId('student-decision-form').waitFor();
    await page.getByTestId('student-decision-' + decision).check();
    await page.getByTestId('student-decision-reason').fill(reason);
    await page.getByTestId('submit-student-decision').click();
    await waitForText(page, 'student-case-status', expectedStatus);
    assert.equal(await page.getByTestId('student-decision-form').count(), 0, 'a decided case offers no second decision');
  });
}

test('the ordinary account chooses the student path and applies with number, university and a private card', async () => {
  await as(student, MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.getByTestId('vet-path-choice').waitFor();
    await Promise.all([page.waitForURL('**/account/vet-profile?path=student'), page.getByTestId('path-student').click()]);
    await page.getByTestId('student-name').fill('دانشجوی آزمایشی مرورگر');
    await page.getByTestId('student-number').fill(STUDENT_NUMBER);
    await page.getByTestId('student-university').fill('دانشگاه نادرست');
    await page.getByTestId('student-card').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('submit-student').click();
    // The case card replaces the form in place: the persisted status is the confirmation.
    await waitForText(page, 'student-case-status', 'ارسال‌شده');
    assert.equal(await page.getByTestId('student-application-form').count(), 0, 'an account with an open case is not offered a second one');
  });
});

test('the association asks for a correction, and the student reads the reason and answers it', async () => {
  await decideAsOperator('REQUEST_CORRECTION', 'SYNTHETIC نام دانشگاه با کارت نمی‌خواند', 'نیازمند اصلاح');
  await as(student, MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'student-case-status', 'نیازمند اصلاح');
    await waitForText(page, 'student-review-note', 'نام دانشگاه با کارت نمی‌خواند');
    await waitForText(page, 'student-history', 'نیازمند اصلاح');
    const form = page.getByTestId('student-correction-form');
    await form.getByTestId('student-university').fill('دانشگاه درست');
    await form.getByTestId('resubmit-student').click();
    await waitForText(page, 'student-case-status', 'ارسال‌شده');
    assert.equal(await page.getByTestId('student-correction-form').count(), 0, 'an answered correction is not offered again');
  });
});

test('once verified, the student sees the one student tag and nothing a doctor has', async () => {
  await decideAsOperator('VERIFY', 'SYNTHETIC کارت دانشجویی بررسی شد', 'دانشجوی تأییدشده');
  await as(student, MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-current-tag', 'دانشجوی دامپزشکی');
    await waitForText(page, 'student-case-status', 'دانشجوی تأییدشده');
    assert.equal(await page.getByTestId('vet-path-choice').count(), 0, 'the path choice is gone');
    assert.equal(await page.locator('text=پروفایل عمومی دایرکتوری').count(), 0, 'no directory editor');

    // The trusted veterinarian panel answers with the real denial screen, not an empty page.
    await page.goto(BASE_URL + '/vet', { waitUntil: 'load' });
    await waitForText(page, 'denial-code', 'FORBIDDEN');

    // And the dashboard no longer offers a path to an account that has chosen one.
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    assert.equal(await page.getByTestId('dashboard-vet-path').count(), 0);
  });
});
