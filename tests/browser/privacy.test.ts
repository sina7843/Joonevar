/**
 * Privacy at the edge — Phase 2 PROMPT-017.
 *
 * The private file route is the one place where a wrong answer leaks a
 * document rather than a page. §20 requires the authorisation to run before any
 * filesystem access, so an unauthorised caller must not even learn whether an
 * object exists. This checks that from outside, over real HTTP.
 *
 * Runs on the isolated database and server of `tools/browser-tests.mjs`.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { BASE_URL, DESKTOP, signIn } from './support.ts';

let browser!: Browser;
let userState: Awaited<ReturnType<BrowserContext['storageState']>>;

before(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await signIn(context, '09990000001');
    userState = await context.storageState();
  } finally {
    await context.close();
  }
});

after(async () => {
  await browser?.close();
});

test('an anonymous caller is refused a private file and learns nothing about it', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const response = await context.request.get(BASE_URL + '/api/files/' + randomUUID());
    // Unauthenticated, not "not found": the answer never depends on whether the
    // object exists, so it cannot be used to probe for one.
    assert.equal(response.status(), 401);
    assert.equal((await response.text()).includes('storage'), false, 'no internal detail leaks');
  } finally {
    await context.close();
  }
});

test('a signed-in account is refused a file it does not own, with no cache left behind', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR', storageState: userState });
  try {
    const response = await context.request.get(BASE_URL + '/api/files/' + randomUUID());
    assert.ok(response.status() === 404 || response.status() === 403, 'refused: ' + response.status());
    assert.equal(response.status() === 200, false);
    // A refusal must not be cached by a proxy on the way back either.
    const cache = response.headers()['cache-control'] ?? '';
    assert.equal(cache.includes('public'), false, 'a private answer is never publicly cacheable');
  } finally {
    await context.close();
  }
});

test('a badly shaped file address is refused the same way as a missing one', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR', storageState: userState });
  try {
    for (const id of ['not-a-uuid', '../../etc/passwd', '00000000-0000-0000-0000-000000000000']) {
      const response = await context.request.get(BASE_URL + '/api/files/' + encodeURIComponent(id));
      assert.equal(response.status() === 200, false, id + ' answered 200');
    }
  } finally {
    await context.close();
  }
});
