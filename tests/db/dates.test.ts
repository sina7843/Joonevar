/**
 * Official mating dates — gate `dates-version-concurrency`.
 *
 * §17.1 makes every declaration a version and forbids overwriting: a correction
 * appends, a stale approval must not confirm the new version, and both values
 * of a disagreement stay readable. §17.2 then reads only the newest mutually
 * confirmed date, for both animals, at every permit entry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { matingDateDeclarations } from '../../src/db/schema/mating.ts';
import {
  confirmDate,
  datesOfPermit,
  declareDate,
  declareDifferentDate,
  pendingDate,
} from '../../src/mating/dates.ts';
import {
  cooldownAdvisoryForAnimals,
  latestConfirmedDateOfAnimal,
} from '../../src/mating/cooldown.ts';
import { cooldownAdvisory, startPermit } from '../../src/mating/permits.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import {
  issuedPermit,
  takeToIssued,
  pedigreedAnimal,
  twoPedigreedAnimals,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';

/** The shared mating fixture, on this suite's own reserved 0999 numbers. */
const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099906000', tmpPrefix: 'hamzist-dates-', councilCode: 'SYNTH-MD-1', chipBase: 6_000_000 },
    fn,
  );

const daysAgo = (days: number) => addDays(todayCivil(), -days);

test('dates open only on an issued permit, and both participants may declare', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);

    // §17.1: before issuance there is no official date at all.
    const open = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: female.pedigreeCode,
    });
    await assert.rejects(
      () => declareDate(ctx.testDb.db, ctx.first.actor, open.id, { matedOn: daysAgo(3) }),
      /مجوز صادرشده/,
    );

    // The very same case, once issued, does open the official dates.
    const permit = await takeToIssued(ctx, open);

    // Either side declares, more than once, including twice in the same week.
    const first = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(6) });
    assert.equal(first.version, 1);
    assert.equal(first.declaredByAccountId, ctx.first.accountId);
    await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: first.id,
      expectedVersion: 1,
    });

    const second = await declareDate(ctx.testDb.db, ctx.second.actor, permit.id, { matedOn: daysAgo(4) });
    assert.equal(second.version, 2);
    assert.equal(second.declaredByAccountId, ctx.second.accountId);
    await confirmDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      declarationId: second.id,
      expectedVersion: 2,
    });

    // Confirming one date never deletes another: both stay in the history.
    const rows = await datesOfPermit(ctx.testDb.db, permit.id);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.status === 'CONFIRMED').length, 2);

    // A future date is not a mating that happened.
    await assert.rejects(
      () => declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: addDays(todayCivil(), 1) }),
      /آینده/,
    );
    // A third party is not part of this case.
    await assert.rejects(
      () => declareDate(ctx.testDb.db, ctx.vet.actor, permit.id, { matedOn: daysAgo(2) }),
      /پیدا نشد/,
    );
  });
});

test('a correction appends a version and a stale approval cannot confirm it', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    const original = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      matedOn: daysAgo(10),
      noteFa: 'اعلام اول',
    });
    // The counterparty opens the confirmation screen for version 1 here.
    const corrected = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      matedOn: daysAgo(9),
      replacesVersion: original.version,
    });
    assert.equal(corrected.version, 2);
    assert.equal(corrected.replacesVersion, 1);

    // The approval that was open for version 1 is now stale, in both the shapes
    // a browser could send it: by the old row, and by the old version number.
    await assert.rejects(
      () =>
        confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: original.id,
          expectedVersion: 1,
        }),
      /در انتظار تأیید نیست/,
    );
    await assert.rejects(
      () =>
        confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: corrected.id,
          expectedVersion: 1,
        }),
      (error: unknown) => (error as { code?: string }).code === 'VERSION_STALE',
    );
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, male.animalId), null);

    // The old row is still there, unchanged apart from being superseded.
    const [old] = await ctx.testDb.db
      .select()
      .from(matingDateDeclarations)
      .where(eq(matingDateDeclarations.id, original.id));
    assert.equal(old!.status, 'SUPERSEDED');
    assert.equal(old!.matedOn, daysAgo(10));
    assert.equal(old!.noteFa, 'اعلام اول');

    // Only the new version can be confirmed, and only by the other side.
    await assert.rejects(
      () =>
        confirmDate(ctx.testDb.db, ctx.first.actor, permit.id, {
          declarationId: corrected.id,
          expectedVersion: 2,
        }),
      /طرف مقابل/,
    );
    const confirmed = await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: corrected.id,
      expectedVersion: 2,
    });
    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(confirmed.confirmedByAccountId, ctx.second.accountId);
    // Confirming the same version twice does not happen silently.
    await assert.rejects(
      () =>
        confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: corrected.id,
          expectedVersion: 2,
        }),
      /در انتظار تأیید نیست/,
    );

    const audit = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetType, 'MATING_DATE_DECLARATION'));
    assert.ok(audit.some((row) => row.action === 'MATING_DATE_CORRECTED'));
    assert.ok(audit.some((row) => row.action === 'MATING_DATE_CONFIRMED'));
  });
});

test('a different date makes a conflict in which both values stay readable', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    const mine = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(8) });
    // Answering with the same date is a confirmation, not a conflict.
    await assert.rejects(
      () =>
        declareDifferentDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: mine.id,
          expectedVersion: 1,
          matedOn: daysAgo(8),
        }),
      /همان تاریخ/,
    );

    const { conflicted, proposed } = await declareDifferentDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: mine.id,
      expectedVersion: 1,
      matedOn: daysAgo(7),
    });
    assert.equal(conflicted.status, 'CONFLICTED');
    assert.equal(conflicted.matedOn, daysAgo(8), 'the first value is not overwritten');
    assert.equal(proposed.version, 2);
    assert.equal(proposed.conflictsWithId, conflicted.id);
    assert.equal(proposed.matedOn, daysAgo(7));

    // Neither value is official while the disagreement stands.
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, female.animalId), null);
    const conflictAudit = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MATING_DATE_CONFLICT'));
    assert.equal(conflictAudit.length, 1);
    assert.deepEqual(conflictAudit[0]!.before, { version: 1, matedOn: daysAgo(8) });
    assert.deepEqual(conflictAudit[0]!.after, { version: 2, matedOn: daysAgo(7) });

    // The first declarer resolves it by confirming the counter-proposal.
    const settled = await confirmDate(ctx.testDb.db, ctx.first.actor, permit.id, {
      declarationId: proposed.id,
      expectedVersion: 2,
    });
    assert.equal(settled.status, 'CONFIRMED');
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, female.animalId), daysAgo(7));

    const told = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.first.accountId),
          eq(notifications.kind, 'MATING_DATE_CONFLICT'),
        ),
      );
    assert.equal(told.length, 1);
    assert.equal(told[0]!.originRoute, '/mating/permits/' + permit.id + '/dates');
    assert.equal(told[0]!.entityType, 'MATING_DATE_DECLARATION');
  });
});

test('the newest mutually confirmed date is the basis for both animals', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    for (const [days, confirm] of [
      [20, true],
      [5, true],
      [1, false],
    ] as const) {
      const row = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(days) });
      if (confirm) {
        await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
          declarationId: row.id,
          expectedVersion: row.version,
        });
      }
    }

    // The unconfirmed proposal is newer, and is deliberately not the basis.
    assert.equal(await pendingDate(ctx.testDb.db, permit.id).then((row) => row?.matedOn), daysAgo(1));
    for (const animalId of [male.animalId, female.animalId]) {
      assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, animalId), daysAgo(5));
    }

    // Both animals' files carry the confirmed date (§10).
    for (const animalId of [male.animalId, female.animalId]) {
      const rows = await ctx.testDb.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetType, 'ANIMAL'), eq(auditEvents.targetId, animalId)));
      assert.equal(rows.filter((row) => row.action === 'ANIMAL_MATING_DATE_CONFIRMED').length, 2);
    }
  });
});

test('the warning follows the confirmed basis and never blocks the next step', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    // §17.2: no confirmed history, no computed warning and no invented date.
    const before = await cooldownAdvisory(ctx.testDb.db, permit);
    assert.equal(before.hasWarning, false);
    assert.equal(before.notices.length, 0);
    assert.equal(before.messageFa, null);

    // A date two days ago puts the male (14 days) and the female (6 months)
    // both inside their windows.
    const recent = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(2) });
    await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: recent.id,
      expectedVersion: recent.version,
    });

    const warned = await cooldownAdvisory(ctx.testDb.db, permit);
    assert.equal(warned.hasWarning, true);
    assert.equal(warned.canContinue, true);
    assert.equal(warned.notices.length, 2);
    const maleNotice = warned.notices.find((n) => n.animalId === male.animalId)!;
    assert.equal(maleNotice.sex, 'MALE');
    assert.equal(maleNotice.baseDate, daysAgo(2));
    assert.equal(maleNotice.endsOn, addDays(daysAgo(2), 14));
    const femaleNotice = warned.notices.find((n) => n.animalId === female.animalId)!;
    assert.equal(femaleNotice.sex, 'FEMALE');
    assert.match(warned.messageFa ?? '', /مانع ادامه مسیر نیست/);

    // The same computation at any permit entry, from the animals alone.
    const atEntry = await cooldownAdvisoryForAnimals(ctx.testDb.db, [male.animalId]);
    assert.equal(atEntry.hasWarning, true);
    assert.equal(atEntry.notices[0]!.endsOn, maleNotice.endsOn);

    // Continuing while warned is possible and is what gets recorded.
    const next = await declareDate(ctx.testDb.db, ctx.second.actor, permit.id, { matedOn: daysAgo(1) });
    assert.equal(next.version, recent.version + 1);
    const continued = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MATING_COOLDOWN_CONTINUED'));
    assert.equal(continued.length, 1);
    assert.equal((continued[0]!.after as { warned: boolean }).warned, true);
    assert.equal((continued[0]!.after as { continued: boolean }).continued, true);

    // A brand-new permit entry for the same male warns as well, and still opens.
    const otherFemale = await pedigreedAnimal(ctx, ctx.second, 'سگ ماده دوم', 'FEMALE');
    const opened = await startPermit(ctx.testDb.db, ctx.first.actor, {
      ownAnimalId: male.animalId,
      counterpartyPedigreeCode: otherFemale.pedigreeCode,
    });
    assert.equal(opened.status, 'AWAITING_COUNTERPARTY', 'the warning never blocks a new case');
    const atStart = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'MATING_COOLDOWN_CONTINUED'),
          eq(auditEvents.targetType, 'MATING_CASE'),
        ),
      );
    assert.equal(atStart.length, 1);
    assert.equal(atStart[0]!.targetId, opened.id);
  });
});

test('a date outside the window produces no warning, and an old basis expires', async () => {
  await withCtx(async (ctx) => {
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);

    // 20 days ago is past the male's 14 days but well inside the female's six
    // calendar months, so exactly one animal is warned about.
    const row = await declareDate(ctx.testDb.db, ctx.first.actor, permit.id, { matedOn: daysAgo(20) });
    await confirmDate(ctx.testDb.db, ctx.second.actor, permit.id, {
      declarationId: row.id,
      expectedVersion: row.version,
    });

    const male_ = await cooldownAdvisoryForAnimals(ctx.testDb.db, [male.animalId]);
    assert.equal(male_.hasWarning, false, 'the 14 days have passed');
    const female_ = await cooldownAdvisoryForAnimals(ctx.testDb.db, [female.animalId]);
    assert.equal(female_.hasWarning, true, 'six calendar months have not');
    assert.equal(female_.notices[0]!.baseDate, daysAgo(20));

    // Nothing was recorded as a continuation for the animal that was not warned.
    const continued = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'MATING_COOLDOWN_CONTINUED'));
    assert.equal(continued.length, 0);
  });
});
