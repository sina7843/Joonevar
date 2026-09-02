import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestAccount, createTestDb } from '../helpers/db.ts';
import { deletePrivateFile, findFile, putPrivateFile, readPrivateFile, resolveWithinRoot } from '../../src/files/storage.ts';
import { detectMime, MB } from '../../src/files/signature.ts';
import { auditTrail } from '../../src/audit/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

const actor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: [],
});

async function withStorage(fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-files-'));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('file type is decided by content, not by the declared name or type', () => {
  assert.equal(detectMime(JPEG), 'image/jpeg');
  assert.equal(detectMime(PNG), 'image/png');
  assert.equal(detectMime(PDF), 'application/pdf');
  assert.equal(detectMime(HTML), null);
});

test('KYC accepts JPG, PNG and PDF and rejects anything else', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001001');
      const owner = actor(ownerId);

      for (const bytes of [JPEG, PNG, PDF]) {
        const stored = await putPrivateFile(testDb.db, root, owner, {
          ownerAccountId: ownerId,
          purpose: 'KYC_NATIONAL_ID',
          bytes,
        });
        assert.ok(stored.id);
      }

      await assert.rejects(
        () =>
          putPrivateFile(testDb.db, root, owner, {
            ownerAccountId: ownerId,
            purpose: 'KYC_NATIONAL_ID',
            bytes: HTML,
          }),
        /نوع فایل پذیرفته نمی‌شود/,
      );

      // A file renamed to look like a JPEG is still rejected on its bytes.
      await assert.rejects(
        () =>
          putPrivateFile(testDb.db, root, owner, {
            ownerAccountId: ownerId,
            purpose: 'KYC_NATIONAL_ID',
            bytes: HTML,
            originalName: 'national-id.jpg',
          }),
        /نوع فایل پذیرفته نمی‌شود/,
      );
    } finally {
      await testDb.drop();
    }
  });
});

test('the 10 MB ceiling is enforced and an empty file is refused', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001002');
      const owner = actor(ownerId);
      const tooBig = new Uint8Array(10 * MB + 1);
      tooBig.set(JPEG, 0);
      await assert.rejects(
        () => putPrivateFile(testDb.db, root, owner, { ownerAccountId: ownerId, purpose: 'KYC_NATIONAL_ID', bytes: tooBig }),
        /حجم فایل بیش از حد مجاز است/,
      );
      await assert.rejects(
        () =>
          putPrivateFile(testDb.db, root, owner, {
            ownerAccountId: ownerId,
            purpose: 'KYC_NATIONAL_ID',
            bytes: new Uint8Array(0),
          }),
        /فایل خالی است/,
      );
    } finally {
      await testDb.drop();
    }
  });
});

test('a private file is readable by its owner and by the reviewing context only', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001003');
      const strangerId = await createTestAccount(testDb.db, '09990001004');

      const stored = await putPrivateFile(testDb.db, root, actor(ownerId), {
        ownerAccountId: ownerId,
        purpose: 'KYC_NATIONAL_ID',
        bytes: JPEG,
        originalName: 'card.jpg',
      });

      const mine = await readPrivateFile(testDb.db, root, actor(ownerId), stored.id);
      assert.deepEqual(new Uint8Array(mine.bytes), JPEG);

      // Another ordinary user cannot read it.
      await assert.rejects(
        () => readPrivateFile(testDb.db, root, actor(strangerId), stored.id),
        /Not permitted to read this private file/,
      );
      // A vet has no business in someone's identity document.
      await assert.rejects(
        () => readPrivateFile(testDb.db, root, actor(strangerId, 'TRUSTED_VET'), stored.id),
        /Not permitted/,
      );
      // The genetics centre reviews receipts, not identity documents.
      await assert.rejects(
        () => readPrivateFile(testDb.db, root, actor(strangerId, 'GENETICS_OPERATOR'), stored.id),
        /Not permitted/,
      );
      // Holding a shell is not the same as holding every permission (§21.4).
      await assert.rejects(
        () => readPrivateFile(testDb.db, root, actor(strangerId, 'SUPERADMIN'), stored.id),
        /Not permitted/,
      );

      // The association operator is the actual reviewer of KYC.
      const review = await readPrivateFile(testDb.db, root, actor(strangerId, 'ASSOCIATION_OPERATOR'), stored.id);
      assert.equal(review.record.id, stored.id);
    } finally {
      await testDb.drop();
    }
  });
});

test('a genetics receipt is visible to the centre but not to the association', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001005');
      const operatorId = await createTestAccount(testDb.db, '09990001006');
      const stored = await putPrivateFile(testDb.db, root, actor(ownerId), {
        ownerAccountId: ownerId,
        purpose: 'GENETICS_RECEIPT',
        bytes: PDF,
      });
      const centre = await readPrivateFile(testDb.db, root, actor(operatorId, 'GENETICS_OPERATOR'), stored.id);
      assert.equal(centre.record.mime, 'application/pdf');
      await assert.rejects(
        () => readPrivateFile(testDb.db, root, actor(operatorId, 'ASSOCIATION_OPERATOR'), stored.id),
        /Not permitted/,
      );
    } finally {
      await testDb.drop();
    }
  });
});

test('storage keys are server-generated and cannot escape the root', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001007');
      const stored = await putPrivateFile(testDb.db, root, actor(ownerId), {
        ownerAccountId: ownerId,
        purpose: 'KYC_NATIONAL_ID',
        bytes: JPEG,
        originalName: '../../../etc/passwd',
      });

      // The client name is kept for display only; it never becomes a path.
      assert.equal(stored.originalName, '../../../etc/passwd');
      assert.match(stored.storageKey, /^kyc_national_id\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
      const absolute = resolveWithinRoot(root, stored.storageKey);
      assert.ok(absolute.startsWith(path.resolve(root)));

      assert.throws(() => resolveWithinRoot(root, '../outside.jpg'), /Unsafe storage key/);
      assert.throws(() => resolveWithinRoot(root, '/etc/passwd'), /Unsafe storage key/);
    } finally {
      await testDb.drop();
    }
  });
});

test('storing and deleting a private file is audited without leaking its content', async () => {
  const testDb = await createTestDb();
  await withStorage(async (root) => {
    try {
      const ownerId = await createTestAccount(testDb.db, '09990001008');
      const owner = actor(ownerId);
      const stored = await putPrivateFile(testDb.db, root, owner, {
        ownerAccountId: ownerId,
        purpose: 'KYC_NATIONAL_ID',
        bytes: JPEG,
      });

      await deletePrivateFile(testDb.db, root, owner, stored.id);
      await assert.rejects(() => findFile(testDb.db, stored.id), /File not found/);
      await assert.rejects(() => fs.stat(resolveWithinRoot(root, stored.storageKey)));

      const trail = await auditTrail(testDb.db, { targetType: 'STORED_FILE', targetId: stored.id }, {
        page: 1,
        pageSize: 10,
      });
      assert.equal(trail.total, 2);
      const serialized = JSON.stringify(trail.items);
      assert.ok(!serialized.includes('\\u00ff'), 'file bytes must never reach the audit log');
      assert.ok(serialized.includes('KYC_NATIONAL_ID'));
    } finally {
      await testDb.drop();
    }
  });
});
