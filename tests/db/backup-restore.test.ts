/**
 * Backup and restore, verified on disposable data — gate `backup-restore`.
 *
 * The point of this gate is that the two halves survive together: after a
 * restore, a sample still points at its animal, a document still points at its
 * owner, and a private file's bytes are still where the row says they are. It
 * runs against a real disposable database and a real disposable storage
 * directory, and it destroys both before restoring, so nothing here is proved
 * by a file that was never actually gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { createTestDb, ADMIN_URL } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { storedFiles } from '../../src/db/schema/core.ts';
import { samples } from '../../src/db/schema/clinical.ts';
import { registrationSheets } from '../../src/db/schema/documents.ts';
import { putPrivateFile, readPrivateFile } from '../../src/files/storage.ts';
import { runBackup } from '../../tools/backup.mjs';
import { runRestore } from '../../tools/restore.mjs';
import { animalWithSheet, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099911000', tmpPrefix: 'hamzist-bak-', councilCode: 'SYNTH-BK-1', chipBase: 5_000_000 },
    fn,
  );

test('a snapshot restores the database and the private files together', async () => {
  await withCtx(async (ctx) => {
    // Real linked data: an animal, its visit, its sample, its registration
    // sheet and a private file that belongs to its owner.
    const animal = await animalWithSheet(ctx, 'سگ پشتیبان');
    const file = await putPrivateFile(ctx.testDb.db, ctx.root, ctx.first.actor, {
      ownerAccountId: ctx.first.accountId,
      purpose: 'KYC_NATIONAL_ID',
      bytes: JPEG,
    });
    const [sheetBefore] = await ctx.testDb.db
      .select()
      .from(registrationSheets)
      .where(eq(registrationSheets.animalId, animal.animalId));
    const [sampleBefore] = await ctx.testDb.db
      .select()
      .from(samples)
      .where(eq(samples.animalId, animal.animalId));
    assert.ok(sheetBefore && sampleBefore);

    const backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-backup-'));
    try {
      const { snapshot, manifest } = await runBackup({
        url: ctx.testDb.url,
        storage: ctx.root,
        out: backupRoot,
        containerName: 'hamzist-db',
      });
      assert.ok(manifest.database.bytes > 0, 'the dump is not empty');
      assert.ok(manifest.privateFiles.count >= 1, 'the private files are part of the same snapshot');

      // Destroy both halves for real.
      await ctx.testDb.db.execute(sql`drop schema public cascade`);
      await ctx.testDb.db.execute(sql`drop schema if exists drizzle cascade`);
      await ctx.testDb.db.execute(sql`create schema public`);
      await fs.rm(ctx.root, { recursive: true, force: true });
      const gone = await ctx.testDb.db
        .execute<{ value: string }>(
          sql`select count(*)::text as value from information_schema.tables where table_schema = 'public'`,
        )
        .then((result) => result.rows[0]!.value);
      assert.equal(gone, '0', 'the database really was emptied');

      const restored = await runRestore({
        from: snapshot,
        url: ctx.testDb.url,
        storage: ctx.root,
        containerName: 'hamzist-db',
      });
      assert.ok(restored.files >= 1);

      // The rows are back, and they still point at each other.
      const [sheetAfter] = await ctx.testDb.db
        .select()
        .from(registrationSheets)
        .where(eq(registrationSheets.animalId, animal.animalId));
      assert.equal(sheetAfter!.id, sheetBefore!.id);
      assert.equal(sheetAfter!.petId, sheetBefore!.petId);
      const [sampleAfter] = await ctx.testDb.db
        .select()
        .from(samples)
        .where(eq(samples.animalId, animal.animalId));
      assert.equal(sampleAfter!.trackingCode, sampleBefore!.trackingCode);

      // And the private file is readable again, by its owner, with its bytes.
      const [fileRow] = await ctx.testDb.db.select().from(storedFiles).where(eq(storedFiles.id, file.id));
      assert.equal(fileRow!.storageKey, file.storageKey);
      const read = await readPrivateFile(ctx.testDb.db, ctx.root, ctx.first.actor, file.id);
      assert.equal(read.bytes.length, JPEG.length);
      assert.deepEqual([...read.bytes], [...JPEG]);
    } finally {
      await fs.rm(backupRoot, { recursive: true, force: true });
    }
  });
});

test('a snapshot that does not match its manifest is refused, not half applied', async () => {
  const testDb = await createTestDb();
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-storage-'));
  const backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-backup-'));
  try {
    await seedBaseline(testDb.db);
    await fs.mkdir(path.join(storage, 'kyc_national_id', '2026'), { recursive: true });
    await fs.writeFile(path.join(storage, 'kyc_national_id', '2026', 'a.jpg'), Buffer.from(JPEG));

    const { snapshot } = await runBackup({
      url: testDb.url,
      storage,
      out: backupRoot,
      containerName: 'hamzist-db',
    });

    // Tamper with the dump after the fact.
    const dumpPath = path.join(snapshot, 'database.sql');
    await fs.appendFile(dumpPath, '\n-- tampered\n', 'utf8');
    await assert.rejects(
      () => runRestore({ from: snapshot, url: testDb.url, storage, containerName: 'hamzist-db' }),
      /manifest digest/,
      'a dump that does not match its manifest is never applied',
    );

    // And a tampered private file is refused for the same reason.
    await fs.copyFile(path.join(snapshot, 'database.sql'), dumpPath + '.bak');
    await fs.truncate(dumpPath, (await fs.stat(dumpPath)).size - '\n-- tampered\n'.length);
    await fs.writeFile(path.join(snapshot, 'files', 'kyc_national_id', '2026', 'a.jpg'), 'not the same bytes');
    await assert.rejects(
      () => runRestore({ from: snapshot, url: testDb.url, storage, containerName: 'hamzist-db' }),
      /manifest digest/,
    );
  } finally {
    await testDb.drop();
    await fs.rm(storage, { recursive: true, force: true });
    await fs.rm(backupRoot, { recursive: true, force: true });
    assert.ok(ADMIN_URL.length > 0);
  }
});
