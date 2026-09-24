/**
 * Joining a club against a real database — Phase 2.5 PROMPT-013.
 *
 * What this suite is for: that the rules are judged against the authoritative
 * facts and nothing else, that a club cannot see an applicant's facts or touch
 * another club's rules and members, that a rule change does not silently re-judge
 * the people already admitted, and that the fee is a server-verified payment
 * priced by the club's own published version.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accounts, auditEvents, notifications, referenceBreeds } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { memberships } from '../../src/db/schema/billing.ts';
import { clubMemberships, clubReevaluations, clubRuleVersions } from '../../src/db/schema/communities.ts';
import { paymentItems } from '../../src/db/schema/billing.ts';
import { assignClubRole, createClub, decideClubVerification, setClubPublication, submitClubForVerification } from '../../src/clubs/service.ts';
import {
  applyToClub,
  clubApplicantFacts,
  clubJoinView,
  clubMemberQueue,
  clubRuleWorkbench,
  decideClubMembership,
  enforceClubMembership,
  leaveClub,
  previewClubRules,
  publishClubRules,
  reevaluateClubMembers,
  saveClubRuleDraft,
  setClubMembershipStanding,
  startClubFeePayment,
} from '../../src/clubs/enrollment.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import type { ClubRuleNode } from '../../src/clubs/rules-model.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

let testDb: TestDb;
let association: Actor;
let counter = 0;
let breedId = '';

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

const all = (...children: ClubRuleNode[]): ClubRuleNode => ({ type: 'GROUP', op: 'ALL', children });
const any = (...children: ClubRuleNode[]): ClubRuleNode => ({ type: 'GROUP', op: 'ANY', children });
const rule = (kind: string, params?: Record<string, unknown>): ClubRuleNode => ({ type: 'RULE', kind: kind as never, params });

const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify() {
    return { paid: true, amountRial, providerRef: 'p-club' };
  },
});

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  association = actorFor(await createTestAccount(testDb.db, '09990430001'), 'ASSOCIATION_OPERATOR');
  const [breed] = await testDb.db.select({ id: referenceBreeds.id }).from(referenceBreeds).limit(1);
  breedId = breed!.id;
});

after(async () => {
  await testDb?.drop();
});

async function person(): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999043' + String(counter + 100).padStart(4, '0')), 'USER');
}

/** An account the product considers active, which is the floor for every rule set. */
async function activeAccount(): Promise<Actor> {
  const actor = await person();
  await testDb.db.update(accounts).set({ status: 'ACTIVE' }).where(eq(accounts.id, actor.accountId));
  return actor;
}

/** A verified, published club owned by this person. */
async function liveClub(owner: Actor, nameFa: string) {
  const draft = await createClub(testDb.db, owner, {
    displayNameFa: nameFa,
    scope: 'BREED',
    aboutFa: 'معرفی ' + nameFa,
    contactPhone: '0210000' + String(counter).padStart(4, '0'),
  });
  const sent = await submitClubForVerification(testDb.db, owner, { clubId: draft.id, expectedVersion: draft.version });
  const verified = await decideClubVerification(testDb.db, association, {
    clubId: sent.id,
    expectedVersion: sent.version,
    outcome: 'VERIFY',
    reasonFa: 'کامل است.',
  });
  return setClubPublication(testDb.db, owner, { clubId: verified.id, expectedVersion: verified.version, publish: true });
}

/** Publish a rule set for a club in one step. */
async function publishRules(
  owner: Actor,
  clubId: string,
  input: { tree: ClubRuleNode; termsFa?: string; termsVersion?: string; feeToman?: string; membershipDays?: number },
) {
  const draft = await saveClubRuleDraft(testDb.db, owner, { clubId, ...input });
  return publishClubRules(testDb.db, owner, { clubId, ruleVersionId: draft.id, expectedVersion: draft.version });
}

const giveDog = async (actor: Actor, breed: string | null = null) => {
  await testDb.db.insert(animals).values({
    ownerAccountId: actor.accountId,
    status: 'REGISTERED',
    species: 'DOG',
    breedId: breed,
    name: 'سگ آزمایشی',
    sex: 'MALE',
  });
};

const giveMembership = async (actor: Actor) => {
  await testDb.db
    .insert(memberships)
    .values({ accountId: actor.accountId, status: 'ACTIVE', lifetime: true })
    .onConflictDoUpdate({ target: memberships.accountId, set: { status: 'ACTIVE', lifetime: true } });
};

const membershipRow = async (clubId: string, accountId: string) => {
  const [row] = await testDb.db
    .select()
    .from(clubMemberships)
    .where(and(eq(clubMemberships.communityId, clubId), eq(clubMemberships.accountId, accountId)));
  return row!;
};

test('the facts come from the authoritative records and a club never writes them', async () => {
  const applicant = await activeAccount();
  const before = await clubApplicantFacts(testDb.db, applicant.accountId);
  assert.deepEqual(
    {
      accountActive: before.accountActive,
      identityVerified: before.identityVerified,
      associationMembershipValid: before.associationMembershipValid,
      dogCount: before.dogCount,
      kennelApproved: before.kennelApproved,
      pedigreeCount: before.pedigreeCount,
      chippedDogCount: before.chippedDogCount,
      vetStatus: before.vetStatus,
    },
    {
      accountActive: true,
      identityVerified: false,
      associationMembershipValid: false,
      dogCount: 0,
      kennelApproved: false,
      pedigreeCount: 0,
      chippedDogCount: 0,
      vetStatus: 'NONE',
    },
  );

  await giveDog(applicant, breedId);
  await giveMembership(applicant);
  const after = await clubApplicantFacts(testDb.db, applicant.accountId);
  assert.equal(after.dogCount, 1);
  assert.equal(after.dogCountByBreed[breedId], 1);
  assert.equal(after.associationMembershipValid, true);

  // A suspended association membership is not a valid one, without anything being rewritten.
  await testDb.db.update(memberships).set({ status: 'SUSPENDED' }).where(eq(memberships.accountId, applicant.accountId));
  assert.equal((await clubApplicantFacts(testDb.db, applicant.accountId)).associationMembershipValid, false);
});

test('a club writes its rules as data, previews them and publishes a numbered version', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب قانون‌دار');

  // Nothing outside the allowlist is stored, whatever it looks like.
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, owner, { clubId: club.id, tree: { type: 'EXPR', expression: 'facts.dogCount > 0' } }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, owner, { clubId: club.id, tree: all(rule('OWNS_DOG', { minCount: 999 })) }),
    code('VALIDATION'),
  );
  // A fee without the rule that charges it, and a terms rule without terms.
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, owner, { clubId: club.id, tree: all(rule('ACCOUNT_ACTIVE')), feeToman: '50000' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, owner, { clubId: club.id, tree: all(rule('TERMS_ACCEPTED')) }),
    code('VALIDATION'),
  );

  const draft = await saveClubRuleDraft(testDb.db, owner, {
    clubId: club.id,
    tree: all(rule('ACCOUNT_ACTIVE'), rule('OWNS_DOG', { minCount: 1, breedId })),
    membershipDays: 30,
    noteFa: 'نسخه نخست',
  });
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.versionNumber, 1);

  // The preview runs against made-up facts, not against anybody's record.
  const preview = await previewClubRules(testDb.db, owner, { clubId: club.id, facts: { dogCountByBreed: {} } });
  assert.equal(preview.evaluation.met, false);
  const passing = await previewClubRules(testDb.db, owner, { clubId: club.id, facts: { dogCountByBreed: { [breedId]: 1 } } });
  assert.equal(passing.evaluation.met, true);

  const published = await publishClubRules(testDb.db, owner, { clubId: club.id, ruleVersionId: draft.id, expectedVersion: draft.version });
  assert.equal(published.status, 'PUBLISHED');
  assert.ok(published.publishedAt);
  assert.equal(published.publishedByAccountId, owner.accountId);

  // A second version supersedes the first, which stays readable.
  const second = await publishRules(owner, club.id, { tree: all(rule('ACCOUNT_ACTIVE')), membershipDays: 30 });
  assert.equal(second.versionNumber, 2);
  const versions = await testDb.db.select().from(clubRuleVersions).where(eq(clubRuleVersions.communityId, club.id));
  assert.equal(versions.find((row) => row.versionNumber === 1)!.status, 'SUPERSEDED');
  const audited = await testDb.db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.targetType, 'CLUB_RULE_VERSION'));
  assert.equal(audited.filter((row) => row.action === 'CLUB_RULES_PUBLISHED').length, 2);
});

test('an applicant is told exactly which conditions they do not meet', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب شرط‌دار');
  await publishRules(owner, club.id, {
    tree: all(
      rule('ACCOUNT_ACTIVE'),
      any(rule('ASSOCIATION_MEMBERSHIP'), rule('KENNEL_APPROVED')),
      rule('OWNS_DOG', { minCount: 1, breedId }),
    ),
  });

  const applicant = await activeAccount();
  const view = await clubJoinView(testDb.db, applicant, club.id);
  assert.equal(view?.canApply, true);
  assert.equal(view?.evaluation?.met, false);
  assert.equal(view?.evaluation?.unmetFa.length, 3);

  const refused = await applyToClub(testDb.db, applicant, { clubId: club.id });
  assert.equal(refused.status, 'INELIGIBLE');
  assert.equal(refused.admittedRuleVersionId, null);
  assert.equal((refused.unmetFa as string[]).length, 3);

  // The facts change; the same rules now admit them.
  await giveMembership(applicant);
  await giveDog(applicant, breedId);
  const admitted = await applyToClub(testDb.db, applicant, { clubId: club.id });
  assert.equal(admitted.status, 'ACTIVE');
  assert.ok(admitted.admittedRuleVersionId);
  assert.equal((admitted.unmetFa as string[]).length, 0);
  assert.ok(admitted.startsAt);

  // Applying again while a membership is live is a conflict, not a second row.
  await assert.rejects(() => applyToClub(testDb.db, applicant, { clubId: club.id }), code('CONFLICT'));
});

test('a club sees whether its rules are met, never the facts behind them', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب محرمانه');
  await publishRules(owner, club.id, { tree: all(rule('ACCOUNT_ACTIVE'), rule('ASSOCIATION_MEMBERSHIP'), rule('PEDIGREE')) });
  const applicant = await activeAccount();
  await giveDog(applicant, breedId);
  await applyToClub(testDb.db, applicant, { clubId: club.id });

  const queue = await clubMemberQueue(testDb.db, owner, club.id);
  const entry = queue.find((row) => row.membership.accountId === applicant.accountId)!;
  assert.equal(entry.membership.status, 'INELIGIBLE');
  assert.equal(entry.unmetCount, 2);
  // What the club gets is a count and a status. No facts, no reasons, no numbers.
  const serialized = JSON.stringify(entry);
  for (const leak of ['pedigreeCount', 'dogCount', 'chippedDogCount', 'vetStatus', 'identityVerified', 'associationMembershipValid']) {
    assert.equal(serialized.includes(leak), false, 'the club queue leaked ' + leak);
  }
  assert.equal(serialized.includes('شجره‌نامه'), false, 'the club queue leaked the applicant’s unmet reasons');

  // The applicant's own view does explain it — to the applicant.
  const mine = await clubJoinView(testDb.db, applicant, club.id);
  assert.ok(mine!.evaluation!.unmetFa.some((reason) => reason.includes('شجره‌نامه')));

  // And nobody else may ask on their behalf.
  const stranger = await activeAccount();
  const strangerView = await clubJoinView(testDb.db, stranger, club.id);
  assert.equal(strangerView!.membership, null);
  assert.equal(strangerView!.evaluation!.unmetFa.length > 0, true);
});

test('a role in one club buys nothing in another', async () => {
  const firstOwner = await activeAccount();
  const secondOwner = await activeAccount();
  const clubA = await liveClub(firstOwner, 'کلاب الف قانون');
  const clubB = await liveClub(secondOwner, 'کلاب ب قانون');
  await publishRules(firstOwner, clubA.id, { tree: all(rule('ACCOUNT_ACTIVE')) });
  await publishRules(secondOwner, clubB.id, { tree: all(rule('ACCOUNT_ACTIVE')) });

  const adminOfA = await activeAccount();
  await assignClubRole(testDb.db, firstOwner, { clubId: clubA.id, mobile: await mobileOf(adminOfA), role: 'ADMIN' });
  assert.ok(await clubRuleWorkbench(testDb.db, adminOfA, clubA.id));

  // The same account against club B: no rules, no queue, no re-evaluation.
  await assert.rejects(() => clubRuleWorkbench(testDb.db, adminOfA, clubB.id), code('FORBIDDEN'));
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, adminOfA, { clubId: clubB.id, tree: all(rule('ACCOUNT_ACTIVE')) }),
    code('FORBIDDEN'),
  );
  await assert.rejects(() => clubMemberQueue(testDb.db, adminOfA, clubB.id), code('FORBIDDEN'));
  await assert.rejects(() => previewClubRules(testDb.db, adminOfA, { clubId: clubB.id }), code('FORBIDDEN'));
  await assert.rejects(
    () => reevaluateClubMembers(testDb.db, adminOfA, { clubId: clubB.id, reasonFa: 'تلاش برای کلاب دیگر' }),
    code('FORBIDDEN'),
  );

  // A moderator of A may see the member list but not rewrite the rules.
  const moderator = await activeAccount();
  await assignClubRole(testDb.db, firstOwner, { clubId: clubA.id, mobile: await mobileOf(moderator), role: 'MODERATOR' });
  assert.ok(await clubMemberQueue(testDb.db, moderator, clubA.id));
  await assert.rejects(
    () => saveClubRuleDraft(testDb.db, moderator, { clubId: clubA.id, tree: all(rule('ACCOUNT_ACTIVE')) }),
    code('FORBIDDEN'),
  );

  // Publishing a rule set for a club whose id belongs to somebody else is refused
  // even when the version id is the other club's own draft.
  const draftOfB = await saveClubRuleDraft(testDb.db, secondOwner, { clubId: clubB.id, tree: all(rule('ACCOUNT_ACTIVE')) });
  await assert.rejects(
    () => publishClubRules(testDb.db, firstOwner, { clubId: clubA.id, ruleVersionId: draftOfB.id, expectedVersion: draftOfB.version }),
    code('NOT_FOUND'),
  );
});

const mobileOf = async (actor: Actor): Promise<string> => {
  const [row] = await testDb.db.select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, actor.accountId));
  return row!.mobile;
};

test('manual approval is a decision with a reason, and the facts are asked again', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب تأیید دستی');
  await publishRules(owner, club.id, { tree: all(rule('ASSOCIATION_MEMBERSHIP'), rule('CLUB_APPROVAL')) });

  const applicant = await activeAccount();
  await giveMembership(applicant);
  const applied = await applyToClub(testDb.db, applicant, { clubId: club.id });
  assert.equal(applied.status, 'PENDING_REVIEW');

  // A decision without a reason, and a decision by somebody from outside the club.
  await assert.rejects(
    () => decideClubMembership(testDb.db, owner, { membershipId: applied.id, expectedVersion: applied.version, approve: true, reasonFa: ' ' }),
    code('VALIDATION'),
  );
  const outsider = await activeAccount();
  await assert.rejects(
    () => decideClubMembership(testDb.db, outsider, { membershipId: applied.id, expectedVersion: applied.version, approve: true, reasonFa: 'اجازه ندارم' }),
    code('FORBIDDEN'),
  );

  // The association membership lapses while the application waits: approving it
  // would grant a membership whose conditions do not hold.
  await testDb.db.update(memberships).set({ status: 'SUSPENDED' }).where(eq(memberships.accountId, applicant.accountId));
  await assert.rejects(
    () => decideClubMembership(testDb.db, owner, { membershipId: applied.id, expectedVersion: applied.version, approve: true, reasonFa: 'تأیید' }),
    code('CONFLICT'),
  );

  await testDb.db.update(memberships).set({ status: 'ACTIVE' }).where(eq(memberships.accountId, applicant.accountId));
  const approved = await decideClubMembership(testDb.db, owner, {
    membershipId: applied.id,
    expectedVersion: applied.version,
    approve: true,
    reasonFa: 'با معرفی یکی از اعضا.',
  });
  assert.equal(approved.status, 'ACTIVE');
  assert.equal(approved.decisionReasonFa, 'با معرفی یکی از اعضا.');
  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, applicant.accountId), eq(notifications.kind, 'CLUB_MEMBERSHIP_APPROVED')));
  assert.equal(told.length, 1);

  // Suspension and reinstatement stay the club's, with a reason each time.
  const suspended = await setClubMembershipStanding(testDb.db, owner, {
    membershipId: approved.id,
    expectedVersion: approved.version,
    to: 'SUSPENDED',
    reasonFa: 'گزارش رفتار در گروه کلاب.',
  });
  assert.equal(suspended.status, 'SUSPENDED');
  await assert.rejects(() => applyToClub(testDb.db, applicant, { clubId: club.id }), code('CONFLICT'));
  const back = await setClubMembershipStanding(testDb.db, owner, {
    membershipId: suspended.id,
    expectedVersion: suspended.version,
    to: 'ACTIVE',
    reasonFa: 'رفع شد.',
  });
  assert.equal(back.status, 'ACTIVE');

  // Leaving is the member's own, and nobody else's.
  await assert.rejects(() => leaveClub(testDb.db, outsider, { membershipId: back.id, expectedVersion: back.version }), code('NOT_FOUND'));
  const left = await leaveClub(testDb.db, applicant, { membershipId: back.id, expectedVersion: back.version });
  assert.equal(left.status, 'LEFT');
});

test('the joining fee is priced by the club’s published version and needs a verified payment', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب حق عضویت');
  const published = await publishRules(owner, club.id, {
    tree: all(rule('ACCOUNT_ACTIVE'), rule('TERMS_ACCEPTED'), rule('FEE_PAID')),
    termsFa: 'شرایط آزمایشی کلاب.',
    termsVersion: 'c1',
    feeToman: '80000',
    membershipDays: 20,
  });

  const applicant = await activeAccount();
  // The terms have to be accepted in the version that is published.
  await assert.rejects(() => applyToClub(testDb.db, applicant, { clubId: club.id, acceptTermsVersion: 'c0' }), code('VALIDATION'));
  const applied = await applyToClub(testDb.db, applicant, { clubId: club.id, acceptTermsVersion: 'c1' });
  assert.equal(applied.status, 'AWAITING_PAYMENT');
  assert.equal(applied.acceptedTermsVersion, 'c1');

  const started = await startClubFeePayment(testDb.db, applicant, { membershipId: applied.id });
  assert.equal(started.amountToman, 80_000n);
  // The price was read on the server from the club's own version, not passed in.
  const [item] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, started.batchId));
  assert.equal(item!.priceSource, 'CLUB_RULE_VERSION');
  assert.equal(item!.priceSourceId, published.id);
  assert.equal(item!.settingKey, null);
  assert.equal(item!.amountToman, '80000');

  const gateway = payingGateway(800_000n);
  const attempt = await startAttempt(testDb.db, applicant, { batchId: started.batchId, callbackUrl: 'https://example.invalid/return' }, gateway, 'test');
  const verified = await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects);
  assert.equal(verified.state, 'PAID');
  const active = await membershipRow(club.id, applicant.accountId);
  assert.equal(active.status, 'ACTIVE');
  assert.ok(active.endsAt);

  // A replayed callback finds the work done and does it once.
  const replay = await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects);
  assert.equal(replay.state, 'PAID');
  assert.equal(replay.state === 'PAID' && replay.performed, false);
  const events = await testDb.db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetType, 'CLUB_MEMBERSHIP'), eq(auditEvents.targetId, active.id)));
  assert.equal(events.filter((row) => row.action === 'CLUB_MEMBERSHIP_FEE_PAID').length, 1);

  // Expiry is applied on the next read, with no scheduler.
  await testDb.db
    .update(clubMemberships)
    .set({ endsAt: new Date(Date.now() - 60_000) })
    .where(eq(clubMemberships.id, active.id));
  await enforceClubMembership(testDb.db, active.id);
  assert.equal((await membershipRow(club.id, applicant.accountId)).status, 'EXPIRED');
});

test('a fee payment grants nothing when the conditions lapsed at the gateway', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب پرداخت بی‌اثر');
  await publishRules(owner, club.id, {
    tree: all(rule('ASSOCIATION_MEMBERSHIP'), rule('FEE_PAID')),
    feeToman: '50000',
  });
  const applicant = await activeAccount();
  await giveMembership(applicant);
  const applied = await applyToClub(testDb.db, applicant, { clubId: club.id });
  assert.equal(applied.status, 'AWAITING_PAYMENT');
  const started = await startClubFeePayment(testDb.db, applicant, { membershipId: applied.id });

  // The association membership is suspended while the payer is at the gateway.
  await testDb.db.update(memberships).set({ status: 'SUSPENDED' }).where(eq(memberships.accountId, applicant.accountId));
  const gateway = payingGateway(500_000n);
  const attempt = await startAttempt(testDb.db, applicant, { batchId: started.batchId, callbackUrl: 'https://example.invalid/return' }, gateway, 'test');
  const verified = await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects);

  // The money is recorded, the membership is not granted, and both are visible.
  assert.equal(verified.state, 'PAID');
  const row = await membershipRow(club.id, applicant.accountId);
  assert.equal(row.status, 'AWAITING_PAYMENT');
  const blocked = await testDb.db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, row.id), eq(auditEvents.action, 'CLUB_MEMBERSHIP_ACTIVATION_BLOCKED')));
  assert.equal(blocked.length, 1);
  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, applicant.accountId), eq(notifications.kind, 'CLUB_MEMBERSHIP_ACTIVATION_BLOCKED')));
  assert.equal(told.length, 1);
});

test('new rules judge new applications, and old members only on an audited campaign', async () => {
  const owner = await activeAccount();
  const club = await liveClub(owner, 'کلاب بازبینی');
  await publishRules(owner, club.id, { tree: all(rule('ACCOUNT_ACTIVE')) });

  const oldMember = await activeAccount();
  const admitted = await applyToClub(testDb.db, oldMember, { clubId: club.id });
  assert.equal(admitted.status, 'ACTIVE');

  // The club demands more of new applicants.
  const stricter = await publishRules(owner, club.id, { tree: all(rule('ACCOUNT_ACTIVE'), rule('ASSOCIATION_MEMBERSHIP')) });
  const newcomer = await activeAccount();
  assert.equal((await applyToClub(testDb.db, newcomer, { clubId: club.id })).status, 'INELIGIBLE');

  // The existing member is untouched and still judged by the version they joined under.
  const stillIn = await membershipRow(club.id, oldMember.accountId);
  assert.equal(stillIn.status, 'ACTIVE');
  assert.notEqual(stillIn.admittedRuleVersionId, stricter.id);
  const mine = await clubJoinView(testDb.db, oldMember, club.id);
  assert.equal(mine?.membership?.status, 'ACTIVE');
  assert.equal(mine?.rule?.id, stillIn.admittedRuleVersionId);
  const queue = await clubMemberQueue(testDb.db, owner, club.id);
  assert.equal(queue.find((row) => row.membership.accountId === oldMember.accountId)!.staleRules, true);

  // A campaign is explicit, needs a reason, and belongs to the club.
  const outsider = await activeAccount();
  await assert.rejects(() => reevaluateClubMembers(testDb.db, outsider, { clubId: club.id, reasonFa: 'بازبینی' }), code('FORBIDDEN'));
  await assert.rejects(() => reevaluateClubMembers(testDb.db, owner, { clubId: club.id, reasonFa: '  ' }), code('VALIDATION'));

  const keeper = await activeAccount();
  await giveMembership(keeper);
  await applyToClub(testDb.db, keeper, { clubId: club.id });

  const result = await reevaluateClubMembers(testDb.db, owner, { clubId: club.id, reasonFa: 'اجرای شرایط تازه برای همه اعضا.' });
  assert.equal(result.examined, 2);
  assert.equal(result.stillEligible, 1);
  assert.equal(result.nowIneligible, 1);

  const after = await membershipRow(club.id, oldMember.accountId);
  assert.equal(after.status, 'SUSPENDED');
  // The member is suspended, not deleted, and keeps the version they were admitted under.
  assert.equal(after.admittedRuleVersionId, stillIn.admittedRuleVersionId);
  assert.equal(after.evaluatedRuleVersionId, stricter.id);
  assert.equal((await membershipRow(club.id, keeper.accountId)).admittedRuleVersionId, stricter.id);

  const campaigns = await testDb.db.select().from(clubReevaluations).where(eq(clubReevaluations.communityId, club.id));
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0]!.reasonFa, 'اجرای شرایط تازه برای همه اعضا.');
  assert.equal(campaigns[0]!.nowIneligible, 1);
  const audited = await testDb.db
    .select({ action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.targetType, 'CLUB_REEVALUATION'));
  assert.equal(audited.length, 1);
  const told = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, oldMember.accountId), eq(notifications.kind, 'CLUB_MEMBERSHIP_REEVALUATED')));
  assert.equal(told.length, 1);
});

test('a club that is not verified and active takes no applications', async () => {
  const owner = await activeAccount();
  const draft = await createClub(testDb.db, owner, { displayNameFa: 'کلاب نیمه‌کاره', scope: 'OTHER' });
  const applicant = await activeAccount();
  assert.equal(await clubJoinView(testDb.db, applicant, draft.id), null);
  await assert.rejects(() => applyToClub(testDb.db, applicant, { clubId: draft.id }), code('CONFLICT'));

  // A verified club with no published rules is honest about it rather than admitting everybody.
  const club = await liveClub(owner, 'کلاب بی‌شرط');
  const view = await clubJoinView(testDb.db, applicant, club.id);
  assert.equal(view?.rule, null);
  assert.equal(view?.canApply, false);
  await assert.rejects(() => applyToClub(testDb.db, applicant, { clubId: club.id }), code('CONFLICT'));
});
