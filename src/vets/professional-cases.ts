/**
 * Professional cases and their evidence — Phase 2.5 PROMPT-003.
 *
 * A case is what an account asks to have verified. Each submission is a
 * numbered, immutable snapshot, and each document belongs to the submission it
 * arrived with; the database refuses to change or delete either. A correction is
 * a new version, so what a reviewer once decided on is still there to read.
 *
 * Until the Phase 2.5 flows replace it (PROMPT-004…007), the Phase 2 application
 * keeps working and every change to it is mirrored onto its case here, inside
 * the same transaction, exactly as migration 0032 mirrored the existing ones.
 */
import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { vetApplications, vetProfessionalCases, vetProfessionalDocuments, vetProfessionalSubmissions } from '../db/schema/vets.ts';
import { LEGACY_APPLICATION_STATUS } from './professional-model.ts';
import { LEGACY_APPLICATION_CASE_TYPE, type ProfessionalDocumentKind } from './professional-profile-model.ts';

export type ProfessionalCaseRow = typeof vetProfessionalCases.$inferSelect;
type ApplicationRow = typeof vetApplications.$inferSelect;

export interface CaseRef {
  readonly caseId: string;
  readonly submissionVersion: number;
}

/** What a Phase 2 application submitted, in the shape 0032 stores for the existing ones. */
export function legacySubmissionPayload(application: ApplicationRow): Record<string, unknown> {
  return {
    source: 'VET_APPLICATION',
    kind: application.kind,
    displayNameFa: application.displayNameFa,
    councilCode: application.councilCode,
    phone: application.phone,
    cityId: application.cityId,
    statementFa: application.statementFa,
    appealFa: application.appealFa,
  };
}

/**
 * Mirrors one application onto its case. `newSubmission` is true when the
 * applicant sent something (submission, correction, appeal) and false for a
 * decision or a withdrawal, which change the status and add no evidence.
 */
export async function syncLegacyCase(
  tx: DbClient,
  application: ApplicationRow,
  options: { newSubmission: boolean },
  now: Date = new Date(),
): Promise<CaseRef> {
  const status = LEGACY_APPLICATION_STATUS[application.status];
  const review = {
    reviewNoteFa: application.reviewNoteFa,
    reviewedByAccountId: application.reviewedByAccountId,
    reviewedAt: application.reviewedAt,
  };
  const [existing] = await tx
    .select()
    .from(vetProfessionalCases)
    .where(eq(vetProfessionalCases.legacyApplicationId, application.id))
    .limit(1);

  if (!existing) {
    const [created] = await tx
      .insert(vetProfessionalCases)
      .values({
        accountId: application.accountId,
        vetProfileId: application.vetProfileId,
        caseType: LEGACY_APPLICATION_CASE_TYPE[application.kind],
        status,
        currentSubmissionVersion: 1,
        legacyApplicationId: application.id,
        ...review,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(vetProfessionalSubmissions).values({
      caseId: created!.id,
      version: 1,
      submittedByAccountId: application.accountId,
      submittedAt: application.submittedAt,
      payload: legacySubmissionPayload(application),
    });
    return { caseId: created!.id, submissionVersion: 1 };
  }

  const submissionVersion = existing.currentSubmissionVersion + (options.newSubmission ? 1 : 0);
  await tx
    .update(vetProfessionalCases)
    .set({ status, vetProfileId: application.vetProfileId, currentSubmissionVersion: submissionVersion, ...review, version: existing.version + 1, updatedAt: now })
    .where(eq(vetProfessionalCases.id, existing.id));
  if (options.newSubmission) {
    await tx.insert(vetProfessionalSubmissions).values({
      caseId: existing.id,
      version: submissionVersion,
      submittedByAccountId: application.accountId,
      submittedAt: application.submittedAt,
      payload: legacySubmissionPayload(application),
    });
  }
  return { caseId: existing.id, submissionVersion };
}

/** A document joins the submission it arrived with and is never moved or removed. */
export async function attachCaseDocument(tx: DbClient, ref: CaseRef, input: { fileId: string; kind: ProfessionalDocumentKind; titleFa?: string | null }): Promise<void> {
  await tx.insert(vetProfessionalDocuments).values({
    caseId: ref.caseId,
    submissionVersion: ref.submissionVersion,
    kind: input.kind,
    fileId: input.fileId,
    titleFa: input.titleFa ?? null,
  });
}
