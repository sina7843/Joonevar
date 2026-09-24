/**
 * The licensed veterinarian submission in the browser — Phase 2.5 PROMPT-006.
 *
 * A new ordinary account chooses the licensed-doctor path and submits council
 * code, general or specialist, licence code, licence date, licence file and
 * council card with an optional clinic and service. The association asks for a
 * correction and reads the licence file; the applicant answers with a new
 * licence date, which becomes a new version; the association approves. The case
 * then waits for payment and the public tag is still the unlicensed one. The
 * licence file stays closed to another account and to a visitor.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { approveMembershipApplication, BASE_URL, DATABASE_URL, DESKTOP, MOBILE, newSyntheticMobile, signIn, syntheticNationalId } from './support.ts';

const ASSOCIATION = '09990000004';
const STRANGER = '09990000005';
const RUN = String(randomInt(100_000, 999_999));
const LICENCE_CODE = 'LIC-' + RUN;
const PDF = Buffer.from('%PDF-1.4 synthetic practice licence ' + RUN);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let browser!: Browser;
const states: Record<'applicant' | 'association' | 'stranger', State> = {} as never;
let licencePath = '';

before(async () => {
  browser = await chromium.launch();
  for (const [who, mobile] of [
    ['applicant', newSyntheticMobile()],
    ['association', ASSOCIATION],
    ['stranger', STRANGER],
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

async function as<T>(who: keyof typeof states | 'visitor', viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR', storageState: who === 'visitor' ? undefined : states[who] });
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

/** A decided case no longer shows its form; the persisted status proves the decision. */
async function decide(page: Page, decision: 'APPROVE' | 'REQUEST_CORRECTION', reason: string, expectedStatus: string): Promise<void> {
  await page.goto(BASE_URL + '/assoc/vet-licences?view=OPEN', { waitUntil: 'load' });
  const item = page.locator('[data-testid="licence-queue"] > li', { hasText: LICENCE_CODE });
  await item.getByTestId('open-licence-case').click();
  await page.getByTestId('licence-decision-form').waitFor();
  await page.getByTestId('licence-decision-' + decision).check();
  await page.getByTestId('licence-decision-reason').fill(reason);
  await page.getByTestId('submit-licence-decision').click();
  await waitForText(page, 'licence-case-status', expectedStatus);
}

test('a licensed doctor submits every mandatory component, and the case waits for review', async () => {
  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await Promise.all([page.waitForURL('**/account/vet-profile?path=licensed'), page.getByTestId('path-licensed').click()]);
    const form = page.getByTestId('licence-application-form');
    await form.waitFor();
    await form.getByTestId('lic-name').fill('دکتر دارای پروانه SYNTHETIC ' + RUN);
    await form.getByTestId('lic-council-code').fill('syn lb ' + RUN);
    await form.getByTestId('lic-scope-SPECIALIST').check();
    await form.getByTestId('lic-code').fill(LICENCE_CODE);
    await form.getByTestId('lic-date').fill('2024-05-01');
    await form.getByTestId('lic-doc-PRACTICE_LICENCE').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: PDF });
    await form.getByTestId('lic-doc-COUNCIL_CARD').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG });
    await form.getByTestId('lic-clinic').fill('کلینیک آزمایشی ' + RUN);
    await form.getByTestId('lic-service-MICROCHIP_IMPLANT').check();
    await form.getByTestId('submit-licence').click();
    await waitForText(page, 'licence-case-status', 'ارسال‌شده');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= MOBILE.width, 'no sideways scroll on a phone: ' + width);
  });
});

test('the association asks for a correction, and the applicant answers with a new version', async () => {
  await as('association', DESKTOP, async (page) => {
    await decide(page, 'REQUEST_CORRECTION', 'SYNTHETIC تاریخ روی پروانه خوانا نیست', 'نیازمند اصلاح');
    assert.equal((await page.getByTestId('review-licence-code').textContent())?.trim(), LICENCE_CODE);
    licencePath = (await page.getByTestId('licence-document-link-PRACTICE_LICENCE').first().getAttribute('href'))!;
    const file = await page.request.get(BASE_URL + licencePath);
    assert.equal(file.status(), 200, 'the association reads the licence file');
    assert.equal(file.headers()['content-type'], 'application/pdf');
    assert.match(file.headers()['cache-control'] ?? '', /no-store/);
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'licence-case-status', 'نیازمند اصلاح');
    await waitForText(page, 'licence-review-note', 'تاریخ روی پروانه خوانا نیست');
    const form = page.getByTestId('licence-revision-form');
    await form.getByTestId('lic-date').fill('2023-02-01');
    await form.getByTestId('revise-licence').click();
    await waitForText(page, 'licence-case-status', 'ارسال‌شده');
    await waitForText(page, 'licence-history', 'نیازمند اصلاح');
  });
});

test('approval waits for payment: the licensed tag does not appear, and the file stays private', async () => {
  await as('association', DESKTOP, async (page) => {
    await decide(page, 'APPROVE', 'SYNTHETIC پروانه و تاریخ تطبیق داده شد', 'پروانه تأییدشده، در انتظار پرداخت');
    await page.getByTestId('licence-submissions').waitFor();
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'licence-case-status', 'در انتظار پرداخت');
    await page.getByTestId('licence-awaiting-payment').waitFor();
    await waitForText(page, 'vet-current-tag', 'بدون پروانه فعالیت');
    assert.equal(((await page.getByTestId('vet-current-tag').textContent()) ?? '').includes('دارای پروانه فعالیت'), false, 'no licensed tag before payment');
    assert.equal(await page.getByTestId('licence-revision-form').count(), 0, 'reviewed facts are not editable');
    assert.equal((await page.request.get(BASE_URL + licencePath)).status(), 200, 'the applicant reads their own licence');
  });

  await as('stranger', DESKTOP, async (page) => {
    assert.equal((await page.request.get(BASE_URL + licencePath)).status(), 403, 'another account cannot read it');
    await page.goto(BASE_URL + '/assoc/vet-licences', { waitUntil: 'load' });
    assert.equal((await page.getByTestId('denial-code').textContent())?.trim(), 'FORBIDDEN');
  });
  await as('visitor', MOBILE, async (page) => {
    assert.equal((await page.request.get(BASE_URL + licencePath)).status(), 401);
  });
});

/** The managed figures of a licence period; nothing is sold until they are entered (PROMPT-008). */
async function configureLicencePeriod(): Promise<void> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    for (const [key, value] of [
      ['vet_licence.activation_toman', '"250000"'],
      ['vet_licence.renewal_toman', '"200000"'],
      ['vet_licence.period_days', '365'],
      ['vet_licence.grace_days', '10'],
      ['vet_licence.reminder_days_before', '30'],
    ] as const) {
      await db.execute(sql`update product_setting set value = ${value}::jsonb, updated_at = now() where key = ${key}`);
    }
  } finally {
    await pool.end();
  }
}

test('an unpaid gateway trip grants nothing, and a verified payment activates the period and the licensed tag', async () => {
  await configureLicencePeriod();

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await page.getByTestId('licence-period').waitFor();

    // A gateway that says no leaves the doctor exactly where they were.
    await page.getByTestId('pay-licence-period').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-fail').click();
    await page.getByTestId('licence-period-failed').waitFor();
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-current-tag', 'بدون پروانه فعالیت');
    await waitForText(page, 'licence-case-status', 'در انتظار پرداخت');

    await page.getByTestId('pay-licence-period').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.getByTestId('licence-period-paid').waitFor();

    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'vet-current-tag', 'دارای پروانه فعالیت');
    await waitForText(page, 'licence-case-status', 'پروانه فعال');
    await waitForText(page, 'licence-period-standing', 'فعال');
    // The next step offered is a renewal, not a second activation.
    await page.getByTestId('renew-licence-period').waitFor();
    assert.equal(await page.getByTestId('pay-licence-period').count(), 0);
  });
});

/** The terms a trusted applicant accepts, and their versions (PROMPT-010). */
async function configureTrustedTerms(): Promise<void> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    for (const [key, value] of [
      ['guide_text.trusted_vet_terms', '"SYNTHETIC — تعهدنامه آزمایشی دامپزشک معتمد."'],
      ['trusted_vet.terms_version', '"v1-browser"'],
      ['trusted_vet.declaration_version', '"d1-browser"'],
    ] as const) {
      await db.execute(sql`update product_setting set value = ${value}::jsonb, updated_at = now() where key = ${key}`);
    }
  } finally {
    await pool.end();
  }
}

test('the trusted request is offered only to an active licensed vet, and names the membership it still needs', async () => {
  await configureTrustedTerms();

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    // The licence is active, so the card is there; the membership is not, so the
    // request is not offered and the reason links to the membership itself.
    await page.getByTestId('trusted-unmet').waitFor();
    await waitForText(page, 'trusted-unmet', 'عضویت انجمن شما معتبر نیست');
    assert.equal(await page.getByTestId('trusted-application-form').count(), 0, 'nothing to submit while a condition is missing');
    assert.equal(await page.getByTestId('trusted-link-MEMBERSHIP').count(), 1);

    // Membership needs an identity and approved KYC first; the licence path never did.
    await page.goto(BASE_URL + '/account/profile', { waitUntil: 'load' });
    await page.getByTestId('first-name').fill('نمونه');
    await page.getByTestId('last-name').fill('معتمد آزمایشی');
    await page.getByTestId('national-id').fill(syntheticNationalId());
    await page.getByTestId('birth-date').fill('1990-01-01');
    await page.getByTestId('display-name').fill('نمایشی معتمد');
    await page.getByTestId('save-identity').click();

    await page.goto(BASE_URL + '/account/kyc', { waitUntil: 'load' });
    await page.getByTestId('kyc-file').setInputFiles({ name: 'card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) });
    await page.getByTestId('upload-kyc').click();
    // The submit stays disabled until the upload is actually stored.
    await page.getByText('تصویر کارت ملی بارگذاری شد').first().waitFor();
    await page.getByTestId('submit-kyc').click();
    await page.getByText('پرونده شما در حال بررسی است').first().waitFor();
    await as('association', DESKTOP, async (ops) => {
      await ops.goto(BASE_URL + '/assoc/kyc', { waitUntil: 'load' });
      await ops.getByTestId('open-case').first().click();
      await ops.getByTestId('review-form').waitFor();
      await ops.getByTestId('decision-APPROVED').check();
      await ops.getByTestId('submit-review').click();
      await ops.getByText('این پرونده در انتظار بررسی نیست').first().waitFor();
    });

    await approveMembershipApplication(browser, page, states.association);
    await page.getByTestId('pay-membership').click();
    await page.waitForURL('**/dev/gateway**');
    await page.getByTestId('gateway-pay').click();
    await page.getByTestId('membership-status').waitFor().catch(() => undefined);

    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    const form = page.getByTestId('trusted-application-form');
    await form.waitFor();
    await waitForText(page, 'trusted-terms-text', 'تعهدنامه آزمایشی');
    // Neither box ticked: the product does not let an empty declaration through.
    assert.equal(await form.getByTestId('submit-trusted').isDisabled(), true);
    await form.getByTestId('trusted-accept-terms').check();
    await form.getByTestId('trusted-declare-reader').check();
    await form.getByTestId('trusted-statement').fill('SYNTHETIC — درخواست معتمد از مرورگر');
    await form.getByTestId('submit-trusted').click();
    await waitForText(page, 'trusted-case-status', 'ارسال‌شده');
  });

  await as('association', DESKTOP, async (page) => {
    await page.goto(BASE_URL + '/assoc/vet-trusted', { waitUntil: 'load' });
    await page.getByTestId('trusted-queue').locator('li').first().getByTestId('open-trusted-case').click();
    await page.getByTestId('trusted-declaration').waitFor();
    // Equipment is declared, never verified.
    await waitForText(page, 'trusted-declared-equipment', 'اعلام‌شده');
    await waitForText(page, 'trusted-eligibility-now', 'عضویت معتبر انجمن');

    await page.getByTestId('trusted-decision-APPROVE').check();
    await page.getByTestId('trusted-decision-reason').fill('SYNTHETIC شرایط معتمد کامل است');
    await page.getByTestId('submit-trusted-decision').click();
    await waitForText(page, 'trusted-case-status', 'معتمد تأییدشده، در انتظار پرداخت');
  });

  await as('applicant', MOBILE, async (page) => {
    await page.goto(BASE_URL + '/account/vet-profile', { waitUntil: 'load' });
    await waitForText(page, 'trusted-case-status', 'معتمد تأییدشده، در انتظار پرداخت');
    await page.getByTestId('trusted-awaiting-payment').waitFor();
    // Approval alone grants nothing: the tag is still the licensed one.
    await waitForText(page, 'vet-current-tag', 'دارای پروانه فعالیت');
    assert.equal(((await page.getByTestId('vet-current-tag').textContent()) ?? '').includes('معتمد'), false);
  });
});
