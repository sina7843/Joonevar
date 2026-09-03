import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, referenceBreeds } from '../../src/db/schema/core.ts';
import { samples } from '../../src/db/schema/clinical.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { parentageResults } from '../../src/db/schema/genetics.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { applyLineage, registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { confirmImplant, recordChipRead, recordRereadAndBind } from '../../src/clinical/microchip.ts';
import { recordOfficialIdentity } from '../../src/clinical/identity.ts';
import { recordShipment, recordSampling, resample, markSampleUnusable } from '../../src/clinical/samples.ts';
import { createSheetRequest } from '../../src/documents/registration-sheet.ts';
import {
  attachReceiptFile,
  centreDetails,
  createReceipt,
  finalResultOf,
  parentResultCheck,
  pedigreeReadiness,
  receiptQueue,
  receiveSample,
  recordResult,
  refreshWaitingResult,
  reviewReceipt,
  startProcessing,
  submitReceipt,
} from '../../src/genetics/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
/** SYNTHETIC values: no real tariff, account or card number is used here. */
const SHEET_FEE = '250000';
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
  readonly vetTwo: Party;
  readonly locationId: string;
  readonly breedId: string;
}

async function approved(testDb: TestDb, root: string, operator: Actor, mobile: string, nationalId: string) {
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

async function payMembership(testDb: TestDb, actor: Actor) {
  const batch = await startMembershipPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const started = await startAttempt(testDb.db, actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, 'test');
  assert.equal((await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');
}

async function withCtx(fn: (ctx: Ctx) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-genetics-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990700099');
    const operator = actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR');
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990700098');
    const admin: Party = { accountId: adminAccount.accountId, actor: actorFor(adminAccount.accountId, 'SUPERADMIN') };
    const centreAccount = await signInWithVerifiedMobile(testDb.db, '09990700097');
    const centre: Party = {
      accountId: centreAccount.accountId,
      actor: actorFor(centreAccount.accountId, 'GENETICS_OPERATOR'),
    };

    const owner = await approved(testDb, root, operator, '09990700001', '0499370899');
    await payMembership(testDb, owner.actor);

    const makeVet = async (mobile: string, nationalId: string, name: string, council: string) => {
      const party = await approved(testDb, root, operator, mobile, nationalId);
      await testDb.db
        .insert(accountRoles)
        .values({ accountId: party.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
      await payMembership(testDb, party.actor);
      await upsertVetProfile(testDb.db, admin.actor, { mobile, displayNameFa: name, councilCode: council });
      const location = await addLocation(testDb.db, admin.actor, party.accountId, {
        nameFa: name + ' — کلینیک',
        cityFa: 'تهران',
        addressFa: 'نشانی نمونه',
        phone: '02100000000',
        licenceStatus: 'VALID',
        canImplantMicrochip: true,
        canDrawBloodSample: true,
      });
      return {
        party: { accountId: party.accountId, actor: actorFor(party.accountId, 'TRUSTED_VET') },
        locationId: location.id,
      };
    };

    const one = await makeVet('09990700002', '0790419904', 'دامپزشک یک', 'SYNTH-GEN-1');
    const two = await makeVet('09990700003', '0084575948', 'دامپزشک دو', 'SYNTH-GEN-2');

    for (const [key, value] of [
      ['fee.registration_sheet_toman', SHEET_FEE],
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
      vet: one.party,
      vetTwo: two.party,
      locationId: one.locationId,
      breedId: breed!.id,
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

let chipCounter = 0;
const nextChip = () => '90000000' + String(2_000_000 + (chipCounter += 1));

/**
 * One animal all the way to an issued registration sheet: chip, sample, batch
 * payment and issuance, which is what §14.1 requires before this route opens.
 */
async function animalWithSheet(
  ctx: Ctx,
  name: string,
  options: { pedigreeCode?: string; sire?: string; dam?: string } = {},
) {
  const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
    name,
    breedId: ctx.breedId,
    sex: 'MALE',
    birthDate: '2022-01-01',
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
    ...(options.sire || options.dam
      ? { origin: 'INTERNAL_G1PLUS' as const, sirePedigreeCode: options.sire, damPedigreeCode: options.dam }
      : {}),
  });
  if (options.sire || options.dam) await applyLineage(ctx.testDb.db, ctx.owner.actor, draft.id);
  const animal = await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id);
  if (options.pedigreeCode) {
    // SYNTHETIC pedigree code: issuance belongs to a later prompt.
    await ctx.testDb.db
      .update(animals)
      .set({ pedigreeCode: options.pedigreeCode })
      .where(eq(animals.id, animal.id));
  }

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

  return { animalId: animal.id, requestId, sample };
}

/** Receipt → approval → shipment → arrival → processing. */
async function throughTheCentre(ctx: Ctx, animalIds: readonly string[]) {
  const receipt = await createReceipt(ctx.testDb.db, ctx.owner.actor, animalIds);
  await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.owner.actor, receipt.id, { bytes: JPEG });
  await submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id);
  await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });
  return receipt;
}

async function shipAndReceive(ctx: Ctx, sampleId: string) {
  await recordShipment(ctx.testDb.db, ctx.vet.actor, sampleId, 'پست پیشتاز');
  await receiveSample(ctx.testDb.db, ctx.centre.actor, sampleId);
  await startProcessing(ctx.testDb.db, ctx.centre.actor, sampleId);
}

test('the pedigree route needs a sheet and reuses the sample already on record', async () => {
  await withCtx(async (ctx) => {
    // An animal with a chip and a sample but no registration sheet is not ready.
    const draft = await startDraft(ctx.testDb.db, ctx.owner.actor, { forceNew: true });
    await saveDraft(ctx.testDb.db, ctx.owner.actor, draft.id, {
      name: 'سگ بدون برگه',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2022-01-01',
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
    });
    const bare = await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id);
    const readiness = await pedigreeReadiness(ctx.testDb.db, ctx.owner.accountId, bare.id);
    assert.equal(readiness.ready, false);
    assert.match(readiness.reasonFa ?? '', /برگه ثبتی/);
    await assert.rejects(() => createReceipt(ctx.testDb.db, ctx.owner.actor, [bare.id]), /برگه ثبتی/);

    // With a sheet, the sample and its custodian are the ones already recorded.
    const ready = await animalWithSheet(ctx, 'سگ آماده');
    const view = await pedigreeReadiness(ctx.testDb.db, ctx.owner.accountId, ready.animalId);
    assert.equal(view.ready, true);
    assert.equal(view.sampleTrackingCode, ready.sample!.trackingCode);
    assert.equal(view.custodyAccountId, ctx.vet.accountId, 'the custodian is the vet who took it');
  });
});

test('an unconfigured centre opens no receipt path and invents no account number', async () => {
  await withCtx(async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'genetics_centre.payment_account',
      value: null,
      reason: 'SYNTHETIC — بازگرداندن به تعیین‌نشده',
    });
    const details = await centreDetails(ctx.testDb.db);
    assert.equal(details.configured, false);
    assert.equal(details.paymentAccount, null);

    const ready = await animalWithSheet(ctx, 'سگ بدون اطلاعات مرکز');
    await assert.rejects(
      () => createReceipt(ctx.testDb.db, ctx.owner.actor, [ready.animalId]),
      /اطلاعات پرداخت مرکز/,
    );
  });
});

test('a rejected receipt is corrected in place and keeps its sample codes', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ فیش');
    const receipt = await createReceipt(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);

    // Submitting without a file is refused rather than queued empty.
    await assert.rejects(() => submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id), /تصویر فیش/);

    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.owner.actor, receipt.id, { bytes: JPEG });
    await submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id);
    assert.equal((await receiptQueue(ctx.testDb.db, ctx.centre.actor)).length, 1);

    // A correction needs a reason, and the sample stays with the veterinarian.
    await assert.rejects(
      () => reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'NEEDS_CORRECTION', reasonFa: ' ' }),
      /دلیل/,
    );
    await reviewReceipt(ctx.testDb.db, ctx.centre.actor, {
      receiptId: receipt.id,
      decision: 'NEEDS_CORRECTION',
      reasonFa: 'مبلغ فیش با تعداد نمونه‌ها نمی‌خواند.',
    });
    const [sample] = await ctx.testDb.db.select().from(samples).where(eq(samples.id, ready.sample!.id));
    assert.equal(sample!.status, 'IN_CUSTODY', 'nothing is asked to be sent on a rejected receipt');

    // The same receipt is fixed and resubmitted; the sample codes are unchanged.
    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.owner.actor, receipt.id, { bytes: JPEG });
    const resubmitted = await submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id);
    assert.equal(resubmitted.id, receipt.id);
    await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });

    const [after] = await ctx.testDb.db.select().from(samples).where(eq(samples.id, ready.sample!.id));
    assert.equal(after!.status, 'SEND_INSTRUCTED');
    // The payer and the actual custodian are both told.
    const alerts = await ctx.testDb.db.select().from(notifications);
    assert.ok(alerts.some((n) => n.kind === 'GENETICS_RECEIPT_APPROVED' && n.recipientAccountId === ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'SAMPLE_SEND_INSTRUCTED' && n.recipientAccountId === ctx.vet.accountId));
  });
});

test('only the custodian ships, and the code stays the same all the way', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ ارسال');
    await throughTheCentre(ctx, [ready.animalId]);

    // Another veterinarian cannot ship somebody else's sample.
    await assert.rejects(
      () => recordShipment(ctx.testDb.db, ctx.vetTwo.actor, ready.sample!.id, 'تلاش دامپزشک دیگر'),
      /پیدا نشد/,
    );

    const shipped = await recordShipment(ctx.testDb.db, ctx.vet.actor, ready.sample!.id, 'پست پیشتاز ۱');
    assert.equal(shipped.trackingCode, ready.sample!.trackingCode);
    await receiveSample(ctx.testDb.db, ctx.centre.actor, ready.sample!.id);
    const [received] = await ctx.testDb.db.select().from(samples).where(eq(samples.id, ready.sample!.id));
    assert.equal(received!.status, 'RECEIVED');
    assert.equal(received!.trackingCode, ready.sample!.trackingCode, 'no second identifier is minted');

    // The centre cannot receive a sample that was never shipped.
    const other = await animalWithSheet(ctx, 'سگ ارسال‌نشده');
    await assert.rejects(() => receiveSample(ctx.testDb.db, ctx.centre.actor, other.sample!.id), /ارسال نشده/);
  });
});

test('processing and a Hamzist issuance payment are independent branches', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ پردازش');
    await throughTheCentre(ctx, [ready.animalId]);
    await shipAndReceive(ctx, ready.sample!.id);

    // No pedigree issuance payment exists, and the result is recorded anyway.
    const result = await recordResult(ctx.testDb.db, ctx.centre.actor, {
      sampleId: ready.sample!.id,
      technicalNoteFa: 'پردازش استاندارد.',
    });
    assert.equal(result.status, 'FINAL');
    assert.equal(await finalResultOf(ctx.testDb.db, ready.animalId) !== null, true);

    // One genetic output, one identifier: there is no second result record.
    const rows = await ctx.testDb.db
      .select()
      .from(parentageResults)
      .where(eq(parentageResults.animalId, ready.animalId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.resultVersion, 1);
  });
});

test('a G1+ result waits for both parents and finalises when they are complete', async () => {
  await withCtx(async (ctx) => {
    const sire = await animalWithSheet(ctx, 'پدر', { pedigreeCode: 'HZ-GEN-S' });
    const dam = await animalWithSheet(ctx, 'مادر', { pedigreeCode: 'HZ-GEN-D' });
    const child = await animalWithSheet(ctx, 'فرزند', { sire: 'HZ-GEN-S', dam: 'HZ-GEN-D' });

    const [childRow] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, child.animalId));
    assert.equal(childRow!.generation, 1, 'the child really is G1');

    await throughTheCentre(ctx, [sire.animalId, dam.animalId, child.animalId]);
    for (const row of [sire, dam, child]) await shipAndReceive(ctx, row.sample!.id);

    // Neither parent has a result yet, so the child waits.
    const waiting = await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: child.sample!.id });
    assert.equal(waiting.status, 'WAITING_PARENT_RESULTS');
    assert.equal(await finalResultOf(ctx.testDb.db, child.animalId), null);
    const check = await parentResultCheck(ctx.testDb.db, child.animalId);
    assert.equal(check.state, 'WAITING');
    assert.match(check.state === 'WAITING' ? check.missingFa : '', /پدر و مادر/);

    // One parent is not enough.
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: sire.sample!.id });
    await assert.rejects(() => refreshWaitingResult(ctx.testDb.db, ctx.centre.actor, waiting.id), /مادر/);

    // With both parents final, the same result becomes final — not a new one.
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: dam.sample!.id });
    const finalised = await refreshWaitingResult(ctx.testDb.db, ctx.centre.actor, waiting.id);
    assert.equal(finalised.id, waiting.id, 'the same result is finalised, not duplicated');
    assert.equal(finalised.status, 'FINAL');
    assert.ok(finalised.sireResultId);
    assert.ok(finalised.damResultId);

    const rows = await ctx.testDb.db
      .select()
      .from(parentageResults)
      .where(eq(parentageResults.animalId, child.animalId));
    assert.equal(rows.length, 1);
  });
});

test('a G0 animal gets its result attached directly', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ G0');
    const [row] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, ready.animalId));
    assert.equal(row!.generation, 0);

    const check = await parentResultCheck(ctx.testDb.db, ready.animalId);
    assert.equal(check.state, 'READY');
    assert.equal(check.state === 'READY' && check.sireResultId, null);

    await throughTheCentre(ctx, [ready.animalId]);
    await shipAndReceive(ctx, ready.sample!.id);
    const result = await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: ready.sample!.id });
    assert.equal(result.status, 'FINAL');
    assert.equal(result.animalId, ready.animalId);
  });
});

test('an unusable sample at the centre goes back to the existing resampling path', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ نمونه خراب');
    await throughTheCentre(ctx, [ready.animalId]);
    await recordShipment(ctx.testDb.db, ctx.vet.actor, ready.sample!.id, 'پست پیشتاز');
    await receiveSample(ctx.testDb.db, ctx.centre.actor, ready.sample!.id);

    await markSampleUnusable(
      ctx.testDb.db,
      ctx.centre.actor,
      ready.sample!.id,
      'INVALID',
      'نمونه برای آزمایش مناسب نبود.',
    );
    // No result can be recorded on it any more.
    await assert.rejects(
      () => recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: ready.sample!.id }),
      /در حال پردازش/,
    );

    // Resampling happens at the veterinarian, on the same request, with history.
    const second = await resample(ctx.testDb.db, ctx.vet.actor, ready.requestId);
    assert.notEqual(second.trackingCode, ready.sample!.trackingCode);
    const rows = await ctx.testDb.db.select().from(samples).where(eq(samples.animalId, ready.animalId));
    assert.equal(rows.length, 2, 'the invalid sample stays on record');
    assert.equal(rows.find((r) => r.id === ready.sample!.id)?.unusableReasonFa, 'نمونه برای آزمایش مناسب نبود.');
  });
});

test('the centre has no authority over ownership, the microchip or a permit', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ محدوده اختیار');
    await throughTheCentre(ctx, [ready.animalId]);

    // It cannot act as an owner on the animal, and it cannot do desk work.
    const { editAnimal } = await import('../../src/animals/service.ts');
    await assert.rejects(
      () => editAnimal(ctx.testDb.db, ctx.centre.actor, ready.animalId, { name: 'تغییر توسط مرکز' }),
      /پیدا نشد/,
    );
    const { recordChipRead: read } = await import('../../src/clinical/microchip.ts');
    await assert.rejects(
      () => read(ctx.testDb.db, ctx.centre.actor, ready.requestId, { number: nextChip(), method: 'MANUAL' }),
      /دامپزشک معتمد/,
    );
    // And it cannot ship a sample it does not hold.
    await assert.rejects(
      () => recordShipment(ctx.testDb.db, ctx.centre.actor, ready.sample!.id, 'تلاش مرکز'),
      /پیدا نشد/,
    );
  });
});

test('receipt review, receiving and results belong to the centre alone', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ مجوز');
    const receipt = await createReceipt(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.owner.actor, receipt.id, { bytes: JPEG });
    await submitReceipt(ctx.testDb.db, ctx.owner.actor, receipt.id);

    for (const actor of [ctx.owner.actor, ctx.vet.actor, ctx.admin.actor]) {
      await assert.rejects(
        () => reviewReceipt(ctx.testDb.db, actor, { receiptId: receipt.id, decision: 'APPROVED' }),
        /مرکز ژنتیک/,
      );
      await assert.rejects(() => receiveSample(ctx.testDb.db, actor, ready.sample!.id), /مرکز ژنتیک/);
      await assert.rejects(
        () => recordResult(ctx.testDb.db, actor, { sampleId: ready.sample!.id }),
        /مرکز ژنتیک/,
      );
    }

    // The owner cannot read somebody else's receipt either.
    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990700005');
    const { ownerReceipt } = await import('../../src/genetics/service.ts');
    await assert.rejects(
      () => ownerReceipt(ctx.testDb.db, actorFor(strangerAccount.accountId), receipt.id),
      /پیدا نشد/,
    );
  });
});

test('the whole path leaves an audit trail on the same sample code', async () => {
  await withCtx(async (ctx) => {
    const ready = await animalWithSheet(ctx, 'سگ تاریخچه');
    await throughTheCentre(ctx, [ready.animalId]);
    await shipAndReceive(ctx, ready.sample!.id);
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: ready.sample!.id });

    const actions = (await ctx.testDb.db.select().from(auditEvents)).map((row) => row.action);
    for (const action of [
      'GENETICS_RECEIPT_CREATED',
      'GENETICS_RECEIPT_SUBMITTED',
      'GENETICS_RECEIPT_REVIEWED',
      'SAMPLE_SHIPPED',
      'SAMPLE_RECEIVED',
      'SAMPLE_PROCESSING_STARTED',
      'PARENTAGE_RESULT_RECORDED',
    ]) {
      assert.ok(actions.includes(action), 'missing audit action: ' + action);
    }
  });
});
