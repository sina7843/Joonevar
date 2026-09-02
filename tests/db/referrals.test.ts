import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { referralCodes, vetVisitRequests } from '../../src/db/schema/vets.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addLocation, searchFinder, updateLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import {
  checkIn,
  correctService,
  createVisitRequests,
  listOwnerRequests,
  ownerRequest,
  renewReferral,
  selectableAnimals,
  vetQueue,
} from '../../src/vets/visits.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const actorFor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: context === 'USER' ? [] : [context as never],
});

const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify(input) {
    return { paid: true, amountRial, providerRef: 'p-' + input.reference };
  },
});

interface Party {
  readonly accountId: string;
  readonly actor: Actor;
}

interface Ctx {
  readonly testDb: TestDb;
  readonly root: string;
  readonly owner: Party;
  readonly operator: Party;
  readonly admin: Party;
  readonly vet: Party;
  readonly locationId: string;
  readonly breedId: string;
}

/** Signs an account in, completes the profile and gets KYC approved. */
async function approved(
  testDb: TestDb,
  root: string,
  operator: Actor,
  mobile: string,
  nationalId: string,
): Promise<Party> {
  const account = await signInWithVerifiedMobile(testDb.db, mobile);
  const actor = actorFor(account.accountId);
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'کاربر آزمایشی',
    nationalId,
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, operator, { caseId: submitted.id, decision: 'APPROVED' });
  return { accountId: account.accountId, actor };
}

async function payMembership(testDb: TestDb, actor: Actor): Promise<void> {
  const batch = await startMembershipPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const started = await startAttempt(
    testDb.db,
    actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
}

async function withCtx(fn: (ctx: Ctx) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-referral-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990400099');
    const operator: Party = {
      accountId: operatorAccount.accountId,
      actor: actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR'),
    };
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990400098');
    const admin: Party = {
      accountId: adminAccount.accountId,
      actor: actorFor(adminAccount.accountId, 'SUPERADMIN'),
    };

    const owner = await approved(testDb, root, operator.actor, '09990400001', '0499370899');
    await payMembership(testDb, owner.actor);

    // SYNTHETIC trusted veterinarian: an already-approved professional, not an
    // onboarding request (D01).
    const vetParty = await approved(testDb, root, operator.actor, '09990400002', '0790419904');
    const vet: Party = { accountId: vetParty.accountId, actor: actorFor(vetParty.accountId, 'TRUSTED_VET') };
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vet.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await payMembership(testDb, vetParty.actor);
    await upsertVetProfile(testDb.db, admin.actor, {
      mobile: '09990400002',
      displayNameFa: 'دامپزشک نمونه',
      councilCode: 'SYNTH-VET-1',
    });
    const location = await addLocation(testDb.db, admin.actor, vet.accountId, {
      nameFa: 'کلینیک نمونه',
      cityFa: 'تهران',
      neighborhoodFa: 'ونک',
      addressFa: 'نشانی نمونه ۱',
      phone: '02100000000',
      licenceNumber: 'SYNTH-LIC-1',
      licenceStatus: 'VALID',
      canImplantMicrochip: true,
      canDrawBloodSample: true,
      canPregnancyCheck: true,
    });

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);

    await fn({
      testDb,
      root,
      owner,
      operator,
      admin,
      vet,
      locationId: location.id,
      breedId: breed!.id,
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function makeAnimal(ctx: Ctx, name: string): Promise<string> {
  const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
    name,
    breedId: ctx.breedId,
    sex: 'MALE',
    birthDate: '2022-01-01',
  });
  const registered = await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id);
  return registered.id;
}

async function makeVisit(ctx: Ctx, names: readonly string[]) {
  const items = [];
  for (const [index, name] of names.entries()) {
    items.push({
      animalId: await makeAnimal(ctx, name),
      serviceType: index % 2 === 0 ? ('MICROCHIP_IMPLANT' as const) : ('MICROCHIP_VERIFICATION' as const),
    });
  }
  return createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
    context: 'MICROCHIP',
    vetAccountId: ctx.vet.accountId,
    locationId: ctx.locationId,
    items,
  });
}

test('every animal in one group gets its own request, code and deadline', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ یک', 'سگ دو']);
    assert.equal(created.items.length, 2);

    const [first, second] = created.items;
    assert.notEqual(first!.request.id, second!.request.id);
    assert.notEqual(first!.referral.code, second!.referral.code);
    assert.equal(first!.request.batchId, second!.request.batchId);
    // The service is chosen per animal, not for the group (§11.2).
    assert.equal(first!.request.serviceType, 'MICROCHIP_IMPLANT');
    assert.equal(second!.request.serviceType, 'MICROCHIP_VERIFICATION');

    // The deadline comes from the database setting, with its version recorded.
    assert.equal(first!.referral.validityDays, 21);
    assert.ok(first!.referral.settingsVersion >= 1);
    const days = Math.round(
      (first!.referral.expiresAt.getTime() - first!.referral.issuedAt.getTime()) / 86_400_000,
    );
    assert.equal(days, 21);

    // The code exists before any sampling and the owner is told about it.
    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.equal(alerts.filter((n) => n.kind === 'REFERRAL_ISSUED').length, 2);
  });
});

test('two scanners racing on one code produce exactly one check-in', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ مسابقه']);
    const code = created.items[0]!.referral.code;

    const results = await Promise.all([
      checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId }),
      checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId }),
      checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId }),
    ]);

    assert.equal(results.filter((r) => r.ok).length, 1);
    for (const loser of results.filter((r) => !r.ok)) {
      // Depending on where the loser was when the winner committed, it sees the
      // code as used or the request as no longer waiting. Both are refusals;
      // what matters is that neither is a second acceptance.
      assert.ok(
        loser.ok === false && ['CONSUMED', 'REQUEST_NOT_ACTIVE'].includes(loser.rejection),
        'unexpected rejection: ' + (loser.ok === false ? loser.rejection : ''),
      );
    }

    const [request] = await ctx.testDb.db
      .select()
      .from(vetVisitRequests)
      .where(eq(vetVisitRequests.id, created.items[0]!.request.id));
    assert.equal(request!.status, 'CHECKED_IN');

    const [referral] = await ctx.testDb.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code));
    assert.equal(referral!.status, 'CONSUMED');
    assert.equal(referral!.consumedByAccountId, ctx.vet.accountId);

    // Exactly one acceptance was recorded, not three.
    const events = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'VET_VISIT_CHECKED_IN'));
    assert.equal(events.length, 1);
  });
});

test('a code is refused at the wrong desk without naming the animal or its owner', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ خصوصی']);
    const code = created.items[0]!.referral.code;

    // Another trusted veterinarian, with their own licensed location.
    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990400003');
    await ctx.testDb.db
      .insert(accountRoles)
      .values({ accountId: strangerAccount.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    const stranger = actorFor(strangerAccount.accountId, 'TRUSTED_VET');
    await upsertVetProfile(ctx.testDb.db, ctx.admin.actor, {
      mobile: '09990400003',
      displayNameFa: 'دامپزشک دیگر',
      councilCode: 'SYNTH-VET-2',
    });
    const otherLocation = await addLocation(ctx.testDb.db, ctx.admin.actor, strangerAccount.accountId, {
      nameFa: 'کلینیک دیگر',
      cityFa: 'تهران',
      addressFa: 'نشانی نمونه ۲',
      phone: '02100000001',
      licenceStatus: 'VALID',
      canImplantMicrochip: true,
      canDrawBloodSample: true,
    });

    const wrongVet = await checkIn(ctx.testDb.db, stranger, { code, locationId: otherLocation.id });
    assert.equal(wrongVet.ok, false);
    assert.equal(wrongVet.ok === false && wrongVet.rejection, 'WRONG_VET');
    assert.doesNotMatch(wrongVet.ok === false ? wrongVet.messageFa : '', /سگ خصوصی/);

    const wrongLocation = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code,
      locationId: otherLocation.id,
    });
    assert.equal(wrongLocation.ok === false && wrongLocation.rejection, 'WRONG_LOCATION');

    // And the queue of the other veterinarian never contained this work.
    assert.equal((await vetQueue(ctx.testDb.db, stranger)).length, 0);
  });
});

test('invalid, expired, cancelled and superseded codes each get their own refusal', async () => {
  await withCtx(async (ctx) => {
    const unknown = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: 'HZ-NOTHINGHERE',
      locationId: ctx.locationId,
    });
    assert.equal(unknown.ok === false && unknown.rejection, 'NOT_FOUND');

    const expiredVisit = await makeVisit(ctx, ['سگ منقضی']);
    await ctx.testDb.db
      .update(referralCodes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(referralCodes.id, expiredVisit.items[0]!.referral.id));
    const expired = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: expiredVisit.items[0]!.referral.code,
      locationId: ctx.locationId,
    });
    assert.equal(expired.ok === false && expired.rejection, 'EXPIRED');

    const cancelledVisit = await makeVisit(ctx, ['سگ لغو']);
    await ctx.testDb.db
      .update(referralCodes)
      .set({ status: 'CANCELLED' })
      .where(eq(referralCodes.id, cancelledVisit.items[0]!.referral.id));
    const cancelled = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: cancelledVisit.items[0]!.referral.code,
      locationId: ctx.locationId,
    });
    assert.equal(cancelled.ok === false && cancelled.rejection, 'CANCELLED');

    const supersededVisit = await makeVisit(ctx, ['سگ جایگزین']);
    await ctx.testDb.db
      .update(referralCodes)
      .set({ status: 'SUPERSEDED' })
      .where(eq(referralCodes.id, supersededVisit.items[0]!.referral.id));
    const superseded = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: supersededVisit.items[0]!.referral.code,
      locationId: ctx.locationId,
    });
    assert.equal(superseded.ok === false && superseded.rejection, 'SUPERSEDED');

    // A code that was already used stays used.
    const usedVisit = await makeVisit(ctx, ['سگ استفاده‌شده']);
    const usedCode = usedVisit.items[0]!.referral.code;
    assert.equal((await checkIn(ctx.testDb.db, ctx.vet.actor, { code: usedCode, locationId: ctx.locationId })).ok, true);
    const again = await checkIn(ctx.testDb.db, ctx.vet.actor, { code: usedCode, locationId: ctx.locationId });
    assert.equal(again.ok === false && again.rejection, 'CONSUMED');
  });
});

test('changing the deadline setting never moves a code that was already issued', async () => {
  await withCtx(async (ctx) => {
    const before = await makeVisit(ctx, ['سگ قبل از تغییر']);
    const oldReferral = before.items[0]!.referral;
    assert.equal(oldReferral.validityDays, 21);

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'referral.validity_days',
      value: 7,
      reason: 'آزمون تغییر مهلت',
    });

    const after = await makeVisit(ctx, ['سگ بعد از تغییر']);
    assert.equal(after.items[0]!.referral.validityDays, 7);
    assert.ok(after.items[0]!.referral.settingsVersion > oldReferral.settingsVersion);

    // The already-issued code keeps its own deadline, to the millisecond.
    const [unchanged] = await ctx.testDb.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.id, oldReferral.id));
    assert.equal(unchanged!.validityDays, 21);
    assert.equal(unchanged!.expiresAt.getTime(), oldReferral.expiresAt.getTime());
  });
});

test('after expiry a new code is issued and the old one stays in the record', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ تمدید']);
    const first = created.items[0]!.referral;
    const requestId = created.items[0]!.request.id;

    // While the code is still valid there is nothing to renew.
    await assert.rejects(() => renewReferral(ctx.testDb.db, ctx.owner.actor, requestId), /هنوز معتبر/);

    await ctx.testDb.db
      .update(referralCodes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(referralCodes.id, first.id));

    const second = await renewReferral(ctx.testDb.db, ctx.owner.actor, requestId);
    assert.notEqual(second.code, first.code);
    assert.ok(second.expiresAt.getTime() > Date.now());

    const history = await ctx.testDb.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.requestId, requestId));
    assert.equal(history.length, 2, 'the previous code is kept, not replaced in place');
    assert.equal(history.find((r) => r.id === first.id)?.status, 'EXPIRED');

    // The old code cannot be used after the reissue.
    const stale = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: first.code,
      locationId: ctx.locationId,
    });
    assert.equal(stale.ok === false && stale.rejection, 'EXPIRED');
    assert.equal(
      (await checkIn(ctx.testDb.db, ctx.vet.actor, { code: second.code, locationId: ctx.locationId })).ok,
      true,
    );
  });
});

test('a renewal re-checks the location and refuses one that lost its licence', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ پروانه']);
    const first = created.items[0]!.referral;
    await ctx.testDb.db
      .update(referralCodes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(referralCodes.id, first.id));

    await updateLocation(ctx.testDb.db, ctx.admin.actor, ctx.locationId, {
      nameFa: 'کلینیک نمونه',
      licenceStatus: 'EXPIRED',
    });

    await assert.rejects(
      () => renewReferral(ctx.testDb.db, ctx.owner.actor, created.items[0]!.request.id),
      /پروانه معتبر/,
    );
  });
});

test('a veterinarian who cannot take new work keeps the work already assigned', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ قبل از تعلیق']);

    // §7.1: the professional approval is suspended, the role and the history stay.
    await ctx.testDb.db
      .update(accountRoles)
      .set({ status: 'SUSPENDED' })
      .where(and(eq(accountRoles.accountId, ctx.vet.accountId), eq(accountRoles.role, 'TRUSTED_VET')));

    // No new assignment reaches them, in Finder or at the write.
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP' })).length, 0);
    const animalId = await makeAnimal(ctx, 'سگ بعد از تعلیق');
    await assert.rejects(
      () =>
        createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
          context: 'MICROCHIP',
          vetAccountId: ctx.vet.accountId,
          locationId: ctx.locationId,
          items: [{ animalId, serviceType: 'MICROCHIP_IMPLANT' }],
        }),
      /درخواست جدید نمی‌پذیرد/,
    );

    // The existing request is still completable at the desk.
    const outcome = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: created.items[0]!.referral.code,
      locationId: ctx.locationId,
    });
    assert.equal(outcome.ok, true);
    assert.equal((await vetQueue(ctx.testDb.db, ctx.vet.actor)).length, 1);
  });
});

test('correcting the observed service touches one animal and leaves the group alone', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ اصلاح', 'سگ همراه']);
    const target = created.items[0]!;
    const untouched = created.items[1]!;

    await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: target.referral.code,
      locationId: ctx.locationId,
    });

    const corrected = await correctService(
      ctx.testDb.db,
      ctx.vet.actor,
      target.request.id,
      'MICROCHIP_VERIFICATION',
      'حیوان از قبل میکروچیپ داشت.',
    );

    const [old] = await ctx.testDb.db
      .select()
      .from(vetVisitRequests)
      .where(eq(vetVisitRequests.id, target.request.id));
    assert.equal(old!.status, 'SUPERSEDED');
    assert.equal(old!.supersededByRequestId, corrected.request.id);
    assert.equal(old!.supersedeReasonFa, 'حیوان از قبل میکروچیپ داشت.');
    // The old audit rows are still there, alongside the correction.
    const trail = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, target.request.id));
    assert.ok(trail.some((row) => row.action === 'VET_VISIT_REQUEST_CREATED'));
    assert.ok(trail.some((row) => row.action === 'VET_VISIT_CHECKED_IN'));
    assert.ok(trail.some((row) => row.action === 'VET_VISIT_SERVICE_CORRECTED'));

    // The replacement is a fresh request that still has to be checked in.
    assert.equal(corrected.request.status, 'ACTIVE');
    assert.equal(corrected.request.serviceType, 'MICROCHIP_VERIFICATION');
    assert.equal(corrected.request.animalId, target.request.animalId);
    assert.equal(corrected.request.batchId, target.request.batchId);
    assert.notEqual(corrected.referral.code, target.referral.code);
    assert.equal(
      (await checkIn(ctx.testDb.db, ctx.vet.actor, { code: corrected.referral.code, locationId: ctx.locationId }))
        .ok,
      true,
    );

    // The other animal of the same group is exactly as it was.
    const [sibling] = await ctx.testDb.db
      .select()
      .from(vetVisitRequests)
      .where(eq(vetVisitRequests.id, untouched.request.id));
    assert.equal(sibling!.status, 'ACTIVE');
    assert.equal(sibling!.serviceType, untouched.request.serviceType);
    const [siblingCode] = await ctx.testDb.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.id, untouched.referral.id));
    assert.equal(siblingCode!.status, 'ACTIVE');
  });
});

test('a superseded code cannot be used, and the correction needs a reason', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ بدون پذیرش']);
    const target = created.items[0]!;

    await assert.rejects(
      () => correctService(ctx.testDb.db, ctx.vet.actor, target.request.id, 'MICROCHIP_VERIFICATION', ' '),
      /دلیل/,
    );
    // Only the assigned veterinarian may correct it.
    await assert.rejects(
      () =>
        correctService(
          ctx.testDb.db,
          ctx.owner.actor,
          target.request.id,
          'MICROCHIP_VERIFICATION',
          'تلاش کاربر',
        ),
      /دامپزشک معتمد/,
    );

    await correctService(
      ctx.testDb.db,
      ctx.vet.actor,
      target.request.id,
      'MICROCHIP_VERIFICATION',
      'وضعیت مشاهده‌شده فرق داشت.',
    );
    const stale = await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: target.referral.code,
      locationId: ctx.locationId,
    });
    assert.equal(stale.ok === false && stale.rejection, 'SUPERSEDED');
  });
});

test('Finder returns only complete, licensed locations of eligible veterinarians', async () => {
  await withCtx(async (ctx) => {
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP' })).length, 1);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'PREGNANCY' })).length, 1);

    // Searching by veterinarian name, centre name and neighbourhood (§11.1).
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP', term: 'دامپزشک نمونه' })).length, 1);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP', term: 'کلینیک' })).length, 1);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP', term: 'ونک' })).length, 1);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP', term: 'یزد' })).length, 0);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP', cityFa: 'شیراز' })).length, 0);

    // Partial capability removes the location instead of offering less (§11.1).
    await updateLocation(ctx.testDb.db, ctx.admin.actor, ctx.locationId, {
      nameFa: 'کلینیک نمونه',
      licenceStatus: 'VALID',
      canImplantMicrochip: true,
      canDrawBloodSample: false,
      canPregnancyCheck: false,
    });
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP' })).length, 0);
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'DNA' })).length, 0);

    // An unlicensed location is out even when fully equipped.
    await updateLocation(ctx.testDb.db, ctx.admin.actor, ctx.locationId, {
      nameFa: 'کلینیک نمونه',
      licenceStatus: 'NONE',
      canImplantMicrochip: true,
      canDrawBloodSample: true,
      canPregnancyCheck: true,
    });
    assert.equal((await searchFinder(ctx.testDb.db, { context: 'MICROCHIP' })).length, 0);
  });
});

test('a request belongs to its owner and to the assigned veterinarian, nobody else', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ مالک']);
    const requestId = created.items[0]!.request.id;

    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990400004');
    const stranger = actorFor(strangerAccount.accountId);
    await assert.rejects(() => ownerRequest(ctx.testDb.db, stranger, requestId), /پیدا نشد/);
    assert.equal((await listOwnerRequests(ctx.testDb.db, stranger)).length, 0);

    const mine = await ownerRequest(ctx.testDb.db, ctx.owner.actor, requestId);
    assert.equal(mine.animalName, 'سگ مالک');
    assert.equal(mine.referral?.code, created.items[0]!.referral.code);
  });
});

test('an animal already waiting for this visit is not offered again', async () => {
  await withCtx(async (ctx) => {
    const created = await makeVisit(ctx, ['سگ در انتظار']);
    const animalId = created.items[0]!.request.animalId;

    const selectable = await selectableAnimals(ctx.testDb.db, ctx.owner.actor, 'MICROCHIP');
    assert.equal(selectable.some((a) => a.id === animalId), false);

    await assert.rejects(
      () =>
        createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
          context: 'MICROCHIP',
          vetAccountId: ctx.vet.accountId,
          locationId: ctx.locationId,
          items: [{ animalId, serviceType: 'MICROCHIP_IMPLANT' }],
        }),
      /درخواست مراجعه فعال/,
    );
  });
});

test('a request cannot be created for somebody else animal or without membership', async () => {
  await withCtx(async (ctx) => {
    const animalId = await makeAnimal(ctx, 'سگ من');

    const otherAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990400005');
    const other = actorFor(otherAccount.accountId);
    await assert.rejects(
      () =>
        createVisitRequests(ctx.testDb.db, other, {
          context: 'MICROCHIP',
          vetAccountId: ctx.vet.accountId,
          locationId: ctx.locationId,
          items: [{ animalId, serviceType: 'MICROCHIP_IMPLANT' }],
        }),
      // The membership lock is reached before anything about the animal.
      /عضویت|احراز هویت/,
    );
  });
});
