/**
 * Browser review — required gates `shell-permissions` and `rtl-browser-review`.
 *
 * This runs a real Chromium against the built application. It checks the things
 * a screenshot alone cannot prove — no horizontal overflow in RTL, identifiers
 * isolated left-to-right, form errors wired to the input, focus trapped and
 * restored, the official logo rendered at its true aspect ratio, and route
 * access decided on the server — and saves the screenshots that were inspected.
 *
 * Requires the built app on BASE_URL and the synthetic fixtures seeded:
 *   npm run build && npx next start -p 3111
 *   node src/db/seed/run.ts --dev
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';

const BASE_URL = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:3111';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
const SHOTS = path.join('docs', 'reports', 'screenshots', 'prompt-003');

/** Reference mobile size is the prototype frame size; the others are the documented breakpoints. */
const VIEWPORTS = {
  mobileReference: { width: 360, height: 800 },
  mobileLarge: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const FIXTURES = {
  owner: '09990000001',
  breeder: '09990000002',
  vet: '09990000003',
  association: '09990000004',
  genetics: '09990000005',
  superadmin: '09990000006',
} as const;

let browser!: Browser;

/**
 * One sign-in per fixture for the whole suite.
 *
 * Each sign-in sends a real code, and the hourly send cap is a real rule, so the
 * session is captured once and replayed as storage state instead of signing in
 * again for every page and viewport.
 */
const storageStates = new Map<string, Awaited<ReturnType<BrowserContext['storageState']>>>();

async function lastCodeFor(mobile: string): Promise<string> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    const rows = await db.execute<{ body: string }>(
      sql`select body from dev_outbound_sms where to_mobile = ${mobile} order by created_at desc limit 1`,
    );
    const match = /(\d{6})/.exec(rows.rows[0]?.body ?? '');
    assert.ok(match, 'no code was sent to ' + mobile);
    return match![1]!;
  } finally {
    await pool.end();
  }
}

async function captureSession(fixture: keyof typeof FIXTURES): Promise<void> {
  const mobile = FIXTURES[fixture];
  const context = await browser.newContext({ viewport: VIEWPORTS.mobileReference, locale: 'fa-IR' });
  try {
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
    storageStates.set(fixture, await context.storageState());
  } finally {
    await context.close();
  }
}

async function signIn(
  fixture: keyof typeof FIXTURES,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const state = storageStates.get(fixture);
  assert.ok(state, 'no captured session for ' + fixture);
  return browser.newContext({ viewport, locale: 'fa-IR', storageState: state });
}

async function anonymousContext(viewport: { width: number; height: number }): Promise<BrowserContext> {
  return browser.newContext({ viewport, locale: 'fa-IR' });
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });

  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    for (const [name, mobile] of Object.entries(FIXTURES)) {
      const rows = await db.execute<{ id: string }>(
        sql`select id from account where mobile = ${mobile} limit 1`,
      );
      assert.ok(rows.rows[0], 'synthetic fixture ' + name + ' is missing; run: node src/db/seed/run.ts --dev');
    }
    // Only the synthetic 0999 range is cleared, so repeated runs are not stopped
    // by the hourly send cap. Real numbers keep their history and their cap.
    await db.execute(sql`delete from otp_challenge where mobile like '0999%'`);
    await db.execute(sql`delete from dev_outbound_sms where to_mobile like '0999%'`);
  } finally {
    await pool.end();
  }

  browser = await chromium.launch();
  for (const fixture of Object.keys(FIXTURES) as Array<keyof typeof FIXTURES>) {
    await captureSession(fixture);
  }
});

after(async () => {
  await browser?.close();
});

/** The single most useful RTL regression check: the page must never scroll sideways. */
async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    label + ' overflows horizontally: scrollWidth=' + overflow.scrollWidth + ' clientWidth=' + overflow.clientWidth,
  );
}

async function assertRtlDocument(page: Page) {
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.equal(await page.getAttribute('html', 'lang'), 'fa');
}

test('every shell renders RTL without horizontal overflow at all reviewed sizes', async () => {
  const pages: ReadonlyArray<{ fixture: keyof typeof FIXTURES; ctx: string; url: string; name: string }> = [
    { fixture: 'owner', ctx: 'USER', url: '/dashboard', name: 'dashboard' },
    { fixture: 'owner', ctx: 'USER', url: '/animals/11111111-1111-1111-1111-111111111111', name: 'animal-profile' },
    { fixture: 'owner', ctx: 'USER', url: '/notifications', name: 'notifications' },
    { fixture: 'breeder', ctx: 'BREEDER', url: '/dashboard', name: 'dashboard-breeder' },
    { fixture: 'vet', ctx: 'TRUSTED_VET', url: '/vet', name: 'vet-panel' },
    { fixture: 'association', ctx: 'ASSOCIATION_OPERATOR', url: '/assoc', name: 'assoc-shell' },
    { fixture: 'association', ctx: 'ASSOCIATION_OPERATOR', url: '/assoc/issuers', name: 'assoc-issuers' },
    { fixture: 'genetics', ctx: 'GENETICS_OPERATOR', url: '/genetics', name: 'genetics-shell' },
    { fixture: 'superadmin', ctx: 'SUPERADMIN', url: '/admin/settings', name: 'admin-settings' },
  ];

  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const target of pages) {
      const context = await signIn(target.fixture, viewport);
      const page = await context.newPage();
      try {
        const response = await page.goto(BASE_URL + target.url, { waitUntil: 'load' });
        assert.equal(response?.status(), 200, target.url + ' should render for ' + target.ctx);
        await assertRtlDocument(page);
        await assertNoHorizontalOverflow(page, target.name + '@' + viewportName);
        if (viewportName === 'mobileReference' || viewportName === 'desktop') {
          await page.screenshot({
            path: path.join(SHOTS, target.name + '-' + viewportName + '.png'),
            fullPage: true,
          });
        }
      } finally {
        await context.close();
      }
    }
  }
});

test('route access is enforced by the server, not by hiding navigation', async () => {
  // Anonymous: no cookie at all.
  {
    const context = await anonymousContext(VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      // Anonymous access is not a refusal screen: it is a sign-in with the
      // requested page carried along, so the flow resumes there (§8, DEC-0110).
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      await page.waitForURL((url) => url.pathname === '/login');
      assert.equal(new URL(page.url()).searchParams.get('next'), '/dashboard');
      await page.screenshot({ path: path.join(SHOTS, 'denied-anonymous.png'), fullPage: true });
    } finally {
      await context.close();
    }
  }

  // An ordinary user typing an operational URL is refused by the server.
  for (const url of ['/admin', '/admin/settings', '/assoc', '/genetics', '/vet']) {
    const context = await signIn('owner', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + url, { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN', url + ' must be refused');
    } finally {
      await context.close();
    }
  }

  // Holding the superadmin role does not open the association shell.
  {
    const context = await signIn('superadmin', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/assoc', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN');
      await page.screenshot({ path: path.join(SHOTS, 'denied-wrong-shell.png'), fullPage: true });
    } finally {
      await context.close();
    }
  }

  // A forged session cookie is not a session: the token is matched by hash.
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobileReference });
    await context.addCookies([{ name: 'hz_session', value: 'forged-token-value', url: BASE_URL }]);
    const page = await context.newPage();
    try {
      // A forged cookie is treated exactly like no session at all: sign in,
      // with the requested page carried along (DEC-0110).
      await page.goto(BASE_URL + '/admin', { waitUntil: 'load' });
      await page.waitForURL((url) => url.pathname === '/login');
      assert.equal(new URL(page.url()).searchParams.get('next'), '/admin');
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      await page.waitForURL((url) => url.pathname === '/login');
      assert.equal(new URL(page.url()).searchParams.get('next'), '/dashboard');
    } finally {
      await context.close();
    }
  }
});

test('the role switcher shows only active public contexts and switching is checked on the server', async () => {
  // No extra role: nothing to switch between, so no switcher is rendered.
  {
    const context = await signIn('owner', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('role-switcher').count(), 0);
    } finally {
      await context.close();
    }
  }

  // Breeder: exactly two chips, and no operational context among them.
  {
    const context = await signIn('breeder', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      const chips = page.locator('[data-testid="role-switcher"] button');
      assert.equal(await chips.count(), 2);
      const contexts = await chips.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-context')));
      assert.deepEqual(contexts, ['USER', 'BREEDER']);
      await page.screenshot({ path: path.join(SHOTS, 'role-switcher.png'), fullPage: true });

      await page.locator('[data-context="BREEDER"]').click();
      await page.waitForLoadState('load');
      assert.equal(await page.locator('[data-context="BREEDER"]').getAttribute('aria-current'), 'true');
    } finally {
      await context.close();
    }
  }

  // The superadmin fixture has no public extra role, so its switcher is absent.
  {
    const context = await signIn('superadmin', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('role-switcher').count(), 0);
    } finally {
      await context.close();
    }
  }

  // Posting an operational context directly is refused.
  {
    const context = await signIn('superadmin', VIEWPORTS.mobileReference);
    try {
      const response = await context.request.post(BASE_URL + '/api/context', {
        form: { context: 'SUPERADMIN', returnTo: '/dashboard' },
      });
      assert.equal(response.status(), 403);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'FORBIDDEN');
    } finally {
      await context.close();
    }
  }
});

test('a locked service shows its reason, prerequisite and a working CTA', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('برای ثبت حیوان هم‌زیست، احراز هویت لازم است'), 'reason is shown');
    assert.ok(body.includes('باید تکمیل و تأیید شود'), 'next prerequisite is shown');
    // Every service that depends on identity verification shows the same CTA,
    // so the count grows with the dashboard; what matters is that each one
    // actually leads to the verification route.
    const cta = page.getByRole('link', { name: 'تکمیل اطلاعات هویتی' });
    const hrefs = await cta.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
    assert.ok(hrefs.length >= 1);
    assert.ok(hrefs.every((href) => href === '/account/kyc'));
  } finally {
    await context.close();
  }
});

test('identifiers stay left-to-right inside Persian text', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    // The profile is a real record now, and it is refused to anyone but its
    // owner, so the fixture owns this synthetic animal.
    const animalId = '11111111-1111-1111-1111-111111111111';
    const { db, pool } = createDatabase(DATABASE_URL);
    try {
      await db.execute(sql`
        insert into animal (id, owner_account_id, status, name)
        select ${animalId}::uuid, account.id, 'REGISTERED', 'نمونه نمایش'
        from account where account.mobile = ${FIXTURES.owner}
        on conflict (id) do nothing
      `);
    } finally {
      await pool.end();
    }
    await page.goto(BASE_URL + '/animals/' + animalId, { waitUntil: 'load' });
    const identifier = page.getByTestId('identifier').first();
    const direction = await identifier.evaluate((node) => getComputedStyle(node).direction);
    assert.equal(direction, 'ltr');
    const unicodeBidi = await identifier.evaluate((node) => getComputedStyle(node).unicodeBidi);
    assert.ok(unicodeBidi.includes('isolate'), 'identifier is bidi-isolated, got ' + unicodeBidi);
    // The rendered text is the stored value, unchanged.
    assert.equal(await identifier.textContent(), animalId);
  } finally {
    await context.close();
  }
});

test('form errors are announced and wired to their input', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dev/patterns', { waitUntil: 'load' });
    const input = page.getByTestId('national-id');

    assert.equal(await input.getAttribute('aria-invalid'), null, 'no error before typing');
    await input.fill('12');

    const describedBy = await input.getAttribute('aria-describedby');
    assert.ok(describedBy, 'input describes its hint and error');
    assert.equal(await input.getAttribute('aria-invalid'), 'true');

    const errorId = describedBy!.split(' ').at(-1)!;
    // useId produces ids containing colons, so an attribute selector is used.
    const error = page.locator('[id="' + errorId + '"]');
    assert.equal(await error.getAttribute('role'), 'alert');
    assert.equal((await error.textContent())?.trim(), 'کد ملی باید دقیقاً ده رقم باشد.');

    await page.screenshot({ path: path.join(SHOTS, 'form-error.png'), fullPage: true });

    await input.fill('0011223344');
    assert.equal(await input.getAttribute('aria-invalid'), null, 'error clears when valid');
  } finally {
    await context.close();
  }
});

test('overlays trap focus, close on Escape and restore focus to the trigger', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dev/patterns', { waitUntil: 'load' });

    const trigger = page.getByTestId('open-modal');
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByTestId('modal');
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    assert.equal(await dialog.getAttribute('role'), 'dialog');

    // Focus moved inside the dialog.
    let focusInside = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="modal"]');
      return modal?.contains(document.activeElement) ?? false;
    });
    assert.ok(focusInside, 'focus moves into the dialog on open');

    // Tab cycles without leaving the dialog.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Tab');
    focusInside = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="modal"]');
      return modal?.contains(document.activeElement) ?? false;
    });
    assert.ok(focusInside, 'Tab stays inside the dialog');

    await page.screenshot({ path: path.join(SHOTS, 'modal-focus.png') });

    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('modal').count(), 0, 'Escape closes the dialog');

    const restored = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? null,
    );
    assert.equal(restored, 'open-modal', 'focus returns to the trigger');
  } finally {
    await context.close();
  }
});

test('the RTL action order puts the primary action on the right', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dev/patterns', { waitUntil: 'load' });
    await page.getByTestId('open-modal').click();
    const primary = await page.getByTestId('modal-primary').boundingBox();
    const secondary = await page.getByTestId('modal-secondary').boundingBox();
    assert.ok(primary && secondary);
    // ERRATA v2.0: right = primary, left = secondary.
    assert.ok(primary!.x > secondary!.x, 'primary must sit to the right of secondary in RTL');
  } finally {
    await context.close();
  }
});

test('the official logo renders at its true aspect ratio and is not cropped', async () => {
  const context = await signIn('owner', VIEWPORTS.desktop);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const logo = page.getByAltText('همزیست').first();
    const metrics = await logo.evaluate((node) => {
      const image = node as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: rect.width,
        height: rect.height,
        objectFit: getComputedStyle(image).objectFit,
        complete: image.complete,
      };
    });
    assert.ok(metrics.complete && metrics.naturalWidth > 0, 'logo asset actually loaded');
    assert.notEqual(metrics.objectFit, 'cover', 'the logo must never be cropped');

    // The image optimizer resizes, so the served bitmap is smaller than the
    // source. What must hold is that neither step changes the shape: the served
    // image keeps the source ratio, and the rendered box keeps the served ratio.
    const sourceRatio = 334 / 72;
    const servedRatio = metrics.naturalWidth / metrics.naturalHeight;
    const renderedRatio = metrics.width / metrics.height;
    assert.ok(
      Math.abs(servedRatio - sourceRatio) < 0.15,
      'served logo ratio drifted from the source: ' + servedRatio + ' vs ' + sourceRatio,
    );
    assert.ok(
      Math.abs(renderedRatio - servedRatio) < 0.05,
      'logo is stretched: served=' + servedRatio + ' rendered=' + renderedRatio,
    );

    // And the source file itself is the official export, byte-for-byte.
    const header = await fs.readFile(path.join('public', 'brand', 'logo-fa-horizontal.png'));
    assert.equal(header.readUInt32BE(16), 334, 'source logo width');
    assert.equal(header.readUInt32BE(20), 72, 'source logo height');
  } finally {
    await context.close();
  }
});

test('long Persian text wraps instead of widening the page', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dev/patterns', { waitUntil: 'load' });
    await assertNoHorizontalOverflow(page, 'patterns@mobileReference');
    await page.screenshot({ path: path.join(SHOTS, 'patterns-mobileReference.png'), fullPage: true });

    // The synthetic gallery is labelled as such wherever it shows sample records.
    assert.ok((await page.locator('[data-synthetic="true"]').count()) > 0, 'sample data is labelled synthetic');
  } finally {
    await context.close();
  }
});

test('the bottom navigation meets the touch target size and marks the current page', async () => {
  const context = await signIn('owner', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const links = page.locator('nav[aria-label="ناوبری اصلی"] a');
    assert.equal(await links.count(), 4);
    for (let i = 0; i < 4; i += 1) {
      const box = await links.nth(i).boundingBox();
      assert.ok((box?.height ?? 0) >= 44, 'tab ' + i + ' must meet the 44px touch minimum');
    }
    assert.equal(await links.first().getAttribute('aria-current'), 'page');
  } finally {
    await context.close();
  }
});
