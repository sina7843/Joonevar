/**
 * The trusted-veterinarian application — Phase 2.5 §7 (PROMPT-010).
 *
 * Two conditions, both read from the one authoritative answer each of them
 * already has: an active practice licence period (PROMPT-008) and a valid
 * association membership (PROMPT-009). Neither is re-derived from a status
 * column here, and both are asked again at submission and again at every
 * sensitive transition — a licence or a membership that ran out between the
 * application and the decision stops the decision.
 *
 * What the applicant adds is a declaration, not evidence: the version of the
 * terms they accepted, and their own statement that they have a microchip
 * reader. No file is required for it, so everything shown from it says
 * «تجهیزات اعلام‌شده». Approval here opens the trusted period payment and
 * nothing else; the trusted tag itself waits for a verified payment (PROMPT-011).
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  vetEquipment,
  vetProfessionalCases,
  vetProfessionalSubmissions,
  vetProfileEquipment,
  vetProfiles,
  vetTrustedDeclarations,
} from '../db/schema/vets.ts';
import { accountRoles } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readText } from '../settings/service.ts';
import { AppError, conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus } from './professional-model.ts';
import { CASE_STATUS_FA, OPEN_CASE_STATUSES } from './professional-profile-model.ts';
import { licenceStanding } from './licence-period.ts';
import { LICENCE_STANDING_FA } from './licence-period-model.ts';
import { membershipStanding } from '../billing/membership.ts';
import {
  MICROCHIP_READER_CODE,
  TRUSTED_DECLARATION_VERSION_KEY,
  TRUSTED_DECISION_OUTCOME,
  TRUSTED_TERMS_TEXT_KEY,
  TRUSTED_TERMS_VERSION_KEY,
  declarationProblem,
  isTrustedDecision,
  trustedAllowed,
  trustedRequirements,
  unmetTrusted,
  type TrustedDeclarationInput,
  type TrustedRequirement,
} from './trusted-model.ts';

/** Serialises two submissions of the same account, the way every other case type does. */
async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  await tx.execute(sql`select id from account where id = ${accountId} for update`);
}

const CASE_TARGET = 'VET_PROFESSIONAL_CASE';
const ROUTE = '/account/vet-profile';
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRUSTED_APPLICANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
export const TRUSTED_REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];

export type TrustedCaseRow = typeof vetProfessionalCases.$inferSelect;
export type DeclarationRow = typeof vetTrustedDeclarations.$inferSelect;

function assertApplicant(actor: Actor): void {
  if (!TRUSTED_APPLICANT_CONTEXTS.includes(actor.context)) throw forbidden('درخواست دامپزشک معتمد از حساب شخصی ثبت می‌شود.');
}

function assertReviewer(actor: Actor): void {
  if (!TRUSTED_REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('بررسی درخواست معتمد از محیط عملیاتی انجمن انجام می‌شود.');
}

/** An optional managed text: unconfigured means the association has not written it yet. */
async function optionalText(database: DbClient, key: string): Promise<string | null> {
  try {
    const value = (await readText(database, key)).trim();
    return value === '' ? null : value;
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_CONFIGURED') return null;
    throw error;
  }
}

export interface TrustedTerms {
  readonly textFa: string | null;
  readonly termsVersion: string | null;
  readonly declarationVersion: string | null;
  readonly configured: boolean;
}

export async function trustedTerms(database: DbClient): Promise<TrustedTerms> {
  const [textFa, termsVersion, declarationVersion] = await Promise.all([
    optionalText(database, TRUSTED_TERMS_TEXT_KEY),
    optionalText(database, TRUSTED_TERMS_VERSION_KEY),
    optionalText(database, TRUSTED_DECLARATION_VERSION_KEY),
  ]);
  return { textFa, termsVersion, declarationVersion, configured: textFa !== null && termsVersion !== null && declarationVersion !== null };
}

/** The equipment a veterinarian may declare. Declared, never verified (§7). */
export async function vetEquipmentCatalogue(database: DbClient) {
  return database
    .select({ code: vetEquipment.code, nameFa: vetEquipment.nameFa })
    .from(vetEquipment)
    .where(eq(vetEquipment.isActive, true))
    .orderBy(vetEquipment.sortOrder);
}

async function openTrustedCase(tx: DbClient, accountId: string): Promise<TrustedCaseRow | null> {
  const [row] = await tx
    .select()
    .from(vetProfessionalCases)
    .where(
      and(
        eq(vetProfessionalCases.accountId, accountId),
        eq(vetProfessionalCases.caseType, 'TRUSTED'),
        inArray(vetProfessionalCases.status, [...OPEN_CASE_STATUSES]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The newest trusted case of an account, open or decided. */
export async function myTrustedCase(database: Database, actor: Actor) {
  const [row] = await database
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, actor.accountId), eq(vetProfessionalCases.caseType, 'TRUSTED')))
    .orderBy(desc(vetProfessionalCases.updatedAt))
    .limit(1);
  if (!row) return null;
  const [declaration] = await database
    .select()
    .from(vetTrustedDeclarations)
    .where(and(eq(vetTrustedDeclarations.caseId, row.id), eq(vetTrustedDeclarations.submissionVersion, row.currentSubmissionVersion)))
    .limit(1);
  return {
    id: row.id,
    status: row.status as VetCaseStatus,
    statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
    version: row.version,
    submissionVersion: row.currentSubmissionVersion,
    reviewNoteFa: row.reviewNoteFa,
    declaration: declaration ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── eligibility ────────────────────────────────────────────────────────────

export interface TrustedEligibility {
  readonly requirements: readonly TrustedRequirement[];
  readonly allowed: boolean;
  readonly unmet: readonly TrustedRequirement[];
  readonly terms: TrustedTerms;
  /** True only for an account whose licence period is live: the request is shown to nobody else. */
  readonly isActiveLicensedVet: boolean;
}

/**
 * The authoritative answer, recomputed every time it is asked.
 *
 * Reading it also applies whatever time has done to the licence period and the
 * membership, so an expired one is never mistaken for a live one.
 */
export async function trustedEligibility(database: Database, accountId: string, now: Date = new Date()): Promise<TrustedEligibility> {
  const [licence, membership, terms] = await Promise.all([
    licenceStanding(database, accountId, now),
    membershipStanding(database, accountId, now),
    trustedTerms(database),
  ]);
  const licenceActive = licence.caseStatus === 'ACTIVE_LICENSED_VET' && (licence.standing === 'ACTIVE' || licence.standing === 'GRACE');
  const open = await openTrustedCase(database, accountId);
  const [role] = await database
    .select({ status: accountRoles.status })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.role, 'TRUSTED_VET'), eq(accountRoles.status, 'ACTIVE')))
    .limit(1);

  const requirements = trustedRequirements({
    licenceActive,
    licenceStandingFa: LICENCE_STANDING_FA[licence.standing],
    membershipValid: membership.valid,
    membershipStatusFa: membership.statusFa,
    termsConfigured: terms.configured,
    openCaseStatus: open ? (open.status as VetCaseStatus) : null,
    alreadyTrusted: role !== undefined,
  });
  return {
    requirements,
    allowed: trustedAllowed(requirements),
    unmet: unmetTrusted(requirements),
    terms,
    isActiveLicensedVet: licenceActive,
  };
}

/** The same question, inside a transaction that is about to change something. */
async function assertStillEligible(database: Database, accountId: string, now: Date, when: string): Promise<TrustedTerms> {
  const eligibility = await trustedEligibility(database, accountId, now);
  const blocking = eligibility.unmet.filter((requirement) => requirement.code === 'LICENCE' || requirement.code === 'MEMBERSHIP' || requirement.code === 'TERMS');
  if (blocking.length > 0) {
    throw conflict(when + ': ' + blocking.map((requirement) => requirement.reasonFa).join(' '), { unmet: blocking.map((requirement) => requirement.code) });
  }
  return eligibility.terms;
}

// ── applying ───────────────────────────────────────────────────────────────

async function declareEquipment(tx: DbClient, vetProfileId: string, codes: readonly string[], now: Date): Promise<readonly string[]> {
  const wanted = [MICROCHIP_READER_CODE, ...codes];
  const known = await tx.select({ code: vetEquipment.code }).from(vetEquipment).where(inArray(vetEquipment.code, [...wanted]));
  const missing = wanted.filter((code) => !known.some((row) => row.code === code));
  if (missing.length > 0) throw validation('تجهیز اعلام‌شده «' + missing[0] + '» در فهرست تجهیزات نیست.');
  for (const code of wanted) {
    await tx.insert(vetProfileEquipment).values({ vetProfileId, equipmentCode: code, declaredAt: now }).onConflictDoNothing();
  }
  return wanted;
}

export async function submitTrustedApplication(
  database: Database,
  actor: Actor,
  input: TrustedDeclarationInput,
  now: Date = new Date(),
): Promise<TrustedCaseRow> {
  assertApplicant(actor);
  const eligibility = await trustedEligibility(database, actor.accountId, now);
  if (!eligibility.allowed) {
    throw conflict(eligibility.unmet[0]?.reasonFa ?? 'شرایط درخواست معتمد فراهم نیست.', { unmet: eligibility.unmet.map((requirement) => requirement.code) });
  }
  const terms = eligibility.terms;
  const problem = declarationProblem(input, terms.termsVersion!);
  if (problem) throw validation(problem);

  return database.transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    if (await openTrustedCase(tx, actor.accountId)) throw conflict('یک درخواست معتمد باز دارید؛ همان را پیگیری کنید.');
    const [profile] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1);
    if (!profile) throw conflict('پروفایل حرفه‌ای این حساب پیدا نشد.');

    const [row] = await tx
      .insert(vetProfessionalCases)
      .values({
        accountId: actor.accountId,
        caseType: 'TRUSTED',
        status: 'SUBMITTED',
        currentSubmissionVersion: 1,
        vetProfileId: profile.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const equipment = await declareEquipment(tx, profile.id, input.equipmentCodes ?? [], now);
    await tx.insert(vetProfessionalSubmissions).values({
      caseId: row!.id,
      version: 1,
      submittedByAccountId: actor.accountId,
      submittedAt: now,
      payload: {
        source: 'TRUSTED_APPLICATION',
        statementFa: (input.statementFa ?? '').trim() || null,
        declaredEquipment: equipment,
        termsVersion: terms.termsVersion,
        declarationVersion: terms.declarationVersion,
      },
    });
    await tx.insert(vetTrustedDeclarations).values({
      caseId: row!.id,
      submissionVersion: 1,
      termsVersion: terms.termsVersion!,
      declarationVersion: terms.declarationVersion!,
      microchipReaderDeclared: true,
      declaredAt: now,
      createdAt: now,
    });

    await recordAudit(tx, actor, {
      action: 'VET_TRUSTED_CASE_SUBMITTED',
      targetType: CASE_TARGET,
      targetId: row!.id,
      targetVersion: row!.version,
      after: {
        status: row!.status,
        submissionVersion: 1,
        termsVersion: terms.termsVersion,
        declarationVersion: terms.declarationVersion,
        microchipReaderDeclared: true,
        declaredEquipment: equipment,
      },
    });
    return row!;
  });
}

/** The answer to a correction: a new version of the declaration; the one reviewed before stays. */
export async function reviseTrustedApplication(
  database: Database,
  actor: Actor,
  input: TrustedDeclarationInput & { caseId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<TrustedCaseRow> {
  assertApplicant(actor);
  if (!UUID.test(input.caseId)) throw notFound('درخواست معتمد پیدا نشد.');
  const terms = await assertStillEligible(database, actor.accountId, now, 'پاسخ اصلاح ثبت نشد');
  const problem = declarationProblem(input, terms.termsVersion!);
  if (problem) throw validation(problem);

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
    if (!current || current.accountId !== actor.accountId || current.caseType !== 'TRUSTED') throw notFound('درخواست معتمد پیدا نشد.');
    if (current.status !== 'NEEDS_CORRECTION' || !vetCaseMove(current.status as VetCaseStatus, 'SUBMITTED', 'APPLICANT')) {
      throw conflict('این درخواست در انتظار اصلاح نیست.');
    }
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const version = current.currentSubmissionVersion + 1;
    const [profile] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1);
    const equipment = await declareEquipment(tx, profile!.id, input.equipmentCodes ?? [], now);
    await tx.insert(vetProfessionalSubmissions).values({
      caseId: current.id,
      version,
      submittedByAccountId: actor.accountId,
      submittedAt: now,
      payload: {
        source: 'TRUSTED_APPLICATION',
        statementFa: (input.statementFa ?? '').trim() || null,
        declaredEquipment: equipment,
        termsVersion: terms.termsVersion,
        declarationVersion: terms.declarationVersion,
      },
    });
    await tx.insert(vetTrustedDeclarations).values({
      caseId: current.id,
      submissionVersion: version,
      termsVersion: terms.termsVersion!,
      declarationVersion: terms.declarationVersion!,
      microchipReaderDeclared: true,
      declaredAt: now,
      createdAt: now,
    });

    const [row] = await tx
      .update(vetProfessionalCases)
      .set({ status: 'SUBMITTED', currentSubmissionVersion: version, version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'VET_TRUSTED_CASE_REVISED',
      targetType: CASE_TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, submissionVersion: current.currentSubmissionVersion },
      after: { status: row.status, submissionVersion: version, termsVersion: terms.termsVersion },
    });
    return row;
  });
}

// ── review ─────────────────────────────────────────────────────────────────

export async function trustedCaseQueue(database: Database, actor: Actor, input: { view?: string } = {}) {
  assertReviewer(actor);
  const statuses: readonly VetCaseStatus[] =
    input.view === 'CORRECTION' ? ['NEEDS_CORRECTION'] : input.view === 'DECIDED' ? ['TRUSTED_APPROVED_AWAITING_PAYMENT', 'REJECTED'] : ['SUBMITTED', 'UNDER_REVIEW'];
  const rows = await database
    .select({ row: vetProfessionalCases, displayNameFa: vetProfiles.displayNameFa })
    .from(vetProfessionalCases)
    .leftJoin(vetProfiles, eq(vetProfiles.id, vetProfessionalCases.vetProfileId))
    .where(and(eq(vetProfessionalCases.caseType, 'TRUSTED'), inArray(vetProfessionalCases.status, [...statuses])))
    .orderBy(vetProfessionalCases.updatedAt)
    .limit(50);
  return rows.map(({ row, displayNameFa }) => ({
    id: row.id,
    status: row.status as VetCaseStatus,
    statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
    displayNameFa,
    submissionVersion: row.currentSubmissionVersion,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** One trusted case with what was declared and whether the conditions still hold. */
export async function trustedCaseForReview(database: Database, actor: Actor, caseId: string, now: Date = new Date()) {
  assertReviewer(actor);
  if (!UUID.test(caseId)) return null;
  const [row] = await database.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, caseId)).limit(1);
  if (!row || row.caseType !== 'TRUSTED') return null;

  const [submissions, declarations, profileRow, eligibility] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(vetProfessionalSubmissions.version),
    database.select().from(vetTrustedDeclarations).where(eq(vetTrustedDeclarations.caseId, row.id)).orderBy(vetTrustedDeclarations.submissionVersion),
    database.select({ displayNameFa: vetProfiles.displayNameFa, id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.id, row.vetProfileId!)).limit(1),
    trustedEligibility(database, row.accountId, now),
  ]);
  const declaredEquipment = profileRow[0]
    ? await database
        .select({ code: vetEquipment.code, nameFa: vetEquipment.nameFa, declaredAt: vetProfileEquipment.declaredAt })
        .from(vetProfileEquipment)
        .innerJoin(vetEquipment, eq(vetEquipment.code, vetProfileEquipment.equipmentCode))
        .where(eq(vetProfileEquipment.vetProfileId, profileRow[0].id))
    : [];

  return {
    case: {
      id: row.id,
      accountId: row.accountId,
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      version: row.version,
      currentSubmissionVersion: row.currentSubmissionVersion,
      reviewNoteFa: row.reviewNoteFa,
    },
    applicantNameFa: profileRow[0]?.displayNameFa ?? null,
    submissions: submissions.map((submission) => ({ version: submission.version, submittedAt: submission.submittedAt, fields: submission.payload as Record<string, unknown> })),
    declarations: declarations.map((declaration) => ({
      submissionVersion: declaration.submissionVersion,
      termsVersion: declaration.termsVersion,
      declarationVersion: declaration.declarationVersion,
      microchipReaderDeclared: declaration.microchipReaderDeclared,
      declaredAt: declaration.declaredAt.toISOString(),
    })),
    /** Always «اعلام‌شده»: no file proves any of it. */
    declaredEquipment: declaredEquipment.map((row) => ({ code: row.code, nameFa: row.nameFa, declaredAt: row.declaredAt.toISOString() })),
    eligibilityNow: eligibility.requirements,
    stillEligible: eligibility.unmet.every((requirement) => requirement.code === 'OPEN_CASE' || requirement.code === 'ALREADY_TRUSTED'),
  };
}

/**
 * Approve, ask for a correction, or reject — always with a written reason.
 *
 * An approval is a sensitive transition, so the conditions are asked again at
 * that moment: a licence period or a membership that ran out since the
 * application stops the approval, and the reviewer is told which one.
 */
export async function decideTrustedCase(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<TrustedCaseRow> {
  assertReviewer(actor);
  if (!isTrustedDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const reasonFa = (input.reasonFa ?? '').trim();
  if (reasonFa === '') throw validation('دلیل تصمیم را بنویسید؛ برای متقاضی نمایش داده می‌شود.');
  if (reasonFa.length > 1000) throw validation('دلیل تصمیم حداکثر ۱۰۰۰ نویسه است.');
  if (!UUID.test(input.caseId)) throw notFound('درخواست معتمد پیدا نشد.');
  const outcome = TRUSTED_DECISION_OUTCOME[input.decision];

  const [existing] = await database.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
  if (!existing || existing.caseType !== 'TRUSTED') throw notFound('درخواست معتمد پیدا نشد.');
  if (existing.accountId === actor.accountId) throw forbidden('درخواست خودتان را نمی‌توانید بررسی کنید.');
  // Only an approval hands something out, so only an approval is blocked by a
  // condition that lapsed; a correction or a rejection stays possible.
  if (outcome === 'TRUSTED_APPROVED_AWAITING_PAYMENT') {
    await assertStillEligible(database, existing.accountId, now, 'تأیید ثبت نشد');
  }

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
    if (!current) throw notFound('درخواست معتمد پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    const status = current.status as VetCaseStatus;
    const reviewable =
      (status === 'UNDER_REVIEW' || (status === 'SUBMITTED' && vetCaseMove('SUBMITTED', 'UNDER_REVIEW', 'REVIEWER'))) && vetCaseMove('UNDER_REVIEW', outcome, 'REVIEWER');
    if (!reviewable) throw conflict('این درخواست در انتظار بررسی نیست.');
    const { assertDecisionAllowed } = await import('./review-workbench.ts');
    await assertDecisionAllowed(tx, current, actor, outcome);

    const [row] = await tx
      .update(vetProfessionalCases)
      .set({
        status: outcome,
        reviewNoteFa: reasonFa,
        reviewedByAccountId: actor.accountId,
        reviewedAt: now,
        claimedByAccountId: null,
        claimedAt: null,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'VET_TRUSTED_CASE_DECIDED',
      targetType: CASE_TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status, submissionVersion: row.currentSubmissionVersion },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: current.accountId,
      kind: 'VET_TRUSTED_CASE_DECIDED',
      titleFa:
        outcome === 'TRUSTED_APPROVED_AWAITING_PAYMENT'
          ? 'درخواست دامپزشک معتمد شما تأیید شد'
          : outcome === 'REJECTED'
            ? 'درخواست دامپزشک معتمد شما رد شد'
            : 'درخواست دامپزشک معتمد شما نیازمند اصلاح است',
      bodyFa: reasonFa,
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: row.id }, step: 'TRUSTED_DECISION', originRoute: ROUTE },
    });
    return row;
  });
}
