import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { paymentBatches, paymentItems } from '../../src/db/schema/billing.ts';
import { matingPermits, permitAllocationShares } from '../../src/db/schema/mating.ts';
import {
  confirmCounterparty,
  cooldownAdvisory,
  permitQueue,
  permitsOfParty,
  permitView,
  resolveByPedigreeCode,
  reviewPermit,
  saveAllocationRule,
  startPermit,
  startPermitPayment,
  submitPermit,
} from '../../src/mating/permits.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { assertAllocationRule } from '../../src/domain/allocation.ts';
import {
  pedigreedAnimal,
  payPermitFee as payPermit,
  twoPedigreedAnimals,
  withMatingCtx,
  PERMIT_FEE,
  type MatingCtx,
} from '../helpers/mating.ts';

/** The shared mating fixture, on this suite's own reserved 0999 numbers. */
const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099907000', tmpPrefix: 'hamzist-permit-', councilCode: 'SYNTH-MP-1', chipBase: 5_000_000 },
    fn,
  );

test('the allocation rule is validated as a rule, never as a count of unborn puppies', () => {
  // §16 step 5 and §19: shape only, and no assumption about a litter size.
  assert.throws(
    () =>
      assertAllocationRule('PERCENTAGE', [
        { side: 'SIRE_SIDE', percent: 60 },
        { side: 'DAM_SIDE', percent: 60 },
      ]),
    /۱۰۰/,
  );
  assert.throws(() => assertAllocationRule('PERCENTAGE', [{ side: 'SIRE_SIDE', percent: 100 }]), /هر دو طرف/);
  assert.throws(
    () =>
      assertAllocationRule('FIXED', [
        { side: 'SIRE_SIDE', fixedCount: 1.5 },
        { side: 'DAM_SIDE', fixedCount: 1 },
      ]),
    /عدد صحیح/,
  );
  assert.throws(
    () =>
      assertAllocationRule('MIXED', [
        { side: 'SIRE_SIDE', fixedCount: 1 },
        { side: 'DAM_SIDE', fixedCount: 1 },
      ]),
    /درصد/,
  );
  assertAllocationRule('MIXED', [
    { side: 'SIRE_SIDE', fixedCount: 1, percent: 40 },
    { side: 'DAM_SIDE', fixedCount: 2, percent: 60 },
  ]);
});

test('a permit needs an active membership and two pedigreed animals of opposite sex', async () => {
  await withCtx(async (ctx) => {
    // Nothing registered yet: the lock names the pedigree, not the cooldown.
    const before = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'MATING_PERMIT');
    assert.equal(before.allowed, false);

    const { male, female } = await twoPedigreedAnimals(ctx);

    // An unknown code resolves to nothing at all.
    await assert.rejects(() => resolveByPedigreeCode(ctx.testDb.db, 'PD-NOSUCHCODE'), /پیدا نشد/);

    // Two animals of the same sex are not a mating pair.
    const sameSex = await pedigreedAnimal(ctx, ctx.second, 'سگ نر دوم', 'MALE');
    await assert.rejects(
      () =>
        startPermit(ctx.testDb.db, ctx.first.actor, {
          ownAnimalId: male.animalId,
          counterpartyPedigreeCode: sameSex.pedigreeCode,
        }),
      /یک نر و یک ماده/,
    );

    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    assert.equal(permit.status, 'AWAITING_COUNTERPARTY');
    assert.equal(permit.sireAnimalId, male.animalId);
    assert.equal(permit.damAnimalId, female.animalId);
    // The counterparty is the real owner of the resolved animal, not an input.
    assert.equal(permit.counterpartyAccountId, ctx.second.accountId);

    // A second live case for the same pair is refused.
    await assert.rejects(
      () =>
        startPermit(ctx.testDb.db, ctx.first.actor, {
          ownAnimalId: male.animalId,
          counterpartyPedigreeCode: female.pedigreeCode,
        }),
      /پرونده مجوز باز/,
    );

    // The invitation reached exactly the resolved owner, and resumes into the case.
    const invites = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.second.accountId),
          eq(notifications.kind, 'MATING_PERMIT_INVITATION'),
        ),
      );
    assert.equal(invites.length, 1);
    assert.equal(invites[0]!.entityId, permit.id);
    assert.equal(invites[0]!.originRoute, '/mating/permits/' + permit.id);
  });
});

test('only the resolved counterparty can confirm, from their own session', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });

    // The initiator cannot confirm on the other side's behalf…
    await assert.rejects(
      () => confirmCounterparty(ctx.testDb.db, ctx.first.actor, permit.id, true),
      /طرف مقابل/,
    );
    // …and someone outside the case cannot even see it.
    await assert.rejects(
      () => confirmCounterparty(ctx.testDb.db, ctx.vet.actor, permit.id, true),
      /پیدا نشد/,
    );

    const confirmed = await confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, true);
    assert.equal(confirmed.status, 'AWAITING_PAYMENT');
    assert.ok(confirmed.counterpartyConfirmedAt);

    // Both sides see the same case; nobody else does.
    assert.equal((await permitsOfParty(ctx.testDb.db, ctx.first.actor)).length, 1);
    assert.equal((await permitsOfParty(ctx.testDb.db, ctx.second.actor)).length, 1);
    assert.equal((await permitsOfParty(ctx.testDb.db, ctx.vet.actor)).length, 0);
  });
});

test('payment comes before the final submit, and paying alone issues nothing', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });

    // The rule cannot be recorded before the other side has confirmed.
    await assert.rejects(
      () =>
        saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
          type: 'PERCENTAGE',
          shares: [
            { side: 'SIRE_SIDE', percent: 50 },
            { side: 'DAM_SIDE', percent: 50 },
          ],
        }),
      /تأیید کند/,
    );
    await confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, true);

    // Nor can the fee be paid before the rule exists (§16 order).
    await assert.rejects(() => startPermitPayment(ctx.testDb.db, ctx.first.actor, permit.id), /توافق تقسیم/);

    await saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
      type: 'MIXED',
      shares: [
        { side: 'SIRE_SIDE', fixedCount: 1, percent: 40 },
        { side: 'DAM_SIDE', fixedCount: 2, percent: 60 },
      ],
      noteFa: 'توافق نمونه',
    });
    // The rule is stored per side and bound to the real owner of each animal.
    const shares = await ctx.testDb.db
      .select()
      .from(permitAllocationShares)
      .where(eq(permitAllocationShares.permitId, permit.id));
    assert.equal(shares.length, 2);
    assert.equal(shares.find((row) => row.side === 'SIRE_SIDE')!.partyAccountId, ctx.first.accountId);
    assert.equal(shares.find((row) => row.side === 'DAM_SIDE')!.partyAccountId, ctx.second.accountId);

    // Submitting before the payment is refused.
    await assert.rejects(() => submitPermit(ctx.testDb.db, ctx.first.actor, permit.id), /پرداخت/);

    const { batch, outcome } = await payPermit(ctx, permit.id);
    assert.equal(outcome.state, 'PAID');
    const [paid] = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));
    assert.equal(paid!.status, 'READY_TO_SUBMIT');
    assert.equal(paid!.permitNo, null, 'a verified payment is not an issued permit');
    assert.equal(paid!.issuedAt, null);

    // The money is a permit batch and its amount came from the settings key.
    const [batchRow] = await ctx.testDb.db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    assert.equal(batchRow!.service, 'MATING_PERMIT');
    const [item] = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));
    assert.equal(item!.settingKey, 'fee.mating_permit_toman');
    assert.equal(item!.amountToman, PERMIT_FEE);
    assert.equal(item!.targetType, 'MATING_CASE');

    const submitted = await submitPermit(ctx.testDb.db, ctx.first.actor, permit.id);
    assert.equal(submitted.status, 'UNDER_REVIEW');
    // The counterparty cannot submit the initiator's case.
    await assert.rejects(() => submitPermit(ctx.testDb.db, ctx.second.actor, permit.id), /آغازکننده|صف بررسی/);
  });
});

test('the association issues the permit once, and the official case reaches both animals', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, true);
    await saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
      type: 'FIXED',
      shares: [
        { side: 'SIRE_SIDE', fixedCount: 1 },
        { side: 'DAM_SIDE', fixedCount: 3 },
      ],
    });
    await payPermit(ctx, permit.id);
    await submitPermit(ctx.testDb.db, ctx.first.actor, permit.id);

    // An owner cannot review their own case; the operational panel owns this.
    await assert.rejects(
      () => reviewPermit(ctx.testDb.db, ctx.first.actor, { permitId: permit.id, decision: 'ISSUED' }),
      /عملیاتی/,
    );

    const queue = await permitQueue(ctx.testDb.db, ctx.association.actor);
    assert.equal(queue.length, 1);

    const issued = await reviewPermit(ctx.testDb.db, ctx.association.actor, {
      permitId: permit.id,
      decision: 'ISSUED',
      expectedVersion: queue[0]!.version,
    });
    assert.equal(issued.status, 'ISSUED');
    assert.match(issued.permitNo ?? '', /^MP-[A-Z0-9]{8}$/);
    assert.ok(issued.issuedAt);

    // Issuing again is refused: the case is no longer under review.
    await assert.rejects(
      () => reviewPermit(ctx.testDb.db, ctx.association.actor, { permitId: permit.id, decision: 'ISSUED' }),
      /در انتظار بررسی نیست/,
    );

    // The official case is recorded on both animals' files (§10, §16 step 9).
    for (const animalId of [male.animalId, female.animalId]) {
      const rows = await ctx.testDb.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetType, 'ANIMAL'), eq(auditEvents.targetId, animalId)));
      assert.ok(rows.some((row) => row.action === 'ANIMAL_MATING_PERMIT_ISSUED'));
    }

    // Both parties are told, and the puppy-card prerequisite moves on for them.
    for (const party of [ctx.first, ctx.second]) {
      const told = await ctx.testDb.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientAccountId, party.accountId),
            eq(notifications.kind, 'MATING_PERMIT_ISSUED'),
          ),
        );
      assert.equal(told.length, 1);
      const puppy = await eligibilityFor(ctx.testDb.db, party.accountId, 'PUPPY_CARD');
      assert.equal(puppy.allowed, false);
      assert.doesNotMatch(puppy.lock.reason, /مجوز جفت‌گیری/, 'the permit prerequisite is satisfied');
    }

    // Nothing about pregnancy, birth, a vet confirmation or a signature was
    // asked for anywhere on this path (§12.5, D13).
    const view = await permitView(ctx.testDb.db, issued);
    assert.equal(view.shares.length, 2);
    assert.equal(view.sire.ownerAccountId, ctx.first.accountId);
    assert.equal(view.dam.ownerAccountId, ctx.second.accountId);
  });
});

test('a correction keeps the verified payment, and a decline closes the case with its reason', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, true);
    await saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
      type: 'PERCENTAGE',
      shares: [
        { side: 'SIRE_SIDE', percent: 50 },
        { side: 'DAM_SIDE', percent: 50 },
      ],
    });
    const { batch } = await payPermit(ctx, permit.id);
    await submitPermit(ctx.testDb.db, ctx.first.actor, permit.id);

    await reviewPermit(ctx.testDb.db, ctx.association.actor, {
      permitId: permit.id,
      decision: 'NEEDS_CORRECTION',
      reasonFa: 'توافق تقسیم را دقیق‌تر بنویسید.',
    });

    // The rule can be corrected, the paid batch is untouched, and resubmitting
    // needs no second payment (§26).
    await saveAllocationRule(ctx.testDb.db, ctx.first.actor, permit.id, {
      type: 'PERCENTAGE',
      shares: [
        { side: 'SIRE_SIDE', percent: 40 },
        { side: 'DAM_SIDE', percent: 60 },
      ],
    });
    const [stillPaid] = await ctx.testDb.db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    assert.equal(stillPaid!.status, 'PAID');
    const again = await submitPermit(ctx.testDb.db, ctx.first.actor, permit.id);
    assert.equal(again.status, 'UNDER_REVIEW');

    await reviewPermit(ctx.testDb.db, ctx.association.actor, {
      permitId: permit.id,
      decision: 'REJECTED',
      reasonFa: 'مدارک پرونده کافی نیست.',
    });
    const [rejected] = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));
    assert.equal(rejected!.status, 'REJECTED');
    assert.equal(rejected!.permitNo, null);
    assert.match(rejected!.reasonFa ?? '', /کافی نیست/);
  });
});

test('a declined invitation closes the case, and the cooldown seam warns about nothing yet', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });

    // §17.2: with no mutually confirmed mating date there is no base date, so
    // no window is invented and no warning is produced.
    const advisory = await cooldownAdvisory(ctx.testDb.db, permit);
    assert.equal(advisory.hasWarning, false);
    assert.equal(advisory.messageFa, null);

    await assert.rejects(
      () => confirmCounterparty(ctx.testDb.db, ctx.second.actor, permit.id, false, ''),
      /دلیل/,
    );
    const declined = await confirmCounterparty(
      ctx.testDb.db,
      ctx.second.actor,
      permit.id,
      false,
      'فعلاً موافق نیستم.',
    );
    assert.equal(declined.status, 'REJECTED');
    assert.equal(declined.counterpartyConfirmedAt, null);
    await assert.rejects(() => startPermitPayment(ctx.testDb.db, ctx.first.actor, permit.id), /تأیید طرف مقابل/);
  });
});
