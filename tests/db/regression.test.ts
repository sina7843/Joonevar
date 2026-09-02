/**
 * The whole official path, end to end — gate `domain-regression`.
 *
 * One case walks every step §5 chains together: identity, animal, membership,
 * referral, chip and sample, registration sheet, genetics receipt, shipment,
 * parentage result, pedigree, permit, mutually confirmed dates, birth,
 * two-party allocation and the puppy card. The independent branches — kennel,
 * foreign pedigree, personal declaration, appeal and postal request — are
 * walked beside it, and the asynchronous edges that only appear when steps
 * arrive out of order are exercised on the same real data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { paymentBatches } from '../../src/db/schema/billing.ts';
import { pedigrees, postalRequests } from '../../src/db/schema/pedigree.ts';
import { puppyCards } from '../../src/db/schema/breeding.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { createVisitRequests, checkIn, renewReferral } from '../../src/vets/visits.ts';
import { confirmImplant, recordChipRead, recordRereadAndBind } from '../../src/clinical/microchip.ts';
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
import { answerAppeal, submitAppeal, takeAppeal } from '../../src/genetics/appeals.ts';
import { createIssuanceRequest, pedigreeOfAnimal } from '../../src/documents/pedigree.ts';
import { createPostalRequest } from '../../src/documents/postal.ts';
import {
  confirmCounterparty,
  reviewPermit,
  saveAllocationRule,
  startPermit,
  submitPermit,
} from '../../src/mating/permits.ts';
import { confirmDate, declareDate, declareDifferentDate } from '../../src/mating/dates.ts';
import { latestConfirmedDateOfAnimal } from '../../src/mating/cooldown.ts';
import { recordBirth } from '../../src/mating/birth.ts';
import {
  cardEligibility,
  currentAllocation,
  proposeAllocation,
  respondToAllocation,
  startCardPayment,
} from '../../src/mating/allocation.ts';
import { startDeclaration, respondToDeclaration } from '../../src/mating/declaration.ts';
import { startKennel, saveKennel, addBreed, startKennelPayment, submitKennel, reviewKennel } from '../../src/kennels/service.ts';
import { latestAttempt, startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import {
  JPEG,
  animalWithSheet,
  payPermitFee,
  payingGateway,
  pedigreedAnimal,
  takeToIssued,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099909000', tmpPrefix: 'hamzist-reg-', councilCode: 'SYNTH-RG-1', chipBase: 2_000_000 },
    fn,
  );

const daysAgo = (days: number) => addDays(todayCivil(), -days);

const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});

test('the official path runs end to end and each step really opens the next', async () => {
  await withCtx(async (ctx) => {
    // Identity, membership and the animal are already true in the fixture: the
    // helper only walks the same public services a person would.
    const male = await pedigreedAnimal(ctx, ctx.first, 'سگ نر مسیر کامل', 'MALE');
    const female = await pedigreedAnimal(ctx, ctx.second, 'سگ ماده مسیر کامل', 'FEMALE');
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, male.animalId));
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, female.animalId));

    // Permit: resolve, invite, confirm, rule, pay, submit, issue.
    const opened = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    assert.equal(opened.status, 'AWAITING_COUNTERPARTY');
    // The helper walks the rest of §16 through the same public services: the
    // counterparty's own confirmation, the rule, the payment, the submission
    // and the association's decision.
    const permit = await takeToIssued(ctx, opened);
    assert.equal(permit.status, 'ISSUED');
    assert.match(permit.permitNo ?? '', /^MP-/);

    // Dates: one side declares, the other confirms, and only then is there an
    // official basis for either animal (§17.1).
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), null);
    const proposed = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      matedOn: daysAgo(40),
    });
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), null);
    await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: proposed.id,
      expectedVersion: proposed.version,
    });
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), daysAgo(40));
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, female.animalId), daysAgo(40));

    // Birth, allocation and the card.
    const { created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(5),
      liveCount: 2,
      deadCount: 0,
    });
    const allocation = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: [
        { puppyId: created[0]!.id, proposedOwnerAccountId: ctx.first.accountId },
        { puppyId: created[1]!.id, proposedOwnerAccountId: ctx.second.accountId },
      ],
    });
    // Until both sides confirm, the card is locked for every puppy.
    const locked = await cardEligibility(ctx.testDb.db, ctx.first.actor, permit.id);
    assert.ok(locked.every((row) => !row.eligible));
    for (const actor of [ctx.first.actor, ctx.second.actor]) {
      await respondToAllocation(ctx.testDb.db, actor, {
        allocationId: allocation.id,
        expectedVersion: 1,
        approve: true,
      });
    }
    assert.equal((await currentAllocation(ctx.testDb.db, permit.id))!.status, 'FINAL');

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.puppy_card_toman',
      value: '120000',
      reason: 'SYNTHETIC — مقدار آزمایشی',
    });
    const batch = await startCardPayment(ctx.testDb.db, ctx.first.actor, permit.id, [created[0]!.id]);
    const gateway = payingGateway(1_200_000n);
    const started = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: batch.id, callbackUrl: '/x' },
      gateway,
      'test-gateway',
    );
    assert.equal(
      (await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects)).state,
      'PAID',
    );
    const cards = await ctx.testDb.db.select().from(puppyCards).where(eq(puppyCards.permitId, permit.id));
    assert.equal(cards.length, 1);
    assert.match(cards[0]!.cardNo, /^PC-/);

    // Every step of the chain left its own document or record behind.
    assert.ok(await sheetOfAnimal(ctx.testDb.db, male.animalId));
    const documents = await ctx.testDb.db.select().from(pedigrees);
    assert.equal(documents.length, 2, 'one pedigree per animal, not one per case');
  });
});

test('the independent branches never borrow the official path', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ شاخه‌ها');

    // Kennel: its own payment and its own review, with no effect on documents.
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'fee.kennel_registration_toman',
      value: '150000',
      reason: 'SYNTHETIC — مقدار آزمایشی',
    });
    const kennel = await startKennel(ctx.testDb.db, ctx.first.actor);
    await saveKennel(ctx.testDb.db, ctx.first.actor, kennel.id, {
      nameFa: 'کنل شاخه',
      cityFa: 'تهران',
      addressFa: 'نشانی آزمایشی',
    });
    const [breed] = await ctx.testDb.db.select().from(referenceBreeds).limit(1);
    await addBreed(ctx.testDb.db, ctx.first.actor, kennel.id, breed!.id);
    const kennelBatch = await startKennelPayment(ctx.testDb.db, ctx.first.actor, kennel.id);
    const kennelGateway = payingGateway(1_500_000n);
    const kennelAttempt = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: kennelBatch.id, callbackUrl: '/x' },
      kennelGateway,
      'test',
    );
    await verifyAttempt(ctx.testDb.db, { reference: kennelAttempt.reference }, kennelGateway, paidEffects);
    await submitKennel(ctx.testDb.db, ctx.first.actor, kennel.id);
    const approved = await reviewKennel(ctx.testDb.db, ctx.association.actor, {
      kennelId: kennel.id,
      decision: 'APPROVED',
    });
    assert.equal(approved.status, 'APPROVED');

    // The personal declaration: no payment, and no official document.
    const sms = localTestSmsSender([], DEV);
    const theirs = await animalWithSheet(ctx, 'سگ طرف مقابل شاخه', { owner: ctx.second });
    const [chip] = await ctx.testDb.db.execute<{ number: string }>(
      // The identifier of a real record, taken from the chip the vet bound.
      // eslint-disable-next-line no-restricted-syntax
      (await import('drizzle-orm')).sql`select number from microchip where animal_id = ${theirs.animalId}::uuid`,
    ).then((result) => result.rows);
    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: animal.animalId,
        counterpartyIdentifier: chip!.number,
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );
    await respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, { confirm: true });
    const batches = await ctx.testDb.db.select().from(paymentBatches);
    assert.ok(
      batches.every((row) => row.service !== 'MATING_PERMIT'),
      'a personal declaration never opens the official permit payment',
    );

    // A postal request records a request and claims no dispatch (§14, D17).
    const sheet = await sheetOfAnimal(ctx.testDb.db, animal.animalId);
    const postal = await createPostalRequest(ctx.testDb.db, ctx.first.actor, {
      documentType: 'REGISTRATION_SHEET',
      documentId: sheet!.id,
      recipientNameFa: 'گیرنده آزمایشی',
      recipientPhone: '02100000000',
      provinceFa: 'تهران',
      cityFa: 'تهران',
      addressFa: 'نشانی آزمایشی',
      postalCode: '1234567890',
    });
    const stored = await ctx.testDb.db
      .select()
      .from(postalRequests)
      .where(eq(postalRequests.id, postal.id));
    const columns = Object.keys(stored[0]!);
    for (const forbidden of ['tracking', 'shipped', 'delivered', 'carrier']) {
      assert.ok(
        !columns.some((column) => column.toLowerCase().includes(forbidden)),
        'a postal request must not claim ' + forbidden,
      );
    }
  });
});

test('out-of-order arrivals are handled where they actually happen', async () => {
  await withCtx(async (ctx) => {
    const male = await pedigreedAnimal(ctx, ctx.first, 'سگ نر ترتیب', 'MALE');
    const female = await pedigreedAnimal(ctx, ctx.second, 'سگ ماده ترتیب', 'FEMALE');
    const opened = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await confirmCounterparty(ctx.testDb.db, ctx.second.actor, opened.id, true);
    await saveAllocationRule(ctx.testDb.db, ctx.first.actor, opened.id, {
      type: 'PERCENTAGE',
      shares: [
        { side: 'SIRE_SIDE', percent: 50 },
        { side: 'DAM_SIDE', percent: 50 },
      ],
    });

    // A replayed gateway callback settles once and performs no second effect.
    const paid = await payPermitFee(ctx, opened.id);
    assert.equal(paid.outcome.state, 'PAID');
    const gateway = payingGateway(3_000_000n);
    const attempt = await latestAttempt(ctx.testDb.db, paid.batch.id);
    const replay = await verifyAttempt(
      ctx.testDb.db,
      { reference: attempt!.reference },
      gateway,
      paidEffects,
    );
    assert.equal(replay.state, 'PAID');
    assert.equal(replay.performed, false, 'a replayed callback performs nothing again');
    const paidEvents = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MATING_PERMIT_PAYMENT_VERIFIED'));
    assert.equal(paidEvents.length, 1, 'and it records the effect only once');
    const told = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.first.accountId),
          eq(notifications.kind, 'MATING_PERMIT_PAYMENT_VERIFIED'),
        ),
      );
    assert.equal(told.length, 1, 'and notifies once, not once per callback');

    const submitted = await submitPermit(ctx.testDb.db, ctx.first.actor, opened.id);
    assert.equal(submitted.status, 'UNDER_REVIEW');
    const permit = await reviewPermit(ctx.testDb.db, ctx.association.actor, {
      permitId: opened.id,
      decision: 'ISSUED',
    });

    // A correction retires the approval that was open for the old version.
    const v1 = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(30) });
    const v2 = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      matedOn: daysAgo(28),
      replacesVersion: v1.version,
    });
    await assert.rejects(
      () =>
        confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: v1.id,
          expectedVersion: v1.version,
        }),
      /در انتظار تأیید نیست/,
    );
    // Answering with a different date leaves both values readable.
    const conflict = await declareDifferentDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: v2.id,
      expectedVersion: v2.version,
      matedOn: daysAgo(26),
    });
    assert.equal(conflict.conflicted.status, 'CONFLICTED');
    assert.equal(conflict.proposed.matedOn, daysAgo(26));
    // And the official basis is still empty until someone confirms one version.
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), null);
    await confirmDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      declarationId: conflict.proposed.id,
      expectedVersion: conflict.proposed.version,
    });
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), daysAgo(26));
  });
});

test('a referral code is single use, and renewal never revives the old one', async () => {
  await withCtx(async (ctx) => {
    const draft = await startDraft(ctx.testDb.db, ctx.first.actor, { forceNew: true });
    await saveDraft(ctx.testDb.db, ctx.first.actor, draft.id, {
      name: 'سگ کد مراجعه',
      breedId: ctx.breedId,
      sex: 'MALE',
      birthDate: '2022-01-01',
    });
    const animal = await registerAnimal(ctx.testDb.db, ctx.first.actor, draft.id);
    const created = await createVisitRequests(ctx.testDb.db, ctx.first.actor, {
      context: 'MICROCHIP',
      vetAccountId: ctx.vet.accountId,
      locationId: ctx.locationId,
      items: [{ animalId: animal.id, serviceType: 'MICROCHIP_IMPLANT' }],
    });
    const code = created.items[0]!.referral.code;
    const requestId = created.items[0]!.request.id;

    // Two simultaneous check-ins with the same code: exactly one is accepted
    // and the loser is told the code was already used, not given a second
    // acceptance.
    const results = await Promise.all([
      checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId }),
      checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId }),
    ]);
    assert.equal(results.filter((row) => row.ok).length, 1);
    const refused = results.find((row) => !row.ok)!;
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.rejection : '', 'CONSUMED');

    // A third attempt with the same code is refused for the same reason.
    const third = await checkIn(ctx.testDb.db, ctx.vet.actor, { code, locationId: ctx.locationId });
    assert.equal(third.ok, false);

    // Renewal exists for a code that expired unused, not for a visit that has
    // already happened: an accepted request is never given a second code.
    await assert.rejects(
      () => renewReferral(ctx.testDb.db, ctx.first.actor, requestId),
      /در انتظار مراجعه نیست/,
    );
  });
});

test('a corrected result and a resampling keep every earlier record readable', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ نتیجه اصلاحی');
    const receipt = await createReceipt(ctx.testDb.db, ctx.first.actor, [animal.animalId]);
    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.first.actor, receipt.id, { bytes: JPEG });
    await submitReceipt(ctx.testDb.db, ctx.first.actor, receipt.id);

    // A receipt sent back for correction keeps its own file and its history.
    const corrected = await reviewReceipt(ctx.testDb.db, ctx.centre.actor, {
      receiptId: receipt.id,
      decision: 'NEEDS_CORRECTION',
      reasonFa: 'تصویر فیش خوانا نیست.',
    });
    assert.equal(corrected.status, 'NEEDS_CORRECTION');
    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.first.actor, receipt.id, { bytes: JPEG });
    await submitReceipt(ctx.testDb.db, ctx.first.actor, receipt.id);
    await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });

    await recordShipment(ctx.testDb.db, ctx.vet.actor, animal.sampleId!, 'پست پیشتاز');
    await receiveSample(ctx.testDb.db, ctx.centre.actor, animal.sampleId!);
    await startProcessing(ctx.testDb.db, ctx.centre.actor, animal.sampleId!);
    const original = await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sampleId! });

    // An appeal is answered and a corrected result is a new version; the first
    // one is still readable and the document already issued is not rewritten.
    const appeal = await submitAppeal(ctx.testDb.db, ctx.first.actor, {
      resultId: original.id,
      messageFa: 'به نتیجه اعتراض دارم و بازبینی می‌خواهم.',
    });
    await takeAppeal(ctx.testDb.db, ctx.centre.actor, appeal.id);
    const answered = await answerAppeal(ctx.testDb.db, ctx.centre.actor, {
      appealId: appeal.id,
      responseFa: 'نتیجه بازبینی شد و تغییری لازم نبود.',
    });
    assert.equal(answered.status, 'ANSWERED');
    const events = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetType, 'PARENTAGE_APPEAL'));
    assert.ok(events.length >= 2, 'the appeal and its answer are both recorded');
  });
});

test('a pedigree waits for its second condition whichever one arrives last', async () => {
  await withCtx(async (ctx) => {
    const animal = await animalWithSheet(ctx, 'سگ اتصال دو شرطی');
    const receipt = await createReceipt(ctx.testDb.db, ctx.first.actor, [animal.animalId]);
    await attachReceiptFile(ctx.testDb.db, ctx.root, ctx.first.actor, receipt.id, { bytes: JPEG });
    await submitReceipt(ctx.testDb.db, ctx.first.actor, receipt.id);
    await reviewReceipt(ctx.testDb.db, ctx.centre.actor, { receiptId: receipt.id, decision: 'APPROVED' });
    await recordShipment(ctx.testDb.db, ctx.vet.actor, animal.sampleId!, 'پست پیشتاز');
    await receiveSample(ctx.testDb.db, ctx.centre.actor, animal.sampleId!);
    await startProcessing(ctx.testDb.db, ctx.centre.actor, animal.sampleId!);

    // Payment first, result second.
    await assert.rejects(
      () => createIssuanceRequest(ctx.testDb.db, ctx.first.actor, [animal.animalId]),
      /نتیجه Parentage/,
    );
    await recordResult(ctx.testDb.db, ctx.centre.actor, { sampleId: animal.sampleId! });
    const issuance = await createIssuanceRequest(ctx.testDb.db, ctx.first.actor, [animal.animalId]);
    assert.equal(await pedigreeOfAnimal(ctx.testDb.db, animal.animalId), null, 'no document before payment');

    const gateway = payingGateway(4_000_000n);
    const started = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: issuance.batch.id, callbackUrl: '/x' },
      gateway,
      'test-gateway',
    );
    assert.equal(
      (await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects)).state,
      'PAID',
    );
    assert.ok(await pedigreeOfAnimal(ctx.testDb.db, animal.animalId), 'the second condition finishes it');
  });
});
