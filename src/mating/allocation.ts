/**
 * Two-party allocation and the Puppy Card — §19.3, §19.4, §22, D16, D18.
 *
 * The one rule everything here serves: a puppy's owner is settled only when
 * both actual counterparties have confirmed the same version. The pre-birth
 * rule of the permit is context for a proposal and never assigns a puppy by
 * itself; a single party's approval and a payment are equally powerless to
 * finish it; and Hamzist never picks a winner when the two sides disagree.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { paymentBatches, paymentItems } from '../db/schema/billing.ts';
import {
  allocationApprovals,
  allocationItems,
  litters,
  puppies,
  puppyAllocations,
  puppyCards,
} from '../db/schema/breeding.ts';
import { matingPermits, permitAllocationShares } from '../db/schema/mating.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { humanCode } from '../domain/ids.ts';
import { describeShare, RULE_TYPE_FA, SIDE_FA } from '../domain/allocation.ts';
import { litterOfPermit } from './birth.ts';
import { permitForParty, type PermitRecord } from './permits.ts';
import type { Actor } from '../authz/actor.ts';

export const PUPPY_CARD_FEE_KEY = 'fee.puppy_card_toman';

export type AllocationRecord = typeof puppyAllocations.$inferSelect;
export type AllocationItemRecord = typeof allocationItems.$inferSelect;
export type ApprovalRecord = typeof allocationApprovals.$inferSelect;
export type PuppyCardRecord = typeof puppyCards.$inferSelect;

export const ALLOCATION_STATUS_FA: Record<string, string> = {
  PENDING_BOTH_OWNERS: 'در انتظار تأیید هر دو طرف',
  FINAL: 'نهایی‌شده با تأیید دوطرفه',
  SUPERSEDED: 'جایگزین‌شده با نسخه جدید',
  REJECTED: 'ردشده؛ نیازمند نسخه جدید',
};

/** §19.4: the card's own identifier, distinct from every other document. */
export const newCardNo = (): string => 'PC-' + humanCode(8);

/** The sentence every allocation screen carries (§19.3). */
export const NO_ARBITRATION_NOTE_FA =
  'هم‌زیست در اختلاف تخصیص داوری نمی‌کند و برنده‌ای تعیین نمی‌کند. توافق بیرون از سامانه انجام می‌شود و نسخه اصلاح‌شده دوباره در همین پرونده ثبت و توسط هر دو طرف تأیید می‌شود.';

/** §19.4: the card is not a registration sheet, a pedigree or a genetic result. */
export const CARD_DISTINCTION_NOTE_FA =
  'کارت توله سند مستقلی است و با برگه ثبتی، شجره‌نامه یا نتیجه ژنتیک یکی نیست؛ صدور آن به برگه ثبتی همان توله وابسته نیست.';

async function requireIssuedPermit(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  // §19.4 and §20: only the official route reaches allocation and cards. A
  // personal declaration has no permit, so it can never arrive here.
  if (permit.status !== 'ISSUED') {
    throw conflict('تخصیص و کارت توله فقط روی پرونده‌ای با مجوز صادرشده ممکن است.');
  }
  return permit;
}

const partiesOf = (permit: PermitRecord): readonly string[] =>
  [permit.initiatorAccountId, permit.counterpartyAccountId].filter(
    (value): value is string => value !== null,
  );

export async function allocationsOfPermit(
  database: DbClient,
  permitId: string,
): Promise<readonly AllocationRecord[]> {
  return database
    .select()
    .from(puppyAllocations)
    .where(eq(puppyAllocations.permitId, permitId))
    .orderBy(desc(puppyAllocations.version));
}

export async function currentAllocation(
  database: DbClient,
  permitId: string,
): Promise<AllocationRecord | null> {
  const [row] = await allocationsOfPermit(database, permitId);
  return row ?? null;
}

export async function itemsOfAllocation(
  database: DbClient,
  allocationId: string,
): Promise<readonly AllocationItemRecord[]> {
  return database
    .select()
    .from(allocationItems)
    .where(eq(allocationItems.allocationId, allocationId))
    .orderBy(asc(allocationItems.createdAt));
}

export async function approvalsOfAllocation(
  database: DbClient,
  allocationId: string,
): Promise<readonly ApprovalRecord[]> {
  return database
    .select()
    .from(allocationApprovals)
    .where(eq(allocationApprovals.allocationId, allocationId));
}

/**
 * The pre-birth rule, as proposal context only — §16 step 5, §19.3.
 *
 * It is read to be shown next to the proposal. Nothing in this module lets it
 * assign a puppy on its own.
 */
export async function proposalContext(database: DbClient, permit: PermitRecord) {
  if (!permit.ruleType) return null;
  const shares = await database
    .select()
    .from(permitAllocationShares)
    .where(eq(permitAllocationShares.permitId, permit.id));
  return {
    typeFa: RULE_TYPE_FA[permit.ruleType],
    sides: shares.map((row) => ({
      sideFa: SIDE_FA[row.side as 'SIRE_SIDE' | 'DAM_SIDE'] ?? row.side,
      partyAccountId: row.partyAccountId,
      describeFa: describeShare(permit.ruleType!, {
        side: row.side as 'SIRE_SIDE' | 'DAM_SIDE',
        fixedCount: row.fixedCount,
        percent: row.percent,
      }),
    })),
    noteFa: permit.ruleNoteFa,
  };
}

/** The puppies an allocation may speak about: born alive and still standing. */
export async function allocatablePuppies(database: DbClient, permitId: string) {
  return database
    .select()
    .from(puppies)
    .where(and(eq(puppies.permitId, permitId), inArray(puppies.status, ['ALIVE', 'DECEASED'])))
    .orderBy(asc(puppies.createdAt));
}

export interface ProposeAllocationInput {
  /** One entry per allocatable puppy; the owner must be one of the parties. */
  readonly assignments: ReadonlyArray<{ puppyId: string; proposedOwnerAccountId: string }>;
  readonly noteFa?: string | null;
}

/**
 * Proposes an allocation version — §19.3.
 *
 * Either party may propose. A proposal always starts a fresh version whose
 * approvals are its own, so approvals collected for the previous data can never
 * carry over. The previous version stays readable as history.
 */
export async function proposeAllocation(
  database: Database,
  actor: Actor,
  permitId: string,
  input: ProposeAllocationInput,
): Promise<AllocationRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const litter = await litterOfPermit(database, permitId);
  if (!litter) throw conflict('ابتدا نتیجه زایمان را ثبت کنید.');

  const allocatable = await allocatablePuppies(database, permitId);
  if (allocatable.length === 0) throw conflict('برای این پرونده توله‌ای برای تخصیص وجود ندارد.');

  const parties = partiesOf(permit);
  const seen = new Set<string>();
  for (const assignment of input.assignments) {
    if (!allocatable.some((row) => row.id === assignment.puppyId)) {
      throw notFound('پرونده توله انتخاب‌شده پیدا نشد.');
    }
    if (seen.has(assignment.puppyId)) throw validation('هر توله فقط یک مالک پیشنهادی دارد.');
    if (!parties.includes(assignment.proposedOwnerAccountId)) {
      throw validation('مالک پیشنهادی باید یکی از دو طرف همین پرونده باشد.');
    }
    seen.add(assignment.puppyId);
  }
  if (seen.size !== allocatable.length) {
    throw validation('برای همه توله‌های این پرونده باید مالک پیشنهادی مشخص شود.');
  }

  const previous = await currentAllocation(database, permitId);
  if (previous?.status === 'FINAL') {
    // A finalised allocation is changed by proposing a new version, which both
    // sides confirm again (§19.3); the cards already issued are never touched.
    if (input.assignments.length === 0) throw validation('تخصیص جدید خالی است.');
  }

  return database.transaction(async (tx) => {
    // A version still awaiting answers becomes SUPERSEDED; one that was
    // rejected keeps that state, because how a version ended is history too.
    if (previous?.status === 'PENDING_BOTH_OWNERS') {
      await tx
        .update(puppyAllocations)
        .set({ status: 'SUPERSEDED' })
        .where(eq(puppyAllocations.id, previous.id));
    }

    const version = (previous?.version ?? 0) + 1;
    const [allocation] = await tx
      .insert(puppyAllocations)
      .values({
        permitId,
        litterId: litter.id,
        version,
        status: 'PENDING_BOTH_OWNERS',
        proposedByAccountId: actor.accountId,
        proposedAt: new Date(),
        noteFa: input.noteFa?.trim() || null,
        replacesVersion: previous?.version ?? null,
      })
      .returning();
    if (!allocation) throw conflict('ثبت تخصیص انجام نشد.');

    for (const assignment of input.assignments) {
      await tx.insert(allocationItems).values({
        allocationId: allocation.id,
        puppyId: assignment.puppyId,
        proposedOwnerAccountId: assignment.proposedOwnerAccountId,
      });
    }

    await recordAudit(tx, actor, {
      action: previous ? 'ALLOCATION_REPROPOSED' : 'ALLOCATION_PROPOSED',
      targetType: 'ALLOCATION',
      targetId: allocation.id,
      targetVersion: version,
      before: previous ? { version: previous.version, status: previous.status } : undefined,
      after: { permitId, version, assignments: input.assignments },
    });
    for (const party of parties) {
      if (party === actor.accountId) continue;
      await createNotification(tx, {
        recipientAccountId: party,
        kind: 'ALLOCATION_PROPOSED',
        titleFa: previous ? 'تخصیص توله‌ها اصلاح شد' : 'پیشنهاد تخصیص توله‌ها',
        bodyFa: 'نسخه ' + version + ' برای تأیید شما ثبت شد؛ تا تأیید هر دو طرف نهایی نمی‌شود.',
        resume: {
          entity: { type: 'ALLOCATION', id: allocation.id },
          step: 'ALLOCATION_APPROVAL',
          originRoute: '/litters/' + litter.id + '/allocation',
        },
      });
    }
    return allocation;
  });
}

/**
 * One party's answer to one exact version — §19.3.
 *
 * FINAL happens only when both parties have approved the same version. A
 * rejection does not hand the decision to anyone: it closes that version and
 * asks for a revised proposal.
 */
export async function respondToAllocation(
  database: Database,
  actor: Actor,
  input: { allocationId: string; expectedVersion: number; approve: boolean; reasonFa?: string | null },
): Promise<AllocationRecord> {
  const [allocation] = await database
    .select()
    .from(puppyAllocations)
    .where(eq(puppyAllocations.id, input.allocationId))
    .limit(1);
  if (!allocation) throw notFound('نسخه تخصیص پیدا نشد.');

  const permit = await requireIssuedPermit(database, actor, allocation.permitId);
  if (allocation.version !== input.expectedVersion) {
    throw versionStale(input.expectedVersion, allocation.version);
  }
  if (allocation.status !== 'PENDING_BOTH_OWNERS') {
    throw conflict('این نسخه تخصیص در انتظار تأیید نیست؛ نسخه جاری را ببینید.');
  }
  const parties = partiesOf(permit);
  if (!parties.includes(actor.accountId)) throw forbidden('تأیید تخصیص با دو طرف همین پرونده است.');

  const reason = (input.reasonFa ?? '').trim();
  if (!input.approve && reason.length < 3) throw validation('برای رد تخصیص، ثبت دلیل الزامی است.');

  const existing = await approvalsOfAllocation(database, input.allocationId);
  if (existing.some((row) => row.partyAccountId === actor.accountId)) {
    throw conflict('پاسخ شما برای این نسخه ثبت شده است.');
  }

  return database.transaction(async (tx) => {
    await tx.insert(allocationApprovals).values({
      allocationId: allocation.id,
      partyAccountId: actor.accountId,
      approved: input.approve,
      reasonFa: input.approve ? null : reason,
    });

    const approvals = await tx
      .select()
      .from(allocationApprovals)
      .where(eq(allocationApprovals.allocationId, allocation.id));
    const approvedBy = approvals.filter((row) => row.approved).map((row) => row.partyAccountId);
    // Both actual counterparties, on this exact version, or it stays pending.
    const bothApproved = parties.every((party) => approvedBy.includes(party));
    const rejected = approvals.some((row) => !row.approved);

    const status = rejected ? 'REJECTED' : bothApproved ? 'FINAL' : 'PENDING_BOTH_OWNERS';
    const [row] = await tx
      .update(puppyAllocations)
      .set({ status, finalizedAt: status === 'FINAL' ? new Date() : null })
      .where(and(eq(puppyAllocations.id, allocation.id), eq(puppyAllocations.version, input.expectedVersion)))
      .returning();
    if (!row) throw conflict('این نسخه هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: input.approve ? 'ALLOCATION_APPROVED' : 'ALLOCATION_REJECTED',
      targetType: 'ALLOCATION',
      targetId: allocation.id,
      targetVersion: allocation.version,
      reason: input.approve ? null : reason,
      after: { status, approvedBy },
    });
    for (const party of parties) {
      if (party === actor.accountId) continue;
      await createNotification(tx, {
        recipientAccountId: party,
        kind: 'ALLOCATION_' + status,
        titleFa:
          status === 'FINAL'
            ? 'تخصیص توله‌ها نهایی شد'
            : status === 'REJECTED'
              ? 'تخصیص پیشنهادی رد شد'
              : 'یک طرف تخصیص را تأیید کرد',
        bodyFa:
          status === 'FINAL'
            ? 'هر دو طرف همین نسخه را تأیید کردند؛ حالا کارت توله قابل صدور است.'
            : status === 'REJECTED'
              ? reason + ' ' + NO_ARBITRATION_NOTE_FA
              : 'تا تأیید طرف دیگر، وضعیت «در انتظار تأیید هر دو طرف» می‌ماند.',
        resume: {
          entity: { type: 'ALLOCATION', id: allocation.id },
          step: 'ALLOCATION_APPROVAL',
          originRoute: '/litters/' + allocation.litterId + '/allocation',
        },
      });
    }
    return row;
  });
}

// ── The litter view ───────────────────────────────────────────────────────

export interface AllocationView {
  readonly permit: PermitRecord;
  readonly litterId: string;
  readonly current: AllocationRecord | null;
  readonly history: readonly AllocationRecord[];
  readonly items: readonly AllocationItemRecord[];
  readonly approvals: readonly ApprovalRecord[];
  readonly puppies: readonly (typeof puppies.$inferSelect)[];
  readonly cards: readonly PuppyCardRecord[];
  readonly partyNames: Record<string, string>;
  readonly ruleContext: Awaited<ReturnType<typeof proposalContext>>;
}

export async function allocationView(
  database: DbClient,
  actor: Actor,
  litterId: string,
): Promise<AllocationView> {
  const [litter] = await database.select().from(litters).where(eq(litters.id, litterId)).limit(1);
  if (!litter) throw notFound('پرونده Litter پیدا نشد.');
  const permit = await requireIssuedPermit(database, actor, litter.permitId);

  const [history, rows, cards, names, ruleContext] = await Promise.all([
    allocationsOfPermit(database, permit.id),
    allocatablePuppies(database, permit.id),
    cardsOfPermit(database, permit.id),
    partyDisplayNames(database, permit),
    proposalContext(database, permit),
  ]);
  const current = history[0] ?? null;
  const [items, approvals] = current
    ? await Promise.all([
        itemsOfAllocation(database, current.id),
        approvalsOfAllocation(database, current.id),
      ])
    : [[], []];

  return {
    permit,
    litterId,
    current,
    history,
    items,
    approvals,
    puppies: rows,
    cards,
    partyNames: names,
    ruleContext,
  };
}

async function partyDisplayNames(
  database: DbClient,
  permit: PermitRecord,
): Promise<Record<string, string>> {
  const parties = partiesOf(permit);
  const rows = await database
    .select({ accountId: profiles.accountId, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(profiles)
    .where(inArray(profiles.accountId, parties));
  const out: Record<string, string> = {};
  for (const row of rows) out[row.accountId] = row.firstName + ' ' + row.lastName.trim().slice(0, 1) + '.';
  return out;
}

// ── Puppy Card ────────────────────────────────────────────────────────────

export async function cardsOfPermit(
  database: DbClient,
  permitId: string,
): Promise<readonly PuppyCardRecord[]> {
  return database.select().from(puppyCards).where(eq(puppyCards.permitId, permitId));
}

export async function cardOfPuppy(database: DbClient, puppyId: string): Promise<PuppyCardRecord | null> {
  const [row] = await database.select().from(puppyCards).where(eq(puppyCards.puppyId, puppyId)).limit(1);
  return row ?? null;
}

export interface CardEligibility {
  readonly puppyId: string;
  readonly tempCode: string;
  readonly nameFa: string | null;
  readonly eligible: boolean;
  readonly reasonFa: string | null;
  readonly ownerAccountId: string | null;
  readonly card: PuppyCardRecord | null;
}

/**
 * What §19.4 actually requires, puppy by puppy.
 *
 * An issued permit, a recorded birth, a puppy born alive, a FINAL allocation
 * naming its owner — and nothing else. The puppy's own registration sheet is
 * explicitly not a prerequisite.
 */
export async function cardEligibility(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<readonly CardEligibility[]> {
  const permit = await permitForParty(database, actor, permitId);
  const rows = await allocatablePuppies(database, permitId);
  const allocation = await currentAllocation(database, permitId);
  const items = allocation ? await itemsOfAllocation(database, allocation.id) : [];
  const cards = await cardsOfPermit(database, permitId);

  return rows.map((puppy) => {
    const card = cards.find((row) => row.puppyId === puppy.id) ?? null;
    const owner = items.find((row) => row.puppyId === puppy.id)?.proposedOwnerAccountId ?? null;
    const base = { puppyId: puppy.id, tempCode: puppy.tempCode, nameFa: puppy.nameFa, card };

    if (permit.status !== 'ISSUED') {
      return { ...base, eligible: false, reasonFa: 'این پرونده مجوز صادرشده ندارد.', ownerAccountId: null };
    }
    if (card) return { ...base, eligible: false, reasonFa: 'کارت این توله صادر شده است.', ownerAccountId: card.ownerAccountId };
    if (allocation?.status !== 'FINAL') {
      return {
        ...base,
        eligible: false,
        reasonFa: 'تا نهایی‌شدن تخصیص با تأیید هر دو طرف، کارت این توله قفل است.',
        ownerAccountId: owner,
      };
    }
    // §19.2 and the conservative reading of §19.4 (DEC): a puppy that has died
    // keeps its history and any card already issued, and no new card is issued.
    if (puppy.status !== 'ALIVE') {
      return {
        ...base,
        eligible: false,
        reasonFa: 'برای توله‌ای که مرگ آن ثبت شده، کارت تازه صادر نمی‌شود و سوابق آن حفظ می‌ماند.',
        ownerAccountId: owner,
      };
    }
    if (owner !== actor.accountId) {
      return {
        ...base,
        eligible: false,
        reasonFa: 'مالک نهایی این توله طرف دیگر پرونده است.',
        ownerAccountId: owner,
      };
    }
    return { ...base, eligible: true, reasonFa: null, ownerAccountId: owner };
  });
}

/** §19.4, §22: one batch for the chosen puppies, priced per puppy from settings. */
export async function startCardPayment(
  database: Database,
  actor: Actor,
  permitId: string,
  puppyIds: readonly string[],
): Promise<BatchRecord> {
  if (puppyIds.length === 0) throw validation('حداقل یک توله انتخاب کنید.');
  const eligibility = await cardEligibility(database, actor, permitId);
  for (const puppyId of puppyIds) {
    const row = eligibility.find((item) => item.puppyId === puppyId);
    if (!row) throw notFound('پرونده توله پیدا نشد.');
    if (!row.eligible) throw conflict(row.reasonFa ?? 'این توله واجد شرایط کارت نیست.');
  }

  return createBatch(database, actor, {
    service: 'PUPPY_CARD',
    items: puppyIds.map((puppyId) => ({
      targetType: 'PUPPY',
      targetId: puppyId,
      settingKey: PUPPY_CARD_FEE_KEY,
    })),
    resume: {
      entity: { type: 'PAYMENT_BATCH', id: permitId },
      step: 'PUPPY_CARD_PAYMENT',
      originRoute: '/puppy-cards/checkout?permit=' + permitId,
    },
  });
}

/**
 * Issues the cards of a verified payment — §19.4, §13-style item independence.
 *
 * Each puppy is judged again at this boundary and issued on its own. A puppy
 * that stopped being eligible between payment and verification is recorded with
 * its reason and does not fail the whole batch; the money stays paid and the
 * case keeps its data.
 */
export async function issueCardsForBatch(tx: DbClient, batch: BatchRecord): Promise<void> {
  const items = await tx.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));

  for (const item of items) {
    if (item.targetType !== 'PUPPY') continue;
    const [puppy] = await tx.select().from(puppies).where(eq(puppies.id, item.targetId)).limit(1);
    if (!puppy) continue;

    const [existing] = await tx.select().from(puppyCards).where(eq(puppyCards.puppyId, puppy.id)).limit(1);
    if (existing) continue;

    const [allocation] = await tx
      .select()
      .from(puppyAllocations)
      .where(and(eq(puppyAllocations.permitId, puppy.permitId), eq(puppyAllocations.status, 'FINAL')))
      .orderBy(desc(puppyAllocations.version))
      .limit(1);
    const [assignment] = allocation
      ? await tx
          .select()
          .from(allocationItems)
          .where(
            and(eq(allocationItems.allocationId, allocation.id), eq(allocationItems.puppyId, puppy.id)),
          )
          .limit(1)
      : [];

    const blocked =
      !allocation || !assignment
        ? 'تخصیص نهایی برای این توله وجود ندارد.'
        : puppy.status !== 'ALIVE'
          ? 'وضعیت این توله دیگر «زنده» نیست.'
          : null;
    if (blocked || !allocation || !assignment) {
      await recordAudit(tx, null, {
        action: 'PUPPY_CARD_BLOCKED',
        targetType: 'PUPPY',
        targetId: puppy.id,
        reason: blocked,
        after: { batchId: batch.id, issued: false },
      });
      await createNotification(tx, {
        recipientAccountId: batch.accountId,
        kind: 'PUPPY_CARD_BLOCKED',
        titleFa: 'کارت این توله صادر نشد',
        bodyFa: (blocked ?? '') + ' پرداخت شما ثبت است و اطلاعات پرونده حفظ شده است.',
        resume: {
          entity: { type: 'PUPPY', id: puppy.id },
          step: 'PUPPY_CARD_ISSUANCE',
          originRoute: '/puppy-cards/checkout?permit=' + puppy.permitId,
        },
      });
      continue;
    }

    const [card] = await tx
      .insert(puppyCards)
      .values({
        puppyId: puppy.id,
        permitId: puppy.permitId,
        cardNo: newCardNo(),
        ownerAccountId: assignment.proposedOwnerAccountId,
        allocationVersion: allocation.version,
        batchId: batch.id,
        issuedAt: new Date(),
      })
      .returning();
    if (!card) continue;

    await recordAudit(tx, null, {
      action: 'PUPPY_CARD_ISSUED',
      targetType: 'PUPPY',
      targetId: puppy.id,
      after: {
        cardId: card.id,
        cardNo: card.cardNo,
        allocationVersion: allocation.version,
        batchId: batch.id,
      },
    });
    await createNotification(tx, {
      recipientAccountId: card.ownerAccountId,
      kind: 'PUPPY_CARD_ISSUED',
      titleFa: 'کارت توله صادر شد',
      bodyFa: 'کارت ' + card.cardNo + ' برای توله ' + puppy.tempCode + ' صادر شد. ' + CARD_DISTINCTION_NOTE_FA,
      resume: {
        entity: { type: 'PUPPY', id: puppy.id },
        step: 'PUPPY_CARD_ISSUED',
        originRoute: '/documents/puppy-card/' + card.id,
      },
    });
  }
}

/** Marks the batch paid; issuance happens in the same verifying transaction. */
export async function markCardBatchPaid(tx: DbClient, batchId: string): Promise<void> {
  await tx.update(paymentBatches).set({ status: 'PAID' }).where(eq(paymentBatches.id, batchId));
}

/** One card, readable only by the owner it was issued to (§23.4). */
export async function cardForOwner(
  database: DbClient,
  actor: Actor,
  cardId: string,
): Promise<{ card: PuppyCardRecord; puppy: typeof puppies.$inferSelect }> {
  const [card] = await database.select().from(puppyCards).where(eq(puppyCards.id, cardId)).limit(1);
  if (!card || card.ownerAccountId !== actor.accountId) throw notFound('کارت توله پیدا نشد.');
  const [puppy] = await database.select().from(puppies).where(eq(puppies.id, card.puppyId)).limit(1);
  if (!puppy) throw notFound('پرونده توله پیدا نشد.');
  return { card, puppy };
}

/** Cards this account owns, for its own list (§10, §23.4). */
export async function cardsOfOwner(database: DbClient, accountId: string) {
  return database
    .select({
      card: puppyCards,
      tempCode: puppies.tempCode,
      nameFa: puppies.nameFa,
      status: puppies.status,
    })
    .from(puppyCards)
    .innerJoin(puppies, eq(puppies.id, puppyCards.puppyId))
    .where(eq(puppyCards.ownerAccountId, accountId))
    .orderBy(desc(puppyCards.issuedAt));
}

/** §5: how many puppies this account really has a final allocation for. */
export async function countFinalAllocatedPuppies(
  database: DbClient,
  accountId: string,
): Promise<number> {
  const rows = await database
    .select({ id: allocationItems.id })
    .from(allocationItems)
    .innerJoin(puppyAllocations, eq(puppyAllocations.id, allocationItems.allocationId))
    .innerJoin(matingPermits, eq(matingPermits.id, puppyAllocations.permitId))
    .where(
      and(
        eq(puppyAllocations.status, 'FINAL'),
        eq(allocationItems.proposedOwnerAccountId, accountId),
        eq(matingPermits.status, 'ISSUED'),
      ),
    );
  return rows.length;
}

/** The batch of an in-flight card checkout, so a retry finds the same one. */
export async function openCardBatch(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<BatchRecord | null> {
  const rows = await database
    .select()
    .from(paymentBatches)
    .where(and(eq(paymentBatches.accountId, actor.accountId), eq(paymentBatches.service, 'PUPPY_CARD')))
    .orderBy(desc(paymentBatches.createdAt));
  for (const row of rows) {
    if (row.status === 'PAID') continue;
    const batch = await findBatch(database, row.id);
    // The resume context is what ties an open batch back to its permit.
    if (batch && batch.resumeContext.entity.id === permitId) return batch;
  }
  return null;
}
