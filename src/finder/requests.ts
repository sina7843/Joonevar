/**
 * Mating requests — PHASE-4 PROMPT-005.
 *
 * A request carries everything decided when it was sent as a snapshot, moves
 * through the ten statuses only by the commands in `request-model.ts`, and
 * records every move with its actor and reason. Three database guarantees back
 * the rules that matter:
 *
 *  - one live request per (sender animal, receiver animal): a partial unique
 *    index, so a double submit is one request;
 *  - one active contract coordination per animal: a partial unique index on
 *    `mating_coordination`, so two acceptances racing for the same animal leave
 *    exactly one winner, whatever the timing;
 *  - optimistic versions on every command, so a stale page changes nothing.
 *
 * Expiry is read, not scheduled: every command and read of a due request first
 * moves it to EXPIRED, and `expireDueRequests` does the same for a sweep.
 */
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, notifications } from '../db/schema/core.ts';
import { residences } from '../db/schema/identity.ts';
import { animals } from '../db/schema/animals.ts';
import { finderContracts, finderConversations, matingCoordinations, matingProfiles, matingRequestEvents, matingRequests } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import { readInt, snapshotSetting } from '../settings/service.ts';
import { isKycApproved } from '../identity/kyc.ts';
import { requireOwnedAnimal } from '../animals/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { todayCivil } from '../domain/calendar.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderFlag, finderFlagEnabled } from './flags.ts';
import { assertFinderAccess, blockedBetween } from './sanctions.ts';
import { pairFormationProblem } from './subscriptions.ts';
import { publicProfile } from './profiles.ts';
import { searchProfiles } from './discovery.ts';
import { FINDER_SETTING_KEYS } from './model.ts';
import { acceptsRequests, holdsCapacity, type ProfileState } from './profile-model.ts';
import {
  commandProblem,
  expiryProblem,
  isDue,
  LIVE_STATUSES,
  PRE_CONTRACT_STATUSES,
  targetOf,
  termsProblem,
  type Party,
  type RequestCommand,
  type RequestStatus,
  type Terms,
} from './request-model.ts';

export type RequestRow = typeof matingRequests.$inferSelect;
export const REQUESTS_ROUTE = '/account/mating-finder/requests';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این درخواست در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.';

export const partyOf = (request: RequestRow, accountId: string): Party | null =>
  request.senderAccountId === accountId ? 'SENDER' : request.receiverAccountId === accountId ? 'RECEIVER' : null;

export const counterpartOf = (request: RequestRow, accountId: string): string =>
  request.senderAccountId === accountId ? request.receiverAccountId : request.senderAccountId;

/** A request only its two parties can reach; anyone else gets the same NOT_FOUND as a missing one. */
export async function loadForParty(tx: DbClient, actor: Actor, requestId: string, lock = false): Promise<{ request: RequestRow; party: Party }> {
  if (!UUID.test(requestId)) throw notFound('این درخواست پیدا نشد.');
  const query = tx.select().from(matingRequests).where(eq(matingRequests.id, requestId)).limit(1);
  const [request] = lock ? await query.for('update') : await query;
  const party = request ? partyOf(request, actor.accountId) : null;
  if (!request || party === null) throw notFound('این درخواست پیدا نشد.');
  return { request, party };
}

/**
 * Kinds that coalesce (PROMPT-007): while the recipient has not read the last
 * notice of this kind for this request, another one adds nothing — one SMS per
 * burst of messages, not one per message.
 */
const COALESCED_KINDS = ['FINDER_MESSAGE_POSTED'];

export async function notifyFinder(tx: DbClient, recipient: string, kind: string, titleFa: string, bodyFa: string, requestId: string): Promise<void> {
  if (!(await finderFlagEnabled(tx, 'finder.flag.notifications'))) return;
  if (COALESCED_KINDS.includes(kind)) {
    const [unread] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.recipientAccountId, recipient), eq(notifications.kind, kind), eq(notifications.entityId, requestId), isNull(notifications.readAt)))
      .limit(1);
    if (unread) return;
  }
  await createNotification(tx, {
    recipientAccountId: recipient,
    kind,
    titleFa,
    bodyFa,
    resume: { entity: { type: 'MATING_REQUEST', id: requestId }, step: 'REQUEST', originRoute: REQUESTS_ROUTE + '/' + requestId },
  });
}

/** Move a request, guarded by its version, and write the history row and the audit row. */
export async function moveRequest(
  tx: DbClient,
  request: RequestRow,
  to: RequestStatus,
  actor: Actor | null,
  reasonFa: string | null,
  extra: Partial<typeof matingRequests.$inferInsert> = {},
  now: Date = new Date(),
): Promise<RequestRow> {
  const [row] = await tx
    .update(matingRequests)
    .set({ ...extra, status: to, closedReasonFa: reasonFa ?? extra.closedReasonFa ?? null, version: request.version + 1, updatedAt: now })
    .where(and(eq(matingRequests.id, request.id), eq(matingRequests.version, request.version)))
    .returning();
  if (!row) throw conflict(STALE);
  await tx.insert(matingRequestEvents).values({
    requestId: request.id,
    fromStatus: request.status,
    toStatus: to,
    actorAccountId: actor?.accountId ?? null,
    reasonFa,
    createdAt: now,
  });
  await recordAudit(tx, actor, {
    action: 'MATING_REQUEST_' + to,
    targetType: 'MATING_REQUEST',
    targetId: request.id,
    targetVersion: row.version,
    before: { status: request.status },
    after: { status: to },
    reason: reasonFa,
  });
  return row;
}

/** Expire a due request in place; returns the row as it now stands. */
async function expireIfDue(tx: DbClient, request: RequestRow, now: Date): Promise<RequestRow> {
  if (!isDue(request.status as RequestStatus, request.expiresAt, now)) return request;
  const expired = await moveRequest(tx, request, 'EXPIRED', null, 'مهلت پاسخ به این درخواست گذشت.', {}, now);
  await releaseCoordination(tx, request.id, now);
  return expired;
}

/** Sweep for an operator or a scheduler; every read expires on its own anyway. */
export async function expireDueRequests(db: Database, now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: matingRequests.id })
    .from(matingRequests)
    .where(and(inArray(matingRequests.status, [...PRE_CONTRACT_STATUSES]), sql`${matingRequests.expiresAt} <= ${now}`));
  let count = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(matingRequests).where(eq(matingRequests.id, id)).for('update').limit(1);
      if (row && row.status !== (await expireIfDue(tx, row, now)).status) count += 1;
    });
  }
  return count;
}

// ── coordination: the single-winner lock ─────────────────────────────────────

/**
 * Serialise every coordination change touching these animals, in id order.
 * Taken before any request row is locked: two requests for the same animal then
 * queue here instead of each holding its own row and waiting on the other's
 * (the deadlock the race test found), and the second one meets the unique index
 * as a clean conflict.
 */
export async function lockAnimals(tx: DbClient, animalIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(animalIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mating_coordination:' || ${id}))`);
  }
}

async function setProfilesState(tx: DbClient, animalIds: readonly string[], from: readonly ProfileState[], to: ProfileState, now: Date) {
  await tx
    .update(matingProfiles)
    .set({ state: to, version: sql`${matingProfiles.version} + 1`, updatedAt: now })
    .where(and(inArray(matingProfiles.animalId, [...animalIds]), inArray(matingProfiles.state, [...from])));
}

/**
 * Hold both animals for this request. The partial unique index decides a race:
 * the second transaction's insert fails and nothing else it did survives.
 * Competing live requests on either animal are paused, not closed.
 */
export async function enterCoordination(tx: DbClient, request: RequestRow, now: Date): Promise<void> {
  try {
    await tx.insert(matingCoordinations).values([
      { animalId: request.senderAnimalId, requestId: request.id, createdAt: now },
      { animalId: request.receiverAnimalId, requestId: request.id, createdAt: now },
    ]);
  } catch (error) {
    if (violates(error, 'mating_coordination_one_active_key')) {
      throw conflict('یکی از این دو حیوان همین حالا در تنظیم قرارداد با درخواست دیگری است.');
    }
    throw error;
  }
  const pair = [request.senderAnimalId, request.receiverAnimalId];
  await tx
    .update(matingRequests)
    .set({ pausedAt: now, updatedAt: now })
    .where(
      and(
        ne(matingRequests.id, request.id),
        inArray(matingRequests.status, [...PRE_CONTRACT_STATUSES]),
        isNull(matingRequests.pausedAt),
        or(inArray(matingRequests.senderAnimalId, pair), inArray(matingRequests.receiverAnimalId, pair)),
      ),
    );
  await setProfilesState(tx, pair, ['READY', 'INVITE_ONLY', 'TEMPORARILY_UNAVAILABLE'], 'COORDINATING', now);
}

/** Let go of both animals; paused competitors whose animals are free again resume. */
export async function releaseCoordination(tx: DbClient, requestId: string, now: Date): Promise<void> {
  const released = await tx
    .update(matingCoordinations)
    .set({ active: false, releasedAt: now })
    .where(and(eq(matingCoordinations.requestId, requestId), eq(matingCoordinations.active, true)))
    .returning({ animalId: matingCoordinations.animalId });
  if (released.length === 0) return;
  const animalIds = released.map((r) => r.animalId);
  await setProfilesState(tx, animalIds, ['COORDINATING', 'MATCH_SELECTED'], 'READY', now);
  await tx.execute(sql`
    update mating_request r set paused_at = null, updated_at = ${now}
    where r.paused_at is not null
      and not exists (select 1 from mating_coordination c where c.active and c.animal_id in (r.sender_animal_id, r.receiver_animal_id))
  `);
}

// ── commands ─────────────────────────────────────────────────────────────────

export interface CreateRequestInput {
  readonly senderAnimalId: string;
  readonly receiverProfileId: string;
  readonly route: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly cityFa: string;
  readonly placeCategory: string;
  readonly financialCategory: string;
  readonly messageFa: string | null;
  readonly specialConditionsFa: string | null;
  /** Shorter than the managed default, or null for the default. */
  readonly expiresInDays: number | null;
}

const text = (value: string | null, max: number, label: string): string | null => {
  const t = value?.trim() ?? '';
  if (t.length > max) throw validation(label + ' حداکثر ' + max.toLocaleString('fa-IR') + ' نویسه است.');
  return t === '' ? null : t;
};

export async function createRequest(db: Database, actor: Actor, input: CreateRequestInput, now: Date = new Date()): Promise<RequestRow> {
  await assertFinderFlag(db, 'finder.flag.requests');
  await assertFinderAccess(db, actor.accountId, now);
  const problem = termsProblem(input, todayCivil(now));
  if (problem) throw validation(problem);
  const messageFa = text(input.messageFa, 1000, 'توضیح');
  const specialConditionsFa = text(input.specialConditionsFa, 1000, 'شرایط ویژه');
  const expiry = await snapshotSetting(db, FINDER_SETTING_KEYS.requestExpiryDays);
  const defaultDays = Number(expiry.value);
  const expiryIssue = expiryProblem(input.expiresInDays, defaultDays);
  if (expiryIssue) throw validation(expiryIssue);
  await assertWithinLimit(db, { action: 'FINDER_REQUEST_CREATE', actor });

  const senderAnimal = await requireOwnedAnimal(db, actor, input.senderAnimalId);
  const [senderProfile] = await db.select().from(matingProfiles).where(eq(matingProfiles.animalId, senderAnimal.id)).limit(1);
  if (!senderProfile || senderProfile.ownerAccountId !== actor.accountId || !holdsCapacity(senderProfile.state as ProfileState)) {
    throw validation('حیوان شما باید پروفایل فعال جفت‌یابی داشته باشد تا از طرف آن درخواست بفرستید.');
  }
  // Only a profile the sender can see, and only one taking requests.
  const card = await publicProfile(db, actor.accountId, input.receiverProfileId, now);
  if (!card) throw notFound('این پروفایل پیدا نشد.');
  if (!acceptsRequests(card.state)) throw conflict('این پروفایل در حال حاضر درخواست تازه نمی‌پذیرد.');
  const [receiverAnimal] = await db.select().from(animals).where(eq(animals.id, card.animalId)).limit(1);
  if (!receiverAnimal || receiverAnimal.ownerAccountId === actor.accountId) throw validation('درخواست به حیوان خودتان ممکن نیست.');
  const pair = await pairFormationProblem(db, actor.accountId, receiverAnimal.ownerAccountId, now);
  if (pair) throw validation(pair);

  // The compatibility outcome at sending time, from the same evaluator the search uses.
  const match = await searchProfiles(db, actor, { for: senderAnimal.id }, { now, onlyProfileId: input.receiverProfileId, pageSize: 1 });
  const evaluation = match.items[0]?.evaluation ?? null;
  if (!evaluation) throw validation('این دو حیوان هم‌نژاد و جنس مخالف نیستند یا جست‌وجو بسته است.');
  if (evaluation.blockers.length > 0) throw validation(evaluation.blockers.join(' '));
  if (input.route === 'OFFICIAL' && !(card.hasPedigree && (await hasPedigree(db, senderAnimal.id)))) {
    throw validation('مسیر رسمی فقط وقتی باز است که هر دو حیوان شجره‌نامه داشته باشند؛ مسیر شخصی را انتخاب کنید.');
  }

  const days = input.expiresInDays ?? defaultDays;
  const snapshot = {
    sender: { accountId: actor.accountId, animalId: senderAnimal.id, nameFa: senderAnimal.name, breedId: senderAnimal.breedId, sex: senderAnimal.sex },
    receiver: { accountId: receiverAnimal.ownerAccountId, animalId: receiverAnimal.id, profileId: card.profileId, nameFa: card.nameFa, breedFa: card.breedFa, sex: card.sex },
    evaluation,
    expirySetting: { key: expiry.key, value: expiry.value, version: expiry.version },
    chosenDays: days,
  };

  try {
    return await db.transaction(async (tx) => {
      // Re-read the receiver's state under a lock: a profile that went into coordination a moment ago takes no request.
      const [locked] = await tx.select().from(matingProfiles).where(eq(matingProfiles.id, card.profileId)).for('update').limit(1);
      if (!locked || !acceptsRequests(locked.state as ProfileState)) throw conflict('این پروفایل در حال حاضر درخواست تازه نمی‌پذیرد.');
      const [row] = await tx
        .insert(matingRequests)
        .values({
          senderAccountId: actor.accountId,
          receiverAccountId: receiverAnimal.ownerAccountId,
          senderAnimalId: senderAnimal.id,
          receiverAnimalId: receiverAnimal.id,
          receiverProfileId: card.profileId,
          route: input.route as Terms['route'],
          windowFrom: input.windowFrom,
          windowTo: input.windowTo,
          cityFa: input.cityFa.trim(),
          placeCategory: input.placeCategory as Terms['placeCategory'],
          financialCategory: input.financialCategory as Terms['financialCategory'],
          messageFa,
          specialConditionsFa,
          expiresAt: new Date(now.getTime() + days * 86_400_000),
          snapshot,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(matingRequestEvents).values({ requestId: row!.id, fromStatus: null, toStatus: 'WAITING_REVIEW', actorAccountId: actor.accountId, createdAt: now });
      await recordAudit(tx, actor, {
        action: 'MATING_REQUEST_CREATED',
        targetType: 'MATING_REQUEST',
        targetId: row!.id,
        targetVersion: 1,
        after: { route: row!.route, score: evaluation.score, ruleVersions: evaluation.ruleVersions, expiresAt: row!.expiresAt.toISOString() },
      });
      await notifyFinder(tx, row!.receiverAccountId, 'FINDER_REQUEST_RECEIVED', 'درخواست جفت‌گیری تازه', 'برای ' + card.nameFa + ' درخواست جفت‌گیری رسیده است.', row!.id);
      return row!;
    });
  } catch (error) {
    if (violates(error, 'mating_request_one_live_pair_key')) throw conflict('برای همین دو حیوان یک درخواست باز دارید.');
    throw error;
  }
}

async function hasPedigree(db: DbClient, animalId: string): Promise<boolean> {
  const rows = await db.execute(sql`select 1 from pedigree where animal_id = ${animalId} limit 1`);
  return rows.rows.length > 0;
}

/**
 * The common path of every owner command: lock, expire if due, check the
 * version, the party and the transition, then move.
 */
const FORWARD_COMMANDS: readonly RequestCommand[] = ['ACCEPT', 'PROPOSE_TERMS', 'ACCEPT_TERMS', 'START_CONTRACT'];
export const BLOCKED_FA = 'امکان ادامه این گفت‌وگو و درخواست وجود ندارد.';

async function command(
  db: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number },
  name: RequestCommand,
  work: (tx: DbClient, request: RequestRow, party: Party) => Promise<RequestRow>,
  now: Date,
): Promise<RequestRow> {
  return db.transaction(async (tx) => {
    const loaded = await loadForParty(tx, actor, input.requestId, true);
    const request = await expireIfDue(tx, loaded.request, now);
    if (request.status === 'EXPIRED' && loaded.request.status !== 'EXPIRED') return request;
    if (request.version !== input.expectedVersion) throw conflict(STALE);
    const problem = commandProblem(name, request.status as RequestStatus, loaded.party);
    if (problem) throw conflict(problem);
    // PROMPT-007: moving a request forward needs finder access and no block between
    // the two; stepping back (reject, cancel, not completed) never does.
    if (FORWARD_COMMANDS.includes(name)) {
      await assertFinderAccess(tx, actor.accountId, now);
      if (await blockedBetween(tx, request.senderAccountId, request.receiverAccountId)) throw conflict(BLOCKED_FA);
    }
    return work(tx, request, loaded.party);
  });
}

export async function respondToRequest(
  db: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number; accept: boolean; reasonFa: string | null },
  now: Date = new Date(),
): Promise<RequestRow> {
  return command(db, actor, input, input.accept ? 'ACCEPT' : 'REJECT', async (tx, request) => {
    if (input.accept) {
      if (request.pausedAt) throw conflict('یکی از دو حیوان در تنظیم قرارداد دیگری است؛ پس از پایان آن دوباره تلاش کنید.');
      // Accepting needs both identities approved (PRODUCT_DECISIONS §3); a subscription that lapsed since does not undo the request.
      if (!(await isKycApproved(tx, request.senderAccountId)) || !(await isKycApproved(tx, request.receiverAccountId))) {
        throw conflict('احراز هویت هر دو مالک باید تأیید شده باشد.');
      }
      const row = await moveRequest(tx, request, 'PRELIMINARILY_ACCEPTED', actor, null, {}, now);
      await tx.insert(finderConversations).values({ requestId: request.id, createdAt: now }).onConflictDoNothing();
      await notifyFinder(tx, request.senderAccountId, 'FINDER_REQUEST_ANSWERED', 'درخواست شما پذیرفته شد', 'گفت‌وگو باز است و می‌توانید درباره شرایط صحبت کنید.', request.id);
      return row;
    }
    const reasonFa = input.reasonFa?.trim() || null;
    if (!reasonFa) throw validation('دلیل رد را بنویسید.');
    const row = await moveRequest(tx, request, 'REJECTED', actor, reasonFa, {}, now);
    await notifyFinder(tx, request.senderAccountId, 'FINDER_REQUEST_ANSWERED', 'درخواست شما رد شد', reasonFa, request.id);
    return row;
  }, now);
}

export async function proposeTerms(
  db: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number } & Omit<Terms, 'specialConditionsFa'> & { specialConditionsFa: string | null },
  now: Date = new Date(),
): Promise<RequestRow> {
  const problem = termsProblem(input, todayCivil(now));
  if (problem) throw validation(problem);
  const special = text(input.specialConditionsFa, 1000, 'شرایط ویژه');
  return command(db, actor, input, 'PROPOSE_TERMS', async (tx, request) => {
    if (input.route === 'OFFICIAL' && !((await hasPedigree(tx, request.senderAnimalId)) && (await hasPedigree(tx, request.receiverAnimalId)))) {
      throw validation('مسیر رسمی فقط وقتی باز است که هر دو حیوان شجره‌نامه داشته باشند.');
    }
    const row = await moveRequest(
      tx,
      request,
      'NEGOTIATING',
      actor,
      null,
      {
        route: input.route,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
        cityFa: input.cityFa.trim(),
        placeCategory: input.placeCategory,
        financialCategory: input.financialCategory,
        specialConditionsFa: special,
        termsVersion: request.termsVersion + 1,
        termsProposedByAccountId: actor.accountId,
      },
      now,
    );
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_REQUEST_TERMS', 'شرایط تازه پیشنهاد شد', 'طرف مقابل شرایط درخواست را تغییر داد.', request.id);
    return row;
  }, now);
}

export async function acceptTerms(db: Database, actor: Actor, input: { requestId: string; expectedVersion: number }, now: Date = new Date()): Promise<RequestRow> {
  return command(db, actor, input, 'ACCEPT_TERMS', async (tx, request) => {
    if (request.termsProposedByAccountId === actor.accountId) throw conflict('شرایط پیشنهادی شما باید توسط طرف مقابل پذیرفته شود.');
    return moveRequest(tx, request, 'PRELIMINARILY_ACCEPTED', actor, null, { termsProposedByAccountId: null }, now);
  }, now);
}

/** Either side, with a reason, before a contract is confirmed. A drafting contract is cancelled with it. */
export async function cancelRequest(
  db: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number; reasonFa: string },
  now: Date = new Date(),
): Promise<RequestRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل لغو را بنویسید؛ در سابقه می‌ماند.');
  return command(db, actor, input, 'CANCEL', async (tx, request) => {
    const row = await moveRequest(tx, request, 'CANCELLED', actor, reasonFa, {}, now);
    if (request.status === 'CONTRACT_DRAFTING') {
      await tx
        .update(finderContracts)
        .set({ status: 'CANCELLED', cancelKind: 'UNILATERAL', cancelledByAccountId: actor.accountId, cancelledAt: now, cancelReasonFa: reasonFa, updatedAt: now })
        .where(and(eq(finderContracts.requestId, request.id), eq(finderContracts.status, 'DRAFTING')));
    }
    await releaseCoordination(tx, request.id, now);
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_REQUEST_CANCELLED', 'درخواست لغو شد', reasonFa, request.id);
    return row;
  }, now);
}

/** After a confirmed contract, either side may record that the mating did not happen, with a reason. */
export async function markNotCompleted(
  db: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number; reasonFa: string },
  now: Date = new Date(),
): Promise<RequestRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل را بنویسید.');
  return command(db, actor, input, 'MARK_NOT_COMPLETED', async (tx, request) => {
    const row = await moveRequest(tx, request, 'MATING_NOT_COMPLETED', actor, reasonFa, {}, now);
    await releaseCoordination(tx, request.id, now);
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_REQUEST_OUTCOME', 'نتیجه ثبت شد', 'طرف مقابل ثبت کرد جفت‌گیری انجام نشد: ' + reasonFa, request.id);
    return row;
  }, now);
}

/**
 * When an animal leaves the finder (transfer, death, missing, archive, a
 * protected identity change, moderation, or its owner switching it off), every
 * open request it is part of — before a confirmed contract — closes with the
 * reason and the other side is told. A confirmed contract and all history stay.
 */
export async function closeRequestsForAnimal(tx: DbClient, animalId: string, reasonFa: string, now: Date = new Date()): Promise<number> {
  const open = await tx
    .select()
    .from(matingRequests)
    .where(
      and(
        inArray(matingRequests.status, [...PRE_CONTRACT_STATUSES, 'CONTRACT_DRAFTING']),
        or(eq(matingRequests.senderAnimalId, animalId), eq(matingRequests.receiverAnimalId, animalId)),
      ),
    )
    .for('update');
  for (const request of open) {
    await moveRequest(tx, request, 'CANCELLED', null, reasonFa, {}, now);
    if (request.status === 'CONTRACT_DRAFTING') {
      await tx
        .update(finderContracts)
        .set({ status: 'CANCELLED', cancelKind: 'UNILATERAL', cancelledAt: now, cancelReasonFa: reasonFa, updatedAt: now })
        .where(and(eq(finderContracts.requestId, request.id), eq(finderContracts.status, 'DRAFTING')));
    }
    await releaseCoordination(tx, request.id, now);
    const affected = request.senderAnimalId === animalId ? request.receiverAccountId : request.senderAccountId;
    await notifyFinder(tx, affected, 'FINDER_REQUEST_CANCELLED', 'درخواست بسته شد', reasonFa, request.id);
  }
  return open.length;
}

// ── contact consent ──────────────────────────────────────────────────────────

const CONTACT_STATUSES: readonly RequestStatus[] = ['CONTRACT_CONFIRMED', 'MATING_COMPLETED', 'MATING_NOT_COMPLETED'];

/** After the contract, each side may agree to show its phone and address; both must agree (PRODUCT_DECISIONS §8). */
export async function setContactConsent(db: Database, actor: Actor, input: { requestId: string; consent: boolean }): Promise<void> {
  await db.transaction(async (tx) => {
    const { request, party } = await loadForParty(tx, actor, input.requestId, true);
    if (!CONTACT_STATUSES.includes(request.status as RequestStatus)) throw conflict('نمایش تماس فقط پس از تأیید قرارداد ممکن است.');
    await tx
      .update(matingRequests)
      .set(party === 'SENDER' ? { senderContactConsent: input.consent } : { receiverContactConsent: input.consent })
      .where(eq(matingRequests.id, request.id));
    await recordAudit(tx, actor, { action: 'MATING_CONTACT_CONSENT', targetType: 'MATING_REQUEST', targetId: request.id, after: { consent: input.consent } });
  });
}

export const contactsRevealed = (request: RequestRow): boolean =>
  CONTACT_STATUSES.includes(request.status as RequestStatus) && request.senderContactConsent && request.receiverContactConsent;

/** The other side's phone and address — only when both consented after a confirmed contract. */
export async function counterpartContact(db: DbClient, actor: Actor, request: RequestRow): Promise<{ mobile: string; addressFa: string | null } | null> {
  if (!contactsRevealed(request)) return null;
  const other = counterpartOf(request, actor.accountId);
  const [row] = await db
    .select({ mobile: accounts.mobile, address: residences.address, city: residences.city })
    .from(accounts)
    .leftJoin(residences, eq(residences.accountId, accounts.id))
    .where(eq(accounts.id, other))
    .limit(1);
  return row ? { mobile: row.mobile, addressFa: row.address ? [row.city, row.address].filter(Boolean).join('، ') : null } : null;
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function myRequests(db: Database, actor: Actor, now: Date = new Date()) {
  await expireDueFor(db, actor.accountId, now);
  return db
    .select()
    .from(matingRequests)
    .where(or(eq(matingRequests.senderAccountId, actor.accountId), eq(matingRequests.receiverAccountId, actor.accountId)))
    .orderBy(desc(matingRequests.updatedAt));
}

async function expireDueFor(db: Database, accountId: string, now: Date) {
  const due = await db
    .select({ id: matingRequests.id })
    .from(matingRequests)
    .where(
      and(
        or(eq(matingRequests.senderAccountId, accountId), eq(matingRequests.receiverAccountId, accountId)),
        inArray(matingRequests.status, [...PRE_CONTRACT_STATUSES]),
        sql`${matingRequests.expiresAt} <= ${now}`,
      ),
    );
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(matingRequests).where(eq(matingRequests.id, id)).for('update').limit(1);
      if (row) await expireIfDue(tx, row, now);
    });
  }
}

export async function requestDetail(db: Database, actor: Actor, requestId: string, now: Date = new Date()) {
  const { request } = await db.transaction(async (tx) => {
    const loaded = await loadForParty(tx, actor, requestId, true);
    return { request: await expireIfDue(tx, loaded.request, now) };
  });
  const events = await db.select().from(matingRequestEvents).where(eq(matingRequestEvents.requestId, request.id)).orderBy(matingRequestEvents.createdAt);
  return { request, party: partyOf(request, actor.accountId)!, events, contact: await counterpartContact(db, actor, request), live: LIVE_STATUSES.includes(request.status as RequestStatus) };
}
