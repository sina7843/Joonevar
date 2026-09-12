/**
 * Public images of directory records — the rule, not the plumbing.
 *
 * The question worth testing is the one a visitor can exploit: does an image
 * stay readable when the record carrying it is not public? Everything else here
 * exists to make that question answerable on real rows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db.ts';
import { attachPublicImage, publicRecordImage, imagePurposes } from '../../src/media/public-image.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import { PURPOSE_RULES } from '../../src/files/signature.ts';
import { actorFor } from '../helpers/mating.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const superadmin = (accountId: string) => actorFor(accountId, 'SUPERADMIN');

async function storageDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-image-'));
}

/** A breed row to hang an image on, created directly because its own service is tested elsewhere. */
async function draftBreed(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  const [row] = await db
    .insert(referenceBreeds)
    .values({ nameFa: 'نژاد آزمایشی', nameEn: 'Test Breed', slug: 'test-breed' })
    .returning();
  return row!;
}

test('an image is readable only while the record carrying it is public', async () => {
  const testDb = await createTestDb();
  const storage = await storageDir();
  try {
    const { accounts } = await import('../../src/db/schema/core.ts');
    const [account] = await testDb.db.insert(accounts).values({ mobile: '09990000101', status: 'ACTIVE' }).returning();
    const actor = superadmin(account!.id);
    const breed = await draftBreed(testDb.db);

    const attached = await attachPublicImage(testDb.db, storage, actor, {
      kind: 'BREED',
      recordId: breed.id,
      expectedVersion: breed.version,
      bytes: JPEG,
      originalName: 'b.jpg',
      altFa: 'تصویر آزمایشی نژاد',
    });

    // The breed is still a draft, so its image does not exist from outside.
    assert.equal(await publicRecordImage(testDb.db, storage, attached.fileId), null);

    await testDb.db
      .update(referenceBreeds)
      .set({ profileStatus: 'PUBLISHED' })
      .where(eq(referenceBreeds.id, breed.id));

    const shown = await publicRecordImage(testDb.db, storage, attached.fileId);
    assert.equal(shown?.mime, 'image/jpeg');
    assert.equal(shown?.sha256, createHash('sha256').update(JPEG).digest('hex'));

    // Taken back out of sight, the address stops answering again.
    await testDb.db.update(referenceBreeds).set({ profileStatus: 'DRAFT' }).where(eq(referenceBreeds.id, breed.id));
    assert.equal(await publicRecordImage(testDb.db, storage, attached.fileId), null);
  } finally {
    await fs.rm(storage, { recursive: true, force: true });
    await testDb.drop();
  }
});

test('an image without alternative text is refused, and a stale version never overwrites', async () => {
  const testDb = await createTestDb();
  const storage = await storageDir();
  try {
    const { accounts } = await import('../../src/db/schema/core.ts');
    const [account] = await testDb.db.insert(accounts).values({ mobile: '09990000102', status: 'ACTIVE' }).returning();
    const actor = superadmin(account!.id);
    const breed = await draftBreed(testDb.db);

    await assert.rejects(
      () =>
        attachPublicImage(testDb.db, storage, actor, {
          kind: 'BREED',
          recordId: breed.id,
          expectedVersion: breed.version,
          bytes: JPEG,
          originalName: null,
          altFa: '   ',
        }),
      /متن جایگزین/,
    );

    await assert.rejects(
      () =>
        attachPublicImage(testDb.db, storage, actor, {
          kind: 'BREED',
          recordId: breed.id,
          expectedVersion: breed.version + 5,
          bytes: JPEG,
          originalName: null,
          altFa: 'تصویر آزمایشی',
        }),
      /هم‌زمان تغییر کرده/,
    );

    // A document is not a picture: the upload rules refuse it by its own bytes.
    await assert.rejects(
      () =>
        attachPublicImage(testDb.db, storage, actor, {
          kind: 'BREED',
          recordId: breed.id,
          expectedVersion: breed.version,
          bytes: PDF,
          originalName: 'not-an-image.pdf',
          altFa: 'تصویر آزمایشی',
        }),
    );
  } finally {
    await fs.rm(storage, { recursive: true, force: true });
    await testDb.drop();
  }
});

test('every public image purpose accepts pictures only, and nothing else answers the public address', async () => {
  for (const purpose of imagePurposes()) {
    const rule = PURPOSE_RULES[purpose as keyof typeof PURPOSE_RULES];
    assert.ok(rule, 'no upload rule for ' + purpose);
    assert.deepEqual([...rule.accept].sort(), ['image/jpeg', 'image/png']);
  }

  const testDb = await createTestDb();
  const storage = await storageDir();
  try {
    // A private document id is not a public image, whoever asks.
    assert.equal(await publicRecordImage(testDb.db, storage, '00000000-0000-0000-0000-000000000000'), null);
    assert.equal(await publicRecordImage(testDb.db, storage, 'not-a-uuid'), null);
  } finally {
    await fs.rm(storage, { recursive: true, force: true });
    await testDb.drop();
  }
});
