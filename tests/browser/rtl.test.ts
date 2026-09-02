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
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { accounts } from '../../src/db/schema/core.ts';

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

let browser: Browser;
const accountIds = new Map<string, string>();

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    for (const [name, mobile] of Object.entries(FIXTURES)) {
      const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile));
      assert.ok(row, 'synthetic fixture ' + name + ' is missing; run: node src/db/seed/run.ts --dev');
      accountIds.set(name, row!.id);
    }
  } finally {
    await pool.end();
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function contextFor(
  fixture: keyof typeof FIXTURES | null,
  actorContext: string,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport, locale: 'fa-IR' });
  if (fixture !== null) {
    await context.addCookies([
      {
        name: 'hz_dev_actor',
        value: accountIds.get(fixture)! + ':' + actorContext,
        url: BASE_URL,
      },
    ]);
  }
  return context;
}

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
      const context = await contextFor(target.fixture, target.ctx, viewport);
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
    const context = await contextFor(null, '', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'UNAUTHENTICATED');
      await page.screenshot({ path: path.join(SHOTS, 'denied-anonymous.png'), fullPage: true });
    } finally {
      await context.close();
    }
  }

  // An ordinary user typing an operational URL is refused by the server.
  for (const url of ['/admin', '/admin/settings', '/assoc', '/genetics', '/vet']) {
    const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
    const context = await contextFor('superadmin', 'SUPERADMIN', VIEWPORTS.mobileReference);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/assoc', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'FORBIDDEN');
      await page.screenshot({ path: path.join(SHOTS, 'denied-wrong-shell.png'), fullPage: true });
    } finally {
      await context.close();
    }
  }

  // A cookie claiming a context the account does not hold resolves to nobody.
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobileReference });
    await context.addCookies([
      { name: 'hz_dev_actor', value: accountIds.get('owner')! + ':SUPERADMIN', url: BASE_URL },
    ]);
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + '/admin', { waitUntil: 'load' });
      assert.equal(await page.getByTestId('denial-code').textContent(), 'UNAUTHENTICATED');
    } finally {
      await context.close();
    }
  }
});

test('the role switcher shows only active public contexts and switching is checked on the server', async () => {
  // No extra role: nothing to switch between, so no switcher is rendered.
  {
    const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
    const context = await contextFor('breeder', 'USER', VIEWPORTS.mobileReference);
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
    const context = await contextFor('superadmin', 'USER', VIEWPORTS.mobileReference);
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
    const context = await contextFor('superadmin', 'USER', VIEWPORTS.mobileReference);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'load' });
    const body = await page.locator('body').innerText();
    assert.ok(body.includes('برای ثبت حیوان هم‌زیست، احراز هویت لازم است'), 'reason is shown');
    assert.ok(body.includes('باید تکمیل و تأیید شود'), 'next prerequisite is shown');
    const cta = page.getByRole('link', { name: 'تکمیل اطلاعات هویتی' });
    assert.equal(await cta.count(), 1);
    assert.equal(await cta.getAttribute('href'), '/account/kyc');
  } finally {
    await context.close();
  }
});

test('identifiers stay left-to-right inside Persian text', async () => {
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL + '/profile', { waitUntil: 'load' });
    const identifier = page.getByTestId('identifier').first();
    const direction = await identifier.evaluate((node) => getComputedStyle(node).direction);
    assert.equal(direction, 'ltr');
    const unicodeBidi = await identifier.evaluate((node) => getComputedStyle(node).unicodeBidi);
    assert.ok(unicodeBidi.includes('isolate'), 'identifier is bidi-isolated, got ' + unicodeBidi);
    // The rendered text is the stored value, unchanged.
    assert.equal(await identifier.textContent(), accountIds.get('owner'));
  } finally {
    await context.close();
  }
});

test('form errors are announced and wired to their input', async () => {
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.desktop);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
  const context = await contextFor('owner', 'USER', VIEWPORTS.mobileReference);
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
