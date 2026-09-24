/**
 * Joining a club — Phase 2.5 §9 (PROMPT-013).
 *
 * A club writes its own joining rules as data, publishes them as a numbered
 * version, and applications are judged against the version in force when they
 * are made. The facts those rules ask about are read here from the
 * authoritative side of each domain — the account, the association membership,
 * the animals, the kennel, the pedigrees, the microchips, the veterinary tag —
 * and nothing in this file writes any of them: a club may ask about a fact and
 * never change one.
 *
 * What a club sees of an applicant is deliberately thin: whether its own rules
 * are met and how many are not, never the facts behind them (§20). The reasons
 * go to the applicant, who already knows their own life.
 */
import { and, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { kycCases } from '../db/schema/identity.ts';
import { memberships } from '../db/schema/billing.ts';
import { animals } from '../db/schema/animals.ts';
import { kennels } from '../db/schema/kennels.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { microchips } from '../db/schema/clinical.ts';
import { vetTagAssignments } from '../db/schema/vets.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import {
  communities,
  clubMemberships,
  clubReevaluations,
  clubRuleVersions,
} from '../db/schema/communities.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { membershipIsValid, type MembershipStatus } from '../billing/membership-model.ts';
import { periodEnd, periodStart } from '../domain/period.ts';
import { createBatch } from '../billing/payments.ts';
import { clubRoleFor } from './service.ts';
import { clubRoleAllows, type ClubActorRole } from './model.ts';
import {
  evaluateRules,
  ruleTreeAsks,
  ruleTreeKinds,
  validateRuleTree,
  RULE_KIND_FA,
  SAMPLE_FACTS,
  type ClubApplicantFacts,
  type ClubRuleContext,
  type ClubRuleNode,
  type RuleEvaluation,
} from './rules-model.ts';
import type { Actor } from '../authz/actor.ts';

export type ClubRuleVersionRow = typeof clubRuleVersions.$inferSelect;
export type ClubMembershipRow = typeof clubMemberships.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const PERSONAL_CONTEXTS = ['USER', 'BREEDER', 'TRUSTED_VET'] as const;

const trimmed = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

function requiredReason(value: string | null | undefined): string {
  const out = trimmed(value);
  if (out === null) throw validation('دلیل این تصمیم را بنویسید؛ در تاریخچه ثبت می‌شود.');
  if (out.length > 500) throw validation('دلیل حداکثر ۵۰۰ نویسه است.');
  return out;
}

async function clubById(tx: DbClient, clubId: string) {
  const [row] = UUID.test(clubId) ? await tx.select().from(communities).where(eq(communities.id, clubId)).limit(1) : [];
  if (!row || row.kind !== 'CLUB') throw notFound('کلاب پیدا نشد.');
  return row;
}

async function requireRuleEditor(tx: DbClient, actor: Actor, clubId: string) {
  const club = await clubById(tx, clubId);
  const role = await clubRoleFor(tx, actor, club);
  if (!clubRoleAllows(role, 'RULES')) throw forbidden('شرایط عضویت این کلاب را فقط مالک یا مدیر همین کلاب می‌نویسد.');
  return { club, role: role as ClubActorRole };
}

// ── The facts a rule may ask about ───────────────────────────────────────

/**
 * Read the authoritative answer for every fact the rules can ask about. Read
 * only: the club asks, the domains answer, and nothing here updates them.
 *
 * `membership` is read from its own columns and judged with the same pure rule
 * the association side uses, rather than through `membershipStanding`, because
 * that one applies expiry as it reads and this must stay a read.
 */
export async function clubApplicantFacts(
  database: DbClient,
  accountId: string,
  input: { acceptedTermsVersion?: string | null; feePaid?: boolean; clubApproved?: boolean } = {},
  now: Date = new Date(),
): Promise<ClubApplicantFacts> {
  const [[account], [kyc], [membership], dogRows, [kennel], [pedigreeCount], [chipCount], [tag]] = await Promise.all([
    database.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, accountId)).limit(1),
    database.select({ status: kycCases.status }).from(kycCases).where(eq(kycCases.accountId, accountId)).limit(1),
    database
      .select({ status: memberships.status, lifetime: memberships.lifetime, currentPeriodEndsAt: memberships.currentPeriodEndsAt })
      .from(memberships)
      .where(eq(memberships.accountId, accountId))
      .limit(1),
    database
      .select({ breedId: animals.breedId, value: count() })
      .from(animals)
      .where(and(eq(animals.ownerAccountId, accountId), eq(animals.status, 'REGISTERED'), eq(animals.species, 'DOG')))
      .groupBy(animals.breedId),
    database
      .select({ status: kennels.status })
      .from(kennels)
      .where(and(eq(kennels.ownerAccountId, accountId), eq(kennels.status, 'APPROVED')))
      .limit(1),
    database.select({ value: count() }).from(pedigrees).where(eq(pedigrees.ownerAccountId, accountId)),
    database
      .select({ value: count() })
      .from(microchips)
      .innerJoin(animals, eq(animals.id, microchips.animalId))
      .where(and(eq(animals.ownerAccountId, accountId), eq(animals.species, 'DOG'))),
    database
      .select({ tag: vetTagAssignments.tag })
      .from(vetTagAssignments)
      .where(and(eq(vetTagAssignments.accountId, accountId), isNull(vetTagAssignments.endedAt)))
      .limit(1),
  ]);

  const dogCountByBreed: Record<string, number> = {};
  let dogCount = 0;
  for (const row of dogRows) {
    const value = Number(row.value);
    dogCount += value;
    if (row.breedId !== null) dogCountByBreed[row.breedId] = (dogCountByBreed[row.breedId] ?? 0) + value;
  }

  return {
    accountActive: account?.status === 'ACTIVE',
    identityVerified: kyc?.status === 'APPROVED',
    associationMembershipValid:
      membership !== undefined &&
      membershipIsValid(
        {
          status: membership.status as MembershipStatus,
          lifetime: membership.lifetime,
          currentPeriodEndsAt: membership.currentPeriodEndsAt,
        },
        now,
      ),
    dogCount,
    dogCountByBreed,
    kennelApproved: kennel !== undefined,
    pedigreeCount: Number(pedigreeCount?.value ?? 0),
    chippedDogCount: Number(chipCount?.value ?? 0),
    // The public tag is the server-written answer to "what is this vet now" (DEC-0193).
    vetStatus: tag?.tag === 'TRUSTED' ? 'TRUSTED' : tag?.tag === 'LICENSED' ? 'LICENSED' : 'NONE',
    acceptedTermsVersion: input.acceptedTermsVersion ?? null,
    feePaid: input.feePaid === true,
    clubApproved: input.clubApproved === true,
  };
}

async function contextFor(database: DbClient, rule: ClubRuleVersionRow): Promise<ClubRuleContext> {
  const tree = rule.tree as ClubRuleNode;
  const ids = new Set<string>();
  const walk = (node: ClubRuleNode): void => {
    if (node.type === 'RULE') {
      const breedId = node.params?.breedId;
      if (typeof breedId === 'string') ids.add(breedId);
      return;
    }
    node.children.forEach(walk);
  };
  walk(tree);
  const breedNamesFa: Record<string, string> = {};
  if (ids.size > 0) {
    const rows = await database
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa })
      .from(referenceBreeds)
      .where(inArray(referenceBreeds.id, [...ids]));
    for (const row of rows) breedNamesFa[row.id] = row.nameFa;
  }
  return { termsVersion: rule.termsVersion, breedNamesFa };
}

// ── The club's own rule set ──────────────────────────────────────────────

async function publishedRules(database: DbClient, clubId: string): Promise<ClubRuleVersionRow | null> {
  const [row] = await database
    .select()
    .from(clubRuleVersions)
    .where(and(eq(clubRuleVersions.communityId, clubId), eq(clubRuleVersions.status, 'PUBLISHED')))
    .limit(1);
  return row ?? null;
}

async function draftRules(database: DbClient, clubId: string): Promise<ClubRuleVersionRow | null> {
  const [row] = await database
    .select()
    .from(clubRuleVersions)
    .where(and(eq(clubRuleVersions.communityId, clubId), eq(clubRuleVersions.status, 'DRAFT')))
    .limit(1);
  return row ?? null;
}

export interface ClubRuleDraftInput {
  readonly clubId: string;
  readonly tree: unknown;
  readonly termsFa?: string | null;
  readonly termsVersion?: string | null;
  readonly feeToman?: string | number | null;
  readonly membershipDays?: string | number | null;
  readonly noteFa?: string | null;
}

function parseFee(value: string | number | null | undefined): bigint | null {
  const raw = trimmed(typeof value === 'number' ? String(value) : value);
  if (raw === null) return null;
  if (!/^\d{1,12}$/.test(raw)) throw validation('حق عضویت باید عددی صحیح به تومان باشد.');
  const amount = BigInt(raw);
  return amount === 0n ? null : amount;
}

function parseDays(value: string | number | null | undefined): number | null {
  const raw = trimmed(typeof value === 'number' ? String(value) : value);
  if (raw === null) return null;
  if (!/^\d{1,4}$/.test(raw) || Number(raw) === 0) throw validation('مدت عضویت باید تعداد روز صحیح و بزرگ‌تر از صفر باشد.');
  return Number(raw);
}

/**
 * Write the club's draft rules. One draft per club: editing replaces it, so a
 * club never accumulates half-written rule sets nobody can tell apart.
 */
export async function saveClubRuleDraft(database: Database, actor: Actor, input: ClubRuleDraftInput): Promise<ClubRuleVersionRow> {
  const { problems } = validateRuleTree(input.tree);
  if (problems.length > 0) throw validation(problems[0]!);
  const tree = input.tree as ClubRuleNode;
  const termsFa = trimmed(input.termsFa);
  const termsVersion = trimmed(input.termsVersion);
  const feeToman = parseFee(input.feeToman);
  const membershipDays = parseDays(input.membershipDays);
  const noteFa = trimmed(input.noteFa);

  if (ruleTreeAsks(tree, 'TERMS_ACCEPTED') && (termsFa === null || termsVersion === null)) {
    throw validation('برای شرط پذیرش شرایط، متن شرایط و نسخه آن را بنویسید.');
  }
  if (ruleTreeAsks(tree, 'FEE_PAID') && feeToman === null) throw validation('برای شرط پرداخت حق عضویت، مبلغ آن را بنویسید.');
  if (feeToman !== null && !ruleTreeAsks(tree, 'FEE_PAID')) {
    throw validation('مبلغ حق عضویت نوشته شده ولی شرط پرداخت در فهرست شرط‌ها نیست.');
  }

  return database.transaction(async (tx) => {
    const { club } = await requireRuleEditor(tx, actor, input.clubId);
    const existing = await draftRules(tx, club.id);
    const [latest] = await tx
      .select({ versionNumber: clubRuleVersions.versionNumber })
      .from(clubRuleVersions)
      .where(eq(clubRuleVersions.communityId, club.id))
      .orderBy(desc(clubRuleVersions.versionNumber))
      .limit(1);

    const values = { tree, termsFa, termsVersion, feeToman, membershipDays, noteFa, updatedAt: new Date() };
    const [row] = existing
      ? await tx
          .update(clubRuleVersions)
          .set({ ...values, version: existing.version + 1 })
          .where(and(eq(clubRuleVersions.id, existing.id), eq(clubRuleVersions.version, existing.version)))
          .returning()
      : await tx
          .insert(clubRuleVersions)
          .values({
            communityId: club.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            status: 'DRAFT',
            createdByAccountId: actor.accountId,
            ...values,
          })
          .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'CLUB_RULES_DRAFTED',
      targetType: 'CLUB_RULE_VERSION',
      targetId: row.id,
      targetVersion: row.version,
      after: { versionNumber: row.versionNumber, kinds: ruleTreeKinds(tree), feeToman: feeToman?.toString() ?? null, membershipDays },
    });
    return row;
  });
}

/**
 * Publish the draft. The version in force becomes SUPERSEDED but stays readable,
 * because members admitted under it are still judged by it.
 */
export async function publishClubRules(
  database: Database,
  actor: Actor,
  input: { clubId: string; ruleVersionId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<ClubRuleVersionRow> {
  return database.transaction(async (tx) => {
    const { club } = await requireRuleEditor(tx, actor, input.clubId);
    const [draft] = UUID.test(input.ruleVersionId)
      ? await tx.select().from(clubRuleVersions).where(eq(clubRuleVersions.id, input.ruleVersionId)).limit(1)
      : [];
    if (!draft || draft.communityId !== club.id) throw notFound('این نسخه شرایط پیدا نشد.');
    if (draft.status !== 'DRAFT') throw conflict('فقط پیش‌نویس منتشر می‌شود.');
    if (draft.version !== input.expectedVersion) throw conflict(STALE);
    const { problems } = validateRuleTree(draft.tree);
    if (problems.length > 0) throw validation(problems[0]!);

    const current = await publishedRules(tx, club.id);
    if (current) {
      await tx
        .update(clubRuleVersions)
        .set({ status: 'SUPERSEDED', version: current.version + 1, updatedAt: now })
        .where(and(eq(clubRuleVersions.id, current.id), eq(clubRuleVersions.version, current.version)));
    }
    const [row] = await tx
      .update(clubRuleVersions)
      .set({ status: 'PUBLISHED', publishedAt: now, publishedByAccountId: actor.accountId, version: draft.version + 1, updatedAt: now })
      .where(and(eq(clubRuleVersions.id, draft.id), eq(clubRuleVersions.version, draft.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'CLUB_RULES_PUBLISHED',
      targetType: 'CLUB_RULE_VERSION',
      targetId: row.id,
      targetVersion: row.version,
      before: current ? { supersededVersionNumber: current.versionNumber } : undefined,
      after: { versionNumber: row.versionNumber, kinds: ruleTreeKinds(row.tree as ClubRuleNode) },
    });
    return row;
  });
}

/**
 * Try a rule set against made-up facts. Nobody's real facts are read here: this
 * is the club checking what its own rules would do, not looking anybody up.
 */
export async function previewClubRules(
  database: DbClient,
  actor: Actor,
  input: { clubId: string; ruleVersionId?: string | null; facts?: Partial<ClubApplicantFacts> },
): Promise<{ evaluation: RuleEvaluation; facts: ClubApplicantFacts; rule: ClubRuleVersionRow }> {
  const { club } = await requireRuleEditor(database, actor, input.clubId);
  const [rule] = input.ruleVersionId && UUID.test(input.ruleVersionId)
    ? await database.select().from(clubRuleVersions).where(eq(clubRuleVersions.id, input.ruleVersionId)).limit(1)
    : [(await draftRules(database, club.id)) ?? (await publishedRules(database, club.id))].filter(Boolean as never);
  if (!rule || rule.communityId !== club.id) throw notFound('نسخه شرایط برای پیش‌نمایش پیدا نشد.');
  const facts: ClubApplicantFacts = { ...SAMPLE_FACTS, ...input.facts };
  const context = await contextFor(database, rule);
  return { evaluation: evaluateRules(rule.tree as ClubRuleNode, facts, context), facts, rule };
}

/** The club's own view of its rules: the draft, what is in force, and its history. */
export async function clubRuleWorkbench(database: DbClient, actor: Actor, clubId: string) {
  const { club, role } = await requireRuleEditor(database, actor, clubId);
  const versions = await database
    .select()
    .from(clubRuleVersions)
    .where(eq(clubRuleVersions.communityId, club.id))
    .orderBy(desc(clubRuleVersions.versionNumber));
  const [counts] = await database
    .select({ value: count() })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.communityId, club.id), eq(clubMemberships.status, 'ACTIVE')));
  return {
    club,
    role,
    draft: versions.find((row) => row.status === 'DRAFT') ?? null,
    published: versions.find((row) => row.status === 'PUBLISHED') ?? null,
    versions,
    activeMembers: Number(counts?.value ?? 0),
    kindsFa: RULE_KIND_FA,
  };
}

// ── Applying, and what the applicant is told ─────────────────────────────

const membershipOf = async (database: DbClient, clubId: string, accountId: string): Promise<ClubMembershipRow | null> => {
  const [row] = await database
    .select()
    .from(clubMemberships)
    .where(and(eq(clubMemberships.communityId, clubId), eq(clubMemberships.accountId, accountId)))
    .limit(1);
  return row ?? null;
};

/** The version this person is judged by: the one they were admitted under, else what is in force. */
async function judgingRules(database: DbClient, clubId: string, membership: ClubMembershipRow | null): Promise<ClubRuleVersionRow | null> {
  if (membership?.admittedRuleVersionId) {
    const [row] = await database.select().from(clubRuleVersions).where(eq(clubRuleVersions.id, membership.admittedRuleVersionId)).limit(1);
    if (row) return row;
  }
  return publishedRules(database, clubId);
}

async function evaluateFor(
  database: DbClient,
  rule: ClubRuleVersionRow,
  accountId: string,
  flow: { acceptedTermsVersion?: string | null; feePaid?: boolean; clubApproved?: boolean },
  now: Date,
): Promise<{ evaluation: RuleEvaluation; facts: ClubApplicantFacts }> {
  const facts = await clubApplicantFacts(database, accountId, flow, now);
  const context = await contextFor(database, rule);
  return { evaluation: evaluateRules(rule.tree as ClubRuleNode, facts, context), facts };
}

/** Expiry applied when the membership is next read; there is no scheduler (DEC-0194). */
export async function enforceClubMembership(database: Database, membershipId: string, now: Date = new Date()): Promise<void> {
  await database.transaction(async (tx) => {
    const [row] = await tx.select().from(clubMemberships).where(eq(clubMemberships.id, membershipId)).limit(1);
    if (!row || row.status !== 'ACTIVE' || row.endsAt === null) return;
    // A club membership has no bought grace: it holds until its own end instant.
    if (row.endsAt.getTime() > now.getTime()) return;
    const [updated] = await tx
      .update(clubMemberships)
      .set({ status: 'EXPIRED', version: row.version + 1, updatedAt: now })
      .where(and(eq(clubMemberships.id, row.id), eq(clubMemberships.version, row.version)))
      .returning();
    if (!updated) return;
    await recordAudit(tx, null, {
      action: 'CLUB_MEMBERSHIP_EXPIRED',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: 'ACTIVE', endsAt: row.endsAt },
      after: { status: 'EXPIRED' },
    });
    await createNotification(tx, {
      recipientAccountId: updated.accountId,
      kind: 'CLUB_MEMBERSHIP_EXPIRED',
      titleFa: 'عضویت شما در کلاب به پایان رسید',
      bodyFa: 'برای ادامه، دوباره درخواست بدهید؛ شرایط جاری کلاب اعمال می‌شود.',
      resume: { entity: { type: 'COMMUNITY', id: updated.communityId }, step: 'CLUB_JOIN', originRoute: '/clubs' },
    });
  });
}

export interface ClubJoinView {
  readonly clubId: string;
  readonly clubNameFa: string;
  readonly rule: ClubRuleVersionRow | null;
  readonly membership: ClubMembershipRow | null;
  readonly evaluation: RuleEvaluation | null;
  readonly termsFa: string | null;
  readonly termsVersion: string | null;
  readonly feeToman: bigint | null;
  readonly canApply: boolean;
  readonly askedFa: readonly string[];
}

/**
 * What one person sees about joining one club: the club's questions, which of
 * them they do not meet, and where they stand. This is the applicant's own
 * evaluation — nobody else may ask for it.
 */
export async function clubJoinView(database: Database, actor: Actor, clubId: string, now: Date = new Date()): Promise<ClubJoinView | null> {
  const club = await clubById(database, clubId);
  if (club.lifecycle !== 'ACTIVE') return null;
  const existing = await membershipOf(database, club.id, actor.accountId);
  if (existing) await enforceClubMembership(database, existing.id, now);
  const membership = existing ? await membershipOf(database, club.id, actor.accountId) : null;
  const rule = await judgingRules(database, club.id, membership);

  let evaluation: RuleEvaluation | null = null;
  if (rule) {
    // The joining steps are read from where the membership actually stands: only
    // an active membership has paid and been approved, whatever else is stored.
    const flow = {
      acceptedTermsVersion: membership?.acceptedTermsVersion ?? null,
      feePaid: membership?.status === 'ACTIVE',
      clubApproved: membership?.status === 'ACTIVE',
    };
    evaluation = (await evaluateFor(database, rule, actor.accountId, flow, now)).evaluation;
  }

  const open = membership === null || ['INELIGIBLE', 'EXPIRED', 'LEFT', 'REJECTED'].includes(membership.status);
  // Terms are only part of joining when the rule set actually asks for them; a
  // club that wrote terms but did not tick the rule is not asking anybody to
  // accept anything.
  const asksTerms = rule !== null && ruleTreeAsks(rule.tree as ClubRuleNode, 'TERMS_ACCEPTED');
  return {
    clubId: club.id,
    clubNameFa: club.displayNameFa,
    rule,
    membership,
    evaluation,
    termsFa: asksTerms ? rule.termsFa : null,
    termsVersion: asksTerms ? rule.termsVersion : null,
    feeToman: rule?.feeToman ?? null,
    canApply: rule !== null && open,
    askedFa: rule === null ? [] : ruleTreeKinds(rule.tree as ClubRuleNode).map((kind) => RULE_KIND_FA[kind]),
  };
}

function nextStatus(evaluation: RuleEvaluation, rule: ClubRuleVersionRow): 'INELIGIBLE' | 'AWAITING_PAYMENT' | 'PENDING_REVIEW' | 'ACTIVE' {
  if (evaluation.unmetStages.fact > 0) return 'INELIGIBLE';
  const tree = rule.tree as ClubRuleNode;
  if (ruleTreeAsks(tree, 'FEE_PAID') && rule.feeToman !== null) return 'AWAITING_PAYMENT';
  if (ruleTreeAsks(tree, 'CLUB_APPROVAL')) return 'PENDING_REVIEW';
  return evaluation.unmetStages.flow > 0 ? 'PENDING_REVIEW' : 'ACTIVE';
}

/**
 * Apply to a club. The rules in force at this moment are the ones that judge the
 * application, and the version is written onto the membership so a later rule
 * change does not silently re-judge it.
 */
export async function applyToClub(
  database: Database,
  actor: Actor,
  input: { clubId: string; acceptTermsVersion?: string | null },
  now: Date = new Date(),
): Promise<ClubMembershipRow> {
  if (!(PERSONAL_CONTEXTS as readonly string[]).includes(actor.context)) throw forbidden('عضویت کلاب از حساب شخصی انجام می‌شود.');

  return database.transaction(async (tx) => {
    const club = await clubById(tx, input.clubId);
    if (club.lifecycle !== 'ACTIVE') throw conflict('این کلاب در حال حاضر عضو نمی‌پذیرد.');
    const rule = await publishedRules(tx, club.id);
    if (rule === null) throw conflict('این کلاب هنوز شرایط عضویت خود را منتشر نکرده است.');

    const existing = await membershipOf(tx, club.id, actor.accountId);
    if (existing && ['ACTIVE', 'PENDING_REVIEW', 'AWAITING_PAYMENT'].includes(existing.status)) {
      throw conflict('درخواست یا عضویت شما در این کلاب در جریان است.');
    }
    if (existing?.status === 'SUSPENDED') throw conflict('عضویت شما در این کلاب تعلیق شده است؛ با مدیر کلاب تماس بگیرید.');

    const accepted = trimmed(input.acceptTermsVersion);
    const needsTerms = ruleTreeAsks(rule.tree as ClubRuleNode, 'TERMS_ACCEPTED');
    if (needsTerms && accepted !== rule.termsVersion) throw validation('شرایط کلاب را در نسخه جاری بپذیرید.');

    const { evaluation } = await evaluateFor(
      tx,
      rule,
      actor.accountId,
      { acceptedTermsVersion: needsTerms ? accepted : null, feePaid: false, clubApproved: false },
      now,
    );
    const status = nextStatus(evaluation, rule);
    const endsAt =
      status === 'ACTIVE' && rule.membershipDays !== null ? periodEnd(periodStart(null, now), rule.membershipDays) : null;

    const values = {
      status,
      admittedRuleVersionId: status === 'INELIGIBLE' ? null : rule.id,
      evaluatedRuleVersionId: rule.id,
      unmetFa: evaluation.unmetFa,
      acceptedTermsVersion: needsTerms ? accepted : null,
      acceptedTermsAt: needsTerms ? now : null,
      feeToman: status === 'AWAITING_PAYMENT' ? rule.feeToman : null,
      paymentBatchId: null,
      appliedAt: now,
      decidedByAccountId: null,
      decidedAt: null,
      decisionReasonFa: null,
      startsAt: status === 'ACTIVE' ? now : null,
      endsAt,
      updatedAt: now,
    };

    const [row] = existing
      ? await tx
          .update(clubMemberships)
          .set({ ...values, version: existing.version + 1 })
          .where(and(eq(clubMemberships.id, existing.id), eq(clubMemberships.version, existing.version)))
          .returning()
      : await tx
          .insert(clubMemberships)
          .values({ communityId: club.id, accountId: actor.accountId, ...values })
          .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'CLUB_MEMBERSHIP_APPLIED',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: row.id,
      targetVersion: row.version,
      // The audit keeps how many conditions failed, not the facts behind them.
      after: { communityId: club.id, status, ruleVersionNumber: rule.versionNumber, unmet: evaluation.unmetFa.length },
    });
    return row;
  });
}

// ── The club's review, the fee, and standing ─────────────────────────────

/**
 * What the club is allowed to know. The membership row itself carries the
 * applicant's unmet reasons, which are theirs, so the queue hands over a
 * projection instead of the row (§20).
 */
export type ClubMemberSummary = Omit<ClubMembershipRow, 'unmetFa'>;

export interface ClubMemberEntry {
  readonly membership: ClubMemberSummary;
  readonly nameFa: string | null;
  /** How many of the club's own conditions are unmet. The reasons stay with the applicant (§20). */
  readonly unmetCount: number;
  readonly admittedVersionNumber: number | null;
  readonly staleRules: boolean;
}

/** The club's member and applicant list — deliberately without the applicants' facts. */
export async function clubMemberQueue(
  database: DbClient,
  actor: Actor,
  clubId: string,
  filter: { status?: string } = {},
): Promise<ClubMemberEntry[]> {
  const club = await clubById(database, clubId);
  const role = await clubRoleFor(database, actor, club);
  if (!clubRoleAllows(role, 'MODERATE') && !clubRoleAllows(role, 'RULES')) {
    throw forbidden('فهرست اعضای این کلاب را فقط نقش‌های مجاز همین کلاب می‌بینند.');
  }
  const published = await publishedRules(database, club.id);
  const rows = await database
    .select({
      membership: clubMemberships,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      versionNumber: clubRuleVersions.versionNumber,
    })
    .from(clubMemberships)
    .leftJoin(profiles, eq(profiles.accountId, clubMemberships.accountId))
    .leftJoin(clubRuleVersions, eq(clubRuleVersions.id, clubMemberships.admittedRuleVersionId))
    .where(
      filter.status
        ? and(eq(clubMemberships.communityId, club.id), eq(clubMemberships.status, filter.status as 'ACTIVE'))
        : eq(clubMemberships.communityId, club.id),
    )
    .orderBy(desc(clubMemberships.updatedAt));

  return rows.map((row) => {
    const { unmetFa, ...membership } = row.membership;
    return {
    membership,
    nameFa: [row.firstName, row.lastName].filter(Boolean).join(' ') || null,
    unmetCount: Array.isArray(unmetFa) ? unmetFa.length : 0,
    admittedVersionNumber: row.versionNumber ?? null,
    staleRules:
      published !== null && membership.admittedRuleVersionId !== null && membership.admittedRuleVersionId !== published.id,
    };
  });
}

/** Manual approval, by a club role that may moderate. A decision always has a reason. */
export async function decideClubMembership(
  database: Database,
  actor: Actor,
  input: { membershipId: string; expectedVersion: number; approve: boolean; reasonFa: string },
  now: Date = new Date(),
): Promise<ClubMembershipRow> {
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const [membership] = UUID.test(input.membershipId)
      ? await tx.select().from(clubMemberships).where(eq(clubMemberships.id, input.membershipId)).limit(1)
      : [];
    if (!membership) throw notFound('درخواست عضویت پیدا نشد.');
    const club = await clubById(tx, membership.communityId);
    const role = await clubRoleFor(tx, actor, club);
    if (!clubRoleAllows(role, 'MODERATE')) throw forbidden('تصمیم درباره عضویت را فقط نقش مجاز همین کلاب می‌گیرد.');
    if (membership.status !== 'PENDING_REVIEW') throw conflict('این درخواست در انتظار تصمیم نیست.');
    if (membership.version !== input.expectedVersion) throw conflict(STALE);

    const rule = await judgingRules(tx, club.id, membership);
    if (rule === null) throw conflict('نسخه شرایطی که این درخواست با آن سنجیده شده پیدا نشد.');

    let status: ClubMembershipRow['status'] = 'REJECTED';
    let endsAt: Date | null = null;
    if (input.approve) {
      // The facts are asked again at the decision, so an approval never rests on
      // a picture taken when the application was made.
      const { evaluation } = await evaluateFor(
        tx,
        rule,
        membership.accountId,
        { acceptedTermsVersion: membership.acceptedTermsVersion, feePaid: true, clubApproved: true },
        now,
      );
      if (evaluation.unmetStages.fact > 0) throw conflict('شرایط این متقاضی دیگر برقرار نیست؛ درخواست را رد کنید یا از او بخواهید دوباره اقدام کند.');
      status = 'ACTIVE';
      endsAt = rule.membershipDays === null ? null : periodEnd(periodStart(null, now), rule.membershipDays);
    }

    const [row] = await tx
      .update(clubMemberships)
      .set({
        status,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
        decisionReasonFa: reason,
        startsAt: status === 'ACTIVE' ? now : null,
        endsAt,
        admittedRuleVersionId: status === 'ACTIVE' ? rule.id : membership.admittedRuleVersionId,
        version: membership.version + 1,
        updatedAt: now,
      })
      .where(and(eq(clubMemberships.id, membership.id), eq(clubMemberships.version, membership.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: input.approve ? 'CLUB_MEMBERSHIP_APPROVED' : 'CLUB_MEMBERSHIP_REJECTED',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: membership.status },
      after: { status: row.status },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: row.accountId,
      kind: input.approve ? 'CLUB_MEMBERSHIP_APPROVED' : 'CLUB_MEMBERSHIP_REJECTED',
      titleFa: input.approve ? 'عضویت شما در «' + club.displayNameFa + '» پذیرفته شد' : 'درخواست عضویت شما در «' + club.displayNameFa + '» رد شد',
      bodyFa: reason,
      resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_JOIN', originRoute: '/clubs' },
    });
    return row;
  });
}

/** Suspending or reinstating a member, by the club, with a reason and an audit row. */
export async function setClubMembershipStanding(
  database: Database,
  actor: Actor,
  input: { membershipId: string; expectedVersion: number; to: 'SUSPENDED' | 'ACTIVE'; reasonFa: string },
  now: Date = new Date(),
): Promise<ClubMembershipRow> {
  const reason = requiredReason(input.reasonFa);
  if (input.to !== 'SUSPENDED' && input.to !== 'ACTIVE') throw validation('وضعیت انتخاب‌شده معتبر نیست.');

  return database.transaction(async (tx) => {
    const [membership] = UUID.test(input.membershipId)
      ? await tx.select().from(clubMemberships).where(eq(clubMemberships.id, input.membershipId)).limit(1)
      : [];
    if (!membership) throw notFound('عضویت پیدا نشد.');
    const club = await clubById(tx, membership.communityId);
    const role = await clubRoleFor(tx, actor, club);
    if (!clubRoleAllows(role, 'MODERATE')) throw forbidden('تغییر وضعیت عضویت را فقط نقش مجاز همین کلاب انجام می‌دهد.');
    if (membership.version !== input.expectedVersion) throw conflict(STALE);
    if (input.to === 'SUSPENDED' && membership.status !== 'ACTIVE') throw conflict('فقط عضویت فعال تعلیق می‌شود.');
    if (input.to === 'ACTIVE' && membership.status !== 'SUSPENDED') throw conflict('فقط عضویت تعلیق‌شده برمی‌گردد.');

    const [row] = await tx
      .update(clubMemberships)
      .set({ status: input.to, decisionReasonFa: reason, decidedByAccountId: actor.accountId, decidedAt: now, version: membership.version + 1, updatedAt: now })
      .where(and(eq(clubMemberships.id, membership.id), eq(clubMemberships.version, membership.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: input.to === 'SUSPENDED' ? 'CLUB_MEMBERSHIP_SUSPENDED' : 'CLUB_MEMBERSHIP_REINSTATED',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: membership.status },
      after: { status: row.status },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: row.accountId,
      kind: 'CLUB_MEMBERSHIP_STANDING_CHANGED',
      titleFa: input.to === 'SUSPENDED' ? 'عضویت شما در «' + club.displayNameFa + '» تعلیق شد' : 'تعلیق عضویت شما در «' + club.displayNameFa + '» برداشته شد',
      bodyFa: reason,
      resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_JOIN', originRoute: '/clubs' },
    });
    return row;
  });
}

/** Leaving is the member's own decision and needs nobody's approval. */
export async function leaveClub(
  database: Database,
  actor: Actor,
  input: { membershipId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<ClubMembershipRow> {
  return database.transaction(async (tx) => {
    const [membership] = UUID.test(input.membershipId)
      ? await tx.select().from(clubMemberships).where(eq(clubMemberships.id, input.membershipId)).limit(1)
      : [];
    // Somebody else's membership is not found rather than forbidden.
    if (!membership || membership.accountId !== actor.accountId) throw notFound('عضویت پیدا نشد.');
    if (membership.version !== input.expectedVersion) throw conflict(STALE);
    if (membership.status === 'LEFT') throw conflict('شما پیش‌تر از این کلاب خارج شده‌اید.');

    const [row] = await tx
      .update(clubMemberships)
      .set({ status: 'LEFT', version: membership.version + 1, updatedAt: now })
      .where(and(eq(clubMemberships.id, membership.id), eq(clubMemberships.version, membership.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CLUB_MEMBERSHIP_LEFT',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: membership.status },
      after: { status: 'LEFT' },
    });
    return row;
  });
}

// ── The fee ──────────────────────────────────────────────────────────────

/**
 * Open the payment for a club's joining fee. The amount is read inside
 * `createBatch` from the club's published rule version — the applicant never
 * sends a number — and the facts are checked again first, so nobody pays for a
 * membership they no longer qualify for.
 */
export async function startClubFeePayment(
  database: Database,
  actor: Actor,
  input: { membershipId: string },
  now: Date = new Date(),
): Promise<{ membership: ClubMembershipRow; batchId: string; amountToman: bigint }> {
  const [membership] = UUID.test(input.membershipId)
    ? await database.select().from(clubMemberships).where(eq(clubMemberships.id, input.membershipId)).limit(1)
    : [];
  if (!membership || membership.accountId !== actor.accountId) throw notFound('درخواست عضویت پیدا نشد.');
  if (membership.status !== 'AWAITING_PAYMENT') throw conflict('این درخواست در مرحله پرداخت نیست.');
  const club = await clubById(database, membership.communityId);
  const rule = await judgingRules(database, club.id, membership);
  if (rule === null || rule.feeToman === null) throw conflict('حق عضویتی برای این کلاب ثبت نشده است.');
  if (rule.status !== 'PUBLISHED') throw conflict('شرایط عضویت این کلاب تغییر کرده است؛ دوباره درخواست بدهید.');

  const { evaluation } = await evaluateFor(
    database,
    rule,
    actor.accountId,
    { acceptedTermsVersion: membership.acceptedTermsVersion, feePaid: true, clubApproved: true },
    now,
  );
  if (evaluation.unmetStages.fact > 0) throw conflict('شرایط عضویت شما دیگر برقرار نیست؛ ' + evaluation.unmetFa.join(' '));

  const batch = await createBatch(database, actor, {
    service: 'CLUB_MEMBERSHIP',
    items: [{ targetType: 'CLUB_MEMBERSHIP', targetId: membership.id, clubRuleVersionId: rule.id }],
    resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_JOIN', originRoute: '/clubs' },
  });

  const [row] = await database
    .update(clubMemberships)
    .set({ paymentBatchId: batch.id, feeToman: rule.feeToman, version: membership.version + 1, updatedAt: now })
    .where(and(eq(clubMemberships.id, membership.id), eq(clubMemberships.version, membership.version)))
    .returning();
  if (!row) throw conflict(STALE);
  return { membership: row, batchId: batch.id, amountToman: rule.feeToman };
}

/**
 * The effect of a verified club fee payment, run inside the verifying
 * transaction. Payment alone does not make a member of a club that also asks for
 * its own approval: it moves them to the review the club asked for.
 */
export async function activateClubMembershipFromPayment(tx: DbClient, batchId: string, now: Date = new Date()): Promise<void> {
  const [membership] = await tx
    .select()
    .from(clubMemberships)
    .where(eq(clubMemberships.paymentBatchId, batchId))
    .limit(1);
  if (!membership) return;
  // A replayed callback finds the work already done.
  if (membership.status !== 'AWAITING_PAYMENT') return;

  const [rule] = membership.admittedRuleVersionId
    ? await tx.select().from(clubRuleVersions).where(eq(clubRuleVersions.id, membership.admittedRuleVersionId)).limit(1)
    : [];
  const [club] = await tx.select().from(communities).where(eq(communities.id, membership.communityId)).limit(1);
  const facts = await clubApplicantFacts(
    tx,
    membership.accountId,
    { acceptedTermsVersion: membership.acceptedTermsVersion, feePaid: true, clubApproved: true },
    now,
  );
  const context: ClubRuleContext = { termsVersion: rule?.termsVersion ?? null };
  const evaluation = rule ? evaluateRules(rule.tree as ClubRuleNode, facts, context) : null;

  // A prerequisite that lapsed while the payer was at the gateway: the money is
  // recorded, the membership is not granted, and the club decides what to do.
  if (evaluation && evaluation.unmetStages.fact > 0) {
    await recordAudit(tx, null, {
      action: 'CLUB_MEMBERSHIP_ACTIVATION_BLOCKED',
      targetType: 'CLUB_MEMBERSHIP',
      targetId: membership.id,
      targetVersion: membership.version,
      after: { batchId, unmet: evaluation.unmetFa.length },
      reason: 'شرایط عضویت هنگام بازگشت از درگاه دیگر برقرار نبود.',
    });
    await createNotification(tx, {
      recipientAccountId: membership.accountId,
      kind: 'CLUB_MEMBERSHIP_ACTIVATION_BLOCKED',
      titleFa: 'پرداخت ثبت شد ولی عضویت فعال نشد',
      bodyFa: 'شرایط عضویت شما هنگام بازگشت از درگاه دیگر برقرار نبود. پیگیری آن با مدیر کلاب است.',
      resume: { entity: { type: 'COMMUNITY', id: membership.communityId }, step: 'CLUB_JOIN', originRoute: '/clubs' },
    });
    return;
  }

  const needsApproval = rule ? ruleTreeAsks(rule.tree as ClubRuleNode, 'CLUB_APPROVAL') : false;
  const status = needsApproval ? 'PENDING_REVIEW' : 'ACTIVE';
  const endsAt = status === 'ACTIVE' && rule?.membershipDays ? periodEnd(periodStart(null, now), rule.membershipDays) : null;

  const [row] = await tx
    .update(clubMemberships)
    .set({ status, startsAt: status === 'ACTIVE' ? now : null, endsAt, version: membership.version + 1, updatedAt: now })
    .where(and(eq(clubMemberships.id, membership.id), eq(clubMemberships.version, membership.version)))
    .returning();
  if (!row) return;

  await recordAudit(tx, null, {
    action: 'CLUB_MEMBERSHIP_FEE_PAID',
    targetType: 'CLUB_MEMBERSHIP',
    targetId: row.id,
    targetVersion: row.version,
    before: { status: membership.status },
    after: { status: row.status, batchId },
  });
  await createNotification(tx, {
    recipientAccountId: row.accountId,
    kind: 'CLUB_MEMBERSHIP_FEE_PAID',
    titleFa: needsApproval ? 'پرداخت شما ثبت شد و درخواست در انتظار تأیید کلاب است' : 'عضویت شما در کلاب فعال شد',
    bodyFa: club ? club.displayNameFa : '',
    resume: { entity: { type: 'COMMUNITY', id: row.communityId }, step: 'CLUB_JOIN', originRoute: '/clubs' },
  });
}

// ── Re-evaluating existing members, on purpose ───────────────────────────

/**
 * Judge the club's existing members against the rules now in force.
 *
 * Nothing does this on its own: a member admitted under version 3 stays judged
 * by version 3 until somebody with the club's authority asks for this, with a
 * reason, and the campaign is recorded with what it did. Members who no longer
 * qualify are suspended rather than deleted, and are told why.
 */
export async function reevaluateClubMembers(
  database: Database,
  actor: Actor,
  input: { clubId: string; reasonFa: string },
  now: Date = new Date(),
): Promise<{ examined: number; stillEligible: number; nowIneligible: number }> {
  const reason = requiredReason(input.reasonFa);

  return database.transaction(async (tx) => {
    const { club } = await requireRuleEditor(tx, actor, input.clubId);
    const rule = await publishedRules(tx, club.id);
    if (rule === null) throw conflict('این کلاب شرایط منتشرشده‌ای ندارد.');

    const members = await tx
      .select()
      .from(clubMemberships)
      .where(and(eq(clubMemberships.communityId, club.id), eq(clubMemberships.status, 'ACTIVE')));

    let stillEligible = 0;
    let nowIneligible = 0;
    for (const member of members) {
      const { evaluation } = await evaluateFor(
        tx,
        rule,
        member.accountId,
        { acceptedTermsVersion: member.acceptedTermsVersion, feePaid: true, clubApproved: true },
        now,
      );
      const keeps = evaluation.unmetStages.fact === 0;
      if (keeps) stillEligible += 1;
      else nowIneligible += 1;
      await tx
        .update(clubMemberships)
        .set({
          status: keeps ? 'ACTIVE' : 'SUSPENDED',
          // Whoever still qualifies is now admitted under the new version; whoever
          // does not keeps the version they were admitted under, with the reasons.
          admittedRuleVersionId: keeps ? rule.id : member.admittedRuleVersionId,
          evaluatedRuleVersionId: rule.id,
          unmetFa: evaluation.unmetFa,
          decisionReasonFa: keeps ? member.decisionReasonFa : reason,
          version: member.version + 1,
          updatedAt: now,
        })
        .where(and(eq(clubMemberships.id, member.id), eq(clubMemberships.version, member.version)));
      if (!keeps) {
        await createNotification(tx, {
          recipientAccountId: member.accountId,
          kind: 'CLUB_MEMBERSHIP_REEVALUATED',
          titleFa: 'عضویت شما در «' + club.displayNameFa + '» با شرایط تازه بازبینی شد',
          bodyFa: evaluation.unmetFa.join(' '),
          resume: { entity: { type: 'COMMUNITY', id: club.id }, step: 'CLUB_JOIN', originRoute: '/clubs' },
        });
      }
    }

    const [campaign] = await tx
      .insert(clubReevaluations)
      .values({
        communityId: club.id,
        ruleVersionId: rule.id,
        launchedByAccountId: actor.accountId,
        reasonFa: reason,
        examined: members.length,
        stillEligible,
        nowIneligible,
        createdAt: now,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: 'CLUB_MEMBERS_REEVALUATED',
      targetType: 'CLUB_REEVALUATION',
      targetId: campaign!.id,
      after: { ruleVersionNumber: rule.versionNumber, examined: members.length, stillEligible, nowIneligible },
      reason,
    });
    return { examined: members.length, stillEligible, nowIneligible };
  });
}

/** The campaigns a club has run, newest first. */
export const clubReevaluationHistory = async (database: DbClient, actor: Actor, clubId: string) => {
  await requireRuleEditor(database, actor, clubId);
  return database
    .select()
    .from(clubReevaluations)
    .where(eq(clubReevaluations.communityId, clubId))
    .orderBy(desc(clubReevaluations.createdAt))
    .limit(20);
};

/** Every club this account belongs to, or has an open application with. */
export async function myClubMemberships(database: DbClient, actor: Actor) {
  return database
    .select({ membership: clubMemberships, clubNameFa: communities.displayNameFa, publicSlug: communities.publicSlug })
    .from(clubMemberships)
    .innerJoin(communities, eq(communities.id, clubMemberships.communityId))
    .where(and(eq(clubMemberships.accountId, actor.accountId), ne(clubMemberships.status, 'LEFT')))
    .orderBy(desc(clubMemberships.updatedAt));
}
