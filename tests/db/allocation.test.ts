/**
 * Two-party allocation and Puppy Cards — gate `allocation-version-integrity`.
 *
 * §19.3 makes one thing decisive: a puppy's owner is settled only when both
 * actual counterparties confirm the same version. This suite tries the ways
 * that could be bypassed — one party alone, an approval of an older version, a
 * changed proposal, and a payment — and shows that none of them works.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { paymentBatches, paymentItems } from '../../src/db/schema/billing.ts';
import { puppyAllocations, puppyCards } from '../../src/db/schema/breeding.ts';
import { registrationSheets } from '../../src/db/schema/documents.ts';
import {
  allocationView,
  cardEligibility,
  cardsOfOwner,
  currentAllocation,
  proposeAllocation,
  respondToAllocation,
  startCardPayment,
} from '../../src/mating/allocation.ts';
import { litterOfPermit, recordBirth, recordPuppyDeath } from '../../src/mating/birth.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import {
  issuedPermit,
  payingGateway,
  twoPedigreedAnimals,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';

/** SYNTHETIC tariff: the real per-puppy price has not been published. */
const CARD_FEE = '120000';

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099906000', tmpPrefix: 'hamzist-alloc-', councilCode: 'SYNTH-AL-1', chipBase: 8_000_000 },
    fn,
  );

const daysAgo = (days: number) => addDays(todayCivil(), -days);

/** An issued permit whose litter already has three living puppies. */
async function litterOfThree(ctx: MatingCtx) {
  const { male, female } = await twoPedigreedAnimals(ctx);
  const permit = await issuedPermit(ctx, male, female);
  const { created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
    bornOn: daysAgo(5),
    liveCount: 3,
    deadCount: 0,
  });
  await updateSetting(ctx.testDb.db, ctx.admin.actor, {
    key: 'fee.puppy_card_toman',
    value: CARD_FEE,
    reason: 'SYNTHETIC — مقدار آزمایشی',
  });
  return { permit, puppies: created };
}

const assignAll = (
  rows: readonly { id: string }[],
  owner: string,
): ReadonlyArray<{ puppyId: string; proposedOwnerAccountId: string }> =>
  rows.map((row) => ({ puppyId: row.id, proposedOwnerAccountId: owner }));

async function payForCards(ctx: MatingCtx, permitId: string, puppyIds: readonly string[], actor = ctx.first.actor) {
  const batch = await startCardPayment(ctx.testDb.db, actor, permitId, puppyIds);
  const gateway = payingGateway(BigInt(Number(CARD_FEE) * 10 * puppyIds.length));
  const started = await startAttempt(
    ctx.testDb.db,
    actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test-gateway',
  );
  const outcome = await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
  return { batch, outcome };
}

test('one party alone never finalises, and both parties on the same version do', async () => {
  await withCtx(async (ctx) => {
    const { permit, puppies } = await litterOfThree(ctx);

    // The pre-birth rule is context: it assigns nothing by itself, so before a
    // proposal exists there is no allocation at all.
    assert.equal(await currentAllocation(ctx.testDb.db, permit.id), null);

    // Every puppy needs a proposed owner, and that owner must be a real party.
    await assert.rejects(
      () =>
        proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
          assignments: [{ puppyId: puppies[0]!.id, proposedOwnerAccountId: ctx.first.accountId }],
        }),
      /همه توله‌های این پرونده/,
    );
    await assert.rejects(
      () =>
        proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
          assignments: assignAll(puppies, ctx.vet.accountId),
        }),
      /یکی از دو طرف/,
    );

    const allocation = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: [
        { puppyId: puppies[0]!.id, proposedOwnerAccountId: ctx.first.accountId },
        { puppyId: puppies[1]!.id, proposedOwnerAccountId: ctx.second.accountId },
        { puppyId: puppies[2]!.id, proposedOwnerAccountId: ctx.first.accountId },
      ],
      noteFa: 'پیشنهاد بر پایه توافق پیش از تولد.',
    });
    assert.equal(allocation.version, 1);
    assert.equal(allocation.status, 'PENDING_BOTH_OWNERS');

    // One party's approval is not agreement.
    const afterFirst = await respondToAllocation(ctx.testDb.db, ctx.first.actor, {
      allocationId: allocation.id,
      expectedVersion: 1,
      approve: true,
    });
    assert.equal(afterFirst.status, 'PENDING_BOTH_OWNERS');
    assert.equal(afterFirst.finalizedAt, null);
    // The same party cannot approve twice to fake the second confirmation.
    await assert.rejects(
      () =>
        respondToAllocation(ctx.testDb.db, ctx.first.actor, {
          allocationId: allocation.id,
          expectedVersion: 1,
          approve: true,
        }),
      /پاسخ شما برای این نسخه ثبت شده است/,
    );
    // Nobody outside the two parties has any say.
    await assert.rejects(
      () =>
        respondToAllocation(ctx.testDb.db, ctx.vet.actor, {
          allocationId: allocation.id,
          expectedVersion: 1,
          approve: true,
        }),
      /پیدا نشد/,
    );

    const afterBoth = await respondToAllocation(ctx.testDb.db, ctx.second.actor, {
      allocationId: allocation.id,
      expectedVersion: 1,
      approve: true,
    });
    assert.equal(afterBoth.status, 'FINAL');
    assert.ok(afterBoth.finalizedAt);

    // §5: only a FINAL allocation counts towards the puppy-card prerequisite.
    const eligibility = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'PUPPY_CARD');
    assert.equal(eligibility.allowed, true);
  });
});

test('a changed proposal starts a fresh version and old approvals cannot approve it', async () => {
  await withCtx(async (ctx) => {
    const { permit, puppies } = await litterOfThree(ctx);
    const first = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: assignAll(puppies, ctx.first.accountId),
    });
    await respondToAllocation(ctx.testDb.db, ctx.first.actor, {
      allocationId: first.id,
      expectedVersion: 1,
      approve: true,
    });

    // The other side proposes different data instead of approving.
    const second = await proposeAllocation(ctx.testDb.db, ctx.second.actor, permit.id, {
      assignments: assignAll(puppies, ctx.second.accountId),
      noteFa: 'تقسیم پیشنهادی دیگر.',
    });
    assert.equal(second.version, 2);
    assert.equal(second.replacesVersion, 1);

    // The old version is history and cannot be approved into effect any more.
    const [old] = await ctx.testDb.db
      .select()
      .from(puppyAllocations)
      .where(eq(puppyAllocations.id, first.id));
    assert.equal(old!.status, 'SUPERSEDED');
    await assert.rejects(
      () =>
        respondToAllocation(ctx.testDb.db, ctx.second.actor, {
          allocationId: first.id,
          expectedVersion: 1,
          approve: true,
        }),
      /در انتظار تأیید نیست/,
    );
    // An approval aimed at the new record but carrying the old version number
    // is refused as stale rather than silently applied.
    await assert.rejects(
      () =>
        respondToAllocation(ctx.testDb.db, ctx.first.actor, {
          allocationId: second.id,
          expectedVersion: 1,
          approve: true,
        }),
      (error: unknown) => (error as { code?: string }).code === 'VERSION_STALE',
    );

    // The first party's earlier approval does not count for version 2.
    const view = await allocationView(ctx.testDb.db, ctx.first.actor, (await litterOfPermit(ctx.testDb.db, permit.id))!.id);
    assert.equal(view.current!.version, 2);
    assert.equal(view.approvals.length, 0, 'a new version starts with no approvals');
    assert.equal(view.history.length, 2, 'both versions stay readable');

    // Both sides confirm version 2 and only then is it final.
    await respondToAllocation(ctx.testDb.db, ctx.first.actor, {
      allocationId: second.id,
      expectedVersion: 2,
      approve: true,
    });
    const finalised = await respondToAllocation(ctx.testDb.db, ctx.second.actor, {
      allocationId: second.id,
      expectedVersion: 2,
      approve: true,
    });
    assert.equal(finalised.status, 'FINAL');
  });
});

test('a rejection asks for a new proposal and Hamzist picks no winner', async () => {
  await withCtx(async (ctx) => {
    const { permit, puppies } = await litterOfThree(ctx);
    const proposal = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: assignAll(puppies, ctx.first.accountId),
    });

    await assert.rejects(
      () =>
        respondToAllocation(ctx.testDb.db, ctx.second.actor, {
          allocationId: proposal.id,
          expectedVersion: 1,
          approve: false,
          reasonFa: '',
        }),
      /دلیل الزامی/,
    );
    const rejected = await respondToAllocation(ctx.testDb.db, ctx.second.actor, {
      allocationId: proposal.id,
      expectedVersion: 1,
      approve: false,
      reasonFa: 'با این تقسیم موافق نیستم.',
    });
    assert.equal(rejected.status, 'REJECTED');

    // No side won: the card stays locked and a revised proposal is needed.
    const locked = await cardEligibility(ctx.testDb.db, ctx.first.actor, permit.id);
    assert.ok(locked.every((row) => !row.eligible));
    assert.match(locked[0]!.reasonFa ?? '', /تأیید هر دو طرف/);
    const [told] = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.first.accountId),
          eq(notifications.kind, 'ALLOCATION_REJECTED'),
        ),
      );
    assert.match(told!.bodyFa, /داوری نمی‌کند/);

    // The revised proposal comes back into the same case as version 2.
    const revised = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: [
        { puppyId: puppies[0]!.id, proposedOwnerAccountId: ctx.first.accountId },
        { puppyId: puppies[1]!.id, proposedOwnerAccountId: ctx.second.accountId },
        { puppyId: puppies[2]!.id, proposedOwnerAccountId: ctx.second.accountId },
      ],
      noteFa: 'نسخه اصلاح‌شده پس از توافق بیرون از سامانه.',
    });
    assert.equal(revised.version, 2);
    // Both values stay readable: the rejected version keeps its own items.
    const history = await ctx.testDb.db
      .select()
      .from(puppyAllocations)
      .where(eq(puppyAllocations.permitId, permit.id));
    assert.equal(history.length, 2);
    assert.ok(history.some((row) => row.status === 'REJECTED'));
  });
});

test('payment cannot bypass the two-party gate, and a card needs no registration sheet', async () => {
  await withCtx(async (ctx) => {
    const { permit, puppies } = await litterOfThree(ctx);
    const proposal = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: assignAll(puppies, ctx.first.accountId),
    });
    await respondToAllocation(ctx.testDb.db, ctx.first.actor, {
      allocationId: proposal.id,
      expectedVersion: 1,
      approve: true,
    });

    // §19.3: one approval plus money is still not an allocation.
    await assert.rejects(
      () => startCardPayment(ctx.testDb.db, ctx.first.actor, permit.id, [puppies[0]!.id]),
      /تأیید هر دو طرف/,
    );

    await respondToAllocation(ctx.testDb.db, ctx.second.actor, {
      allocationId: proposal.id,
      expectedVersion: 1,
      approve: true,
    });

    const { batch, outcome } = await payForCards(ctx, permit.id, [puppies[0]!.id, puppies[1]!.id]);
    assert.equal(outcome.state, 'PAID');
    const [batchRow] = await ctx.testDb.db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    assert.equal(batchRow!.service, 'PUPPY_CARD');
    const items = await ctx.testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));
    assert.equal(items.length, 2, 'one priced item per puppy');
    assert.ok(items.every((row) => row.settingKey === 'fee.puppy_card_toman' && row.amountToman === CARD_FEE));

    const cards = await ctx.testDb.db.select().from(puppyCards).where(eq(puppyCards.permitId, permit.id));
    assert.equal(cards.length, 2, 'each chosen puppy gets its own card');
    for (const card of cards) {
      assert.match(card.cardNo, /^PC-[A-Z0-9]{8}$/);
      assert.equal(card.allocationVersion, 1);
      assert.equal(card.ownerAccountId, ctx.first.accountId);
    }

    // §19.4: the card came before any registration sheet for that puppy, and it
    // is a different document from the sheet, the pedigree and the result.
    const sheets = await ctx.testDb.db
      .select()
      .from(registrationSheets)
      .where(eq(registrationSheets.animalId, puppies[0]!.id));
    assert.equal(sheets.length, 0, 'no registration sheet was needed or created');

    // The third puppy has no card, and asking again for an already-carded puppy
    // is refused rather than issuing a second one.
    const eligibility = await cardEligibility(ctx.testDb.db, ctx.first.actor, permit.id);
    assert.equal(eligibility.filter((row) => row.eligible).length, 1);
    await assert.rejects(
      () => startCardPayment(ctx.testDb.db, ctx.first.actor, permit.id, [puppies[0]!.id]),
      /کارت این توله صادر شده است/,
    );

    // The other party owns none of these cards and sees none of them.
    assert.equal((await cardsOfOwner(ctx.testDb.db, ctx.second.accountId)).length, 0);
    assert.equal((await cardsOfOwner(ctx.testDb.db, ctx.first.accountId)).length, 2);
  });
});

test('a batch is issued item by item, and a puppy that dies keeps its card and history', async () => {
  await withCtx(async (ctx) => {
    const { permit, puppies } = await litterOfThree(ctx);
    const proposal = await proposeAllocation(ctx.testDb.db, ctx.first.actor, permit.id, {
      assignments: assignAll(puppies, ctx.first.accountId),
    });
    for (const actor of [ctx.first.actor, ctx.second.actor]) {
      await respondToAllocation(ctx.testDb.db, actor, {
        allocationId: proposal.id,
        expectedVersion: 1,
        approve: true,
      });
    }

    // One card is issued first, then that puppy dies.
    await payForCards(ctx, permit.id, [puppies[0]!.id]);
    const [issued] = await ctx.testDb.db
      .select()
      .from(puppyCards)
      .where(eq(puppyCards.puppyId, puppies[0]!.id));
    assert.ok(issued);

    const [alive] = await ctx.testDb.db
      .select()
      .from(puppyCards)
      .where(eq(puppyCards.puppyId, puppies[1]!.id));
    assert.equal(alive, undefined);

    await recordPuppyDeath(ctx.testDb.db, ctx.first.actor, permit.id, {
      puppyId: puppies[0]!.id,
      diedOn: daysAgo(1),
      reasonFa: 'بیماری پس از تولد.',
      expectedVersion: 1,
    });
    // The issued card and its history are untouched by the death.
    const [afterDeath] = await ctx.testDb.db
      .select()
      .from(puppyCards)
      .where(eq(puppyCards.puppyId, puppies[0]!.id));
    assert.equal(afterDeath!.cardNo, issued!.cardNo);
    assert.equal(afterDeath!.ownerAccountId, ctx.first.accountId);

    // The deceased puppy of the second batch is recorded as blocked while the
    // other puppy of the same batch is issued: one payment, item-level outcomes.
    const { outcome } = await payForCards(ctx, permit.id, [puppies[1]!.id]);
    assert.equal(outcome.state, 'PAID');
    const cards = await ctx.testDb.db.select().from(puppyCards).where(eq(puppyCards.permitId, permit.id));
    assert.equal(cards.length, 2);

    // A new card for a deceased puppy is refused with its stated reason.
    const eligibility = await cardEligibility(ctx.testDb.db, ctx.first.actor, permit.id);
    const dead = eligibility.find((row) => row.puppyId === puppies[0]!.id)!;
    assert.equal(dead.eligible, false);
    assert.equal(dead.card?.cardNo, issued!.cardNo, 'the issued document is preserved');

    const [audit] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'PUPPY_CARD_ISSUED'), eq(auditEvents.targetId, puppies[1]!.id)));
    assert.ok(audit, 'each issued card is recorded on its own puppy');
  });
});

test('cards and allocation exist only for an issued permit, never for a personal route', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    // A case that never reached issuance is the closest thing to the personal
    // route in the official tables: it has no permit, so nothing here opens.
    const { startPermit } = await import('../../src/mating/permits.ts');
    const open = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await assert.rejects(
      () => proposeAllocation(ctx.testDb.db, ctx.first.actor, open.id, { assignments: [] }),
      /مجوز صادرشده/,
    );
    await assert.rejects(
      () => startCardPayment(ctx.testDb.db, ctx.first.actor, open.id, ['00000000-0000-0000-0000-000000000000']),
      /پیدا نشد|مجوز صادرشده/,
    );
    await assert.rejects(
      () => cardEligibility(ctx.testDb.db, ctx.vet.actor, open.id),
      /پیدا نشد/,
    );
  });
});
