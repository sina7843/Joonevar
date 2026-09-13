/**
 * Read models of the veterinary professional profile — Phase 2.5 PROMPT-003.
 *
 * Three readers, three shapes, each built by naming what it may contain:
 *  - the account itself (dashboard): its own values, cases, review notes and
 *    document references, but never who reviewed it;
 *  - the reviewer side: everything, including every submitted version and the
 *    other profiles that share a code, and the viewing itself is audited;
 *  - the public: the one tag and what the veterinarian chose to publish, never
 *    a document, a licence detail, a student number or a workflow state.
 *
 * Every payload is plain JSON — instants as ISO strings, dates as YYYY-MM-DD,
 * lists bounded — so a mobile client can take it as it is.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import {
  vetEquipment,
  vetProfessionalCases,
  vetProfessionalDocuments,
  vetProfessionalSubmissions,
  vetProfileCertificates,
  vetProfileEquipment,
  vetProfiles,
  vetProfileServices,
  vetServices,
} from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { forbidden } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetTagLabel, type VetCaseStatus, type VetPracticeScope, type VetTag } from './professional-model.ts';
import { currentVetTag, vetTagHistory } from './professional-tags.ts';
import { professionalCaseHistory } from './student-application.ts';
import {
  CASE_STATUS_FA,
  CASE_TYPE_FA,
  DOCUMENT_KIND_FA,
  publicProfessionalView,
  type ProfessionalDocumentKind,
  type PublicProfessionalView,
  type VetApplicantType,
  type VetCaseType,
} from './professional-profile-model.ts';

const REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'REVIEW_OPERATOR', 'SUPERADMIN'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^vet-[0-9a-f]{10}$/;
/** No list in a payload grows without bound (§20). */
export const PAYLOAD_LIST_CEILING = 50;

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

type ProfileRow = typeof vetProfiles.$inferSelect;

async function catalogueOf(database: DbClient, profileId: string) {
  const [services, equipment, certificates] = await Promise.all([
    database
      .select({ code: vetServices.code, nameFa: vetServices.nameFa })
      .from(vetProfileServices)
      .innerJoin(vetServices, eq(vetServices.code, vetProfileServices.serviceCode))
      .where(eq(vetProfileServices.vetProfileId, profileId))
      .orderBy(asc(vetServices.sortOrder)),
    database
      .select({ code: vetEquipment.code, nameFa: vetEquipment.nameFa, declaredAt: vetProfileEquipment.declaredAt })
      .from(vetProfileEquipment)
      .innerJoin(vetEquipment, eq(vetEquipment.code, vetProfileEquipment.equipmentCode))
      .where(eq(vetProfileEquipment.vetProfileId, profileId))
      .orderBy(asc(vetEquipment.sortOrder)),
    database
      .select()
      .from(vetProfileCertificates)
      .where(and(eq(vetProfileCertificates.vetProfileId, profileId), isNull(vetProfileCertificates.removedAt)))
      .orderBy(asc(vetProfileCertificates.createdAt))
      .limit(PAYLOAD_LIST_CEILING),
  ]);
  return {
    services,
    equipment: equipment.map((row) => ({ code: row.code, nameFa: row.nameFa, declaredAt: iso(row.declaredAt)! })),
    certificates: certificates.map((row) => ({ id: row.id, titleFa: row.titleFa, issuerFa: row.issuerFa, issuedOn: row.issuedOn, fileId: row.fileId })),
  };
}

function ownFields(profile: ProfileRow) {
  return {
    applicantType: profile.applicantType as VetApplicantType | null,
    displayNameFa: profile.displayNameFa,
    studentNumber: profile.studentNumber,
    universityFa: profile.universityFa,
    practiceScope: profile.practiceScope as VetPracticeScope | null,
    councilCode: profile.councilCode,
    councilVerified: profile.councilVerifiedAt !== null,
    hasLicence: profile.hasLicence,
    licenceCode: profile.licenceCode,
    licenceDate: profile.licenceDate,
    licenceFileId: profile.licenceFileId,
    licenceVerified: profile.licenceVerifiedAt !== null,
    websiteUrl: profile.websiteUrl,
    instagramHandle: profile.instagramHandle,
    clinicNameFa: profile.clinicNameFa,
    phone: profile.phone,
  };
}

async function casesOf(database: DbClient, accountId: string) {
  const cases = await database
    .select()
    .from(vetProfessionalCases)
    .where(eq(vetProfessionalCases.accountId, accountId))
    .orderBy(desc(vetProfessionalCases.updatedAt))
    .limit(PAYLOAD_LIST_CEILING);
  const documents = cases.length
    ? await database
        .select()
        .from(vetProfessionalDocuments)
        .where(inArray(vetProfessionalDocuments.caseId, cases.map((row) => row.id)))
        .orderBy(asc(vetProfessionalDocuments.createdAt))
    : [];
  return { cases, documents };
}

const documentOut = (row: typeof vetProfessionalDocuments.$inferSelect) => ({
  id: row.id,
  kind: row.kind as ProfessionalDocumentKind,
  kindFa: DOCUMENT_KIND_FA[row.kind as ProfessionalDocumentKind],
  titleFa: row.titleFa,
  submissionVersion: row.submissionVersion,
  fileId: row.fileId,
});

// ── The account itself ─────────────────────────────────────────────────────

export async function professionalDashboard(database: DbClient, actor: Actor) {
  const [[profile], tag, history, { cases, documents }] = await Promise.all([
    database.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1),
    currentVetTag(database, actor.accountId),
    vetTagHistory(database, actor, actor.accountId),
    casesOf(database, actor.accountId),
  ]);
  // Status changes and reviewer reasons, without who the reviewer was (PROMPT-004).
  const caseHistory = await professionalCaseHistory(database, cases.map((row) => row.id));
  return {
    profile: profile ? { ...ownFields(profile), ...(await catalogueOf(database, profile.id)) } : null,
    currentTag: tag ? { tag: tag.tag as VetTag, labelFa: vetTagLabel(tag.tag, tag.practiceScope), since: iso(tag.startedAt)! } : null,
    tagHistory: history.slice(-PAYLOAD_LIST_CEILING).map((row) => ({
      tag: row.tag as VetTag,
      labelFa: vetTagLabel(row.tag, row.practiceScope),
      startedAt: iso(row.startedAt)!,
      endedAt: iso(row.endedAt),
    })),
    cases: cases.map((row) => ({
      id: row.id,
      caseType: row.caseType as VetCaseType,
      caseTypeFa: CASE_TYPE_FA[row.caseType as VetCaseType],
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      submissionVersion: row.currentSubmissionVersion,
      reviewNoteFa: row.reviewNoteFa,
      updatedAt: iso(row.updatedAt)!,
      documents: documents.filter((document) => document.caseId === row.id).map(documentOut),
      history: caseHistory[row.id] ?? [],
    })),
  };
}

export type ProfessionalDashboard = Awaited<ReturnType<typeof professionalDashboard>>;

// ── The reviewer side ──────────────────────────────────────────────────────

export async function professionalProfileForReview(database: DbClient, actor: Actor, accountId: string) {
  if (!REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('پرونده حرفه‌ای فقط در محیط بررسی دیده می‌شود.');
  if (!UUID.test(accountId)) return null;
  const [[profile], history, { cases, documents }] = await Promise.all([
    database.select().from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1),
    vetTagHistory(database, actor, accountId),
    casesOf(database, accountId),
  ]);
  if (!profile && cases.length === 0 && history.length === 0) return null;

  const submissions = cases.length
    ? await database
        .select()
        .from(vetProfessionalSubmissions)
        .where(inArray(vetProfessionalSubmissions.caseId, cases.map((row) => row.id)))
        .orderBy(asc(vetProfessionalSubmissions.version))
    : [];
  // Another profile holding the same council code, licence code or student number is what a reviewer must see first.
  const sameCodes = profile
    ? [
        profile.councilCode ? eq(vetProfiles.councilCode, profile.councilCode) : undefined,
        profile.licenceCode ? eq(vetProfiles.licenceCode, profile.licenceCode) : undefined,
        profile.studentNumber ? eq(vetProfiles.studentNumber, profile.studentNumber) : undefined,
      ].filter((condition) => condition !== undefined)
    : [];
  const duplicates =
    profile && sameCodes.length > 0
      ? await database
          .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, displayNameFa: vetProfiles.displayNameFa, publicSlug: vetProfiles.publicSlug })
          .from(vetProfiles)
          .where(and(ne(vetProfiles.id, profile.id), or(...sameCodes)))
          .limit(PAYLOAD_LIST_CEILING)
      : [];

  await recordAudit(database, actor, {
    action: 'VET_PROFESSIONAL_PROFILE_VIEWED',
    targetType: 'ACCOUNT',
    targetId: accountId,
    metadata: { context: actor.context, cases: cases.length },
  });

  return {
    accountId,
    profile: profile
      ? {
          id: profile.id,
          ...ownFields(profile),
          councilVerifiedAt: iso(profile.councilVerifiedAt),
          councilVerifiedByAccountId: profile.councilVerifiedByAccountId,
          licenceVerifiedAt: iso(profile.licenceVerifiedAt),
          licenceVerifiedByAccountId: profile.licenceVerifiedByAccountId,
          publicSlug: profile.publicSlug,
          publicStatus: profile.publicStatus,
          ...(await catalogueOf(database, profile.id)),
        }
      : null,
    tagHistory: history.slice(-PAYLOAD_LIST_CEILING).map((row) => ({
      id: row.id,
      tag: row.tag as VetTag,
      labelFa: vetTagLabel(row.tag, row.practiceScope),
      startedAt: iso(row.startedAt)!,
      endedAt: iso(row.endedAt),
      endReasonFa: row.endReasonFa,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      grantedByAccountId: row.grantedByAccountId,
      endedByAccountId: row.endedByAccountId,
    })),
    cases: cases.map((row) => ({
      id: row.id,
      caseType: row.caseType as VetCaseType,
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      legacyApplicationId: row.legacyApplicationId,
      reviewNoteFa: row.reviewNoteFa,
      reviewedByAccountId: row.reviewedByAccountId,
      reviewedAt: iso(row.reviewedAt),
      updatedAt: iso(row.updatedAt)!,
      submissions: submissions
        .filter((submission) => submission.caseId === row.id)
        .map((submission) => ({
          version: submission.version,
          submittedAt: iso(submission.submittedAt)!,
          submittedByAccountId: submission.submittedByAccountId,
          payload: submission.payload,
        })),
      documents: documents.filter((document) => document.caseId === row.id).map(documentOut),
    })),
    duplicates,
  };
}

// ── The public ─────────────────────────────────────────────────────────────

/** The professional part of a published directory page, or null when there is no such page. */
export async function publicProfessionalProfile(database: DbClient, slug: string): Promise<PublicProfessionalView | null> {
  if (!SLUG.test(slug)) return null;
  const [profile] = await database
    .select()
    .from(vetProfiles)
    .where(
      and(
        eq(vetProfiles.publicSlug, slug),
        eq(vetProfiles.publicStatus, 'PUBLISHED'),
        eq(vetProfiles.hiddenByReview, false),
        isNull(vetProfiles.mergedIntoProfileId),
      ),
    )
    .limit(1);
  if (!profile) return null;
  const [tag, catalogue] = await Promise.all([
    profile.accountId ? currentVetTag(database, profile.accountId) : Promise.resolve(null),
    catalogueOf(database, profile.id),
  ]);
  return publicProfessionalView({
    slug,
    displayNameFa: profile.displayNameFa,
    councilCode: profile.councilCode,
    showCouncilCode: profile.showCouncilCode,
    phone: profile.phone,
    showPhone: profile.showPhone,
    clinicNameFa: profile.clinicNameFa,
    websiteUrl: profile.websiteUrl,
    instagramHandle: profile.instagramHandle,
    tag: tag ? { tag: tag.tag, practiceScope: tag.practiceScope } : null,
    servicesFa: catalogue.services.map((row) => row.nameFa),
    equipmentFa: catalogue.equipment.map((row) => row.nameFa),
  });
}
