/**
 * Clubs — Phase 2.5 §8 (PROMPT-012).
 *
 * A club is not a second kind of record: it is a `community` row with
 * `kind = 'CLUB'`, so the profile, events, posts, images, merge and public
 * reader written in Phase 2 keep working unchanged. What lives here is the part
 * a club has and an association does not: a lifecycle that starts as a draft and
 * only becomes public once the association verified it, roles that mean
 * something inside one club and nothing outside it, and ownership that is
 * claimed or handed over by a decision somebody is accountable for.
 *
 * Every authorization answer is asked with the club's own id. There is no
 * "manager of clubs" anywhere in this file, so a role in one club can never
 * carry into another (DEC-0198).
 */
import { and, count, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { communities, communityManagers, communityOwnershipRequests } from '../db/schema/communities.ts';
import { moderationReports } from '../db/schema/moderation.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { AppError, conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { DAY_MS, limitMessageFa, windowStart, withinLimit } from '../privacy/limits.ts';
import { readInt } from '../settings/service.ts';
import { unifyPersianLetters } from '../breeds/model.ts';
import { isReportReason, reportInputProblems, type ReportReason } from '../moderation/model.ts';
import { communityPageBySlug, newCommunitySlug, publishedCommunities, type CommunityQuery } from '../communities/service.ts';
import { isCommunityScope, type CommunityScope } from '../communities/model.ts';
import {
  assignableClubRoles,
  clubLifecycleMove,
  clubRoleAllows,
  clubSubmissionBlockers,
  isClubOwnershipKind,
  isClubRole,
  type ClubActorRole,
  type ClubCapability,
  type ClubLifecycle,
  type ClubOwnershipKind,
  type ClubRole,
} from './model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

export type ClubRow = typeof communities.$inferSelect;
export type ClubMemberRow = typeof communityManagers.$inferSelect;
export type ClubOwnershipRow = typeof communityOwnershipRequests.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این کلاب هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const PERSONAL_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];

/**
 * Who verifies a club and who decides a privileged ownership change: the
 * association's operational environment, and the superadmin as the system
 * authority behind it (DEC-0198). A club's own owner is never its verifier.
 */
const AUTHORITY_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];

/** Club reports are decided where every other report is decided (§13). */
const MODERATION_CONTEXTS: readonly ActorContextName[] = ['CONTENT_ADMIN', 'SUPERADMIN'];

// The driver's unique violation, which drizzle re-throws wrapped in its own error.
const isUniqueViolation = (error: unknown): boolean =>
  [error, (error as { cause?: unknown })?.cause].some(
    (candidate) => typeof candidate === 'object' && candidate !== null && (candidate as { code?: string }).code === '23505',
  );

const text = (value: string | null | undefined): string | null => {
  const out = unifyPersianLetters((value ?? '').trim()).replace(/[ \t]+/g, ' ');
  return out === '' ? null : out;
};

function bounded(value: string | null | undefined, max: number, labelFa: string): string | null {
  const out = text(value);
  if (out !== null && out.length > max) throw validation(labelFa + ' حداکثر ' + max.toLocaleString('fa-IR') + ' نویسه است.');
  return out;
}

function requiredReason(value: string | null | undefined): string {
  const out = bounded(value, 500, 'دلیل');
  if (out === null) throw validation('دلیل این تصمیم را بنویسید؛ در تاریخچه ثبت می‌شود.');
  return out;
}

async function clubById(tx: DbClient, clubId: string): Promise<ClubRow> {
  const [row] = UUID.test(clubId) ? await tx.select().from(communities).where(eq(communities.id, clubId)).limit(1) : [];
  if (!row || row.kind !== 'CLUB') throw notFound('کلاب پیدا نشد.');
  return row;
}

async function accountByMobile(tx: DbClient, mobile: string | null | undefined): Promise<{ id: string }> {
  const [account] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.mobile, text(mobile) ?? ''))
    .limit(1);
  if (!account) throw notFound('حسابی با این شماره پیدا نشد؛ صاحب شماره باید یک‌بار وارد همزیست شده باشد.');
  return account;
}

async function bump(tx: DbClient, current: ClubRow, values: Record<string, unknown>): Promise<ClubRow> {
  const [row] = await tx
    .update(communities)
    .set({ ...values, version: current.version + 1, updatedAt: new Date() })
    .where(and(eq(communities.id, current.id), eq(communities.version, current.version)))
    .returning();
  if (!row) throw conflict(STALE);
  return row;
}

// ── Who may do what, inside one club ─────────────────────────────────────

/**
 * The actor's standing in *this* club. The manager row is always read with both
 * the club id and the account id, which is what keeps clubs isolated from each
 * other: there is no query here that could return a role for a different club.
 */
export async function clubRoleFor(database: DbClient, actor: Actor | null, club: ClubRow): Promise<ClubActorRole | null> {
  if (actor === null) return null;
  if (AUTHORITY_CONTEXTS.includes(actor.context)) return 'SYSTEM';
  if (!PERSONAL_CONTEXTS.includes(actor.context)) return null;
  if (club.ownerAccountId !== null && club.ownerAccountId === actor.accountId) return 'OWNER';
  const [row] = await database
    .select({ role: communityManagers.role })
    .from(communityManagers)
    .where(
      and(
        eq(communityManagers.communityId, club.id),
        eq(communityManagers.accountId, actor.accountId),
        eq(communityManagers.status, 'ACCEPTED'),
      ),
    )
    .limit(1);
  if (!row) return null;
  // Only the club record itself says who the owner is; an old OWNER assignment
  // on a membership row of somebody who no longer owns it is an admin, not an owner.
  return row.role === 'OWNER' ? 'ADMIN' : row.role;
}

function assertCapability(role: ClubActorRole | null, capability: ClubCapability, whatFa: string): ClubActorRole {
  if (role === null || !clubRoleAllows(role, capability)) throw forbidden(whatFa + ' را فقط نقش مجاز همین کلاب انجام می‌دهد.');
  return role;
}

async function requireCapability(
  tx: DbClient,
  actor: Actor,
  club: ClubRow,
  capability: ClubCapability,
  whatFa: string,
): Promise<ClubActorRole> {
  return assertCapability(await clubRoleFor(tx, actor, club), capability, whatFa);
}

function assertAuthority(actor: Actor, whatFa: string): void {
  if (!AUTHORITY_CONTEXTS.includes(actor.context)) throw forbidden(whatFa + ' از محیط عملیاتی انجمن انجام می‌شود.');
}

// ── Creating a club ──────────────────────────────────────────────────────

export interface CreateClubInput {
  readonly displayNameFa: string;
  readonly scope?: string | null;
  readonly aboutFa?: string | null;
  readonly contactPhone?: string | null;
}

/**
 * Anyone with an ordinary account may open a club. It starts as a draft owned by
 * its creator: nothing about it is public until the association verified it.
 */
export async function createClub(database: Database, actor: Actor, input: CreateClubInput, now: Date = new Date()): Promise<ClubRow> {
  if (!PERSONAL_CONTEXTS.includes(actor.context)) throw forbidden('ساخت کلاب از حساب شخصی انجام می‌شود.');
  const displayNameFa = bounded(input.displayNameFa, 160, 'نام کلاب');
  if (displayNameFa === null) throw validation('نام کلاب را بنویسید.');
  const scope = input.scope ?? 'OTHER';
  if (!isCommunityScope(scope)) throw validation('حوزه انتخاب‌شده معتبر نیست.');
  const aboutFa = bounded(input.aboutFa, 4000, 'معرفی');
  const contactPhone = bounded(input.contactPhone, 40, 'راه ارتباطی');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(communities)
      .values({
        kind: 'CLUB',
        displayNameFa,
        scope: scope as CommunityScope,
        aboutFa,
        contactPhone,
        ownerAccountId: actor.accountId,
        claimedAt: now,
        lifecycle: 'DRAFT',
      })
      .returning();
    await recordAudit(tx, actor, {
      action: 'CLUB_CREATED',
      targetType: 'COMMUNITY',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { displayNameFa, scope, lifecycle: 'DRAFT' },
    });
    return row!;
  });
}

// ── The lifecycle ────────────────────────────────────────────────────────

async function moveLifecycle(
  tx: DbClient,
  actor: Actor,
  club: ClubRow,
  role: ClubActorRole | null,
  to: ClubLifecycle,
  reason: string | null,
  extra: Record<string, unknown> = {},
): Promise<ClubRow> {
  const from = club.lifecycle as ClubLifecycle;
  if (from === to) throw validation('این کلاب همین حالا در همین وضعیت است.');
  const move = clubLifecycleMove(from, to, role);
  if (move === null) throw conflict('این تغییر وضعیت از حالت کنونی کلاب ممکن نیست.');
  // Leaving ACTIVE takes the page down with it: a club that is no longer verified
  // is no longer public, whatever its own publication switch says.
  const publication = to === 'ACTIVE' ? {} : { publicStatus: 'DRAFT' as const };
  const row = await bump(tx, club, { lifecycle: to, lifecycleReasonFa: reason, ...publication, ...extra });
  await recordAudit(tx, actor, {
    action: 'CLUB_LIFECYCLE_CHANGED',
    targetType: 'COMMUNITY',
    targetId: row.id,
    targetVersion: row.version,
    before: { lifecycle: from, publicStatus: club.publicStatus },
    after: { lifecycle: row.lifecycle, publicStatus: row.publicStatus },
    reason,
  });
  return row;
}

async function tellOwner(tx: DbClient, club: ClubRow, kind: string, titleFa: string, bodyFa: string): Promise<void> {
  if (club.ownerAccountId === null) return;
  await createNotification(tx, {
    recipientAccountId: club.ownerAccountId,
    kind,
    titleFa,
    bodyFa,
    resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_MANAGEMENT', originRoute: '/account/clubs/' + club.id },
  });
}

/** The club asks the association to look at it. Sent by its owner or an admin. */
export async function submitClubForVerification(
  database: Database,
  actor: Actor,
  input: { clubId: string; expectedVersion: number; noteFa?: string | null },
): Promise<ClubRow> {
  const note = bounded(input.noteFa, 500, 'توضیح');

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    const role = await requireCapability(tx, actor, club, 'SUBMIT', 'ارسال کلاب برای بررسی');
    if (club.version !== input.expectedVersion) throw conflict(STALE);
    const blockers = clubSubmissionBlockers({
      aboutFa: club.aboutFa,
      contact: club.contactPhone ?? club.websiteUrl ?? club.membershipUrl,
      ownedByAccount: club.ownerAccountId !== null,
    });
    if (blockers.length > 0) throw validation(blockers.join(' '));
    return moveLifecycle(tx, actor, club, role, 'PENDING_VERIFICATION', note);
  });
}

export const CLUB_VERIFICATION_OUTCOMES = ['VERIFY', 'NEEDS_CORRECTION', 'REJECT'] as const;
export type ClubVerificationOutcome = (typeof CLUB_VERIFICATION_OUTCOMES)[number];

const OUTCOME_TO: Record<ClubVerificationOutcome, ClubLifecycle> = {
  VERIFY: 'ACTIVE',
  NEEDS_CORRECTION: 'NEEDS_CORRECTION',
  REJECT: 'REJECTED',
};

/** The association's initial verification decision, with its reason recorded (DEC-0198). */
export async function decideClubVerification(
  database: Database,
  actor: Actor,
  input: { clubId: string; expectedVersion: number; outcome: string; reasonFa: string },
  now: Date = new Date(),
): Promise<ClubRow> {
  assertAuthority(actor, 'تأیید کلاب');
  if (!(CLUB_VERIFICATION_OUTCOMES as readonly string[]).includes(input.outcome)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const outcome = input.outcome as ClubVerificationOutcome;
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    if (club.version !== input.expectedVersion) throw conflict(STALE);
    if (club.lifecycle !== 'PENDING_VERIFICATION') throw conflict('این کلاب در انتظار بررسی نیست.');
    const row = await moveLifecycle(
      tx,
      actor,
      club,
      'SYSTEM',
      OUTCOME_TO[outcome],
      reason,
      outcome === 'VERIFY' ? { verifiedAt: now, verifiedByAccountId: actor.accountId } : {},
    );
    await tellOwner(
      tx,
      row,
      'CLUB_VERIFICATION_DECIDED',
      outcome === 'VERIFY' ? 'کلاب «' + row.displayNameFa + '» تأیید شد' : 'تصمیم انجمن درباره کلاب «' + row.displayNameFa + '»',
      outcome === 'VERIFY' ? 'اکنون می‌توانید صفحه عمومی کلاب را منتشر کنید. ' + reason : reason,
    );
    return row;
  });
}

/**
 * Suspension, reinstatement and archiving. Suspension and reinstatement belong
 * to the association; archiving belongs to the club's owner, and to the
 * association for a club it suspended or rejected.
 */
export async function setClubStanding(
  database: Database,
  actor: Actor,
  input: { clubId: string; expectedVersion: number; to: string; reasonFa: string },
): Promise<ClubRow> {
  const to = input.to;
  if (to !== 'SUSPENDED' && to !== 'ACTIVE' && to !== 'ARCHIVED') throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    const role = await clubRoleFor(tx, actor, club);
    if (club.version !== input.expectedVersion) throw conflict(STALE);
    const row = await moveLifecycle(tx, actor, club, role, to, reason);
    const titleFa =
      to === 'SUSPENDED'
        ? 'کلاب «' + row.displayNameFa + '» تعلیق شد'
        : to === 'ACTIVE'
          ? 'تعلیق کلاب «' + row.displayNameFa + '» برداشته شد'
          : 'کلاب «' + row.displayNameFa + '» بایگانی شد';
    await tellOwner(tx, row, 'CLUB_STANDING_CHANGED', titleFa, reason);
    return row;
  });
}

/**
 * Publishing the club's own page. Only a verified club has a page to publish,
 * and a club hidden by moderation is republished only from moderation.
 */
export async function setClubPublication(
  database: Database,
  actor: Actor,
  input: { clubId: string; expectedVersion: number; publish: boolean; reasonFa?: string | null },
  now: Date = new Date(),
): Promise<ClubRow> {
  const reason = bounded(input.reasonFa, 500, 'دلیل');

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    const role = await requireCapability(tx, actor, club, 'PUBLISH', 'انتشار صفحه کلاب');
    if (club.version !== input.expectedVersion) throw conflict(STALE);
    const to = input.publish ? 'PUBLISHED' : 'HIDDEN';
    if (club.publicStatus === to) throw validation('این کلاب همین حالا در همین وضعیت انتشار است.');
    if (input.publish) {
      if (club.lifecycle !== 'ACTIVE') throw conflict('تا وقتی کلاب تأیید نشده است، صفحه عمومی ندارد.');
      if (club.hiddenByReview && role !== 'SYSTEM') {
        throw conflict('این کلاب را بررسی همزیست پنهان کرده است و فقط همان‌جا دوباره منتشر می‌شود.');
      }
    }
    const row = await bump(tx, club, {
      publicStatus: to,
      publicSlug: club.publicSlug ?? newCommunitySlug('CLUB'),
      publicPublishedAt: club.publicPublishedAt ?? (input.publish ? now : null),
      hiddenByReview: to === 'HIDDEN' && role === 'SYSTEM',
    });
    await recordAudit(tx, actor, {
      action: 'CLUB_PUBLICATION_CHANGED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: { publicStatus: club.publicStatus },
      after: { publicStatus: row.publicStatus, publicSlug: row.publicSlug },
      reason,
    });
    return row;
  });
}

// ── Club-scoped roles ────────────────────────────────────────────────────

/**
 * Give somebody a role in this club. The role is written on the membership row
 * of this club only; the same account may hold a different role, or none, in
 * every other club.
 */
export async function assignClubRole(
  database: Database,
  actor: Actor,
  input: { clubId: string; mobile: string; role: string; reasonFa?: string | null },
  now: Date = new Date(),
): Promise<ClubMemberRow> {
  if (!isClubRole(input.role)) throw validation('نقش انتخاب‌شده معتبر نیست.');
  const role: ClubRole = input.role;
  const reason = bounded(input.reasonFa, 500, 'دلیل');

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    const mine = await clubRoleFor(tx, actor, club);
    if (!assignableClubRoles(mine).includes(role)) {
      throw forbidden('نقش «' + role + '» را فقط نقش بالاتر همین کلاب واگذار می‌کند؛ مالکیت از مسیر واگذاری مالکیت تغییر می‌کند.');
    }
    const account = await accountByMobile(tx, input.mobile);
    if (account.id === club.ownerAccountId) throw validation('مالک کلاب نقش دیگری در همین کلاب نمی‌گیرد.');

    const [existing] = await tx
      .select()
      .from(communityManagers)
      .where(and(eq(communityManagers.communityId, club.id), eq(communityManagers.accountId, account.id)))
      .limit(1);

    const values = {
      role,
      roleFa: null,
      // A person put into a club by its owner is in it: the invitation dance of
      // Phase 2 stays for association co-managers, whose names appear publicly.
      status: 'ACCEPTED' as const,
      invitedByAccountId: actor.accountId,
      invitedAt: now,
      respondedAt: now,
    };
    const [row] = existing
      ? await tx
          .update(communityManagers)
          .set({ ...values, version: existing.version + 1, updatedAt: now })
          .where(and(eq(communityManagers.id, existing.id), eq(communityManagers.version, existing.version)))
          .returning()
      : await tx
          .insert(communityManagers)
          .values({ communityId: club.id, accountId: account.id, ...values })
          .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'CLUB_ROLE_ASSIGNED',
      targetType: 'COMMUNITY_MANAGER',
      targetId: row.id,
      targetVersion: row.version,
      before: existing ? { role: existing.role, status: existing.status } : undefined,
      after: { communityId: club.id, accountId: account.id, role },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: account.id,
      kind: 'CLUB_ROLE_ASSIGNED',
      titleFa: 'نقش شما در کلاب «' + club.displayNameFa + '»',
      bodyFa: 'این نقش فقط در همین کلاب کار می‌کند.',
      resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_MANAGEMENT', originRoute: '/account/clubs/' + club.id },
    });
    return row;
  });
}

export async function removeClubRole(
  database: Database,
  actor: Actor,
  input: { membershipId: string; expectedVersion: number; reasonFa?: string | null },
  now: Date = new Date(),
): Promise<ClubMemberRow> {
  const reason = bounded(input.reasonFa, 500, 'دلیل');

  return database.transaction(async (tx) => {
    const [membership] = UUID.test(input.membershipId)
      ? await tx.select().from(communityManagers).where(eq(communityManagers.id, input.membershipId)).limit(1)
      : [];
    if (!membership) throw notFound('این عضویت پیدا نشد.');
    const club = await clubById(tx, membership.communityId);
    const mine = await clubRoleFor(tx, actor, club);
    const theirs = membership.role as ClubRole;
    if (!assignableClubRoles(mine).includes(theirs)) throw forbidden('برداشتن این نقش از اختیار شما در این کلاب بیرون است.');
    if (membership.status === 'REMOVED') throw conflict('این عضویت پیش‌تر برداشته شده است.');
    if (membership.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(communityManagers)
      .set({ status: 'REMOVED', respondedAt: now, version: membership.version + 1, updatedAt: now })
      .where(and(eq(communityManagers.id, membership.id), eq(communityManagers.version, membership.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CLUB_ROLE_REMOVED',
      targetType: 'COMMUNITY_MANAGER',
      targetId: row.id,
      targetVersion: row.version,
      before: { role: membership.role, status: membership.status },
      after: { status: 'REMOVED' },
      reason,
    });
    return row;
  });
}

// ── Ownership: claim and transfer ────────────────────────────────────────

const OPEN_REQUEST = 'درخواست بازی درباره مالکیت این کلاب در جریان است؛ تا تعیین تکلیف آن، درخواست تازه‌ای ثبت نمی‌شود.';

/**
 * A claim asks for a club nobody owns; a transfer is its owner naming who should
 * own it next. Neither takes effect by itself: the association decides, which is
 * what keeps a club from changing hands quietly.
 */
export async function requestClubOwnership(
  database: Database,
  actor: Actor,
  input: { clubId: string; kind: string; targetMobile?: string | null; reasonFa?: string | null },
  now: Date = new Date(),
): Promise<ClubOwnershipRow> {
  if (!PERSONAL_CONTEXTS.includes(actor.context)) throw forbidden('درخواست مالکیت کلاب از حساب شخصی ثبت می‌شود.');
  if (!isClubOwnershipKind(input.kind)) throw validation('نوع درخواست معتبر نیست.');
  const kind: ClubOwnershipKind = input.kind;
  const reason = bounded(input.reasonFa, 500, 'توضیح');

  try {
    return await database.transaction(async (tx) => {
      const club = await clubById(tx, input.clubId);
      if (club.lifecycle === 'ARCHIVED' || club.lifecycle === 'REJECTED') throw conflict('این کلاب دیگر فعال نیست.');

      let targetAccountId: string;
      if (kind === 'CLAIM') {
        if (club.ownerAccountId !== null) throw conflict('این کلاب هم‌اکنون مالک دارد؛ تغییر مالکیت از مسیر واگذاری انجام می‌شود.');
        targetAccountId = actor.accountId;
      } else {
        if (club.ownerAccountId !== actor.accountId) throw forbidden('واگذاری مالکیت را فقط مالک کنونی کلاب آغاز می‌کند.');
        const target = await accountByMobile(tx, input.targetMobile);
        if (target.id === actor.accountId) throw validation('کلاب را نمی‌توان به خود مالک واگذار کرد.');
        targetAccountId = target.id;
      }

      const [row] = await tx
        .insert(communityOwnershipRequests)
        .values({
          communityId: club.id,
          kind,
          requestedByAccountId: actor.accountId,
          targetAccountId,
          reasonFa: reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await recordAudit(tx, actor, {
        action: kind === 'CLAIM' ? 'CLUB_OWNERSHIP_CLAIMED' : 'CLUB_OWNERSHIP_TRANSFER_REQUESTED',
        targetType: 'COMMUNITY_OWNERSHIP_REQUEST',
        targetId: row!.id,
        targetVersion: row!.version,
        after: { communityId: club.id, kind, targetAccountId },
        reason,
      });
      if (kind === 'TRANSFER') {
        await createNotification(tx, {
          recipientAccountId: targetAccountId,
          kind: 'CLUB_OWNERSHIP_TRANSFER_REQUESTED',
          titleFa: 'کلاب «' + club.displayNameFa + '» به نام شما واگذار شده است',
          bodyFa: 'این واگذاری پس از تصمیم انجمن اثر می‌گذارد.',
          resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_MANAGEMENT', originRoute: '/account/clubs' },
        });
      }
      return row!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(OPEN_REQUEST);
    throw error;
  }
}

export async function cancelClubOwnershipRequest(
  database: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<ClubOwnershipRow> {
  return database.transaction(async (tx) => {
    const [request] = UUID.test(input.requestId)
      ? await tx.select().from(communityOwnershipRequests).where(eq(communityOwnershipRequests.id, input.requestId)).limit(1)
      : [];
    // Somebody else's request is not found rather than forbidden.
    if (!request || request.requestedByAccountId !== actor.accountId) throw notFound('درخواست پیدا نشد.');
    if (request.status !== 'PENDING') throw conflict('این درخواست پیش‌تر تعیین تکلیف شده است.');
    if (request.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(communityOwnershipRequests)
      .set({ status: 'CANCELLED', decidedAt: now, version: request.version + 1, updatedAt: now })
      .where(and(eq(communityOwnershipRequests.id, request.id), eq(communityOwnershipRequests.version, request.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CLUB_OWNERSHIP_CANCELLED',
      targetType: 'COMMUNITY_OWNERSHIP_REQUEST',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED' },
    });
    return row;
  });
}

/**
 * The association's decision on a claim or a transfer. The facts are re-read
 * inside this transaction: a claim on a club that gained an owner meanwhile, or
 * a transfer from somebody who is no longer the owner, is a conflict rather than
 * a second owner.
 */
export async function decideClubOwnership(
  database: Database,
  actor: Actor,
  input: { requestId: string; expectedVersion: number; approve: boolean; reasonFa: string },
  now: Date = new Date(),
): Promise<{ request: ClubOwnershipRow; club: ClubRow }> {
  assertAuthority(actor, 'تصمیم درباره مالکیت کلاب');
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const [request] = UUID.test(input.requestId)
      ? await tx.select().from(communityOwnershipRequests).where(eq(communityOwnershipRequests.id, input.requestId)).limit(1)
      : [];
    if (!request) throw notFound('درخواست پیدا نشد.');
    if (request.status !== 'PENDING') throw conflict('این درخواست پیش‌تر تعیین تکلیف شده است.');
    if (request.version !== input.expectedVersion) throw conflict(STALE);
    const club = await clubById(tx, request.communityId);

    if (input.approve) {
      if (request.kind === 'CLAIM' && club.ownerAccountId !== null) {
        throw conflict('این کلاب در این فاصله مالک پیدا کرده است؛ درخواست را رد کنید یا واگذاری تازه ثبت شود.');
      }
      if (request.kind === 'TRANSFER' && club.ownerAccountId !== request.requestedByAccountId) {
        throw conflict('مالک کلاب در این فاصله عوض شده است؛ این واگذاری دیگر معتبر نیست.');
      }
    }

    const [updated] = await tx
      .update(communityOwnershipRequests)
      .set({
        status: input.approve ? 'APPROVED' : 'REJECTED',
        decisionReasonFa: reason,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
        version: request.version + 1,
        updatedAt: now,
      })
      .where(and(eq(communityOwnershipRequests.id, request.id), eq(communityOwnershipRequests.version, request.version)))
      .returning();
    if (!updated) throw conflict(STALE);

    let row = club;
    if (input.approve) {
      const previousOwner = club.ownerAccountId;
      row = await bump(tx, club, { ownerAccountId: request.targetAccountId, claimedAt: now });
      // The previous owner keeps a way in rather than losing the club silently.
      if (previousOwner !== null) {
        const [existing] = await tx
          .select()
          .from(communityManagers)
          .where(and(eq(communityManagers.communityId, club.id), eq(communityManagers.accountId, previousOwner)))
          .limit(1);
        const values = { role: 'ADMIN' as const, status: 'ACCEPTED' as const, invitedByAccountId: actor.accountId, respondedAt: now };
        if (existing) {
          await tx
            .update(communityManagers)
            .set({ ...values, version: existing.version + 1, updatedAt: now })
            .where(and(eq(communityManagers.id, existing.id), eq(communityManagers.version, existing.version)));
        } else {
          await tx
            .insert(communityManagers)
            .values({ communityId: club.id, accountId: previousOwner, invitedAt: now, ...values });
        }
      }
      // A membership row of the new owner would shadow nothing, but leaving it
      // would show them twice in the member list.
      await tx
        .update(communityManagers)
        .set({ status: 'REMOVED', respondedAt: now, updatedAt: now })
        .where(
          and(
            eq(communityManagers.communityId, club.id),
            eq(communityManagers.accountId, request.targetAccountId),
            ne(communityManagers.status, 'REMOVED'),
          ),
        );
    }

    await recordAudit(tx, actor, {
      action: input.approve ? 'CLUB_OWNERSHIP_APPROVED' : 'CLUB_OWNERSHIP_REJECTED',
      targetType: 'COMMUNITY_OWNERSHIP_REQUEST',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: 'PENDING', ownerAccountId: club.ownerAccountId },
      after: { status: updated.status, ownerAccountId: row.ownerAccountId },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: request.targetAccountId,
      kind: input.approve ? 'CLUB_OWNERSHIP_APPROVED' : 'CLUB_OWNERSHIP_REJECTED',
      titleFa: input.approve ? 'مالکیت کلاب «' + row.displayNameFa + '» به شما رسید' : 'درخواست مالکیت کلاب «' + row.displayNameFa + '» رد شد',
      bodyFa: reason,
      resume: { entity: { type: 'COMMUNITY', id: row.id }, step: 'CLUB_MANAGEMENT', originRoute: '/account/clubs' },
    });
    return { request: updated, club: row };
  });
}

// ── Reading ──────────────────────────────────────────────────────────────

export interface ClubMemberView {
  readonly membershipId: string;
  readonly accountId: string;
  readonly nameFa: string | null;
  readonly role: ClubRole;
  readonly version: number;
}

async function membersOf(database: DbClient, clubId: string): Promise<ClubMemberView[]> {
  const rows = await database
    .select({
      membershipId: communityManagers.id,
      accountId: communityManagers.accountId,
      role: communityManagers.role,
      version: communityManagers.version,
      firstNameFa: profiles.firstName,
      lastNameFa: profiles.lastName,
    })
    .from(communityManagers)
    .leftJoin(profiles, eq(profiles.accountId, communityManagers.accountId))
    .where(and(eq(communityManagers.communityId, clubId), eq(communityManagers.status, 'ACCEPTED')))
    .orderBy(desc(communityManagers.updatedAt));
  return rows.map((row) => ({
    membershipId: row.membershipId,
    accountId: row.accountId,
    nameFa: [row.firstNameFa, row.lastNameFa].filter(Boolean).join(' ') || null,
    role: row.role as ClubRole,
    version: row.version,
  }));
}

/** Every club this account may open a management shell for — and only those. */
export async function myClubs(database: DbClient, actor: Actor): Promise<Array<{ club: ClubRow; role: ClubActorRole }>> {
  const owned = await database
    .select()
    .from(communities)
    .where(and(eq(communities.kind, 'CLUB'), eq(communities.ownerAccountId, actor.accountId)));
  const memberships = await database
    .select({ club: communities, role: communityManagers.role })
    .from(communityManagers)
    .innerJoin(communities, eq(communities.id, communityManagers.communityId))
    .where(
      and(
        eq(communityManagers.accountId, actor.accountId),
        eq(communityManagers.status, 'ACCEPTED'),
        eq(communities.kind, 'CLUB'),
        ne(communities.ownerAccountId, actor.accountId),
      ),
    );
  return [
    ...owned.map((club) => ({ club, role: 'OWNER' as ClubActorRole })),
    ...memberships.map((row) => ({ club: row.club, role: (row.role === 'OWNER' ? 'ADMIN' : row.role) as ClubActorRole })),
  ];
}

export interface ClubManagementView {
  readonly club: ClubRow;
  readonly role: ClubActorRole;
  readonly capabilities: readonly ClubCapability[];
  readonly members: readonly ClubMemberView[];
  readonly assignableRoles: readonly ClubRole[];
  readonly submissionBlockers: readonly string[];
  readonly ownershipRequest: ClubOwnershipRow | null;
  readonly openReports: number;
}

/** The management shell's data. Null for somebody with no role in this club. */
export async function clubManagement(database: DbClient, actor: Actor, clubId: string): Promise<ClubManagementView | null> {
  const [club] = UUID.test(clubId) ? await database.select().from(communities).where(eq(communities.id, clubId)).limit(1) : [];
  if (!club || club.kind !== 'CLUB') return null;
  const role = await clubRoleFor(database, actor, club);
  if (role === null) return null;
  const [members, [pending], [reports]] = await Promise.all([
    membersOf(database, club.id),
    database
      .select()
      .from(communityOwnershipRequests)
      .where(and(eq(communityOwnershipRequests.communityId, club.id), eq(communityOwnershipRequests.status, 'PENDING')))
      .limit(1),
    database
      .select({ value: count() })
      .from(moderationReports)
      .where(and(eq(moderationReports.communityId, club.id), eq(moderationReports.status, 'OPEN'))),
  ]);
  return {
    club,
    role,
    capabilities: (['VIEW', 'PROFILE', 'SUBMIT', 'PUBLISH', 'ASSIGN_ADMIN', 'ASSIGN_MODERATOR', 'ASSIGN_MEMBER', 'MODERATE', 'TRANSFER', 'ARCHIVE', 'AUTHORITY'] as const).filter(
      (capability) => clubRoleAllows(role, capability),
    ),
    members,
    assignableRoles: assignableClubRoles(role),
    submissionBlockers: clubSubmissionBlockers({
      aboutFa: club.aboutFa,
      contact: club.contactPhone ?? club.websiteUrl ?? club.membershipUrl,
      ownedByAccount: club.ownerAccountId !== null,
    }),
    ownershipRequest: pending ?? null,
    openReports: Number(reports?.value ?? 0),
  };
}

/** What the association has to look at: clubs waiting, and ownership requests waiting. */
export async function clubAuthorityQueue(database: DbClient, actor: Actor) {
  assertAuthority(actor, 'صف بررسی کلاب‌ها');
  const [waiting, requests] = await Promise.all([
    database
      .select()
      .from(communities)
      .where(and(eq(communities.kind, 'CLUB'), eq(communities.lifecycle, 'PENDING_VERIFICATION')))
      .orderBy(desc(communities.updatedAt)),
    database
      .select({ request: communityOwnershipRequests, club: communities })
      .from(communityOwnershipRequests)
      .innerJoin(communities, eq(communities.id, communityOwnershipRequests.communityId))
      .where(eq(communityOwnershipRequests.status, 'PENDING'))
      .orderBy(desc(communityOwnershipRequests.createdAt)),
  ]);
  return { waiting, requests };
}

/** One club as the association sees it while deciding. */
export async function clubForAuthority(database: DbClient, actor: Actor, clubId: string) {
  assertAuthority(actor, 'پرونده کلاب');
  const [club] = UUID.test(clubId) ? await database.select().from(communities).where(eq(communities.id, clubId)).limit(1) : [];
  if (!club || club.kind !== 'CLUB') return null;
  const [members, ownerName] = await Promise.all([
    membersOf(database, club.id),
    club.ownerAccountId === null
      ? Promise.resolve(null)
      : database
          .select({ firstNameFa: profiles.firstName, lastNameFa: profiles.lastName })
          .from(profiles)
          .where(eq(profiles.accountId, club.ownerAccountId))
          .limit(1)
          .then((rows) => (rows[0] ? [rows[0].firstNameFa, rows[0].lastNameFa].filter(Boolean).join(' ') || null : null)),
  ]);
  return { club, members, ownerNameFa: ownerName };
}

/** The public club directory: the shared list, narrowed to verified active clubs. */
export const publicClubs = (database: DbClient, query: Omit<CommunityQuery, 'kind'>, today?: string) =>
  publishedCommunities(database, { ...query, kind: 'CLUB' }, today);

/**
 * One public club page. An association's address is not a club address, and the
 * club's own id comes with it so the page can offer the report action.
 */
export async function clubPageBySlug(database: DbClient, slug: string, today?: string, now?: Date) {
  const page = await communityPageBySlug(database, slug, today, now);
  if (page === null || page.kind !== 'CLUB') return null;
  const [row] = await database.select({ id: communities.id }).from(communities).where(eq(communities.publicSlug, slug)).limit(1);
  return row === undefined ? null : { ...page, id: row.id };
}

// ── Reporting a club, and what the moderator does about it ───────────────

const DUPLICATE_REPORT = 'گزارش قبلی شما درباره همین کلاب هنوز در حال بررسی است.';

/**
 * A signed-in person reports a club they can actually see, once at a time, under
 * the same daily ceiling as every other report (§13, §20).
 */
export async function reportClub(
  database: Database,
  actor: Actor,
  input: { clubId: string; reason: string; details: string | null },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const problems = reportInputProblems(input);
  if (problems.length > 0) throw validation(problems[0]!);
  if (!isReportReason(input.reason)) throw validation('دلیل گزارش معتبر نیست.');
  const details = (input.details ?? '').trim() || null;

  try {
    return await database.transaction(async (tx) => {
      const club = await clubById(tx, input.clubId);
      if (club.publicStatus !== 'PUBLISHED' || club.lifecycle !== 'ACTIVE') throw notFound('این کلاب صفحه عمومی ندارد.');
      if (club.ownerAccountId === actor.accountId) throw validation('کلاب خودتان را گزارش نکنید؛ آن را از محیط مدیریت کلاب اصلاح کنید.');

      const [open] = await tx
        .select({ id: moderationReports.id })
        .from(moderationReports)
        .where(
          and(
            eq(moderationReports.reporterAccountId, actor.accountId),
            eq(moderationReports.communityId, club.id),
            eq(moderationReports.status, 'OPEN'),
          ),
        )
        .limit(1);
      if (open) throw conflict(DUPLICATE_REPORT);

      const ceiling = await readInt(tx, 'moderation.report_daily_limit');
      const [recent] = await tx
        .select({ value: count() })
        .from(moderationReports)
        .where(and(eq(moderationReports.reporterAccountId, actor.accountId), gt(moderationReports.createdAt, windowStart(now, DAY_MS))));
      if (!withinLimit({ used: Number(recent?.value ?? 0), ceiling })) throw new AppError('RATE_LIMITED', limitMessageFa(DAY_MS));

      const [row] = await tx
        .insert(moderationReports)
        .values({
          targetKind: 'CLUB',
          communityId: club.id,
          reporterAccountId: actor.accountId,
          reason: input.reason as ReportReason,
          details,
          createdAt: now,
        })
        .returning({ id: moderationReports.id });
      await recordAudit(tx, actor, {
        action: 'CLUB_REPORTED',
        targetType: 'COMMUNITY',
        targetId: club.id,
        // The reporter is the actor of this row; what they wrote stays on the report.
        metadata: { reportId: row!.id, reason: input.reason },
      });
      return { id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_REPORT);
    throw error;
  }
}

export interface ClubReportGroup {
  readonly club: ClubRow;
  readonly openReports: number;
  readonly reasons: readonly string[];
  readonly firstReportedAt: Date;
}

export async function clubReportQueue(database: DbClient, actor: Actor): Promise<ClubReportGroup[]> {
  if (!MODERATION_CONTEXTS.includes(actor.context)) throw forbidden('گزارش‌های کلاب فقط در محیط ادمین محتوا بررسی می‌شوند.');
  const rows = await database
    .select({ club: communities, reason: moderationReports.reason, createdAt: moderationReports.createdAt })
    .from(moderationReports)
    .innerJoin(communities, eq(communities.id, moderationReports.communityId))
    .where(and(eq(moderationReports.status, 'OPEN'), eq(moderationReports.targetKind, 'CLUB')))
    .orderBy(desc(moderationReports.createdAt));
  const grouped = new Map<string, ClubReportGroup>();
  for (const row of rows) {
    const current = grouped.get(row.club.id);
    grouped.set(row.club.id, {
      club: row.club,
      openReports: (current?.openReports ?? 0) + 1,
      reasons: current?.reasons.includes(row.reason) ? current.reasons : [...(current?.reasons ?? []), row.reason],
      firstReportedAt: current === undefined || row.createdAt < current.firstReportedAt ? row.createdAt : current.firstReportedAt,
    });
  }
  return [...grouped.values()];
}

export const CLUB_MODERATION_DECISIONS = ['DISMISS', 'HIDE', 'SOFT_DELETE'] as const;
export type ClubModerationDecision = (typeof CLUB_MODERATION_DECISIONS)[number];

/**
 * All the open reports of one club are decided together, in one transaction:
 * dismissed, the page hidden, or the club taken out of public life altogether by
 * suspending it. Nothing is deleted — the record, its history and the reports
 * stay, with the decision, its actor and its reason on them (§13, §22).
 */
export async function decideClubReports(
  database: Database,
  actor: Actor,
  input: { clubId: string; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<{ club: ClubRow; decided: number }> {
  if (!MODERATION_CONTEXTS.includes(actor.context)) throw forbidden('گزارش‌های کلاب فقط در محیط ادمین محتوا بررسی می‌شوند.');
  if (!(CLUB_MODERATION_DECISIONS as readonly string[]).includes(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const decision = input.decision as ClubModerationDecision;
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    const open = await tx
      .select({ id: moderationReports.id })
      .from(moderationReports)
      .where(and(eq(moderationReports.communityId, club.id), eq(moderationReports.status, 'OPEN')));
    if (open.length === 0) throw conflict('گزارش بازی درباره این کلاب نمانده است.');

    await tx
      .update(moderationReports)
      .set({
        status: decision === 'DISMISS' ? 'DISMISSED' : 'ACTIONED',
        decision,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
        decisionReason: reason,
      })
      .where(
        and(
          inArray(
            moderationReports.id,
            open.map((row) => row.id),
          ),
          eq(moderationReports.status, 'OPEN'),
        ),
      );

    let row = club;
    if (decision === 'HIDE') {
      row = await bump(tx, club, { publicStatus: 'HIDDEN', hiddenByReview: true });
    } else if (decision === 'SOFT_DELETE') {
      // Taking a club out of public life is the association's suspension state,
      // reached here by a moderator with the same audited record.
      row = await bump(tx, club, { publicStatus: 'HIDDEN', hiddenByReview: true, lifecycle: 'SUSPENDED', lifecycleReasonFa: reason });
    }

    await recordAudit(tx, actor, {
      action: 'CLUB_REPORTS_DECIDED',
      targetType: 'COMMUNITY',
      targetId: club.id,
      targetVersion: row.version,
      before: { publicStatus: club.publicStatus, lifecycle: club.lifecycle },
      after: { publicStatus: row.publicStatus, lifecycle: row.lifecycle, decision, reports: open.length },
      reason,
    });
    if (decision !== 'DISMISS') {
      await tellOwner(
        tx,
        row,
        'CLUB_MODERATED',
        decision === 'HIDE' ? 'صفحه کلاب «' + row.displayNameFa + '» پنهان شد' : 'کلاب «' + row.displayNameFa + '» از دسترس عمومی خارج شد',
        reason,
      );
    }
    return { club: row, decided: open.length };
  });
}

/** Used by the public page to offer the report action only where it means something. */
export async function reportableClub(database: DbClient, clubId: string) {
  if (!UUID.test(clubId)) return null;
  const [club] = await database
    .select({ id: communities.id, displayNameFa: communities.displayNameFa, publicSlug: communities.publicSlug, kind: communities.kind, lifecycle: communities.lifecycle, publicStatus: communities.publicStatus })
    .from(communities)
    .where(eq(communities.id, clubId))
    .limit(1);
  if (!club || club.kind !== 'CLUB' || club.lifecycle !== 'ACTIVE' || club.publicStatus !== 'PUBLISHED') return null;
  return club;
}
