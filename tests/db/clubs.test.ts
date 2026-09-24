/**
 * Clubs against a real database — Phase 2.5 PROMPT-012.
 *
 * The four things this prompt asks to be sure of: a role in one club grants
 * nothing in another, an unverified club is invisible to the public however it
 * is published, two people cannot be handed the same club by two decisions, and
 * a reported club is hidden or taken down with the decision recorded.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accounts, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { communities, communityManagers, communityOwnershipRequests } from '../../src/db/schema/communities.ts';
import { moderationReports } from '../../src/db/schema/moderation.ts';
import {
  assignClubRole,
  cancelClubOwnershipRequest,
  clubAuthorityQueue,
  clubManagement,
  clubPageBySlug,
  clubReportQueue,
  createClub,
  decideClubOwnership,
  decideClubReports,
  decideClubVerification,
  myClubs,
  publicClubs,
  removeClubRole,
  reportClub,
  requestClubOwnership,
  setClubPublication,
  setClubStanding,
  submitClubForVerification,
} from '../../src/clubs/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let association: Actor;
let moderator: Actor;
let counter = 0;

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  association = actorFor(await createTestAccount(testDb.db, '09990420001'), 'ASSOCIATION_OPERATOR');
  moderator = actorFor(await createTestAccount(testDb.db, '09990420002'), 'CONTENT_ADMIN');
});

after(async () => {
  await testDb?.drop();
});

async function person(): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999042' + String(counter + 100).padStart(4, '0')), 'USER');
}

const mobileOf = async (actor: Actor): Promise<string> => {
  const [row] = await testDb.db.select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, actor.accountId));
  return row!.mobile;
};

const reload = async (clubId: string) => {
  const [row] = await testDb.db.select().from(communities).where(eq(communities.id, clubId));
  return row!;
};

/** A club its owner wrote, the association verified and the owner published. */
async function publicClub(owner: Actor, nameFa: string) {
  const draft = await createClub(testDb.db, owner, {
    displayNameFa: nameFa,
    scope: 'BREED',
    aboutFa: 'معرفی آزمایشی ' + nameFa,
    contactPhone: '02100000' + String(counter).padStart(2, '0'),
  });
  const sent = await submitClubForVerification(testDb.db, owner, { clubId: draft.id, expectedVersion: draft.version });
  const verified = await decideClubVerification(testDb.db, association, {
    clubId: sent.id,
    expectedVersion: sent.version,
    outcome: 'VERIFY',
    reasonFa: 'مدارک و معرفی کامل است.',
  });
  return setClubPublication(testDb.db, owner, { clubId: verified.id, expectedVersion: verified.version, publish: true });
}

test('a club is created as a draft and only the association verifies it', async () => {
  const owner = await person();
  const club = await createClub(testDb.db, owner, { displayNameFa: 'کلاب پیش‌نویس', scope: 'SPORT' });
  assert.equal(club.lifecycle, 'DRAFT');
  assert.equal(club.publicStatus, 'DRAFT');
  assert.equal(club.ownerAccountId, owner.accountId);
  assert.equal(club.verifiedAt, null);

  // Half-written: no introduction and no way to reach them.
  await assert.rejects(() => submitClubForVerification(testDb.db, owner, { clubId: club.id, expectedVersion: club.version }), code('VALIDATION'));

  const filled = await testDb.db
    .update(communities)
    .set({ aboutFa: 'معرفی', contactPhone: '02112345678', version: club.version + 1 })
    .where(eq(communities.id, club.id))
    .returning();
  const sent = await submitClubForVerification(testDb.db, owner, { clubId: club.id, expectedVersion: filled[0]!.version });
  assert.equal(sent.lifecycle, 'PENDING_VERIFICATION');

  // The owner cannot verify their own club, and cannot publish it before the association did.
  await assert.rejects(
    () => decideClubVerification(testDb.db, owner, { clubId: sent.id, expectedVersion: sent.version, outcome: 'VERIFY', reasonFa: 'خودم تأیید می‌کنم.' }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => setClubPublication(testDb.db, owner, { clubId: sent.id, expectedVersion: sent.version, publish: true }),
    code('CONFLICT'),
  );
  // A decision without a reason is refused.
  await assert.rejects(
    () => decideClubVerification(testDb.db, association, { clubId: sent.id, expectedVersion: sent.version, outcome: 'VERIFY', reasonFa: '  ' }),
    code('VALIDATION'),
  );

  const corrected = await decideClubVerification(testDb.db, association, {
    clubId: sent.id,
    expectedVersion: sent.version,
    outcome: 'NEEDS_CORRECTION',
    reasonFa: 'راه ارتباطی را کامل کنید.',
  });
  assert.equal(corrected.lifecycle, 'NEEDS_CORRECTION');
  assert.equal(corrected.lifecycleReasonFa, 'راه ارتباطی را کامل کنید.');

  const again = await submitClubForVerification(testDb.db, owner, { clubId: corrected.id, expectedVersion: corrected.version });
  const verified = await decideClubVerification(testDb.db, association, {
    clubId: again.id,
    expectedVersion: again.version,
    outcome: 'VERIFY',
    reasonFa: 'اصلاح انجام شد.',
  });
  assert.equal(verified.lifecycle, 'ACTIVE');
  assert.ok(verified.verifiedAt);
  assert.equal(verified.verifiedByAccountId, association.accountId);

  const events = await testDb.db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetType, 'COMMUNITY'), eq(auditEvents.targetId, club.id)));
  assert.equal(events.filter((row) => row.action === 'CLUB_LIFECYCLE_CHANGED').length, 4);
  const told = await testDb.db.select().from(notifications).where(eq(notifications.entityId, club.id));
  assert.equal(told.filter((row) => row.kind === 'CLUB_VERIFICATION_DECIDED').length, 2);
});

test('an unverified club has no public page, however it is published', async () => {
  const owner = await person();
  const club = await createClub(testDb.db, owner, {
    displayNameFa: 'کلاب نامرئی',
    scope: 'CITY',
    aboutFa: 'معرفی کلاب نامرئی',
    contactPhone: '02133333333',
  });
  // Publication is forced straight onto the record, the way an older row could look.
  const [forced] = await testDb.db
    .update(communities)
    .set({ publicStatus: 'PUBLISHED', publicSlug: 'club-aaaaaaaaaa', publicPublishedAt: new Date() })
    .where(eq(communities.id, club.id))
    .returning();
  assert.equal(forced!.lifecycle, 'DRAFT');

  assert.equal(await clubPageBySlug(testDb.db, 'club-aaaaaaaaaa'), null);
  const listed = await publicClubs(testDb.db, { page: 1 });
  assert.equal(
    listed.items.some((item) => item.nameFa === 'کلاب نامرئی'),
    false,
  );

  const live = await publicClub(await person(), 'کلاب دیدنی');
  const page = await clubPageBySlug(testDb.db, live.publicSlug!);
  assert.equal(page?.nameFa, 'کلاب دیدنی');
  assert.equal(page?.kind, 'CLUB');

  // Suspension takes the page down again and does not need the owner's consent.
  const suspended = await setClubStanding(testDb.db, association, {
    clubId: live.id,
    expectedVersion: live.version,
    to: 'SUSPENDED',
    reasonFa: 'گزارش‌های تأییدشده درباره رفتار کلاب.',
  });
  assert.equal(suspended.lifecycle, 'SUSPENDED');
  assert.equal(suspended.publicStatus, 'DRAFT');
  assert.equal(await clubPageBySlug(testDb.db, live.publicSlug!), null);

  const back = await setClubStanding(testDb.db, association, {
    clubId: suspended.id,
    expectedVersion: suspended.version,
    to: 'ACTIVE',
    reasonFa: 'تعلیق برداشته شد.',
  });
  // Reinstating does not republish by itself: that stays the club's own decision.
  assert.equal(back.publicStatus, 'DRAFT');
  assert.equal(await clubPageBySlug(testDb.db, live.publicSlug!), null);
  const republished = await setClubPublication(testDb.db, await ownerOf(back.id), {
    clubId: back.id,
    expectedVersion: back.version,
    publish: true,
  });
  assert.equal(republished.publicStatus, 'PUBLISHED');
  assert.ok(await clubPageBySlug(testDb.db, live.publicSlug!));
});

async function ownerOf(clubId: string): Promise<Actor> {
  const club = await reload(clubId);
  return { accountId: club.ownerAccountId!, context: 'USER', activeRoles: [] };
}

test('a role in one club grants nothing in another', async () => {
  const first = await person();
  const second = await person();
  const outsider = await person();
  const clubA = await publicClub(first, 'کلاب الف');
  const clubB = await publicClub(second, 'کلاب ب');

  const adminOfA = await person();
  await assignClubRole(testDb.db, first, { clubId: clubA.id, mobile: await mobileOf(adminOfA), role: 'ADMIN' });

  // Inside club A the admin may act.
  const viewA = await clubManagement(testDb.db, adminOfA, clubA.id);
  assert.equal(viewA?.role, 'ADMIN');
  assert.deepEqual(viewA?.assignableRoles, ['MODERATOR', 'MEMBER']);

  // Inside club B the very same account is nobody.
  assert.equal(await clubManagement(testDb.db, adminOfA, clubB.id), null);
  await assert.rejects(
    async () => assignClubRole(testDb.db, adminOfA, { clubId: clubB.id, mobile: await mobileOf(outsider), role: 'MEMBER' }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => setClubPublication(testDb.db, adminOfA, { clubId: clubB.id, expectedVersion: clubB.version, publish: false }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => submitClubForVerification(testDb.db, adminOfA, { clubId: clubB.id, expectedVersion: clubB.version }),
    code('FORBIDDEN'),
  );

  // And the owner of A is nobody in B either.
  assert.equal(await clubManagement(testDb.db, first, clubB.id), null);
  const mine = await myClubs(testDb.db, adminOfA);
  assert.deepEqual(
    mine.map((row) => row.club.id),
    [clubA.id],
  );

  // An admin may hand out the rungs below, never their own or above.
  const helper = await person();
  const moderatorRow = await assignClubRole(testDb.db, adminOfA, { clubId: clubA.id, mobile: await mobileOf(helper), role: 'MODERATOR' });
  assert.equal(moderatorRow.role, 'MODERATOR');
  assert.equal(moderatorRow.status, 'ACCEPTED');
  await assert.rejects(
    async () => assignClubRole(testDb.db, adminOfA, { clubId: clubA.id, mobile: await mobileOf(outsider), role: 'ADMIN' }),
    code('FORBIDDEN'),
  );
  // A moderator holds no power over members at all.
  await assert.rejects(
    async () => assignClubRole(testDb.db, helper, { clubId: clubA.id, mobile: await mobileOf(outsider), role: 'MEMBER' }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => removeClubRole(testDb.db, helper, { membershipId: moderatorRow.id, expectedVersion: moderatorRow.version }),
    code('FORBIDDEN'),
  );

  const removed = await removeClubRole(testDb.db, first, { membershipId: moderatorRow.id, expectedVersion: moderatorRow.version, reasonFa: 'پایان همکاری' });
  assert.equal(removed.status, 'REMOVED');
  assert.equal(await clubManagement(testDb.db, helper, clubA.id), null);
  // The row is kept, not deleted: the history of who was here survives.
  const kept = await testDb.db.select().from(communityManagers).where(eq(communityManagers.id, moderatorRow.id));
  assert.equal(kept.length, 1);
});

test('two people cannot be handed the same club, and a stale transfer is refused', async () => {
  const owner = await person();
  const heir = await person();
  const other = await person();
  const club = await publicClub(owner, 'کلاب واگذاری');

  const transfer = await requestClubOwnership(testDb.db, owner, { clubId: club.id, kind: 'TRANSFER', targetMobile: await mobileOf(heir), reasonFa: 'واگذاری به همکار' });
  assert.equal(transfer.status, 'PENDING');
  assert.equal(transfer.targetAccountId, heir.accountId);

  // One open request per club: the second one is a conflict, not a second owner.
  await assert.rejects(
    async () => requestClubOwnership(testDb.db, owner, { clubId: club.id, kind: 'TRANSFER', targetMobile: await mobileOf(other) }),
    code('CONFLICT'),
  );
  // A claim on a club that has an owner is refused outright.
  await assert.rejects(() => requestClubOwnership(testDb.db, other, { clubId: club.id, kind: 'CLAIM' }), code('CONFLICT'));
  // Only the owner starts a transfer.
  await assert.rejects(
    async () => requestClubOwnership(testDb.db, other, { clubId: club.id, kind: 'TRANSFER', targetMobile: await mobileOf(other) }),
    code('FORBIDDEN'),
  );
  // And the decision is the association's, never the club's.
  await assert.rejects(
    () => decideClubOwnership(testDb.db, owner, { requestId: transfer.id, expectedVersion: transfer.version, approve: true, reasonFa: 'خودم' }),
    code('FORBIDDEN'),
  );

  const decided = await decideClubOwnership(testDb.db, association, {
    requestId: transfer.id,
    expectedVersion: transfer.version,
    approve: true,
    reasonFa: 'واگذاری با توافق دو طرف.',
  });
  assert.equal(decided.request.status, 'APPROVED');
  assert.equal(decided.club.ownerAccountId, heir.accountId);
  // The previous owner keeps a way in rather than losing the club silently.
  const previous = await clubManagement(testDb.db, owner, club.id);
  assert.equal(previous?.role, 'ADMIN');
  const now = await clubManagement(testDb.db, heir, club.id);
  assert.equal(now?.role, 'OWNER');

  // Deciding the same request twice changes nothing.
  await assert.rejects(
    () => decideClubOwnership(testDb.db, association, { requestId: transfer.id, expectedVersion: decided.request.version, approve: true, reasonFa: 'دوباره' }),
    code('CONFLICT'),
  );

  // A transfer whose requester is no longer the owner cannot be approved.
  const stale = await requestClubOwnership(testDb.db, heir, { clubId: club.id, kind: 'TRANSFER', targetMobile: await mobileOf(other) });
  await testDb.db.update(communities).set({ ownerAccountId: other.accountId }).where(eq(communities.id, club.id));
  await assert.rejects(
    () => decideClubOwnership(testDb.db, association, { requestId: stale.id, expectedVersion: stale.version, approve: true, reasonFa: 'واگذاری کهنه' }),
    code('CONFLICT'),
  );
  // Rejecting it is still possible, and closes the club for a fresh request.
  const rejected = await decideClubOwnership(testDb.db, association, {
    requestId: stale.id,
    expectedVersion: stale.version,
    approve: false,
    reasonFa: 'مالک کلاب در این فاصله عوض شده است.',
  });
  assert.equal(rejected.request.status, 'REJECTED');
  assert.equal((await reload(club.id)).ownerAccountId, other.accountId);

  const open = await testDb.db
    .select()
    .from(communityOwnershipRequests)
    .where(and(eq(communityOwnershipRequests.communityId, club.id), eq(communityOwnershipRequests.status, 'PENDING')));
  assert.equal(open.length, 0);
});

test('an unowned club is claimed, and the claimant may take the request back', async () => {
  const claimant = await person();
  const [unowned] = await testDb.db
    .insert(communities)
    .values({ kind: 'CLUB', displayNameFa: 'کلاب بی‌صاحب', scope: 'OTHER', lifecycle: 'DRAFT' })
    .returning();

  const claim = await requestClubOwnership(testDb.db, claimant, { clubId: unowned!.id, kind: 'CLAIM', reasonFa: 'اداره این کلاب با من بوده است.' });
  assert.equal(claim.kind, 'CLAIM');
  assert.equal(claim.targetAccountId, claimant.accountId);

  // Somebody else's request is not theirs to withdraw.
  await assert.rejects(
    async () => cancelClubOwnershipRequest(testDb.db, await person(), { requestId: claim.id, expectedVersion: claim.version }),
    code('NOT_FOUND'),
  );
  const cancelled = await cancelClubOwnershipRequest(testDb.db, claimant, { requestId: claim.id, expectedVersion: claim.version });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal((await reload(unowned!.id)).ownerAccountId, null);

  const again = await requestClubOwnership(testDb.db, claimant, { clubId: unowned!.id, kind: 'CLAIM' });
  const queue = await clubAuthorityQueue(testDb.db, association);
  assert.ok(queue.requests.some((row) => row.request.id === again.id));
  const approved = await decideClubOwnership(testDb.db, association, {
    requestId: again.id,
    expectedVersion: again.version,
    approve: true,
    reasonFa: 'مدارک ارائه‌شده کافی است.',
  });
  assert.equal(approved.club.ownerAccountId, claimant.accountId);
  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, claimant.accountId), eq(notifications.kind, 'CLUB_OWNERSHIP_APPROVED')));
  assert.equal(told.length, 1);
});

test('a reported club is hidden or taken down, with the decision recorded and nothing deleted', async () => {
  const owner = await person();
  const reporter = await person();
  const club = await publicClub(owner, 'کلاب گزارش‌شده');

  // The club's own owner has the management shell for that, not the report form.
  await assert.rejects(() => reportClub(testDb.db, owner, { clubId: club.id, reason: 'SPAM', details: null }), code('VALIDATION'));

  const report = await reportClub(testDb.db, reporter, { clubId: club.id, reason: 'SPAM', details: 'تبلیغ انبوه در صفحه کلاب.' });
  assert.ok(report.id);
  // One open report per person per club.
  await assert.rejects(() => reportClub(testDb.db, reporter, { clubId: club.id, reason: 'SPAM', details: null }), code('CONFLICT'));
  const second = await person();
  await reportClub(testDb.db, second, { clubId: club.id, reason: 'OFFENSIVE', details: null });

  // The queue belongs to the moderator, not to the association operator or the club.
  await assert.rejects(() => clubReportQueue(testDb.db, owner), code('FORBIDDEN'));
  const queue = await clubReportQueue(testDb.db, moderator);
  const group = queue.find((row) => row.club.id === club.id);
  assert.equal(group?.openReports, 2);
  assert.deepEqual([...group!.reasons].sort(), ['OFFENSIVE', 'SPAM']);

  const hidden = await decideClubReports(testDb.db, moderator, { clubId: club.id, decision: 'HIDE', reasonFa: 'تبلیغ انبوه تأیید شد.' });
  assert.equal(hidden.decided, 2);
  assert.equal(hidden.club.publicStatus, 'HIDDEN');
  assert.equal(hidden.club.hiddenByReview, true);
  assert.equal(hidden.club.lifecycle, 'ACTIVE');
  assert.equal(await clubPageBySlug(testDb.db, club.publicSlug!), null);
  // A club hidden by moderation is not republished by its own owner.
  await assert.rejects(
    () => setClubPublication(testDb.db, owner, { clubId: club.id, expectedVersion: hidden.club.version, publish: true }),
    code('CONFLICT'),
  );

  const decided = await testDb.db.select().from(moderationReports).where(eq(moderationReports.communityId, club.id));
  assert.equal(decided.length, 2);
  for (const row of decided) {
    assert.equal(row.status, 'ACTIONED');
    assert.equal(row.decision, 'HIDE');
    assert.equal(row.decidedByAccountId, moderator.accountId);
    assert.equal(row.decisionReason, 'تبلیغ انبوه تأیید شد.');
    assert.equal(row.targetKind, 'CLUB');
    assert.equal(row.contentId, null);
  }
  // Nothing is left open, so a second decision has nothing to decide.
  await assert.rejects(
    () => decideClubReports(testDb.db, moderator, { clubId: club.id, decision: 'DISMISS', reasonFa: 'دوباره' }),
    code('CONFLICT'),
  );

  // A further report leads to the club leaving public life altogether.
  const third = await person();
  await testDb.db
    .update(communities)
    .set({ publicStatus: 'PUBLISHED', hiddenByReview: false })
    .where(eq(communities.id, club.id));
  await reportClub(testDb.db, third, { clubId: club.id, reason: 'OFFENSIVE', details: null });
  const removed = await decideClubReports(testDb.db, moderator, { clubId: club.id, decision: 'SOFT_DELETE', reasonFa: 'تکرار تخلف.' });
  assert.equal(removed.club.lifecycle, 'SUSPENDED');
  assert.equal(removed.club.publicStatus, 'HIDDEN');
  // The club record itself is still there, with its history.
  assert.equal((await reload(club.id)).displayNameFa, 'کلاب گزارش‌شده');
  const moderationEvents = await testDb.db
    .select({ action: auditEvents.action, reason: auditEvents.reason })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, club.id), eq(auditEvents.action, 'CLUB_REPORTS_DECIDED')));
  assert.equal(moderationEvents.length, 2);
  assert.equal(moderationEvents.some((row) => row.reason === 'تکرار تخلف.'), true);
  const owners = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, owner.accountId), eq(notifications.kind, 'CLUB_MODERATED')));
  assert.equal(owners.length, 2);
});

test('a report about a club never looks like a report about content', async () => {
  // The database itself refuses a club report that names no club, and a content
  // report that names one, so a mislabelled row cannot reach either queue.
  const reporter = await person();
  await assert.rejects(() =>
    testDb.db.execute(
      sql`insert into moderation_report (target_kind, reporter_account_id, reason) values ('CLUB', ${reporter.accountId}, 'SPAM')`,
    ),
  );
  const club = await publicClub(await person(), 'کلاب سالم');
  await assert.rejects(() =>
    testDb.db.execute(
      sql`insert into moderation_report (target_kind, community_id, reporter_account_id, reason) values ('CONTENT', ${club.id}, ${reporter.accountId}, 'SPAM')`,
    ),
  );
});
