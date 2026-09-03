import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, referenceBreeds } from '../../src/db/schema/core.ts';
import { paymentBatches, paymentItems } from '../../src/db/schema/billing.ts';
import { registrationSheetItems, registrationSheets } from '../../src/db/schema/documents.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { samples } from '../../src/db/schema/clinical.ts';
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
import { markSampleUnusable, recordSampling } from '../../src/clinical/samples.ts';
import {
  createSheetRequest,
  itemsOfBatch,
  readinessOf,
  retryIssuance,
  selectableAnimals,
  sheetForOwner,
  sheetOfAnimal,
} from '../../src/documents/registration-sheet.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
/** SYNTHETIC tariff: the real registration-sheet fee has not been published. */
const SHEET_FEE = '250000';

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-sheet-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990600099');
    const operator = actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR');
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990600098');
    const admin: Party = { accountId: adminAccount.accountId, actor: actorFor(adminAccount.accountId, 'SUPERADMIN') };

    const owner = await approved(testDb, root, operator, '09990600001', '0499370899');
    await payMembership(testDb, owner.actor);

    const vetParty = await approved(testDb, root, operator, '09990600002', '0790419904');
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vetParty.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
    await payMembership(testDb, vetParty.actor);
    await upsertVetProfile(testDb.db, admin.actor, {
      mobile: '09990600002',
      displayNameFa: 'دامپزشک نمونه',
      councilCode: 'SYNTH-SHEET-1',
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

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);

    await fn({
      testDb,
      root,
      owner,
      admin,
      vet: { accountId: vetParty.accountId, actor: actorFor(vetParty.accountId, 'TRUSTED_VET') },
      locationId: location.id,
      breedId: breed!.id,
    });
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

/** The real tariff is unknown, so the test enters a clearly synthetic one. */
async function setSheetFee(ctx: Ctx, value: string | null = SHEET_FEE) {
  await updateSetting(ctx.testDb.db, ctx.admin.actor, {
    key: 'fee.registration_sheet_toman',
    value,
    reason: 'SYNTHETIC — مقدار آزمایشی',
  });
}

let chipCounter = 0;
const nextChip = () => '90000000' + String(1_000_000 + (chipCounter += 1));

/** Takes one animal all the way through microchip and sampling. */
/** Just the owner's own registration: nothing has been certified or chipped. */
async function plainAnimal(ctx: Ctx, name: string) {
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
  return { animalId: animal.id };
}

/** The paid visit: identity certified, chip bound, sample taken. */
async function runMicrochipVisit(ctx: Ctx, animalId: string, name: string) {
  const created = await createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
    context: 'MICROCHIP',
    vetAccountId: ctx.vet.accountId,
    locationId: ctx.locationId,
    items: [{ animalId, serviceType: 'MICROCHIP_IMPLANT' }],
  });
  const requestId = created.items[0]!.request.id;
  await checkIn(ctx.testDb.db, ctx.vet.actor, {
    code: created.items[0]!.referral.code,
    locationId: ctx.locationId,
  });
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
  await recordSampling(ctx.testDb.db, ctx.vet.actor, requestId);
  return requestId;
}

async function readyAnimal(ctx: Ctx, name: string, options: { sample?: boolean } = {}) {
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
  // §13: the identity is certified at the desk before the chip is bound.
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

  const sample = options.sample === false ? null : await recordSampling(ctx.testDb.db, ctx.vet.actor, requestId);
  return { animalId: animal.id, requestId, number, sample };
}

async function payBatch(ctx: Ctx, batchId: string, gateway = payingGateway(2_500_000n)) {
  const started = await startAttempt(
    ctx.testDb.db,
    ctx.owner.actor,
    { batchId, callbackUrl: '/registration/' + batchId + '/return' },
    gateway,
    'test-gateway',
  );
  return { started, outcome: await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects) };
}

test('the fee is paid before the visit, and the document waits for its result', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    // DEC-0136: the fee buys the visit, so an animal with nothing done yet is
    // exactly what a person pays for.
    const fresh = await plainAnimal(ctx, 'سگ تازه ثبت‌شده');

    const before = await readinessOf(ctx.testDb.db, ctx.owner.accountId, fresh.animalId);
    assert.equal(before.payable, true, 'the service can be bought');
    assert.equal(before.ready, false, 'but the document cannot be issued yet');
    assert.equal(before.nextStep?.href, '/requests/new?context=MICROCHIP');

    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [fresh.animalId]);
    await payBatch(ctx, created.batch.id, payingGateway(2_500_000n));

    // Paid, and honest about it: no sheet exists yet, and the item says why.
    const [afterPayment] = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    assert.equal(afterPayment!.state, 'BLOCKED');
    assert.match(afterPayment!.blockedReasonFa ?? '', /میکروچیپ|مشخصات/);
    assert.equal((await ctx.testDb.db.select().from(registrationSheets)).length, 0);

    // The visit runs, and the sheet issues by itself when it produces its
    // result — no second payment and no second request from the owner.
    await runMicrochipVisit(ctx, fresh.animalId, 'سگ تازه ثبت‌شده');

    const [afterVisit] = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    assert.equal(afterVisit!.state, 'ISSUED');
    const sheets = await ctx.testDb.db.select().from(registrationSheets);
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0]!.animalId, fresh.animalId);
  });
});

test('an unconfigured tariff opens no payment path and invents no amount', async () => {
  await withCtx(async (ctx) => {
    // The catalogue ships a starting figure, so an unset tariff is something the
    // operator did on purpose. Clearing it here reproduces exactly that state.
    await setSheetFee(ctx, null);
    const ready = await readyAnimal(ctx, 'سگ بدون تعرفه');
    await assert.rejects(
      () => createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]),
      /تعیین‌نشده|NOT_CONFIGURED|fee\.registration_sheet_toman/,
    );

    await setSheetFee(ctx);
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    const [line] = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.equal(line!.amountToman, SHEET_FEE);
    assert.equal(line!.settingKey, 'fee.registration_sheet_toman');
  });
});

test('two animals in one batch keep separate money lines and separate outcomes', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const first = await readyAnimal(ctx, 'سگ اول');
    const second = await readyAnimal(ctx, 'سگ دوم');

    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [first.animalId, second.animalId]);
    // Nothing about the document exists before the payment (DEC-0141): the
    // selection lives on the priced money lines and nowhere else.
    assert.equal(created.items.length, 0);
    assert.equal((await itemsOfBatch(ctx.testDb.db, created.batch.id)).length, 0);
    const lines = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.equal(lines.length, 2, 'money is attributed per animal, not to the group');

    // The second animal's sample is lost between the checkout and the payment.
    await markSampleUnusable(ctx.testDb.db, ctx.vet.actor, second.sample!.id, 'LOST', 'نمونه در انتقال مفقود شد.');

    const { outcome } = await payBatch(ctx, created.batch.id, payingGateway(5_000_000n));
    assert.equal(outcome.state, 'PAID');

    const items = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    const issued = items.find((i) => i.animalId === first.animalId)!;
    const blocked = items.find((i) => i.animalId === second.animalId)!;
    assert.equal(issued.state, 'ISSUED', 'the eligible paid animal is issued regardless of its neighbour');
    assert.equal(blocked.state, 'BLOCKED');
    assert.match(blocked.blockedReasonFa ?? '', /نمونه/);

    // Exactly one document exists, for the eligible animal only.
    assert.ok(await sheetOfAnimal(ctx.testDb.db, first.animalId));
    assert.equal(await sheetOfAnimal(ctx.testDb.db, second.animalId), null);

    // The owner is told about both outcomes, per animal.
    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'REGISTRATION_SHEET_ISSUED'));
    assert.ok(alerts.some((n) => n.kind === 'REGISTRATION_SHEET_BLOCKED'));
  });
});

test('a blocked item can be issued later without any new money', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const first = await readyAnimal(ctx, 'سگ سالم');
    const second = await readyAnimal(ctx, 'سگ بازیابی‌شده');
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [first.animalId, second.animalId]);
    await markSampleUnusable(ctx.testDb.db, ctx.vet.actor, second.sample!.id, 'DAMAGED', 'لوله شکست.');
    await payBatch(ctx, created.batch.id, payingGateway(5_000_000n));

    const before = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));

    // The missing prerequisite is fixed by a real re-collection.
    const { resample } = await import('../../src/clinical/samples.ts');
    await resample(ctx.testDb.db, ctx.vet.actor, second.requestId);

    const items = await retryIssuance(ctx.testDb.db, ctx.owner.actor, created.batch.id);
    assert.equal(items.every((i) => i.state === 'ISSUED'), true);

    // No refund, no extra charge, no rewritten snapshot.
    const after = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.deepEqual(
      after.map((l) => l.amountToman).sort(),
      before.map((l) => l.amountToman).sort(),
    );
    assert.equal(after.length, before.length);
  });
});

test('a repeated callback and a repeated issuance produce exactly one document', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ تکرار');
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    const gateway = payingGateway(2_500_000n);
    const { started } = await payBatch(ctx, created.batch.id, gateway);

    // The same return arrives twice more, and the issuance is retried on top.
    await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
    await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
    await retryIssuance(ctx.testDb.db, ctx.owner.actor, created.batch.id);

    const sheets = await ctx.testDb.db
      .select()
      .from(registrationSheets)
      .where(eq(registrationSheets.animalId, ready.animalId));
    assert.equal(sheets.length, 1);

    const issuedEvents = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'REGISTRATION_SHEET_ISSUED'));
    assert.equal(issuedEvents.length, 1, 'the document is issued once, however many times the callback lands');

    // The animal now carries its Pet ID, and it is the one on the sheet.
    const [animal] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, ready.animalId));
    assert.equal(animal!.petId, sheets[0]!.petId);
    assert.match(sheets[0]!.sheetNo, /^RS-/);
    assert.match(sheets[0]!.petId, /^PET-/);
    // The sheet states what was true at issuance.
    assert.equal(sheets[0]!.microchipNumber, ready.number);
    assert.equal(sheets[0]!.sampleTrackingCode, ready.sample!.trackingCode);
  });
});

test('a failed payment keeps the selection and the frozen amounts for a retry', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ پرداخت ناموفق');
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);

    const failed = await payBatch(ctx, created.batch.id, failingGateway);
    assert.equal(failed.outcome.state, 'FAILED');
    assert.equal(await sheetOfAnimal(ctx.testDb.db, ready.animalId), null);

    // A failed payment leaves no document record at all; what survives is the
    // frozen price, so the retry charges exactly what was quoted.
    let items = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    assert.equal(items.length, 0, 'nothing is written before the money is confirmed');
    const lines = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.equal(lines[0]!.amountToman, SHEET_FEE);
    assert.equal(lines[0]!.targetId, ready.animalId, 'the selection is on the money line');

    // A cancelled attempt behaves the same way.
    const cancelled = await startAttempt(
      ctx.testDb.db,
      ctx.owner.actor,
      { batchId: created.batch.id, callbackUrl: '/x' },
      failingGateway,
      'test-gateway',
    );
    await cancelAttempt(ctx.testDb.db, { reference: cancelled.reference });
    items = await itemsOfBatch(ctx.testDb.db, created.batch.id);
    assert.equal(items.length, 0, 'a cancelled attempt writes nothing either');

    // And the second, real attempt issues the document.
    const { outcome } = await payBatch(ctx, created.batch.id);
    assert.equal(outcome.state, 'PAID');
    assert.ok(await sheetOfAnimal(ctx.testDb.db, ready.animalId));
  });
});

test('a tariff change after the batch was created never rewrites what was charged', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx, '250000');
    const ready = await readyAnimal(ctx, 'سگ تعرفه');
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);

    await setSheetFee(ctx, '400000');
    const [line] = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, created.batch.id));
    assert.equal(line!.amountToman, '250000', 'the frozen snapshot is what the payer owes');
  });
});

test('a document is readable by its owner and by nobody else', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ سند');
    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    await payBatch(ctx, created.batch.id);
    const sheet = (await sheetOfAnimal(ctx.testDb.db, ready.animalId))!;

    const mine = await sheetForOwner(ctx.testDb.db, ctx.owner.actor, sheet.id);
    assert.equal(mine.sheetNo, sheet.sheetNo);

    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990600005');
    await assert.rejects(
      () => sheetForOwner(ctx.testDb.db, actorFor(strangerAccount.accountId), sheet.id),
      /پیدا نشد/,
    );
    // The veterinarian who did the work is not the owner of the document either.
    await assert.rejects(() => sheetForOwner(ctx.testDb.db, ctx.vet.actor, sheet.id), /پیدا نشد/);
  });
});

test('an issued sheet opens the next service and is never offered twice', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ سرویس بعدی');

    const before = await eligibilityFor(ctx.testDb.db, ctx.owner.accountId, 'PEDIGREE');
    assert.equal(before.allowed, false);

    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    await payBatch(ctx, created.batch.id);

    const after = await eligibilityFor(ctx.testDb.db, ctx.owner.accountId, 'PEDIGREE');
    assert.equal(after.allowed, true, 'the issued sheet is what unlocks the pedigree step');

    const selectable = await selectableAnimals(ctx.testDb.db, ctx.owner.actor);
    const row = selectable.find((a) => a.animalId === ready.animalId);
    assert.equal(row?.ready ?? false, false);
    assert.match(row?.reasonFa ?? '', /برگه ثبتی صادر شده/);
    await assert.rejects(
      () => createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]),
      /برگه ثبتی صادر شده/,
    );
  });
});

test('somebody else animal cannot be put in a batch', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ خصوصی');

    const strangerAccount = await signInWithVerifiedMobile(ctx.testDb.db, '09990600006');
    const stranger = actorFor(strangerAccount.accountId);
    await assert.rejects(
      () => createSheetRequest(ctx.testDb.db, stranger, [ready.animalId]),
      /عضویت|احراز هویت|پیدا نشد/,
    );
    assert.equal(
      (await ctx.testDb.db.select().from(registrationSheetItems).where(eq(registrationSheetItems.ownerAccountId, stranger.accountId))).length,
      0,
    );
  });
});

test('the sheet records the usable sample, not an unusable one', async () => {
  await withCtx(async (ctx) => {
    await setSheetFee(ctx);
    const ready = await readyAnimal(ctx, 'سگ نمونه دوم');
    await markSampleUnusable(ctx.testDb.db, ctx.vet.actor, ready.sample!.id, 'INVALID', 'نمونه نامعتبر بود.');
    const { resample } = await import('../../src/clinical/samples.ts');
    const second = await resample(ctx.testDb.db, ctx.vet.actor, ready.requestId);

    const created = await createSheetRequest(ctx.testDb.db, ctx.owner.actor, [ready.animalId]);
    await payBatch(ctx, created.batch.id);

    const sheet = (await sheetOfAnimal(ctx.testDb.db, ready.animalId))!;
    assert.equal(sheet.sampleTrackingCode, second.trackingCode);
    const rows = await ctx.testDb.db.select().from(samples).where(eq(samples.animalId, ready.animalId));
    assert.equal(rows.length, 2, 'the unusable sample is still on record');
  });
});
