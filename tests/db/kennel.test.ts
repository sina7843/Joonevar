import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, referenceBreeds, storedFiles } from '../../src/db/schema/core.ts';
import { paymentBatches, paymentItems } from '../../src/db/schema/billing.ts';
import { kennels } from '../../src/db/schema/kennels.ts';
import { residences } from '../../src/db/schema/identity.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { cancelAttempt, startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { confirmImplant, recordChipRead, recordRereadAndBind } from '../../src/clinical/microchip.ts';
import { recordOfficialIdentity } from '../../src/clinical/identity.ts';
import { recordSampling } from '../../src/clinical/samples.ts';
import { createSheetRequest, sheetOfAnimal } from '../../src/documents/registration-sheet.ts';
import {
  addBreed,
  breedsOfKennel,
  kennelOfOwner,
  kennelQueue,
  removeBreed,
  reviewKennel,
  saveKennel,
  searchBreeds,
  startKennel,
  startKennelPayment,
  submitKennel,
  submitReadiness,
} from '../../src/kennels/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
/** SYNTHETIC tariffs: the real ones have not been published. */
const SHEET_FEE = '250000';
const KENNEL_FEE = '150000';

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

const failingGateway: PaymentGateway = {
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify(input) {
    return { paid: false, amountRial: 0n, providerRef: 'p-' + input.reference };
  },
};

interface Party {
  readonly accountId: string;
  readonly actor: Actor;
}

interface Ctx {
  readonly testDb: TestDb;
  readonly root: string;
  readonly owner: Party;
  readonly admin: Party;
  readonly association: Party;
  readonly vet: Party;
  readonly locationId: string;
  readonly breedIds: readonly string[];
}

async function approved(testDb: TestDb, root: string, operator: Actor, mobile: string, nationalId: string) {
  const account = await signInWithVerifiedMobile(testDb.db, mobile);
  const actor = actorFor(account.accountId);
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'کاربر آزمایشی',
    displayName: 'نمایشی آزمایشی',
    nationalId,
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, operator, { caseId: submitted.id, decision: 'APPROVED' });
  return { accountId: account.accountId, actor };
}

async function payMembership(testDb: TestDb, actor: Actor) {
  const batch = await startMembershipPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const started = await startAttempt(testDb.db, actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, 'test');
  assert.equal((await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');
}

async function withCtx(fn: (ctx: Ctx) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-kennel-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990900099');
    const association: Party = {
      accountId: operatorAccount.accountId,
      actor: actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR'),
    };
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990900098');
    const admin: Party = { accountId: adminAccount.accountId, actor: actorFor(adminAccount.accountId, 'SUPERADMIN') };

    const owner = await approved(testDb, root, association.actor, '09990900001', '0499370899');
    await payMembership(testDb, owner.actor);

    const vetParty = await approved(testDb, root, association.actor, '09990900002', '0790419904');
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vetParty.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await payMembership(testDb, vetParty.actor);
    await upsertVetProfile(testDb.db, admin.actor, {
      mobile: '09990900002',
      displayNameFa: 'دامپزشک نمونه',
      councilCode: 'SYNTH-KEN-1',
    });
    const location = await addLocation(testDb.db, admin.actor, vetParty.accountId, {
      nameFa: 'کلینیک نمونه',
      cityFa: 'تهران',
      addressFa: 'نشانی نمونه',
      phone: '02100000000',
      licenceStatus: 'VALID',
      canImplantMicrochip: true,
      canDrawBloodSample: true,
    });

    for (const [key, value] of [
      ['fee.registration_sheet_toman', SHEET_FEE],
      ['fee.kennel_registration_toman', KENNEL_FEE],
    ] as const) {
      await updateSetting(testDb.db, admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
    }

    const breeds = await testDb.db.select().from(referenceBreeds).limit(3);

    await fn({
      testDb,
      root,
      owner,
      admin,
      association,
      vet: { accountId: vetParty.accountId, actor: actorFor(vetParty.accountId, 'TRUSTED_VET') },
      locationId: location.id,
      breedIds: breeds.map((row) => row.id),
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

let chipCounter = 0;
const nextChip = () => '90000000' + String(4_000_000 + (chipCounter += 1));

/** One animal taken to an issued registration sheet, the kennel prerequisite. */
async function animalWithSheet(ctx: Ctx, name: string) {
  const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
    name,
    breedId: ctx.breedIds[0]!,
    sex: 'MALE',
    birthDate: '2022-01-01',
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  const animal = await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id);

  const created = await createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
    context: 'MICROCHIP',
    vetAccountId: ctx.vet.accountId,
    locationId: ctx.locationId,
    items: [{ animalId: animal.id, serviceType: 'MICROCHIP_IMPLANT' }],
  });
  const requestId = created.items[0]!.request.id;
  await checkIn(ctx.testDb.db, ctx.vet.actor, {
    code: created.items[0]!.referral.code,
    locationId: ctx.locationId,
  });
  // §13: identity is certified at the desk before the chip is bound.
  await recordOfficialIdentity(ctx.testDb.db, ctx.vet.actor, requestId, {
    name,
    breedId: ctx.breedIds[0]!,
    sex: 'MALE',
    birthDate: '2022-01-01',
    birthDateApproximate: false,
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  const number = nextChip();
  await recordChipRead(ctx.testDb.db, ctx.vet.actor, requestId, { number, method: 'MANUAL' });
  await confirmImplant(ctx.testDb.db, ctx.vet.actor, requestId);
  await recordRereadAndBind(ctx.testDb.db, ctx.vet.actor, requestId, { number, method: 'MANUAL' });
  await recordSampling(ctx.testDb.db, ctx.vet.actor, requestId);

  const batch = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [animal.id]);
  const gateway = payingGateway(2_500_000n);
  const started = await startAttempt(
    ctx.testDb.db,
    ctx.owner.actor,
    { batchId: batch.batch.id, callbackUrl: '/x' },
    gateway,
    'test',
  );
  assert.equal((await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');
  assert.ok(await sheetOfAnimal(ctx.testDb.db, animal.id));
  return animal.id;
}

/** Fills the kennel and its breeds, ready for payment. */
async function completeKennel(ctx: Ctx, kennelId: string) {
  await saveKennel(ctx.testDb.db, ctx.owner.actor, kennelId, {
    nameFa: 'کنل نمونه',
    nameEn: 'Sample Kennel',
    phone: '02100000000',
    provinceFa: 'تهران',
    cityFa: 'تهران',
    addressFa: 'نشانی کنل نمونه',
  });
  await addBreed(ctx.testDb.db, ctx.owner.actor, kennelId, ctx.breedIds[0]!);
}

async function payKennel(ctx: Ctx, kennelId: string, gateway = payingGateway(1_500_000n)) {
  const batch = await startKennelPayment(ctx.testDb.db, ctx.owner.actor, kennelId);
  const started = await startAttempt(
    ctx.testDb.db,
    ctx.owner.actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  return { batch, outcome: await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects) };
}

test('the kennel entry needs a membership and a registration sheet, and nothing else', async () => {
  await withCtx(async (ctx) => {
    // No registration sheet yet: the entry is locked with that exact reason.
    await assert.rejects(() => startKennel(ctx.testDb.db, ctx.owner.actor), /برگه ثبتی/);

    await animalWithSheet(ctx, 'سگ برگه‌دار');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    assert.equal(kennel.status, 'DRAFT');

    // Holding the breeder role is not a condition, and starting again resumes.
    const again = await startKennel(ctx.testDb.db, ctx.owner.actor);
    assert.equal(again.id, kennel.id);
    const roles = await ctx.testDb.db
      .select()
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, ctx.owner.accountId), eq(accountRoles.role, 'BREEDER')));
    assert.equal(roles.length, 0, 'the role is produced by approval, not required to start');
  });
});

test('an empty residence never blocks the kennel, but a missing kennel address does', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ نشانی');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);

    // §6.2: the residence is optional and stays empty here.
    const residence = await ctx.testDb.db
      .select()
      .from(residences)
      .where(eq(residences.accountId, ctx.owner.accountId));
    assert.equal(residence.length === 0 || residence[0]!.address === null, true);

    await saveKennel(ctx.testDb.db, ctx.owner.actor, kennel.id, { nameFa: 'کنل بدون نشانی' });
    await addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[0]!);
    const missing = await submitReadiness(ctx.testDb.db, (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!);
    assert.equal(missing.ready, false);
    assert.match(missing.reasonFa ?? '', /نشانی و موقعیت کنل/);
    await assert.rejects(() => startKennelPayment(ctx.testDb.db, ctx.owner.actor, kennel.id), /نشانی/);

    // With the kennel's own address, and still no residence, it is ready.
    await saveKennel(ctx.testDb.db, ctx.owner.actor, kennel.id, {
      cityFa: 'تهران',
      addressFa: 'نشانی کنل نمونه',
    });
    const ready = await submitReadiness(ctx.testDb.db, (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!);
    assert.equal(ready.ready, true);
  });
});

test('at least one breed is required and the last one cannot be removed', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ نژاد');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await saveKennel(ctx.testDb.db, ctx.owner.actor, kennel.id, {
      nameFa: 'کنل نژاد',
      cityFa: 'تهران',
      addressFa: 'نشانی',
    });

    const withoutBreed = await submitReadiness(ctx.testDb.db, (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!);
    assert.equal(withoutBreed.ready, false);
    assert.match(withoutBreed.reasonFa ?? '', /حداقل یک نژاد/);

    await addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[0]!);
    // A single-breed kennel is the same path with one choice.
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 1);
    await assert.rejects(
      () => removeBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[0]!),
      /آخرین نژاد/,
    );

    // Adding the same breed twice does nothing; a second breed can be removed.
    await addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[0]!);
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 1);
    await addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[1]!);
    await removeBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[1]!);
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 1);

    // A breed outside the reference registry is refused.
    await assert.rejects(
      () => addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, '00000000-0000-4000-8000-000000000000'),
      /فهرست مرجع/,
    );
  });
});

test('breeds are searchable in Persian and in English', async () => {
  await withCtx(async (ctx) => {
    const [breed] = await ctx.testDb.db.select().from(referenceBreeds).limit(1);
    const byFa = await searchBreeds(ctx.testDb.db, breed!.nameFa.slice(0, 3));
    assert.ok(byFa.some((row) => row.id === breed!.id));
    const byEn = await searchBreeds(ctx.testDb.db, breed!.nameEn.slice(0, 3));
    assert.ok(byEn.some((row) => row.id === breed!.id));
    assert.equal((await searchBreeds(ctx.testDb.db, 'zzzzz-not-a-breed')).length, 0);
  });
});

test('the payment opens submission, the association approves, and the role becomes real', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ تأیید');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);

    // Submission is refused before the payment is verified.
    await assert.rejects(() => submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id), /پرداخت ثبت کنل/);

    const { batch, outcome } = await payKennel(ctx, kennel.id);
    assert.equal(outcome.state, 'PAID');
    const paid = (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!;
    assert.equal(paid.status, 'READY_TO_SUBMIT', 'paying does not approve the kennel');
    assert.equal((await kennelQueue(ctx.testDb.db, ctx.association.actor)).length, 0);

    // Exactly one money line, for the kennel registration service.
    const lines = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.settingKey, 'fee.kennel_registration_toman');
    assert.equal(lines[0]!.amountToman, KENNEL_FEE);

    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);
    assert.equal((await kennelQueue(ctx.testDb.db, ctx.association.actor)).length, 1);

    // Only the association decides.
    await assert.rejects(
      () => reviewKennel(ctx.testDb.db, ctx.owner.actor, { kennelId: kennel.id, decision: 'APPROVED' }),
      /محیط انجمن/,
    );

    await reviewKennel(ctx.testDb.db, ctx.association.actor, { kennelId: kennel.id, decision: 'APPROVED' });
    const approvedKennel = (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!;
    assert.equal(approvedKennel.status, 'APPROVED');

    const [role] = await ctx.testDb.db
      .select()
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, ctx.owner.accountId), eq(accountRoles.role, 'BREEDER')));
    assert.equal(role?.status, 'ACTIVE', 'the approved kennel is what activates the breeder context');

    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'KENNEL_PAYMENT_VERIFIED'));
    assert.ok(alerts.some((n) => n.kind === 'KENNEL_APPROVED'));
    const trail = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'BREEDER_ROLE_ACTIVATED'));
    assert.equal(trail.length, 1);
  });
});

test('a correction keeps the data and the payment, and needs no second payment', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ اصلاح');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);
    const { batch } = await payKennel(ctx, kennel.id);
    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);

    await assert.rejects(
      () =>
        reviewKennel(ctx.testDb.db, ctx.association.actor, {
          kennelId: kennel.id,
          decision: 'NEEDS_CORRECTION',
          reasonFa: ' ',
        }),
      /دلیل/,
    );
    await reviewKennel(ctx.testDb.db, ctx.association.actor, {
      kennelId: kennel.id,
      decision: 'NEEDS_CORRECTION',
      reasonFa: 'نشانی کنل دقیق نیست.',
    });

    const corrected = (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!;
    assert.equal(corrected.status, 'NEEDS_CORRECTION');
    assert.equal(corrected.reasonFa, 'نشانی کنل دقیق نیست.');
    assert.equal(corrected.nameFa, 'کنل نمونه', 'the entered data survives');
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 1);

    // The same file is fixed and resent; no second payment is asked for.
    await saveKennel(ctx.testDb.db, ctx.owner.actor, kennel.id, { addressFa: 'نشانی دقیق‌تر کنل' });
    await assert.rejects(() => startKennelPayment(ctx.testDb.db, ctx.owner.actor, kennel.id), /قبلاً تأیید/);
    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);

    const batches = await ctx.testDb.db
      .select()
      .from(paymentBatches)
      .where(
        and(eq(paymentBatches.accountId, ctx.owner.accountId), eq(paymentBatches.service, 'KENNEL_REGISTRATION')),
      );
    assert.equal(batches.length, 1, 'exactly one kennel payment ever existed');
    assert.equal(batches[0]!.id, batch.id);
  });
});

test('a failed or cancelled payment keeps the kennel and allows a retry', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ پرداخت');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);

    const failed = await payKennel(ctx, kennel.id, failingGateway);
    assert.equal(failed.outcome.state, 'FAILED');
    assert.equal((await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!.status, 'DRAFT');

    const batch = await startKennelPayment(ctx.testDb.db, ctx.owner.actor, kennel.id);
    const cancelled = await startAttempt(
      ctx.testDb.db,
      ctx.owner.actor,
      { batchId: batch.id, callbackUrl: '/x' },
      failingGateway,
      'test-gateway',
    );
    await cancelAttempt(ctx.testDb.db, { reference: cancelled.reference });
    assert.equal((await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!.status, 'DRAFT');
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 1, 'the selection survives');

    const { outcome } = await payKennel(ctx, kennel.id);
    assert.equal(outcome.state, 'PAID');
    assert.equal((await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!.status, 'READY_TO_SUBMIT');
  });
});

test('editing breeds after approval records the change and starts no new review', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ ویرایش');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);
    await payKennel(ctx, kennel.id);
    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);
    await reviewKennel(ctx.testDb.db, ctx.association.actor, { kennelId: kennel.id, decision: 'APPROVED' });

    await addBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[1]!);
    const after = (await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!;
    assert.equal(after.status, 'APPROVED', 'the kennel is not sent back for review');
    assert.equal((await kennelQueue(ctx.testDb.db, ctx.association.actor)).length, 0);
    assert.equal((await breedsOfKennel(ctx.testDb.db, kennel.id)).length, 2);

    // Before and after, the actor and the time are all recorded.
    const [event] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'KENNEL_BREED_ADDED'));
    assert.ok(event);
    assert.equal(event!.actorAccountId, ctx.owner.accountId);
    assert.ok(event!.before);
    assert.ok(event!.after);
    assert.ok(event!.occurredAt instanceof Date);

    // And no new payment was created by the edit.
    const batches = await ctx.testDb.db
      .select()
      .from(paymentBatches)
      .where(
        and(eq(paymentBatches.accountId, ctx.owner.accountId), eq(paymentBatches.service, 'KENNEL_REGISTRATION')),
      );
    assert.equal(batches.length, 1);

    await removeBreed(ctx.testDb.db, ctx.owner.actor, kennel.id, ctx.breedIds[1]!);
    assert.equal((await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!.status, 'APPROVED');
  });
});

test('no breeder document is stored anywhere in this flow', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ مدارک');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);
    await payKennel(ctx, kennel.id);
    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);
    await reviewKennel(ctx.testDb.db, ctx.association.actor, { kennelId: kennel.id, decision: 'APPROVED' });

    // The kennel row has no document column, and the only stored file for this
    // person is the national card from KYC (§15.1).
    const [row] = await ctx.testDb.db.select().from(kennels).where(eq(kennels.id, kennel.id));
    for (const forbidden of ['documentFileId', 'licenceFileId', 'attachmentId']) {
      assert.equal(Object.keys(row!).includes(forbidden), false, 'unexpected document column: ' + forbidden);
    }
    const files = await ctx.testDb.db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.ownerAccountId, ctx.owner.accountId));
    assert.equal(files.every((f) => f.purpose === 'KYC_NATIONAL_ID'), true);
  });
});

test('a kennel belongs to its owner and a rejection keeps its reason', async () => {
  await withCtx(async (ctx) => {
    await animalWithSheet(ctx, 'سگ دسترسی');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);
    await payKennel(ctx, kennel.id);
    await submitKennel(ctx.testDb.db, ctx.owner.actor, kennel.id);

    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990900005');
    const stranger = actorFor(strangerAccount.accountId);
    await assert.rejects(
      () => saveKennel(ctx.testDb.db, stranger, kennel.id, { nameFa: 'تغییر توسط دیگری' }),
      /پیدا نشد/,
    );
    await assert.rejects(
      () => addBreed(ctx.testDb.db, stranger, kennel.id, ctx.breedIds[1]!),
      /پیدا نشد/,
    );

    await reviewKennel(ctx.testDb.db, ctx.association.actor, {
      kennelId: kennel.id,
      decision: 'REJECTED',
      reasonFa: 'اطلاعات ارائه‌شده قابل تأیید نبود.',
    });
    const [rejected] = await ctx.testDb.db.select().from(kennels).where(eq(kennels.id, kennel.id));
    assert.equal(rejected!.status, 'REJECTED');
    assert.equal(rejected!.reasonFa, 'اطلاعات ارائه‌شده قابل تأیید نبود.');

    // A rejection does not activate anything.
    const roles = await ctx.testDb.db
      .select()
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, ctx.owner.accountId), eq(accountRoles.role, 'BREEDER')));
    assert.equal(roles.length, 0);
  });
});

test('an unconfigured kennel tariff opens no payment path', async () => {
  await withCtx(async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.kennel_registration_toman',
      value: null,
      reason: 'SYNTHETIC — بازگرداندن به تعیین‌نشده',
    });
    await animalWithSheet(ctx, 'سگ بدون تعرفه کنل');
    const kennel = await startKennel(ctx.testDb.db, ctx.owner.actor);
    await completeKennel(ctx, kennel.id);

    await assert.rejects(
      () => startKennelPayment(ctx.testDb.db, ctx.owner.actor, kennel.id),
      /تعیین‌نشده|NOT_CONFIGURED|fee\.kennel_registration_toman/,
    );
    assert.equal((await kennelOfOwner(ctx.testDb.db, ctx.owner.accountId))!.status, 'DRAFT');
  });
});
