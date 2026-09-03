/**
 * The personal declaration, and its isolation from the official route — gate
 * `personal-declaration-isolation`.
 *
 * §20 defines this service by what it is not: no payment, no stored agreement,
 * no permit, no lineage, no official confirmed date and no puppy card. This
 * suite checks the prerequisites it really has, the invitation it really
 * validates, and every official thing it must not be able to reach.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { paymentBatches } from '../../src/db/schema/billing.ts';
import { personalDeclarations, personalNotes } from '../../src/db/schema/declarations.ts';
import { matingPermits } from '../../src/db/schema/mating.ts';
import { puppyCards } from '../../src/db/schema/breeding.ts';
import {
  addPersonalNote,
  cancelDeclaration,
  declarationView,
  declarationsOfActor,
  respondToDeclaration,
  resolveCounterpartyAnimal,
  startDeclaration,
} from '../../src/mating/declaration.ts';
import { latestConfirmedDateOfAnimal } from '../../src/mating/cooldown.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { registerAnimal, saveDraft, startDraft } from '../../src/animals/service.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { withMatingCtx, type MatingCtx, type Party } from '../helpers/mating.ts';
import type { Actor } from '../../src/authz/actor.ts';

const withCtx = (fn: (ctx: MatingCtx) => Promise<void>) =>
  withMatingCtx(
    { mobilePrefix: '099907000', tmpPrefix: 'hamzist-decl-', councilCode: 'SYNTH-PD-1', chipBase: 9_000_000 },
    fn,
  );

const daysAgo = (days: number) => addDays(todayCivil(), -days);

/** A SYNTHETIC sink: nothing leaves the process while this is being built. */
const DEV = loadEnv({
  APP_ENV: 'development',
  INTEGRATION_MODE: 'local',
  DATABASE_URL: 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist',
});
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, DEV);

/**
 * A plain registered animal — no microchip, no registration sheet, no pedigree.
 * §20 asks for an existing record and nothing more.
 */
async function plainAnimal(ctx: MatingCtx, owner: Party, name: string) {
  const draft = await startDraft(ctx.testDb.db, owner.actor, { forceNew: true });
  await saveDraft(ctx.testDb.db, owner.actor, draft.id, {
    name,
    breedId: ctx.breedId,
    sex: 'MALE',
    birthDate: '2022-01-01',
    color: 'قهوه‌ای',
    markings: 'بدون نشانه خاص',
  });
  return registerAnimal(ctx.testDb.db, owner.actor, draft.id);
}

/** The identifier the other side is named by: a microchip on a real record. */
async function chippedAnimal(ctx: MatingCtx, owner: Party, name: string, number: string) {
  const animal = await plainAnimal(ctx, owner, name);
  const { microchips } = await import('../../src/db/schema/clinical.ts');
  await ctx.testDb.db.insert(microchips).values({
    animalId: animal.id,
    number,
    readMethod: 'MANUAL',
    boundVia: 'EXISTING_UNREGISTERED',
    boundByAccountId: ctx.vet.accountId,
  });
  return animal;
}

test('the prerequisites are KYC, membership and existing records — not a sheet or a pedigree', async () => {
  await withCtx(async (ctx) => {
    // A member with no animal record has nothing to declare about yet.
    const before = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'PERSONAL_DECLARATION');
    assert.equal(before.allowed, false);
    assert.equal(before.lock.cta.href, '/animals/new');

    const mine = await plainAnimal(ctx, ctx.first, 'سگ اعلام شخصی');
    const theirs = await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900001');

    // Neither animal has a registration sheet or a pedigree, and that is fine.
    const after = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'PERSONAL_DECLARATION');
    assert.equal(after.allowed, true);

    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900001',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );
    assert.equal(declaration.status, 'PENDING_COUNTERPARTY_CONFIRMATION');
    assert.equal(declaration.counterpartyAnimalId, theirs.id);
    assert.equal(declaration.counterpartyAccountId, ctx.second.accountId);

    // The invitation went to the product's own SMS adapter, to that number.
    assert.equal(sink.at(-1)?.to, ctx.second.mobile);
    const [invite] = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.second.accountId),
          eq(notifications.kind, 'PERSONAL_DECLARATION_INVITATION'),
        ),
      );
    assert.equal(invite!.entityId, declaration.id);
    assert.equal(invite!.originRoute, '/declaration/' + declaration.id);

    // §20: this service has no payment at all. The only batches in the fixture
    // are the memberships of §7, and the declaration added none.
    const batches = await ctx.testDb.db.select().from(paymentBatches);
    assert.ok(
      batches.every((row) => row.service === 'MEMBERSHIP'),
      'the declaration opened no payment batch of its own',
    );
  });
});

test('an animal outside the database, and a mismatched invitation, are both refused', async () => {
  await withCtx(async (ctx) => {
    const mine = await plainAnimal(ctx, ctx.first, 'سگ من');
    await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900002');

    // A hand-typed animal is never accepted.
    await assert.rejects(() => resolveCounterpartyAnimal(ctx.testDb.db, 'سگ همسایه'), /پیدا نشد/);
    await assert.rejects(
      () =>
        startDeclaration(
          ctx.testDb.db,
          ctx.first.actor,
          { ownAnimalId: mine.id, counterpartyIdentifier: '', counterpartyMobile: ctx.second.mobile },
          sms,
        ),
      /شناسه حیوان طرف مقابل/,
    );

    // The invited number has to be the owner of the animal that was named.
    const sentBefore = sink.length;
    await assert.rejects(
      () =>
        startDeclaration(
          ctx.testDb.db,
          ctx.first.actor,
          {
            ownAnimalId: mine.id,
            counterpartyIdentifier: '900000000900002',
            counterpartyMobile: ctx.vet.mobile,
          },
          sms,
        ),
      /با مالک این حیوان یکی نیست/,
    );
    assert.equal(sink.length, sentBefore, 'a mismatched invitation is never sent');
    const rows = await ctx.testDb.db.select().from(personalDeclarations);
    assert.equal(rows.length, 0, 'and nothing is stored for it');

    // One's own animal on both sides is not a two-party agreement.
    const second = await chippedAnimal(ctx, ctx.first, 'سگ دوم من', '900000000900003');
    assert.ok(second);
    await assert.rejects(
      () =>
        startDeclaration(
          ctx.testDb.db,
          ctx.first.actor,
          {
            ownAnimalId: mine.id,
            counterpartyIdentifier: '900000000900003',
            counterpartyMobile: ctx.first.mobile,
          },
          sms,
        ),
      /متعلق به شخص دیگری/,
    );
  });
});

test('only the invited person answers, and a decline ends the case with its reason', async () => {
  await withCtx(async (ctx) => {
    const mine = await plainAnimal(ctx, ctx.first, 'سگ من');
    await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900004');
    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900004',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );

    // The initiator cannot answer for the other side, and a stranger sees nothing.
    await assert.rejects(
      () => respondToDeclaration(ctx.testDb.db, ctx.first.actor, declaration.id, { confirm: true }),
      /طرف مقابل/,
    );
    await assert.rejects(
      () => respondToDeclaration(ctx.testDb.db, ctx.vet.actor, declaration.id, { confirm: true }),
      /پیدا نشد/,
    );
    await assert.rejects(
      () => declarationView(ctx.testDb.db, ctx.vet.actor, declaration.id),
      /پیدا نشد/,
    );

    // A decline needs a reason and closes the case.
    await assert.rejects(
      () =>
        respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, {
          confirm: false,
          reasonFa: '',
        }),
      /دلیل الزامی/,
    );
    const rejected = await respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, {
      confirm: false,
      reasonFa: 'چنین توافقی وجود ندارد.',
    });
    assert.equal(rejected.status, 'REJECTED');
    assert.match(rejected.reasonFa ?? '', /وجود ندارد/);
    await assert.rejects(
      () => respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, { confirm: true }),
      /در انتظار پاسخ شما نیست/,
    );
    // Both sides still see the case and its outcome.
    assert.equal((await declarationsOfActor(ctx.testDb.db, ctx.first.actor)).length, 1);
    assert.equal((await declarationsOfActor(ctx.testDb.db, ctx.second.actor)).length, 1);
    assert.equal((await declarationsOfActor(ctx.testDb.db, ctx.vet.actor)).length, 0);
  });
});

test('nothing about the agreement itself is stored, and no official effect exists', async () => {
  await withCtx(async (ctx) => {
    const mine = await plainAnimal(ctx, ctx.first, 'سگ من');
    const theirs = await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900005');
    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900005',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );
    const confirmed = await respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, {
      confirm: true,
    });
    assert.equal(confirmed.status, 'CONFIRMED');

    // §20: the table has no place for terms, text, files, signatures or shares.
    const columns = Object.keys(confirmed);
    for (const forbidden of ['terms', 'text', 'file', 'image', 'signature', 'share', 'amount', 'price']) {
      assert.ok(
        !columns.some((column) => column.toLowerCase().includes(forbidden)),
        'the declaration must not store ' + forbidden,
      );
    }

    // Confirming produced no permit, no card and no payment of its own.
    assert.equal((await ctx.testDb.db.select().from(matingPermits)).length, 0);
    assert.equal((await ctx.testDb.db.select().from(puppyCards)).length, 0);
    const batches = await ctx.testDb.db.select().from(paymentBatches);
    assert.ok(batches.every((row) => row.service === 'MEMBERSHIP'));

    // And it opened no official service: the puppy card still names the permit.
    const puppyCard = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'PUPPY_CARD');
    assert.equal(puppyCard.allowed, false);
    assert.match(puppyCard.lock.reason, /مجوز/);

    // The Hamzist contract itself stays disabled, exactly as §20 requires.
    const contract = await eligibilityFor(ctx.testDb.db, ctx.first.accountId, 'HAMZIST_CONTRACT');
    assert.equal(contract.allowed, false);
    assert.equal(contract.comingSoon, true);

    // The confirmation notice says plainly what this route cannot do.
    const [told] = await ctx.testDb.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, ctx.first.accountId),
          eq(notifications.kind, 'PERSONAL_DECLARATION_CONFIRMED'),
        ),
      );
    assert.match(told!.bodyFa, /کارت توله نمی‌سازد/);
    assert.ok(theirs);
  });
});

test('personal notes stay UNVERIFIED and never touch the official basis', async () => {
  await withCtx(async (ctx) => {
    const mine = await plainAnimal(ctx, ctx.first, 'سگ من');
    const theirs = await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900006');
    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900006',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );
    await respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, { confirm: true });

    await assert.rejects(
      () => addPersonalNote(ctx.testDb.db, ctx.first.actor, declaration.id, { kind: 'MATING_DATE' }),
      /تاریخ جفت‌گیری شخصی/,
    );
    await assert.rejects(
      () =>
        addPersonalNote(ctx.testDb.db, ctx.first.actor, declaration.id, {
          kind: 'MATING_DATE',
          noteDate: addDays(todayCivil(), 2),
        }),
      /آینده/,
    );

    const note = await addPersonalNote(ctx.testDb.db, ctx.first.actor, declaration.id, {
      kind: 'MATING_DATE',
      noteDate: daysAgo(3),
      noteFa: 'ثبت شخصی.',
    });
    assert.equal(note.kind, 'MATING_DATE');
    await addPersonalNote(ctx.testDb.db, ctx.second.actor, declaration.id, {
      kind: 'PREGNANCY',
      noteFa: 'یادداشت شخصی طرف مقابل.',
    });

    // §17.3: the official basis of both animals is still empty. A personal note
    // is not a mutually confirmed official date and never becomes one.
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, mine.id), null);
    assert.equal(await latestConfirmedDateOfAnimal(ctx.testDb.db, theirs.id), null);

    const stored = await ctx.testDb.db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.declarationId, declaration.id));
    assert.equal(stored.length, 2);
    const [audit] = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PERSONAL_NOTE_RECORDED'));
    assert.equal((audit!.after as { status: string }).status, 'UNVERIFIED');

    // The view shows the notes and masks the invited number.
    const view = await declarationView(ctx.testDb.db, ctx.first.actor, declaration.id);
    assert.equal(view.notes.length, 2);
    assert.match(view.invitedMobileTail, /^••••\d{4}$/);
  });
});

test('the initiator may withdraw an unanswered invitation, and only that one', async () => {
  await withCtx(async (ctx) => {
    const mine = await plainAnimal(ctx, ctx.first, 'سگ من');
    await chippedAnimal(ctx, ctx.second, 'سگ طرف مقابل', '900000000900007');
    const declaration = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900007',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );

    await assert.rejects(
      () => cancelDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id),
      /آغازکننده/,
    );
    const cancelled = await cancelDeclaration(ctx.testDb.db, ctx.first.actor, declaration.id);
    assert.equal(cancelled.status, 'CANCELLED');
    await assert.rejects(
      () => respondToDeclaration(ctx.testDb.db, ctx.second.actor, declaration.id, { confirm: true }),
      /در انتظار پاسخ شما نیست/,
    );
    await assert.rejects(
      () => addPersonalNote(ctx.testDb.db, ctx.first.actor, declaration.id, { kind: 'PREGNANCY' }),
      /لغوشده/,
    );

    // A fresh invitation for the same pair is possible once that one is closed.
    const again = await startDeclaration(
      ctx.testDb.db,
      ctx.first.actor,
      {
        ownAnimalId: mine.id,
        counterpartyIdentifier: '900000000900007',
        counterpartyMobile: ctx.second.mobile,
      },
      sms,
    );
    assert.equal(again.status, 'PENDING_COUNTERPARTY_CONFIRMATION');
    await assert.rejects(
      () =>
        startDeclaration(
          ctx.testDb.db,
          ctx.first.actor,
          {
            ownAnimalId: mine.id,
            counterpartyIdentifier: '900000000900007',
            counterpartyMobile: ctx.second.mobile,
          },
          sms,
        ),
      /در انتظار پاسخ وجود دارد/,
    );
  });
});
