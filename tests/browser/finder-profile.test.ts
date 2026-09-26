/**
 * Mating profile in a real browser — PHASE-4 PROMPT-003.
 *
 * An owner makes an animal eligible and activates it through the pages; the
 * public page and the picture are then asked for by the owner and by a visitor.
 * The clinical path (identity, chip) and KYC review have their own suites, so
 * those facts are written directly as SYNTHETIC rows here.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDatabase } from '../../src/db/client.ts';
import {
  BASE_URL,
  DATABASE_URL,
  DESKTOP,
  MOBILE,
  clearSyntheticOtp,
  expectText,
  newSyntheticMobile,
  signIn,
  syntheticNationalId,
} from './support.ts';

const SHOTS = path.join('docs', 'reports', 'screenshots', 'phase-4', 'prompt-003');
const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];
/** A real, decodable JPEG drawn by the browser, with an EXIF block carrying a GPS position injected after SOI. */
let realJpeg: Buffer;
const photo = (tag: string) =>
  Buffer.concat([realJpeg.subarray(0, 2), Buffer.from(segment(0xe1, [...Buffer.from('Exif\0\0GPS 35.7N 51.4E ' + tag)])), realJpeg.subarray(2)]);

let browser!: Browser;
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;
let animalId = '';
let previousCapacity: unknown = null;

async function withDb<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>): Promise<T> {
  const { db, pool } = createDatabase(DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

async function completeProfile(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/account/complete', { waitUntil: 'load' });
  if ((await page.getByTestId('national-id').count()) === 0) return;
  await page.getByTestId('first-name').fill('نمونه');
  await page.getByTestId('last-name').fill('جفت‌یابی');
  await page.getByTestId('national-id').fill(syntheticNationalId());
  await page.getByTestId('birth-date').fill('1990-01-01');
  await page.getByTestId('display-name').fill('نمایشی آزمایشی');
  await Promise.all([page.waitForURL('**/dashboard'), page.getByTestId('save-identity').click()]);
}

before(async () => {
  await fs.mkdir(SHOTS, { recursive: true });
  await clearSyntheticOtp();
  browser = await chromium.launch();
  const drawing = await browser.newPage();
  const dataUrl = await drawing.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#c8733a';
    g.fillRect(0, 0, 320, 240);
    g.fillStyle = '#3b2a1e';
    g.beginPath();
    g.ellipse(160, 130, 90, 60, 0, 0, Math.PI * 2);
    g.fill();
    return canvas.toDataURL('image/jpeg', 0.9);
  });
  await drawing.close();
  realJpeg = Buffer.from(dataUrl.split(',')[1]!, 'base64');
  const mobile = newSyntheticMobile();
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    await completeProfile(await signIn(context, mobile));
    ownerState = await context.storageState();
  } finally {
    await context.close();
  }
  // SYNTHETIC facts the clinical and KYC suites cover on their own.
  animalId = await withDb(async (db) => {
    const account = (await db.execute<{ id: string }>(sql`select id from account where mobile = ${mobile}`)).rows[0]!.id;
    await db.execute(sql`insert into kyc_case (account_id, status) values (${account}::uuid, 'APPROVED') on conflict (account_id) do update set status = 'APPROVED'`);
    const breed = (await db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' and is_active order by sort_order limit 1`)).rows[0]!.id;
    const animal = (
      await db.execute<{ id: string }>(
        sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
            values (${account}::uuid, 'REGISTERED', 'DOG', 'سگ جفت‌یابی', ${breed}::uuid, 'FEMALE', '2023-02-01') returning id`,
      )
    ).rows[0]!.id;
    await db.execute(
      sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id)
          values (${animal}::uuid, ${'98511' + String(Date.now()).slice(-10)}, 'MANUAL', 'EXISTING_UNREGISTERED', ${account}::uuid)`,
    );
    previousCapacity = (await db.execute<{ value: unknown }>(sql`select value from product_setting where key = 'finder.capacity.free_owner'`)).rows[0]?.value ?? null;
    await db.execute(sql`update product_setting set value = '1'::jsonb, version = version + 1 where key = 'finder.capacity.free_owner'`);
    return animal;
  });
});

after(async () => {
  await withDb((db) =>
    db.execute(sql`update product_setting set value = ${previousCapacity === null ? null : JSON.stringify(previousCapacity)}::jsonb where key = 'finder.capacity.free_owner'`),
  ).catch(() => undefined);
  await browser?.close();
});

test('an owner makes an animal eligible, adds the two pictures and activates it, and the page says what is still missing at each step', async () => {
  const context = await browser.newContext({ viewport: MOBILE, locale: 'fa-IR', storageState: ownerState });
  try {
    const page = await context.newPage();
    await page.goto(BASE_URL + '/account/mating-finder/profiles', { waitUntil: 'load' });
    await page.getByTestId('finder-owner-animal-' + animalId).click();
    await page.getByTestId('finder-problems').waitFor();
    for (const problem of ['FERTILITY_UNDECLARED', 'FULL_BODY', 'FACE']) await page.getByTestId('finder-problem-' + problem).waitFor();
    assert.equal(await page.getByTestId('finder-activate').count(), 0, 'no activation button while conditions are missing');

    await page.getByTestId('finder-fertility-status').selectOption('NOT_STERILIZED');
    await page.getByTestId('finder-fertility-submit').click();
    await expectText(page, 'اظهار شما ثبت شد');

    for (const [role, alt] of [['FULL_BODY', 'تمام‌بدن سگ'], ['FACE', 'صورت سگ']] as const) {
      const form = page.getByTestId('finder-media-form-image');
      await form.getByTestId('finder-media-file-image').setInputFiles({ name: role + '.jpg', mimeType: 'image/jpeg', buffer: photo(role) });
      await form.getByTestId('finder-media-role').selectOption(role);
      await form.getByTestId('finder-media-alt-image').fill(alt);
      await form.getByTestId('finder-media-submit-image').click();
      await expectText(page, alt);
    }
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('finder-eligible').waitFor();
    await page.getByTestId('finder-activate').click();
    // The activation form gives way to the availability form once the profile is live.
    await page.getByTestId('finder-state-form').waitFor();
    assert.match(await page.getByTestId('finder-profile-state').innerText(), /آماده دریافت درخواست/);

    await page.getByTestId('finder-public-link').click();
    await page.getByTestId('finder-public-title').waitFor();
    await expectText(page, 'سابقه جفت‌گیری تأییدشده ثبت نشده');
    await expectText(page, 'میکروچیپ رسمی ثبت‌شده');
    const body = await page.locator('body').innerText();
    assert.ok(!/98511\d{10}/.test(body), 'the microchip number is not on the public page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'no horizontal scroll at 360px');
    await page.screenshot({ path: path.join(SHOTS, 'public-profile-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('a visitor gets the same 404 for a free owner’s profile and its picture, and the served picture has no metadata', async () => {
  const [profileId, renditionId, originalId] = await withDb(async (db) => {
    const row = (
      await db.execute<{ profile_id: string; rendition: string; original: string }>(
        sql`select p.id as profile_id, m.rendition_file_id as rendition, m.file_id as original
            from mating_profile p join mating_profile_media m on m.profile_id = p.id
            where p.animal_id = ${animalId}::uuid and m.kind = 'IMAGE' limit 1`,
      )
    ).rows[0]!;
    return [row.profile_id, row.rendition, row.original];
  });

  const visitor = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR' });
  try {
    const page = await visitor.newPage();
    const response = await page.goto(BASE_URL + '/mating-finder/' + profileId, { waitUntil: 'load' });
    assert.equal(response?.status(), 404, 'a free owner’s profile is not for a visitor');
    assert.equal((await page.request.get(BASE_URL + '/media/' + renditionId)).status(), 404);
  } finally {
    await visitor.close();
  }

  const owner = await browser.newContext({ viewport: DESKTOP, locale: 'fa-IR', storageState: ownerState });
  try {
    const page = await owner.newPage();
    const served = await page.request.get(BASE_URL + '/media/' + renditionId);
    assert.equal(served.status(), 200);
    assert.ok(!(await served.body()).toString('latin1').includes('GPS'));
    assert.equal((await page.request.get(BASE_URL + '/media/' + originalId)).status(), 404, 'the original is never public');
  } finally {
    await owner.close();
  }
});
