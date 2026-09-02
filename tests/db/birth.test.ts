/**
 * Pregnancy, birth and the puppy history — gate `birth-history-integrity`.
 *
 * §18 keeps the owner's record and the veterinarian's record independent, and
 * §19.2 makes history evidence: the first report keeps its numbers, a
 * correction is a new version with a reason, a profile is never deleted, and a
 * death after birth is a different thing from having been dead at birth. None
 * of it may touch the issued permit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { matingPermits } from '../../src/db/schema/mating.ts';
import { puppies } from '../../src/db/schema/breeding.ts';
import {
  birthHistory,
  correctBirth,
  litterView,
  recordBirth,
  recordPuppyDeath,
  renamePuppy,
} from '../../src/mating/birth.ts';
import {
  attachPregnancyCheck,
  declarePregnancy,
  pregnancyRecords,
  recordVetPregnancyResult,
} from '../../src/mating/pregnancy.ts';
import { startPermit } from '../../src/mating/permits.ts';
import { checkIn, createVisitRequests } from '../../src/vets/visits.ts';
import { todayCivil, addDays } from '../../src/domain/calendar.ts';
import {
  issuedPermit,
  takeToIssued,
  twoPedigreedAnimals,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';

/** The shared mating fixture, on this suite's own reserved 0999 numbers. */
const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099905000', tmpPrefix: 'hamzist-birth-', councilCode: 'SYNTH-BR-1', chipBase: 7_000_000 },
    fn,
  );

const daysAgo = (days: number) => addDays(todayCivil(), -days);

/** The optional §18.2 visit: a Finder request, checked in at that location. */
async function pregnancyVisit(ctx: MatingCtx, permitId: string, damAnimalId: string) {
  const created = await createVisitRequests(ctx.testDb.db, ctx.second.actor, {
    context: 'PREGNANCY',
    vetAccountId: ctx.vet.accountId,
    locationId: ctx.locationId,
    items: [{ animalId: damAnimalId, serviceType: 'PREGNANCY_CHECK' }],
  });
  const request = created.items[0]!.request;
  await attachPregnancyCheck(ctx.testDb.db, ctx.second.actor, permitId, request.id);
  await checkIn(ctx.testDb.db, ctx.vet.actor, {
    code: created.items[0]!.referral.code,
    locationId: ctx.locationId,
  });
  return request;
}

test('the owner declares without any vet, and the permit is untouched', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);

    // §18.1: before issuance there is no official declaration at all.
    const open = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await assert.rejects(
      () => declarePregnancy(ctx.testDb.db, ctx.first.actor, open.id, { pregnant: true }),
      /مجوز صادرشده/,
    );

    // The same case, once issued, is where the declaration lives.
    const permit = await takeToIssued(ctx, open);
    const before = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));

    const first = await declarePregnancy(ctx.testDb.db, ctx.first.actor, permit.id, {
      pregnant: true,
      expectedCount: 4,
    });
    assert.equal(first.version, 1);
    assert.equal(first.declaredByAccountId, ctx.first.accountId);

    // A correction needs a reason and keeps the earlier version intact.
    await assert.rejects(
      () => declarePregnancy(ctx.testDb.db, ctx.second.actor, permit.id, { pregnant: true, expectedCount: 5 }),
      /علت الزامی/,
    );
    const second = await declarePregnancy(ctx.testDb.db, ctx.second.actor, permit.id, {
      pregnant: true,
      expectedCount: 5,
      reasonFa: 'شمارش دقیق‌تر پس از سونوگرافی.',
    });
    assert.equal(second.version, 2);
    const records = await pregnancyRecords(ctx.testDb.db, permit.id);
    assert.equal(records.declarations.length, 2);
    assert.equal(records.declarations[1]!.expectedCount, 4, 'the first version is not overwritten');
    assert.equal(records.mismatch, false, 'no vet record means nothing to disagree with');

    // A negative or fractional estimate is refused.
    await assert.rejects(
      () =>
        declarePregnancy(ctx.testDb.db, ctx.first.actor, permit.id, {
          pregnant: true,
          expectedCount: -1,
          reasonFa: 'آزمایشی',
        }),
      /نامنفی/,
    );

    // §18.1: none of this changed the permit in any way.
    const after = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));
    assert.equal(after[0]!.status, 'ISSUED');
    assert.deepEqual(
      { v: after[0]!.version, no: after[0]!.permitNo },
      { v: before[0]!.version, no: before[0]!.permitNo },
    );
    // A third party is not part of this case.
    await assert.rejects(
      () => declarePregnancy(ctx.testDb.db, ctx.vet.actor, permit.id, { pregnant: false }),
      /پیدا نشد/,
    );
  });
});

test('the vet result is a separate record, and a difference is neutral and notified', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);
    await declarePregnancy(ctx.testDb.db, ctx.first.actor, permit.id, { pregnant: true, expectedCount: 4 });

    const request = await pregnancyVisit(ctx, permit.id, female.animalId);
    // Only the assigned veterinarian may record it, from the vet panel.
    await assert.rejects(
      () => recordVetPregnancyResult(ctx.testDb.db, ctx.first.actor, request.id, { pregnant: true }),
      /پنل دامپزشک/,
    );

    const result = await recordVetPregnancyResult(ctx.testDb.db, ctx.vet.actor, request.id, {
      pregnant: true,
      expectedCount: 6,
      noteFa: 'شمارش تخمینی در معاینه.',
    });
    assert.equal(result.version, 1);
    assert.equal(result.councilCode, 'SYNTH-BR-1');
    assert.equal(result.locationId, ctx.locationId, 'the examination location, not a place of mating');

    // §18.3: neither record rewrote the other.
    const records = await pregnancyRecords(ctx.testDb.db, permit.id);
    assert.equal(records.declaration!.expectedCount, 4);
    assert.equal(records.checks[0]!.latest!.expectedCount, 6);
    assert.equal(records.mismatch, true);

    // §18.4: the audit event references both records, and the notice is neutral.
    const [mismatch] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PREGNANCY_RECORDS_MISMATCH'));
    assert.ok(mismatch);
    assert.equal((mismatch.before as { ownerDeclarationId: string }).ownerDeclarationId, records.declaration!.id);
    assert.equal((mismatch.after as { vetResultId: string }).vetResultId, result.id);
    const [told] = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.first.accountId),
          eq(notifications.kind, 'PREGNANCY_RECORDS_MISMATCH'),
        ),
      );
    assert.ok(told);
    assert.equal(told.originRoute, '/mating/permits/' + permit.id + '/pregnancy');
    assert.match(told.bodyFa, /اختلاف حقوقی نیست/);

    // The vet may correct their own record, with a reason, keeping history.
    const corrected = await recordVetPregnancyResult(ctx.testDb.db, ctx.vet.actor, request.id, {
      pregnant: true,
      expectedCount: 4,
      reasonFa: 'اصلاح پس از معاینه دوم.',
    });
    assert.equal(corrected.version, 2);
    const after = await pregnancyRecords(ctx.testDb.db, permit.id);
    assert.equal(after.checks[0]!.results.length, 2);
    assert.equal(after.mismatch, false, 'equal values need no mismatch state');

    // Throughout, the permit stayed exactly as issued.
    const [row] = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));
    assert.equal(row!.status, 'ISSUED');
  });
});

test('live and dead counts are independent, and a dead-at-birth puppy gets no profile', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    for (const bad of [
      { liveCount: -1, deadCount: 0 },
      { liveCount: 1.5, deadCount: 0 },
      { liveCount: 1, deadCount: -2 },
      { liveCount: Number.NaN, deadCount: 0 },
    ]) {
      await assert.rejects(
        () => recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, { bornOn: daysAgo(1), ...bad }),
        /نامنفی/,
      );
    }
    await assert.rejects(
      () =>
        recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
          bornOn: addDays(todayCivil(), 1),
          liveCount: 1,
          deadCount: 0,
        }),
      /آینده/,
    );

    const { event, created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(2),
      liveCount: 3,
      deadCount: 2,
    });
    assert.equal(event.liveCount, 3);
    assert.equal(event.deadCount, 2);
    // Exactly one profile per live puppy, and none for the two born dead.
    assert.equal(created.length, 3);
    for (const puppy of created) {
      assert.match(puppy.tempCode, /^PUP-[A-Z0-9]{8}$/);
      assert.equal(puppy.nameFa, null, 'the name stays optional until the microchip stage');
    }
    const view = await litterView(ctx.testDb.db, permit.id);
    assert.equal(view.puppies.length, 3);
    assert.equal(view.reportedLiveAtBirth, 3);
    assert.equal(view.reportedDeadAtBirth, 2);
    assert.equal(view.livingNow, 3);

    await assert.rejects(
      () =>
        recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
          bornOn: daysAgo(1),
          liveCount: 1,
          deadCount: 0,
        }),
      /ثبت شده است/,
    );
  });
});

test('a birth with no puppy at all is a recorded result, not a missing one', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    const { event, created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(1),
      liveCount: 0,
      deadCount: 0,
    });
    assert.equal(event.liveCount, 0);
    assert.equal(created.length, 0);
    const view = await litterView(ctx.testDb.db, permit.id);
    assert.ok(view.litter, 'the litter exists even with no puppy');
    assert.equal(view.puppies.length, 0);

    // Live zero with dead above zero is the other recorded outcome.
    await withCtx(async (other) => {
      const pair = await twoPedigreedAnimals(other);
      const second = await issuedPermit(other, pair.male, pair.female);
      const result = await recordBirth(other.testDb.db, other.first.actor, second.id, {
        bornOn: daysAgo(1),
        liveCount: 0,
        deadCount: 3,
      });
      assert.equal(result.created.length, 0);
      assert.equal(result.event.deadCount, 3);
    });
  });
});

test('a correction keeps every earlier version and never deletes a profile', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);
    const { created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(3),
      liveCount: 2,
      deadCount: 1,
    });

    // A correction needs a reason and the version it was shown for.
    await assert.rejects(
      () =>
        correctBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
          liveCount: 3,
          deadCount: 1,
          reasonFa: '',
          expectedVersion: 1,
        }),
      /علت الزامی/,
    );
    await assert.rejects(
      () =>
        correctBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
          liveCount: 3,
          deadCount: 1,
          reasonFa: 'شمارش دوباره.',
          expectedVersion: 7,
        }),
      (error: unknown) => (error as { code?: string }).code === 'VERSION_STALE',
    );

    // An increase creates only the missing profile; the existing two are untouched.
    const up = await correctBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      liveCount: 3,
      deadCount: 1,
      reasonFa: 'یک توله در گزارش اول جا افتاده بود.',
      expectedVersion: 1,
    });
    assert.equal(up.event.version, 2);
    assert.equal(up.event.kind, 'CORRECTION');
    assert.equal(up.created.length, 1);
    assert.equal(up.withdrawn.length, 0);
    const afterUp = await litterView(ctx.testDb.db, permit.id);
    assert.equal(afterUp.puppies.length, 3);
    for (const original of created) {
      assert.ok(afterUp.puppies.some((row) => row.id === original.id), 'no profile was replaced');
    }

    // A decrease without naming the affected profiles is refused outright.
    await assert.rejects(
      () =>
        correctBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
          liveCount: 2,
          deadCount: 1,
          reasonFa: 'یکی از توله‌ها اشتباه شمرده شده بود.',
          expectedVersion: 2,
        }),
      /حذف خودکار انجام نمی‌شود/,
    );

    const victim = afterUp.puppies[2]!;
    const down = await correctBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      liveCount: 2,
      deadCount: 1,
      reasonFa: 'گزارش اولیه یک توله را دوبار شمرده بود.',
      expectedVersion: 2,
      withdrawPuppyIds: [victim.id],
    });
    assert.equal(down.withdrawn.length, 1);
    // Withdrawn, not deleted: the row is still there with its reason.
    const [stillThere] = await ctx.testDb.db.select().from(puppies).where(eq(puppies.id, victim.id));
    assert.equal(stillThere!.status, 'WITHDRAWN');
    assert.equal(stillThere!.withdrawnByVersion, 3);
    assert.match(stillThere!.withdrawnReasonFa ?? '', /دوبار شمرده/);

    // Every version is kept, including the first report's numbers.
    const history = await birthHistory(ctx.testDb.db, permit.id);
    assert.equal(history.length, 3);
    assert.deepEqual(
      history.map((row) => [row.version, row.liveCount, row.deadCount]),
      [
        [3, 2, 1],
        [2, 3, 1],
        [1, 2, 1],
      ],
    );
    const audit = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'BIRTH_COUNTS_CORRECTED'));
    assert.equal(audit.length, 2);
    assert.ok(audit.every((row) => (row.reason ?? '').length > 3), 'every correction carries its reason');

    // No association review was added anywhere on this path.
    const [row] = await ctx.testDb.db.select().from(matingPermits).where(eq(matingPermits.id, permit.id));
    assert.equal(row!.status, 'ISSUED');
  });
});

test('a death after birth keeps the profile and the originally reported count', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);
    const { created } = await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(10),
      liveCount: 3,
      deadCount: 0,
    });
    const puppy = created[0]!;

    await assert.rejects(
      () =>
        recordPuppyDeath(ctx.testDb.db, ctx.first.actor, permit.id, {
          puppyId: puppy.id,
          diedOn: daysAgo(5),
          reasonFa: '',
          expectedVersion: puppy.version,
        }),
      /علت الزامی/,
    );
    await assert.rejects(
      () =>
        recordPuppyDeath(ctx.testDb.db, ctx.first.actor, permit.id, {
          puppyId: puppy.id,
          diedOn: daysAgo(20),
          reasonFa: 'آزمایشی',
          expectedVersion: puppy.version,
        }),
      /پیش از تاریخ تولد/,
    );

    const dead = await recordPuppyDeath(ctx.testDb.db, ctx.first.actor, permit.id, {
      puppyId: puppy.id,
      diedOn: daysAgo(4),
      reasonFa: 'بیماری پس از تولد.',
      expectedVersion: puppy.version,
    });
    assert.equal(dead.status, 'DECEASED');
    assert.equal(dead.diedOn, daysAgo(4));

    // §19.2: the report keeps its number, only the current count moves.
    const view = await litterView(ctx.testDb.db, permit.id);
    assert.equal(view.reportedLiveAtBirth, 3, 'the birth report is unchanged');
    assert.equal(view.current!.liveCount, 3, 'a death is not a correction of the report');
    assert.equal(view.profiles, 3, 'the profile is kept');
    assert.equal(view.livingNow, 2);
    assert.equal(view.diedAfterBirth, 1);

    const [audit] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PUPPY_DIED_AFTER_BIRTH'));
    assert.equal(audit!.targetId, puppy.id, 'the event names the puppy it concerns');
    assert.equal((audit!.after as { reportedLiveAtBirth: number }).reportedLiveAtBirth, 3);
    assert.equal((audit!.after as { livingNow: number }).livingNow, 2);

    // A stale edit of the same puppy is refused, and a second death is too.
    await assert.rejects(
      () =>
        recordPuppyDeath(ctx.testDb.db, ctx.first.actor, permit.id, {
          puppyId: puppy.id,
          diedOn: daysAgo(3),
          reasonFa: 'دوباره',
          expectedVersion: puppy.version,
        }),
      (error: unknown) => (error as { code?: string }).code === 'VERSION_STALE',
    );
    await assert.rejects(
      () =>
        renamePuppy(ctx.testDb.db, ctx.first.actor, permit.id, {
          puppyId: puppy.id,
          nameFa: 'نام تازه',
          expectedVersion: puppy.version,
        }),
      (error: unknown) => (error as { code?: string }).code === 'VERSION_STALE',
    );

    // A correction after a death still speaks about the report, and the dead
    // puppy's profile counts as one of the profiles that report created.
    const corrected = await correctBirth(ctx.testDb.db, ctx.second.actor, permit.id, {
      liveCount: 4,
      deadCount: 0,
      reasonFa: 'یک توله زنده در گزارش اول شمرده نشده بود.',
      expectedVersion: 1,
    });
    assert.equal(corrected.created.length, 1, 'only the missing profile is added');
    const afterAll = await litterView(ctx.testDb.db, permit.id);
    assert.equal(afterAll.profiles, 4);
    assert.equal(afterAll.livingNow, 3);
    assert.equal(afterAll.reportedLiveAtBirth, 3, 'the original report is still readable');
  });
});

test('a vet result never rewrites the counts or the profiles', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);
    await declarePregnancy(ctx.testDb.db, ctx.first.actor, permit.id, { pregnant: true, expectedCount: 3 });
    await recordBirth(ctx.testDb.db, ctx.first.actor, permit.id, {
      bornOn: daysAgo(2),
      liveCount: 3,
      deadCount: 0,
    });
    const before = await litterView(ctx.testDb.db, permit.id);

    const request = await pregnancyVisit(ctx, permit.id, female.animalId);
    await recordVetPregnancyResult(ctx.testDb.db, ctx.vet.actor, request.id, {
      pregnant: true,
      expectedCount: 1,
      noteFa: 'تعداد متفاوت با اعلام مالک.',
    });

    const after = await litterView(ctx.testDb.db, permit.id);
    assert.equal(after.puppies.length, before.puppies.length, 'no profile was created or removed');
    assert.equal(after.current!.liveCount, 3, 'the owner’s reported count is untouched');
    assert.equal((await birthHistory(ctx.testDb.db, permit.id)).length, 1, 'no version was appended');
    const records = await pregnancyRecords(ctx.testDb.db, permit.id);
    assert.equal(records.mismatch, true, 'the difference is a display state, nothing more');
  });
});
