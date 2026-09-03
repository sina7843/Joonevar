import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, referenceBreeds } from '../../src/db/schema/core.ts';
import { microchipConflicts, microchips, sampleEvents, samples } from '../../src/db/schema/clinical.ts';
import { vetVisitRequests } from '../../src/db/schema/vets.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { startMembershipPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { editAnimal, registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { auditTrail } from '../../src/audit/service.ts';
import { addLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import {
  bindExistingChip,
  chipOfAnimal,
  confirmImplant,
  conflictsOfAnimal,
  recordChipRead,
  recordRereadAndBind,
} from '../../src/clinical/microchip.ts';
import { recordOfficialIdentity } from '../../src/clinical/identity.ts';
import {
  custodyList,
  instructSend,
  markSampleUnusable,
  recordSampling,
  recordShipment,
  resample,
  samplesOfRequest,
} from '../../src/clinical/samples.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** SYNTHETIC transponder numbers, in a 15-digit shape but not issued. */
const CHIP_A = '900000000000001';
const CHIP_B = '900000000000002';
const CHIP_C = '900000000000003';

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
  readonly genetics: Party;
  readonly vet: Party;
  readonly vetTwo: Party;
  readonly locationId: string;
  readonly locationTwoId: string;
  readonly breedId: string;
}

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
    displayName: 'نمایشی آزمایشی',
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
  const started = await startAttempt(testDb.db, actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, 'test');
  assert.equal((await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');
}

async function withCtx(fn: (ctx: Ctx) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-chip-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);

    const operatorAccount = await signInWithVerifiedMobile(testDb.db, '09990500099');
    const operator = actorFor(operatorAccount.accountId, 'ASSOCIATION_OPERATOR');
    const adminAccount = await signInWithVerifiedMobile(testDb.db, '09990500098');
    const admin: Party = { accountId: adminAccount.accountId, actor: actorFor(adminAccount.accountId, 'SUPERADMIN') };
    const geneticsAccount = await signInWithVerifiedMobile(testDb.db, '09990500097');
    const genetics: Party = {
      accountId: geneticsAccount.accountId,
      actor: actorFor(geneticsAccount.accountId, 'GENETICS_OPERATOR'),
    };

    const owner = await approved(testDb, root, operator, '09990500001', '0499370899');
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

    const one = await makeVet('09990500002', '0790419904', 'دامپزشک یک', 'SYNTH-CHIP-1');
    const two = await makeVet('09990500003', '0084575948', 'دامپزشک دو', 'SYNTH-CHIP-2');

    const [breed] = await testDb.db.select().from(referenceBreeds).limit(1);

    await fn({
      testDb,
      root,
      owner,
      admin,
      genetics,
      vet: one.party,
      vetTwo: two.party,
      locationId: one.locationId,
      locationTwoId: two.locationId,
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
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  return (await registerAnimal(ctx.testDb.db, ctx.owner.actor, draft.id)).id;
}

/** Creates a visit and checks it in, so the desk work can start. */
async function openVisit(
  ctx: Ctx,
  name: string,
  serviceType: 'MICROCHIP_IMPLANT' | 'MICROCHIP_VERIFICATION',
  which: 'one' | 'two' = 'one',
) {
  const vet = which === 'one' ? ctx.vet : ctx.vetTwo;
  const locationId = which === 'one' ? ctx.locationId : ctx.locationTwoId;
  const animalId = await makeAnimal(ctx, name);
  const created = await createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
    context: 'MICROCHIP',
    vetAccountId: vet.accountId,
    locationId,
    items: [{ animalId, serviceType }],
  });
  const requestId = created.items[0]!.request.id;
  const outcome = await checkIn(ctx.testDb.db, vet.actor, {
    code: created.items[0]!.referral.code,
    locationId,
  });
  assert.equal(outcome.ok, true);
  // §13: the chip step does not open before the identity is certified.
  await recordOfficialIdentity(ctx.testDb.db, vet.actor, requestId, {
    name,
    breedId: ctx.breedId,
    sex: 'MALE',
    birthDate: '2022-01-01',
    birthDateApproximate: false,
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  return { animalId, requestId, vet, locationId };
}

/** The whole implant path, as the source orders it. */
async function implant(ctx: Ctx, visit: Awaited<ReturnType<typeof openVisit>>, number: string) {
  const read = await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, {
    number,
    method: 'MANUAL',
  });
  assert.equal(read.state, 'READY_TO_IMPLANT');
  await confirmImplant(ctx.testDb.db, visit.vet.actor, visit.requestId);
  return recordRereadAndBind(ctx.testDb.db, visit.vet.actor, visit.requestId, { number, method: 'MANUAL' });
}

test('the implant path reads, implants, rereads and only then binds', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ کاشت', 'MICROCHIP_IMPLANT');

    // Nothing is bound before the reread.
    await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, { number: CHIP_A, method: 'MANUAL' });
    assert.equal(await chipOfAnimal(ctx.testDb.db, visit.animalId), null);

    // And the reread cannot happen before the implant is recorded.
    await assert.rejects(
      () =>
        recordRereadAndBind(ctx.testDb.db, visit.vet.actor, visit.requestId, {
          number: CHIP_A,
          method: 'MANUAL',
        }),
      /ابتدا انجام کاشت/,
    );

    await confirmImplant(ctx.testDb.db, visit.vet.actor, visit.requestId);
    const bound = await recordRereadAndBind(ctx.testDb.db, visit.vet.actor, visit.requestId, {
      number: CHIP_A,
      method: 'BLUETOOTH_READER',
    });
    assert.equal(bound.state, 'BOUND');

    const chip = await chipOfAnimal(ctx.testDb.db, visit.animalId);
    assert.equal(chip?.number, CHIP_A);
    assert.equal(chip?.boundVia, 'IMPLANT');
    // The method travels with the record; the value does not depend on it.
    assert.equal(chip?.readMethod, 'BLUETOOTH_READER');

    const alerts = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientAccountId, ctx.owner.accountId));
    assert.ok(alerts.some((n) => n.kind === 'MICROCHIP_BOUND'));
  });
});

test('a serial that reads differently after implantation is a recorded conflict, not a binding', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ ناهمخوان', 'MICROCHIP_IMPLANT');
    await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, { number: CHIP_A, method: 'MANUAL' });
    await confirmImplant(ctx.testDb.db, visit.vet.actor, visit.requestId);

    const outcome = await recordRereadAndBind(ctx.testDb.db, visit.vet.actor, visit.requestId, {
      number: CHIP_B,
      method: 'MANUAL',
    });
    assert.equal(outcome.state, 'CONFLICT');
    assert.equal(outcome.state === 'CONFLICT' && outcome.kind, 'SERIAL_MISMATCH');
    assert.equal(await chipOfAnimal(ctx.testDb.db, visit.animalId), null);

    const conflicts = await conflictsOfAnimal(ctx.testDb.db, visit.animalId);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.kind, 'SERIAL_MISMATCH');
    // Neither serial silently became the animal's chip.
    const rows = await ctx.testDb.db.select().from(microchips);
    assert.equal(rows.length, 0);
  });
});

test('one animal cannot get a second microchip, ever', async () => {
  await withCtx(async (ctx) => {
    const first = await openVisit(ctx, 'سگ یک‌چیپ', 'MICROCHIP_IMPLANT');
    assert.equal((await implant(ctx, first, CHIP_A)).state, 'BOUND');
    await recordSampling(ctx.testDb.db, first.vet.actor, first.requestId);

    // A second visit for the same animal, a different number.
    const created = await createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
      context: 'MICROCHIP',
      vetAccountId: ctx.vet.accountId,
      locationId: ctx.locationId,
      items: [{ animalId: first.animalId, serviceType: 'MICROCHIP_IMPLANT' }],
    });
    await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: created.items[0]!.referral.code,
      locationId: ctx.locationId,
    });

    const read = await recordChipRead(ctx.testDb.db, ctx.vet.actor, created.items[0]!.request.id, {
      number: CHIP_B,
      method: 'MANUAL',
    });
    assert.equal(read.state, 'CONFLICT');
    assert.equal(read.state === 'CONFLICT' && read.kind, 'ANIMAL_HAS_OTHER_CHIP');
    // The original binding is untouched: no replacement, no transfer.
    assert.equal((await chipOfAnimal(ctx.testDb.db, first.animalId))?.number, CHIP_A);
    assert.equal((await ctx.testDb.db.select().from(microchips)).length, 1);
  });
});

test('two visits binding the same number at the same time leave exactly one binding', async () => {
  await withCtx(async (ctx) => {
    const one = await openVisit(ctx, 'سگ رقابت الف', 'MICROCHIP_IMPLANT', 'one');
    const two = await openVisit(ctx, 'سگ رقابت ب', 'MICROCHIP_IMPLANT', 'two');

    for (const visit of [one, two]) {
      await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, { number: CHIP_C, method: 'MANUAL' });
      await confirmImplant(ctx.testDb.db, visit.vet.actor, visit.requestId);
    }

    const results = await Promise.all([
      recordRereadAndBind(ctx.testDb.db, one.vet.actor, one.requestId, { number: CHIP_C, method: 'MANUAL' }),
      recordRereadAndBind(ctx.testDb.db, two.vet.actor, two.requestId, { number: CHIP_C, method: 'MANUAL' }),
    ]);

    assert.equal(results.filter((r) => r.state === 'BOUND').length, 1);
    const loser = results.find((r) => r.state === 'CONFLICT');
    assert.ok(loser && loser.state === 'CONFLICT' && loser.kind === 'DUPLICATE_NUMBER');

    const rows = await ctx.testDb.db.select().from(microchips).where(eq(microchips.number, CHIP_C));
    assert.equal(rows.length, 1, 'the unique index is the arbiter, not a prior read');
    const conflicts = await ctx.testDb.db.select().from(microchipConflicts);
    assert.equal(conflicts.length, 1);
  });
});

test('verification confirms the animal own chip and refuses anything else', async () => {
  await withCtx(async (ctx) => {
    const first = await openVisit(ctx, 'سگ دارای چیپ', 'MICROCHIP_IMPLANT');
    await implant(ctx, first, CHIP_A);
    await recordSampling(ctx.testDb.db, first.vet.actor, first.requestId);

    // Same chip, same animal → confirmed, and no second row is written.
    const again = await createVisitRequests(ctx.testDb.db, ctx.owner.actor, {
      context: 'MICROCHIP',
      vetAccountId: ctx.vet.accountId,
      locationId: ctx.locationId,
      items: [{ animalId: first.animalId, serviceType: 'MICROCHIP_VERIFICATION' }],
    });
    await checkIn(ctx.testDb.db, ctx.vet.actor, {
      code: again.items[0]!.referral.code,
      locationId: ctx.locationId,
    });
    const confirmed = await recordChipRead(ctx.testDb.db, ctx.vet.actor, again.items[0]!.request.id, {
      number: CHIP_A,
      method: 'PACKAGE_BARCODE',
    });
    assert.equal(confirmed.state, 'CONFIRMED');
    assert.equal((await ctx.testDb.db.select().from(microchips)).length, 1);

    // A serial belonging to another animal stops the visit.
    const other = await openVisit(ctx, 'سگ دیگر', 'MICROCHIP_VERIFICATION');
    const clash = await recordChipRead(ctx.testDb.db, other.vet.actor, other.requestId, {
      number: CHIP_A,
      method: 'MANUAL',
    });
    assert.equal(clash.state, 'CONFLICT');
    assert.equal(clash.state === 'CONFLICT' && clash.kind, 'BELONGS_TO_OTHER_ANIMAL');
    assert.equal(await chipOfAnimal(ctx.testDb.db, other.animalId), null);
  });
});

test('an existing physical chip with no record binds only after the same checks', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ چیپ‌دار بدون رکورد', 'MICROCHIP_VERIFICATION');
    const read = await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, {
      number: CHIP_B,
      method: 'MOBILE_READER',
    });
    assert.equal(read.state, 'BINDABLE');

    const bound = await bindExistingChip(ctx.testDb.db, visit.vet.actor, visit.requestId);
    assert.equal(bound.state, 'BOUND');
    const chip = await chipOfAnimal(ctx.testDb.db, visit.animalId);
    assert.equal(chip?.number, CHIP_B);
    assert.equal(chip?.boundVia, 'EXISTING_UNREGISTERED');
    // Binding an existing chip is not an implant: no implant event was recorded.
    const trail = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MICROCHIP_IMPLANT_CONFIRMED'));
    assert.equal(trail.length, 0);
  });
});

test('the tracking code exists only after a sample was actually taken', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ نمونه', 'MICROCHIP_IMPLANT');

    // Before the chip work is settled there is no sample and no code.
    await assert.rejects(
      () => recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId),
      /تا تعیین‌تکلیف میکروچیپ/,
    );
    assert.equal((await samplesOfRequest(ctx.testDb.db, visit.requestId)).length, 0);

    await implant(ctx, visit, CHIP_A);
    const sample = await recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId);
    assert.match(sample.trackingCode, /^SM-/);
    assert.equal(sample.custodyAccountId, visit.vet.accountId);
    assert.equal(sample.status, 'IN_CUSTODY');

    // The referral code and the sample code are different identifiers.
    const [request] = await ctx.testDb.db
      .select()
      .from(vetVisitRequests)
      .where(eq(vetVisitRequests.id, visit.requestId));
    assert.equal(request!.status, 'COMPLETED');
    assert.ok(!sample.trackingCode.startsWith('HZ-'));

    // A second collection is refused rather than issuing a spare code: the
    // visit is finished, and a live sample already exists for this request.
    await assert.rejects(
      () => recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId),
      /نمونه فعال|پذیرش‌شده نیست/,
    );
    assert.equal((await samplesOfRequest(ctx.testDb.db, visit.requestId)).length, 1);

    const events = await ctx.testDb.db.select().from(sampleEvents).where(eq(sampleEvents.sampleId, sample.id));
    assert.deepEqual(
      events.map((e) => e.kind).sort(),
      ['COLLECTED', 'CUSTODY_RECORDED'],
    );
  });
});

test('verification also requires blood, and custody stays with the same vet', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ تأیید', 'MICROCHIP_VERIFICATION');
    await recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, { number: CHIP_C, method: 'MANUAL' });
    await bindExistingChip(ctx.testDb.db, visit.vet.actor, visit.requestId);

    const sample = await recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId);
    const held = await custodyList(ctx.testDb.db, visit.vet.actor);
    assert.equal(held.length, 1);
    assert.equal(held[0]!.id, sample.id);
    // Another veterinarian is holding nothing.
    assert.equal((await custodyList(ctx.testDb.db, ctx.vetTwo.actor)).length, 0);
  });
});

test('resampling issues a new code on the same request and keeps the old one', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ نمونه‌گیری مجدد', 'MICROCHIP_IMPLANT');
    await implant(ctx, visit, CHIP_A);
    const first = await recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId);

    // A new collection is refused while the current sample is still usable.
    await assert.rejects(
      () => resample(ctx.testDb.db, visit.vet.actor, visit.requestId),
      /غیرقابل‌استفاده ثبت نشده/,
    );

    await markSampleUnusable(ctx.testDb.db, visit.vet.actor, first.id, 'INSUFFICIENT', 'حجم نمونه کافی نبود.');
    const second = await resample(ctx.testDb.db, visit.vet.actor, visit.requestId);

    assert.notEqual(second.trackingCode, first.trackingCode);
    const rows = await samplesOfRequest(ctx.testDb.db, visit.requestId);
    assert.equal(rows.length, 2, 'the previous sample is kept, not replaced in place');
    const kept = rows.find((r) => r.id === first.id)!;
    assert.equal(kept.status, 'INSUFFICIENT');
    assert.equal(kept.unusableReasonFa, 'حجم نمونه کافی نبود.');
    assert.equal(kept.supersededBySampleId, second.id);

    // Resampling is not a second implant: the chip record is untouched.
    assert.equal((await ctx.testDb.db.select().from(microchips)).length, 1);
    const trail = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MICROCHIP_IMPLANT_CONFIRMED'));
    assert.equal(trail.length, 1);
  });
});

test('a sample travels only when the centre asks, and shipment is an event on the same code', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ ارسال', 'MICROCHIP_IMPLANT');
    await implant(ctx, visit, CHIP_A);
    const sample = await recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId);

    // No expiry and no shipment before the instruction.
    await assert.rejects(
      () => recordShipment(ctx.testDb.db, visit.vet.actor, sample.id, 'پست پیشتاز'),
      /دستور ارسال/,
    );
    // The instruction belongs to the genetics centre, not to the veterinarian.
    await assert.rejects(() => instructSend(ctx.testDb.db, visit.vet.actor, sample.id), /مرکز ژنتیک/);

    await instructSend(ctx.testDb.db, ctx.genetics.actor, sample.id);
    const shipped = await recordShipment(ctx.testDb.db, visit.vet.actor, sample.id, 'پست پیشتاز ۱۲۳');
    assert.equal(shipped.status, 'SHIPPED');
    assert.equal(shipped.trackingCode, sample.trackingCode, 'shipment does not mint a second code');

    const events = await ctx.testDb.db.select().from(sampleEvents).where(eq(sampleEvents.sampleId, sample.id));
    assert.ok(events.some((e) => e.kind === 'SEND_INSTRUCTED'));
    assert.ok(events.some((e) => e.kind === 'SHIPPED'));
  });
});

test('the desk work belongs to the assigned veterinarian and to an open visit only', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ خصوصی', 'MICROCHIP_IMPLANT');

    // Another veterinarian gets the same answer as for a record that is not there.
    await assert.rejects(
      () =>
        recordChipRead(ctx.testDb.db, ctx.vetTwo.actor, visit.requestId, { number: CHIP_A, method: 'MANUAL' }),
      /پیدا نشد/,
    );
    // And so does the owner.
    await assert.rejects(
      () =>
        recordChipRead(ctx.testDb.db, ctx.owner.actor, visit.requestId, { number: CHIP_A, method: 'MANUAL' }),
      /دامپزشک معتمد/,
    );

    // A sample of one veterinarian is not visible to another as a custodian.
    await implant(ctx, visit, CHIP_A);
    const sample = await recordSampling(ctx.testDb.db, visit.vet.actor, visit.requestId);
    await assert.rejects(
      () => markSampleUnusable(ctx.testDb.db, ctx.vetTwo.actor, sample.id, 'LOST', 'تلاش دامپزشک دیگر'),
      /پیدا نشد/,
    );
  });
});

test('a malformed number never reaches the record', async () => {
  await withCtx(async (ctx) => {
    const visit = await openVisit(ctx, 'سگ شماره نامعتبر', 'MICROCHIP_IMPLANT');
    await assert.rejects(
      () => recordChipRead(ctx.testDb.db, visit.vet.actor, visit.requestId, { number: '12345', method: 'MANUAL' }),
      /۱۵ رقم/,
    );
    assert.equal((await ctx.testDb.db.select().from(microchips)).length, 0);
  });
});

test('the identity is certified by the vet, once, and the chip waits for it', async () => {
  await withCtx(async (ctx) => {
    const animalId = await makeAnimal(ctx, 'سگ هویت');
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

    // §13: a number bound to an animal nobody has identified would be a
    // lifetime link to an unverified record, so the chip step waits.
    await assert.rejects(
      () => recordChipRead(ctx.testDb.db, ctx.vet.actor, requestId, { number: '900000000000041', method: 'MANUAL' }),
      /مشخصات رسمی/,
    );

    // The owner declared one thing; the vet, looking at the animal, records
    // another. What is stored is the vet's.
    await recordOfficialIdentity(ctx.testDb.db, ctx.vet.actor, requestId, {
      name: 'نام رسمی',
      breedId: ctx.breedId,
      sex: 'FEMALE',
      birthDate: '2021-03-04',
      birthDateApproximate: true,
      color: 'سیاه',
      markings: 'لکه سفید روی سینه',
    });
    const [afterVerify] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, animalId));
    assert.equal(afterVerify!.sex, 'FEMALE');
    assert.equal(afterVerify!.color, 'سیاه');
    assert.equal(afterVerify!.birthDateApproximate, true);
    assert.ok(afterVerify!.identityVerifiedAt !== null);
    assert.equal(afterVerify!.identityVerifiedByAccountId, ctx.vet.accountId);

    // What the owner had declared is kept, not destroyed.
    const trail = await auditTrail(
      ctx.testDb.db,
      { targetType: 'ANIMAL', targetId: animalId },
      { page: 1, pageSize: 50 },
    );
    const entry = trail.items.find((row) => row.action === 'ANIMAL_IDENTITY_VERIFIED');
    assert.ok(entry, 'the certification is on the record');
    assert.equal((entry!.before as { sex?: string }).sex, 'MALE');

    // Certified once. A second write is refused rather than silently applied.
    await assert.rejects(
      () =>
        recordOfficialIdentity(ctx.testDb.db, ctx.vet.actor, requestId, {
          name: 'نام دیگر',
          breedId: ctx.breedId,
          sex: 'MALE',
          birthDate: '2020-01-01',
          birthDateApproximate: false,
          color: null,
          markings: null,
        }),
      /قبلاً ثبت شده/,
    );

    // And the owner cannot rewrite it from the profile form (§10).
    await assert.rejects(
      () => editAnimal(ctx.testDb.db, ctx.owner.actor, animalId, { color: 'قهوه‌ای' }),
      /دامپزشک معتمد ثبت شده/,
    );

    // With the identity on record, the chip step proceeds normally.
    const read = await recordChipRead(ctx.testDb.db, ctx.vet.actor, requestId, {
      number: '900000000000041',
      method: 'MANUAL',
    });
    assert.equal(read.state, 'READY_TO_IMPLANT');
  });
});
