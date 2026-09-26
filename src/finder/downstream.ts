/**
 * From a confirmed contract to exactly one downstream path — PHASE-4 PROMPT-006.
 *
 * OFFICIAL opens (or links) the existing mating permit through `startPermit`, so
 * every permit rule stays where it is: the counterparty's own confirmation, the
 * allocation rule, the permit payment and the association review. The contract
 * issues nothing and replaces nothing.
 *
 * PERSONAL creates a `finder_personal_mating`: no permit number, no review, no
 * official allocation, no Puppy Card. It shares only the date protocol.
 *
 * The handoff is idempotent: a per-contract advisory lock plus the unique
 * contract key on `finder_downstream_link` mean a retry, a double click or both
 * parties at once all get the same single link, and never a second permit.
 */
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { sql } from 'drizzle-orm';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { microchips } from '../db/schema/clinical.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { finderContracts, finderContractVersions } from '../db/schema/finder.ts';
import { finderDownstreamLinks, finderPersonalMatings, matingDateDeclarations, matingPermits } from '../db/schema/mating.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { todayCivil, type CivilDate } from '../domain/calendar.ts';
import type { Actor } from '../authz/actor.ts';
import { startPermit, PERMIT_STATUS_FA } from '../mating/permits.ts';
import { counterpartOf, loadForParty, lockAnimals, notifyFinder } from './requests.ts';
import { lifeStatusOf } from './profiles.ts';
import { activeRule } from './rules.ts';
import { lastMatingsOf } from './last-mating.ts';
import { cooldownState, type CooldownState } from './profile-model.ts';
import { handoffProblems, type ContractContent, type HandoffSide, type Route } from './request-model.ts';

export type LinkRow = typeof finderDownstreamLinks.$inferSelect;

/** The live permit states a new permit would collide with (same list as startPermit). */
const LIVE_PERMIT = ['DRAFT', 'AWAITING_COUNTERPARTY', 'AWAITING_PAYMENT', 'READY_TO_SUBMIT', 'UNDER_REVIEW', 'NEEDS_CORRECTION'] as const;

async function confirmedContent(db: DbClient, contractId: string, number: number): Promise<ContractContent> {
  const [row] = await db
    .select({ content: finderContractVersions.content })
    .from(finderContractVersions)
    .where(and(eq(finderContractVersions.contractId, contractId), eq(finderContractVersions.number, number)))
    .limit(1);
  if (!row) throw notFound('نسخه تأییدشده قرارداد پیدا نشد.');
  return row.content as ContractContent;
}

async function sideFacts(db: DbClient, animalId: string, expectedOwnerId: string) {
  const [row] = await db
    .select({ animal: animals, mergedInto: referenceBreeds.mergedIntoBreedId })
    .from(animals)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!row) throw notFound('پرونده حیوان پیدا نشد.');
  const [life, chip, pedigree] = await Promise.all([
    lifeStatusOf(db, animalId),
    db.select({ id: microchips.id }).from(microchips).where(eq(microchips.animalId, animalId)).limit(1),
    db.select({ code: pedigrees.pedigreeCode }).from(pedigrees).where(eq(pedigrees.animalId, animalId)).limit(1),
  ]);
  const facts: HandoffSide = {
    expectedOwnerId,
    ownerId: row.animal.ownerAccountId,
    status: row.animal.status,
    lifeStatus: life,
    sex: row.animal.sex,
    species: row.animal.species,
    resolvedBreedId: row.mergedInto ?? row.animal.breedId,
    hasChip: chip.length > 0,
    hasPedigree: pedigree.length > 0,
  };
  return { facts, pedigreeCode: pedigree[0]?.code ?? null };
}

/** What stands in the way right now, re-read from the current records. */
export async function currentHandoffProblems(db: DbClient, content: ContractContent) {
  const route = content.terms.route as Route;
  const [sire, dam] = await Promise.all([
    sideFacts(db, content.animals.sire.animalId, content.parties.sire.accountId),
    sideFacts(db, content.animals.dam.animalId, content.parties.dam.accountId),
  ]);
  return { route, sire, dam, problems: handoffProblems(route, sire.facts, dam.facts) };
}

export async function linkOfContract(db: DbClient, contractId: string): Promise<LinkRow | null> {
  const [row] = await db.select().from(finderDownstreamLinks).where(eq(finderDownstreamLinks.contractId, contractId)).limit(1);
  return row ?? null;
}

/**
 * Continue a confirmed contract on its own route. Either party may do it; the
 * second call (by anyone) returns the link the first one made.
 */
export async function handoffContract(db: Database, actor: Actor, input: { contractId: string }, now: Date = new Date()): Promise<LinkRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('finder_handoff:' || ${input.contractId}))`);
    const [contract] = await tx.select().from(finderContracts).where(eq(finderContracts.id, input.contractId)).limit(1);
    if (!contract) throw notFound('قرارداد پیدا نشد.');
    const { request } = await loadForParty(tx, actor, contract.requestId);

    const existing = await linkOfContract(tx, contract.id);
    if (existing) return existing;
    if (contract.status !== 'CONFIRMED' || contract.confirmedNumber === null) {
      throw conflict('فقط قرارداد تأییدشده دوطرفه به مسیر بعدی می‌رود.');
    }
    if (request.status !== 'CONTRACT_CONFIRMED') throw conflict('این درخواست دیگر در مرحله قرارداد تأییدشده نیست.');

    const content = await confirmedContent(tx, contract.id, contract.confirmedNumber);
    // Another contract for the same pair (possible once this one's mating is done)
    // must not open a second permit alongside this one.
    await lockAnimals(tx, [content.animals.sire.animalId, content.animals.dam.animalId]);
    const { route, sire, dam, problems } = await currentHandoffProblems(tx, content);
    if (problems.length > 0) throw validation(problems.join(' '));

    let permitId: string | null = null;
    let personalMatingId: string | null = null;
    const owners = [content.parties.sire.accountId, content.parties.dam.accountId];

    if (route === 'OFFICIAL') {
      // A live permit the same two owners already opened for these animals is
      // linked instead of duplicated; otherwise the ordinary permit is opened.
      const [live] = await tx
        .select()
        .from(matingPermits)
        .where(
          and(
            eq(matingPermits.sireAnimalId, content.animals.sire.animalId),
            eq(matingPermits.damAnimalId, content.animals.dam.animalId),
            inArray(matingPermits.status, [...LIVE_PERMIT]),
            inArray(matingPermits.initiatorAccountId, owners),
            inArray(matingPermits.counterpartyAccountId, owners),
          ),
        )
        .limit(1);
      if (live) {
        permitId = live.id;
      } else {
        const mine = actor.accountId === content.parties.sire.accountId ? 'sire' : 'dam';
        const other = mine === 'sire' ? dam : sire;
        const permit = await startPermit(tx, actor, {
          ownAnimalId: content.animals[mine].animalId,
          counterpartyPedigreeCode: other.pedigreeCode!,
        });
        permitId = permit.id;
      }
    } else {
      const [personal] = await tx
        .insert(finderPersonalMatings)
        .values({
          contractId: contract.id,
          requestId: request.id,
          sireAnimalId: content.animals.sire.animalId,
          damAnimalId: content.animals.dam.animalId,
          sireAccountId: content.parties.sire.accountId,
          damAccountId: content.parties.dam.accountId,
          createdAt: now,
        })
        .returning();
      personalMatingId = personal!.id;
    }

    const [link] = await tx
      .insert(finderDownstreamLinks)
      .values({
        contractId: contract.id,
        contractNumber: contract.confirmedNumber,
        route,
        permitId,
        personalMatingId,
        linkedByAccountId: actor.accountId,
        linkedAt: now,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: 'FINDER_DOWNSTREAM_LINKED',
      targetType: 'FINDER_CONTRACT',
      targetId: contract.id,
      after: { route, permitId, personalMatingId, contractNumber: contract.confirmedNumber },
    });
    await notifyFinder(
      tx,
      counterpartOf(request, actor.accountId),
      'FINDER_DOWNSTREAM_LINKED',
      route === 'OFFICIAL' ? 'پرونده مجوز رسمی باز شد' : 'پرونده جفت‌گیری شخصی باز شد',
      route === 'OFFICIAL'
        ? 'پرونده مجوز رسمی برای این قرارداد باز شد؛ تأیید، پرداخت و بررسی انجمن همان مراحل همیشگی است.'
        : 'پرونده شخصی این قرارداد باز شد؛ تاریخ جفت‌گیری را همان‌جا اعلام و تأیید کنید.',
      request.id,
    );
    return link!;
  });
}

/**
 * The contract is cancelled: its link is detached, never rewritten. A personal
 * mating is closed with the reason; confirmed dates stay confirmed, because they
 * record what happened. A permit is not the Finder's to cancel — it keeps its
 * own status and flow, and only stops counting as this contract's path.
 */
export async function detachDownstream(tx: DbClient, actor: Actor, contractId: string, reasonFa: string, now: Date): Promise<void> {
  const [link] = await tx
    .update(finderDownstreamLinks)
    .set({ detachedAt: now, detachedReasonFa: reasonFa })
    .where(and(eq(finderDownstreamLinks.contractId, contractId), isNull(finderDownstreamLinks.detachedAt)))
    .returning();
  if (!link) return;
  if (link.personalMatingId) {
    await tx
      .update(finderPersonalMatings)
      .set({ status: 'CANCELLED', cancelledAt: now, cancelReasonFa: reasonFa })
      .where(and(eq(finderPersonalMatings.id, link.personalMatingId), eq(finderPersonalMatings.status, 'ACTIVE')));
    // Pending proposals of a cancelled record can never be confirmed later.
    await tx
      .update(matingDateDeclarations)
      .set({ status: 'SUPERSEDED' })
      .where(and(eq(matingDateDeclarations.personalMatingId, link.personalMatingId), eq(matingDateDeclarations.status, 'PROPOSED')));
  }
  await recordAudit(tx, actor, {
    action: 'FINDER_DOWNSTREAM_DETACHED',
    targetType: 'FINDER_CONTRACT',
    targetId: contractId,
    before: { route: link.route, permitId: link.permitId, personalMatingId: link.personalMatingId },
    reason: reasonFa,
  });
}

// ── reading ──────────────────────────────────────────────────────────────────

export interface AnimalCooldown {
  readonly animalId: string;
  readonly nameFa: string;
  readonly sex: 'MALE' | 'FEMALE';
  readonly lastMatedOn: CivilDate | null;
  readonly cooldown: CooldownState;
}

/**
 * The versioned breed rule applied to the derived last mating, as a warning only:
 * a date is a fact, and a rule that blocks new requests never blocks recording
 * what already happened.
 */
export async function finderCooldownFor(db: DbClient, animalIds: readonly string[], today: CivilDate = todayCivil()): Promise<AnimalCooldown[]> {
  if (animalIds.length === 0) return [];
  const rows = await db
    .select({ animal: animals, mergedInto: referenceBreeds.mergedIntoBreedId })
    .from(animals)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(inArray(animals.id, [...animalIds]));
  const last = await lastMatingsOf(db, animalIds);
  const out: AnimalCooldown[] = [];
  for (const { animal, mergedInto } of rows) {
    if (animal.sex !== 'MALE' && animal.sex !== 'FEMALE') continue;
    const rule = await activeRule(db, animal.species, mergedInto ?? animal.breedId, animal.sex);
    const lastMatedOn = last.get(animal.id)?.lastMatedOn ?? null;
    out.push({
      animalId: animal.id,
      nameFa: animal.name ?? 'بدون نام',
      sex: animal.sex,
      lastMatedOn,
      cooldown: cooldownState(rule === null ? null : { ...rule, cooldownMode: 'WARN' }, lastMatedOn, today),
    });
  }
  return out;
}

/** What the request page shows about the contract's downstream path. */
export async function downstreamView(db: DbClient, actor: Actor, requestId: string) {
  const { request } = await loadForParty(db, actor, requestId);
  const [contract] = await db.select().from(finderContracts).where(eq(finderContracts.requestId, request.id)).limit(1);
  if (!contract || contract.confirmedNumber === null) return null;
  const content = await confirmedContent(db, contract.id, contract.confirmedNumber);
  const link = await linkOfContract(db, contract.id);
  const [permit] = link?.permitId ? await db.select().from(matingPermits).where(eq(matingPermits.id, link.permitId)).limit(1) : [];
  const [personal] = link?.personalMatingId
    ? await db.select().from(finderPersonalMatings).where(eq(finderPersonalMatings.id, link.personalMatingId)).limit(1)
    : [];
  const pending = link === null && contract.status === 'CONFIRMED' ? (await currentHandoffProblems(db, content)).problems : [];
  return {
    contract,
    route: content.terms.route as Route,
    link,
    permit: permit ? { id: permit.id, status: permit.status, statusFa: PERMIT_STATUS_FA[permit.status] ?? permit.status, permitNo: permit.permitNo } : null,
    personal: personal ?? null,
    problems: pending,
    cooldown: await finderCooldownFor(db, [content.animals.sire.animalId, content.animals.dam.animalId]),
  };
}

/** The personal mating's page: its contract context, the two animals and their cooldown. */
export async function personalMatingView(db: DbClient, mating: typeof finderPersonalMatings.$inferSelect) {
  const [contract] = await db.select().from(finderContracts).where(eq(finderContracts.id, mating.contractId)).limit(1);
  const content = await confirmedContent(db, contract!.id, contract!.confirmedNumber!);
  return {
    content,
    cooldown: await finderCooldownFor(db, [mating.sireAnimalId, mating.damAnimalId]),
  };
}

/** Every personal mating of one person, for the finder navigation. */
export async function personalMatingsOf(db: DbClient, actor: Actor) {
  return db
    .select()
    .from(finderPersonalMatings)
    .where(or(eq(finderPersonalMatings.sireAccountId, actor.accountId), eq(finderPersonalMatings.damAccountId, actor.accountId)));
}
