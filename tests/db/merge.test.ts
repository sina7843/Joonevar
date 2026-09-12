/**
 * Merging duplicate records — Phase 2 PROMPT-016.
 *
 * Runs against a freshly migrated database. What §21 asks for is checked
 * directly: the duplicate keeps its row and its address, the lists stop showing
 * it, the address points at the primary, the change is auditable, and a
 * redirect never grows a second hop.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { communities } from '../../src/db/schema/communities.ts';
import {
  changeCommunityStatus,
  communityPageBySlug,
  createCommunity,
  publishedCommunities,
  updateCommunityProfile,
  type CommunityRow,
} from '../../src/communities/service.ts';
import { mergeCandidates, mergeRecord, mergedRecords } from '../../src/admin/merge.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let user: Actor;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990700001'), 'SUPERADMIN');
  user = actorFor(await createTestAccount(testDb.db, '09990700002'));
});

after(async () => {
  await testDb?.drop();
});

async function publishedClub(nameFa: string): Promise<CommunityRow> {
  counter += 1;
  const created = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: nameFa + ' ' + counter,
    reason: 'ثبت برای آزمون ادغام',
  });
  const filled = await updateCommunityProfile(testDb.db, admin, {
    communityId: created.id,
    expectedVersion: created.version,
    displayNameFa: created.displayNameFa,
    aboutFa: 'کلاب آزمایشی ادغام.',
    scope: 'OTHER',
    provinceCode: null,
    cityId: null,
    membershipInfoFa: null,
    membershipUrl: null,
    contactPhone: '02100000000',
    websiteUrl: null,
    speciesCodes: [],
    breedIds: [],
    reason: 'تکمیل پرونده',
  });
  return changeCommunityStatus(testDb.db, admin, {
    communityId: filled.id,
    expectedVersion: filled.version,
    to: 'PUBLISHED',
    reason: 'انتشار برای آزمون',
  });
}

test('a merged record leaves the lists, keeps its address and points at the primary', async () => {
  const duplicate = await publishedClub('کلاب تکراری');
  const primary = await publishedClub('کلاب اصلی');

  const before = await publishedCommunities(testDb.db, { page: 1 });
  assert.equal(before.items.filter((row) => row.slug === duplicate.publicSlug).length, 1);

  const merged = await mergeRecord(testDb.db, admin, {
    kind: 'COMMUNITY',
    duplicateId: duplicate.id,
    primaryId: primary.id,
    expectedVersion: duplicate.version,
    reason: 'هر دو یک کلاب‌اند',
  });
  assert.equal(merged.mergedIntoId, primary.id);

  // Gone from every list…
  const after = await publishedCommunities(testDb.db, { page: 1 });
  assert.equal(after.items.some((row) => row.slug === duplicate.publicSlug), false);
  assert.equal(after.items.some((row) => row.slug === primary.publicSlug), true);

  // …but its own address still answers, and says where to go (§21 redirect).
  const page = await communityPageBySlug(testDb.db, duplicate.publicSlug!);
  assert.ok(page, 'the duplicate keeps its public address');
  assert.equal(page!.primary?.slug, primary.publicSlug);
  assert.equal(page!.primary?.nameFa, primary.displayNameFa);
  // The primary itself carries no notice.
  assert.equal((await communityPageBySlug(testDb.db, primary.publicSlug!))!.primary, null);

  // The row is still there, with its history.
  const [row] = await testDb.db.select().from(communities).where(eq(communities.id, duplicate.id));
  assert.ok(row, 'the duplicate row is not deleted');
  assert.equal(row!.displayNameFa, duplicate.displayNameFa);

  const [audit] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, duplicate.id), eq(auditEvents.action, 'COMMUNITY_MERGED')));
  assert.equal(audit!.reason, 'هر دو یک کلاب‌اند');
  assert.equal((audit!.before as Record<string, unknown>).mergedIntoId, null);
  assert.equal((audit!.after as Record<string, unknown>).mergedIntoId, primary.id);
});

test('a redirect never grows a second hop, and a stale version is refused', async () => {
  const first = await publishedClub('کلاب زنجیره یک');
  const second = await publishedClub('کلاب زنجیره دو');
  const third = await publishedClub('کلاب زنجیره سه');

  await mergeRecord(testDb.db, admin, {
    kind: 'COMMUNITY',
    duplicateId: first.id,
    primaryId: second.id,
    expectedVersion: first.version,
    reason: 'ادغام اول',
  });

  // Already a duplicate: it cannot be merged again.
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'COMMUNITY',
      duplicateId: first.id,
      primaryId: third.id,
      expectedVersion: first.version + 1,
      reason: 'دوباره',
    }),
    /پیش‌تر/,
  );
  // Something points at `second`, so `second` cannot itself become a duplicate.
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'COMMUNITY',
      duplicateId: second.id,
      primaryId: third.id,
      expectedVersion: second.version,
      reason: 'زنجیره',
    }),
    /رکورد دیگری/,
  );
  // A record cannot be its own duplicate, and a stale version is refused.
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'COMMUNITY',
      duplicateId: third.id,
      primaryId: third.id,
      expectedVersion: third.version,
      reason: 'خودش',
    }),
    /خودش/,
  );
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'COMMUNITY',
      duplicateId: third.id,
      primaryId: second.id,
      expectedVersion: third.version + 5,
      reason: 'نسخه کهنه',
    }),
    /هم‌زمان تغییر/,
  );
});

test('only the superadmin merges, and only with a reason', async () => {
  const duplicate = await publishedClub('کلاب اجازه');
  const primary = await publishedClub('کلاب مرجع');

  await assert.rejects(
    mergeRecord(testDb.db, user, {
      kind: 'COMMUNITY',
      duplicateId: duplicate.id,
      primaryId: primary.id,
      expectedVersion: duplicate.version,
      reason: 'بدون اجازه',
    }),
    /سوپرادمین/,
  );
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'COMMUNITY',
      duplicateId: duplicate.id,
      primaryId: primary.id,
      expectedVersion: duplicate.version,
      reason: '   ',
    }),
    /دلیل ادغام/,
  );
  await assert.rejects(
    mergeRecord(testDb.db, admin, {
      kind: 'NOT_A_KIND',
      duplicateId: duplicate.id,
      primaryId: primary.id,
      expectedVersion: duplicate.version,
      reason: 'نوع نادرست',
    }),
    /نوع رکورد/,
  );
  assert.equal((await mergeCandidates(testDb.db, admin, 'COMMUNITY')).some((row) => row.id === duplicate.id), true);
  await assert.rejects(mergeCandidates(testDb.db, user, 'COMMUNITY'), /سوپرادمین/);
});

test('the panel lists what was merged and where it points', async () => {
  const merged = await mergedRecords(testDb.db, admin, 'COMMUNITY');
  assert.ok(merged.length >= 1);
  assert.equal(merged.every((row) => row.mergedIntoId !== null), true);
  assert.equal(merged.every((row) => row.primary !== null), true);
  // A merged record is never offered as a choice for the next merge.
  const candidates = await mergeCandidates(testDb.db, admin, 'COMMUNITY');
  assert.equal(candidates.some((row) => merged.some((m) => m.id === row.id)), false);
});
