import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, referenceBreeds } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { paymentItems } from '../../src/db/schema/billing.ts';
import { parentageResults } from '../../src/db/schema/genetics.ts';
import { pedigrees, postalRequests } from '../../src/db/schema/pedigree.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { confirmImplant, recordChipRead, recordRereadAndBind } from '../../src/clinical/microchip.ts';
import { recordOfficialIdentity } from '../../src/clinical/identity.ts';
import { recordSampling, recordShipment } from '../../src/clinical/samples.ts';
import { createSheetRequest, sheetOfAnimal } from '../../src/documents/registration-sheet.ts';
import {
  attachReceiptFile,
  createReceipt,
  receiveSample,
  recordResult,
  reviewReceipt,
  startProcessing,
  submitReceipt,
} from '../../src/genetics/service.ts';
import {
  createIssuanceRequest,
  itemsOfBatch,
  pedigreeForOwner,
  pedigreeOfAnimal,
  pedigreeReadiness,
  retryIssuance,
} from '../../src/documents/pedigree.ts';
import { answerAppeal, appealQueue, submitAppeal, takeAppeal } from '../../src/genetics/appeals.ts';
import { createPostalRequest, postalRequestsOfOwner } from '../../src/documents/postal.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
/** SYNTHETIC values: no real tariff, account or card number is used here. */
const SHEET_FEE = '250000';
const PEDIGREE_FEE = '400000';
const CENTRE_NAME = 'SYNTHETIC مرکز ژنتیک آزمایشی';
const CENTRE_ACCOUNT = 'SYNTHETIC-TEST-ACCOUNT';

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
  readonly admin: Party;
  readonly centre: Party;
  readonly vet: Party;
  readonly locationId: string;
  readonly breedId: string;
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-pedigree-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990800099');
    const operator = actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR');
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990800098');
    const admin: Party = { accountId: adminAccount.accountId, actor: actorFor(adminAccount.accountId, 'SUPERADMIN') };
    const centreAccount = await signInWithVerifiedMobile(testDb.db, '09990800097');
    const centre: Party = {
      accountId: centreAccount.accountId,
      actor: actorFor(centreAccount.accountId, 'GENETICS_OPERATOR'),
    };

    const owner = await approved(testDb, root, operator, '09990800001', '0499370899');
    await payMembership(testDb, owner.actor);

    const vetParty = await approved(testDb, root, operator, '09990800002', '0790419904');
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vetParty.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await payMembership(testDb, vetParty.actor);
    await upsertVetProfile(testDb.db, admin.actor, {
      mobile: '09990800002',
      displayNameFa: 'دامپزشک نمونه',
      councilCode: 'SYNTH-PED-1',
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
      ['fee.pedigree_toman', PEDIGREE_FEE],
      ['genetics_centre.name', CENTRE_NAME],
      ['genetics_centre.payment_account', CENTRE_ACCOUNT],
    ] as const) {
      await updateSetting(testDb.db, admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
    }

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);

    await fn({
      testDb,
      root,
      owner,
      admin,
      centre,
      vet: { accountId: vetParty.accountId, actor: actorFor(vetParty.accountId, 'TRUSTED_VET') },
      locationId: location.id,
      breedId: breed!.id,
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

let chipCounter = 0;
const nextChip = () => '90000000' + String(3_000_000 + (chipCounter += 1));

/** An animal taken all the way to an issued registration sheet. */
async function animalWithSheet(ctx: Ctx, name: string) {
  const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
    name,
    breedId: ctx.breedId,
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
    breedId: ctx.breedId,
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
  const sample = await recordSampling(ctx.testDb.db, ctx.vet.actor, requestId);

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

  return { animalId: animal.id, requestId, sample };
}

/** Receipt, shipment, arrival and processing, ready for a result. */
async function throughTheCentre(ctx: Ctx, animalId: string, sampleId: string) {
  const receipt = await createReceipt(ctx.testDb.db, ctx.owner.actor, [animalId]);
  await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.owner.actor, receipt.id, { bytes: JPEG });
  await submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id);
  await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });
  await recordShipment(ctx.testDb.db, ctx.vet.actor, sampleId, 'پست پیشتاز');
  await receiveSample(ctx.testDb.db, ctx.centre.actor, sampleId);
  await startProcessing(ctx.testDb.db, ctx.centre.actor, sampleId);
  return receipt;
}

async function payIssuance(ctx: Ctx, batchId: string, amountRial = 4_000_000n) {
  const gateway = payingGateway(amountRial);
  const started = await startAttempt(
    ctx.testDb.db,
    ctx.owner.actor,
    { batchId, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  return { started, outcome: await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects) };
}

test('a paid issuance waits for the result, and finishes when the result arrives', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ پرداخت اول');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);

    // The result is not there yet, so issuance cannot even be requested.
    const readiness = await pedigreeReadiness(ctx.testDb.db, ctx.owner.accountId, animal.animalId);
    assert.equal(readiness.ready, false);
    assert.match(readiness.reasonFa ?? '', /نتیجه Parentage/);
    await assert.rejects(
      () => createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]),
      /نتیجه Parentage/,
    );

    // The result arrives, then the payment: the second one finishes the join.
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });
    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]);
    assert.equal(await pedigreeOfAnimal(ctx.testDb.db, animal.animalId), null, 'no document before payment');

    const { outcome } = await payIssuance(ctx, created.batch.id);
    assert.equal(outcome.state, 'PAID');
    const document = await pedigreeOfAnimal(ctx.testDb.db, animal.animalId);
    assert.ok(document);
    assert.match(document!.pedigreeCode, /^PD-/);
    assert.equal(document!.issuedFromResultVersion, 1);
  });
});

test('a payment made before the result blocks that item and issues it later, with no new money', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ آماده');
    const waiting = await animalWithSheet(ctx, 'سگ در انتظار نتیجه');
    await throughTheCentre(ctx, ready.animalId, ready.sample!.id);
    await throughTheCentre(ctx, waiting.animalId, waiting.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: ready.sample!.id });

    // Only the animal with a final result may enter the checkout.
    await assert.rejects(
      () => createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId, waiting.animalId]),
      /نتیجه Parentage/,
    );

    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    const before = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    await payIssuance(ctx, created.batch.id);
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, ready.animalId));

    // The other animal's result arrives afterwards and needs its own checkout.
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: waiting.sample!.id });
    const second = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [waiting.animalId]);
    await payIssuance(ctx, second.batch.id);
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, waiting.animalId));

    const after = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.deepEqual(after.map((l) => l.amountToman), before.map((l) => l.amountToman));
  });
});

test('a blocked item in a paid batch is issued later without any new payment', async () => {
  await withCtx(async (ctx) => {
    const first = await animalWithSheet(ctx, 'سگ یک');
    const second = await animalWithSheet(ctx, 'سگ دو');
    await throughTheCentre(ctx, first.animalId, first.sample!.id);
    await throughTheCentre(ctx, second.animalId, second.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: first.sample!.id });
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: second.sample!.id });

    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [
      first.animalId,
      second.animalId,
    ]);
    // The second result is withdrawn to a waiting state before the payment lands.
    await ctx.testDb.db
      .update(parentageResults)
      .set({ status: 'WAITING_PARENT_RESULTS' })
      .where(eq(parentageResults.animalId, second.animalId));

    await payIssuance(ctx, created.batch.id, 8_000_000n);
    const items = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    assert.equal(items.find((i) => i.animalId === first.animalId)?.state, 'ISSUED');
    assert.equal(items.find((i) => i.animalId === second.animalId)?.state, 'BLOCKED');
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, first.animalId), 'a partial success is a real success');

    // The result becomes final again and the same paid item is issued.
    await ctx.testDb.db
      .update(parentageResults)
      .set({ status: 'FINAL' })
      .where(eq(parentageResults.animalId, second.animalId));
    const retried = await retryIssuance(ctx.testDb.db, ctx.owner.actor, created.batch.id);
    assert.equal(retried.every((i) => i.state === 'ISSUED'), true);
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, second.animalId));
  });
});

test('a repeated callback and a repeated issuance produce exactly one pedigree', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ تکرار');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });
    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]);
    const gateway = payingGateway(4_000_000n);
    const { started } = await payIssuance(ctx, created.batch.id);

    await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
    await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
    await retryIssuance(ctx.testDb.db, ctx.owner.actor, created.batch.id);

    const rows = await ctx.testDb.db.select().from(pedigrees).where(eq(pedigrees.animalId, animal.animalId));
    assert.equal(rows.length, 1);
    const issued = (await ctx.testDb.db.select().from(auditEvents).where(eq(auditEvents.action, 'PEDIGREE_ISSUED')));
    assert.equal(issued.length, 1);

    // The animal carries the pedigree code, and it is the document's code.
    const [row] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, animal.animalId));
    assert.equal(row!.pedigreeCode, rows[0]!.pedigreeCode);
  });
});

test('the result stays visible when the issuance payment never happens', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ بدون پرداخت صدور');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    const result = await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });

    assert.equal(result.status, 'FINAL');
    const { ownerResult } = await import('../../src/genetics/service.ts');
    const visible = await ownerResult(ctx.testDb.db, ctx.owner.actor, animal.animalId);
    assert.equal(visible?.id, result.id, 'the result is readable without any issuance payment');
    assert.equal(await pedigreeOfAnimal(ctx.testDb.db, animal.animalId), null, 'only the document waits');

    // And the centre receipt on its own is not the issuance payment.
    const readiness = await pedigreeReadiness(ctx.testDb.db, ctx.owner.accountId, animal.animalId);
    assert.equal(readiness.ready, true, 'ready to be paid for, not already issued');
  });
});

test('an appeal never edits the result, and a correction is a new version', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ اعتراض');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    const original = await recordResult(ctx.testDb.db, ctx.centre.actor, {
      sampleId: animal.sample!.id,
      technicalNoteFa: 'نتیجه اولیه.',
    });

    const appeal = await submitAppeal(ctx.testDb.db, ctx.owner.actor, {
      resultId: original.id,
      messageFa: 'نتیجه با سابقه نسب این حیوان هم‌خوان نیست.',
    });
    assert.equal(appeal.status, 'SUBMITTED');
    // A second open appeal on the same result is refused.
    await assert.rejects(
      () =>
        submitAppeal(ctx.testDb.db, ctx.owner.actor, {
          resultId: original.id,
          messageFa: 'دوباره همان اعتراض را ثبت می‌کنم.',
        }),
      /اعتراض بازی/,
    );
    // The owner has no way to answer their own appeal.
    await assert.rejects(
      () => answerAppeal(ctx.testDb.db, ctx.owner.actor, { appealId: appeal.id, responseFa: 'تأیید خودم' }),
      /مرکز ژنتیک/,
    );

    assert.equal((await appealQueue(ctx.testDb.db, ctx.centre.actor)).length, 1);
    await takeAppeal(ctx.testDb.db, ctx.centre.actor, appeal.id);
    const answered = await answerAppeal(ctx.testDb.db, ctx.centre.actor, {
      appealId: appeal.id,
      responseFa: 'بازبینی انجام شد و نتیجه اصلاح می‌شود.',
      correctResult: { technicalNoteFa: 'نتیجه اصلاحی پس از بازبینی.' },
    });
    assert.equal(answered.status, 'ANSWERED');
    assert.ok(answered.correctedResultId);

    // Both versions exist; the disputed one is untouched and still linked.
    const rows = await ctx.testDb.db
      .select()
      .from(parentageResults)
      .where(eq(parentageResults.animalId, animal.animalId));
    assert.equal(rows.length, 2);
    const kept = rows.find((r) => r.id === original.id)!;
    assert.equal(kept.resultVersion, 1);
    assert.equal(kept.technicalNoteFa, 'نتیجه اولیه.');
    const corrected = rows.find((r) => r.id === answered.correctedResultId)!;
    assert.equal(corrected.resultVersion, 2);
    assert.equal(corrected.supersedesResultId, original.id);
  });
});

test('a corrected result leaves an already issued document exactly as it was', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ سند صادرشده');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    const original = await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });
    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]);
    await payIssuance(ctx, created.batch.id);
    const before = (await pedigreeOfAnimal(ctx.testDb.db, animal.animalId))!;

    const appeal = await submitAppeal(ctx.testDb.db, ctx.owner.actor, {
      resultId: original.id,
      messageFa: 'درخواست بازبینی نتیجه این حیوان را دارم.',
    });
    await takeAppeal(ctx.testDb.db, ctx.centre.actor, appeal.id);
    await answerAppeal(ctx.testDb.db, ctx.centre.actor, {
      appealId: appeal.id,
      responseFa: 'نتیجه اصلاح شد.',
      correctResult: {},
    });

    const after = (await pedigreeOfAnimal(ctx.testDb.db, animal.animalId))!;
    assert.equal(after.id, before.id, 'no second document');
    assert.equal(after.pedigreeCode, before.pedigreeCode);
    assert.equal(after.issuedFromResultId, before.issuedFromResultId, 'provenance is unchanged');
    assert.equal(after.issuedFromResultVersion, 1);
    assert.equal(after.issuedAt.getTime(), before.issuedAt.getTime());
    // What changed is a notice beside it, and the owner was told.
    assert.match(after.correctionNoticeFa ?? '', /نسخه ۲|نسخه 2/);
    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'PEDIGREE_CORRECTION_NOTICED'));
    const trail = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PEDIGREE_CORRECTION_NOTICED'));
    assert.equal(trail.length, 1);
  });
});

test('a pedigree belongs to its owner and unlocks the next service', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ دسترسی');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });

    const before = await eligibilityFor(ctx.testDb.db, ctx.owner.accountId, 'MATING_PERMIT');
    assert.equal(before.allowed, false);

    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]);
    await payIssuance(ctx, created.batch.id);
    const document = (await pedigreeOfAnimal(ctx.testDb.db, animal.animalId))!;

    assert.equal((await pedigreeForOwner(ctx.testDb.db, ctx.owner.actor, document.id)).id, document.id);
    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990800005');
    await assert.rejects(
      () => pedigreeForOwner(ctx.testDb.db, actorFor(strangerAccount.accountId), document.id),
      /پیدا نشد/,
    );
    await assert.rejects(() => pedigreeForOwner(ctx.testDb.db, ctx.centre.actor, document.id), /پیدا نشد/);

    const after = await eligibilityFor(ctx.testDb.db, ctx.owner.accountId, 'MATING_PERMIT');
    assert.equal(after.allowed, true, 'the issued pedigree is what opens the permit step');
  });
});

test('a postal request is tied to an issued document and claims no dispatch', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ پستی');
    const sheet = (await sheetOfAnimal(ctx.testDb.db, animal.animalId))!;

    // A document that is not this person's cannot be posted.
    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990800006');
    await assert.rejects(
      () =>
        createPostalRequest(ctx.testDb.db, actorFor(strangerAccount.accountId), {
          documentType: 'REGISTRATION_SHEET',
          documentId: sheet.id,
          recipientNameFa: 'گیرنده آزمایشی',
          recipientPhone: '09990000000',
          addressFa: 'نشانی آزمایشی',
        }),
      /پیدا نشد/,
    );

    // An address is required on the request, but never on the KYC profile.
    await assert.rejects(
      () =>
        createPostalRequest(ctx.testDb.db, ctx.owner.actor, {
          documentType: 'REGISTRATION_SHEET',
          documentId: sheet.id,
          recipientNameFa: 'گیرنده آزمایشی',
          recipientPhone: '09990000000',
          addressFa: '  ',
        }),
      /نشانی/,
    );

    const created = await createPostalRequest(ctx.testDb.db, ctx.owner.actor, {
      documentType: 'REGISTRATION_SHEET',
      documentId: sheet.id,
      recipientNameFa: 'گیرنده آزمایشی',
      recipientPhone: '09990000000',
      cityFa: 'تهران',
      addressFa: 'نشانی آزمایشی ۱',
    });
    assert.equal(created.documentId, sheet.id);

    // The record has no carrier, tariff, label, tracking or delivery field.
    const columns = Object.keys(created);
    for (const forbidden of ['trackingCode', 'carrier', 'shippingFee', 'labelUrl', 'deliveredAt', 'status']) {
      assert.equal(columns.includes(forbidden), false, 'unexpected shipping field: ' + forbidden);
    }
    const rows = await postalRequestsOfOwner(ctx.testDb.db, ctx.owner.actor);
    assert.equal(rows.length, 1);
    const stored = await ctx.testDb.db.select().from(postalRequests).where(eq(postalRequests.id, created.id));
    assert.equal(stored.length, 1);
  });
});

test('a postal request can be made for an issued pedigree as well', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ پستی شجره');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });
    const created = await createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]);
    await payIssuance(ctx, created.batch.id);
    const document = (await pedigreeOfAnimal(ctx.testDb.db, animal.animalId))!;

    const request = await createPostalRequest(ctx.testDb.db, ctx.owner.actor, {
      documentType: 'PEDIGREE',
      documentId: document.id,
      recipientNameFa: 'گیرنده آزمایشی',
      recipientPhone: '09990000000',
      addressFa: 'نشانی آزمایشی ۲',
    });
    assert.equal(request.documentType, 'PEDIGREE');
    assert.equal(request.documentId, document.id);

    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'POSTAL_REQUEST_SUBMITTED'));
  });
});

test('an unconfigured pedigree tariff opens no payment path', async () => {
  await withCtx(async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.pedigree_toman',
      value: null,
      reason: 'SYNTHETIC — بازگرداندن به تعیین‌نشده',
    });
    const animal = await animalWithSheet(ctx, 'سگ بدون تعرفه صدور');
    await throughTheCentre(ctx, animal.animalId, animal.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sample!.id });

    await assert.rejects(
      () => createIssuanceRequest(ctx.testDb.db, ctx.owner.actor, [animal.animalId]),
      /تعیین‌نشده|NOT_CONFIGURED|fee\.pedigree_toman/,
    );
    assert.equal(await pedigreeOfAnimal(ctx.testDb.db, animal.animalId), null);
  });
});
