/**
 * Animal registration and lineage — §9, §10.
 *
 * Registering an animal needs approved KYC and does **not** need membership or
 * a residence address (§9.1, acceptance A-001). The record created here is an
 * internal file: it is not a registration sheet, not a Pet ID and not a
 * pedigree (§9.2).
 */
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { putPrivateFile } from '../files/storage.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { todayCivil } from '../domain/calendar.ts';
import {
  assertPedigreeCode,
  normalizePedigreeCode,
  resolveGeneration,
  wouldCreateCycle,
  type GenerationOutcome,
  type ParentResolution,
} from '../domain/lineage.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';

export type AnimalOrigin = 'G0' | 'INTERNAL_G1PLUS' | 'FOREIGN_PEDIGREE';
export type AnimalStatus = 'DRAFT' | 'REGISTERED' | 'ARCHIVED';
export type AnimalSex = 'MALE' | 'FEMALE';

export type AnimalRecord = typeof animals.$inferSelect;

/** Values the owner may set. Generation, pet id and pedigree code are absent by design. */
export interface AnimalDraftInput {
  readonly name?: string | null;
  readonly breedId?: string | null;
  readonly sex?: AnimalSex | null;
  readonly birthDate?: string | null;
  readonly birthDateApproximate?: boolean;
  readonly color?: string | null;
  readonly markings?: string | null;
  readonly declaredMicrochipNumber?: string | null;
  readonly origin?: AnimalOrigin;
  /** Codes typed on the G1+ step, kept on the draft so a detour cannot lose them. */
  readonly ownPedigreeCode?: string | null;
  readonly sirePedigreeCode?: string | null;
  readonly damPedigreeCode?: string | null;
  readonly step?: number;
}

export interface DraftData {
  readonly ownPedigreeCode?: string | null;
  readonly sirePedigreeCode?: string | null;
  readonly damPedigreeCode?: string | null;
  /** Where the owner was when they left to register a missing parent. */
  readonly returnTo?: ResumeContext | null;
  readonly lastLineageState?: GenerationOutcome['state'] | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export async function findAnimal(database: DbClient, animalId: string): Promise<AnimalRecord | null> {
  const [row] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  return row ?? null;
}

/**
 * Every read and write of one animal goes through this, so a changed URL cannot
 * reach a record the actor does not own (§4, §23.4).
 */
export async function requireOwnedAnimal(
  database: DbClient,
  actor: Actor,
  animalId: string,
): Promise<AnimalRecord> {
  const record = await findAnimal(database, animalId);
  // Somebody else's record and a record that does not exist give the same
  // answer, so guessing identifiers cannot confirm that one exists.
  if (record === null || record.ownerAccountId !== actor.accountId) {
    throw notFound('پرونده حیوان پیدا نشد.');
  }
  return record;
}

export async function listAnimals(database: DbClient, actor: Actor): Promise<readonly AnimalRecord[]> {
  return database
    .select()
    .from(animals)
    .where(eq(animals.ownerAccountId, actor.accountId))
    .orderBy(sql`created_at desc`);
}

export async function countRegisteredAnimals(database: DbClient, accountId: string): Promise<number> {
  const [row] = await database
    .select({ total: sql<string>`count(*)` })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, accountId), eq(animals.status, 'REGISTERED')));
  return Number(row?.total ?? 0);
}

/**
 * Starts a draft, or returns the one already open, so the form is never lost.
 *
 * `excludeAnimalId` matters when the owner leaves a half-finished child to go
 * and register its missing parent: without it, "continue the open draft" would
 * hand back the child itself and the parent would end up being the child.
 * `forceNew` is the same idea for a caller that always wants a fresh record.
 */
export async function startDraft(
  database: Database,
  actor: Actor,
  options: { forceNew?: boolean; excludeAnimalId?: string } = {},
): Promise<AnimalRecord> {
  await assertEligible(database, actor.accountId, 'ANIMAL_REGISTRATION');

  if (options.forceNew !== true) {
    const open = await database
      .select()
      .from(animals)
      .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'DRAFT')))
      .orderBy(sql`created_at desc`)
      .limit(2);
    const existing = open.find((row) => row.id !== options.excludeAnimalId);
    if (existing) return existing;
  }

  return database.transaction(async (tx) => {
    const [created] = await tx
      .insert(animals)
      .values({ ownerAccountId: actor.accountId, status: 'DRAFT', draftStep: 1, draftData: {} })
      .returning();
    await recordAudit(tx, actor, {
      action: 'ANIMAL_DRAFT_STARTED',
      targetType: 'ANIMAL',
      targetId: created!.id,
      targetVersion: 1,
      after: { status: 'DRAFT' },
    });
    return created!;
  });
}

function validateBasics(input: AnimalDraftInput, record: AnimalRecord) {
  const name = trimmedOrNull(input.name ?? record.name);
  if (name !== null && name.length > 60) throw validation('نام حیوان بیش از حد طولانی است.');

  const birthDate = trimmedOrNull(input.birthDate ?? record.birthDate);
  if (birthDate !== null && birthDate > todayCivil()) {
    throw validation('تاریخ تولد نمی‌تواند در آینده باشد.');
  }
  return { name, birthDate };
}

/**
 * Save one step of the form.
 *
 * The draft row is updated in place with an optimistic version check, so two
 * tabs cannot silently overwrite each other, and the entered pedigree codes are
 * kept even while other steps change.
 */
export async function saveDraft(
  database: Database,
  actor: Actor,
  animalId: string,
  input: AnimalDraftInput,
  expectedVersion?: number,
): Promise<AnimalRecord> {
  const record = await requireOwnedAnimal(database, actor, animalId);
  if (record.status !== 'DRAFT') throw conflict('این پرونده دیگر پیش‌نویس نیست.');
  if (expectedVersion !== undefined && expectedVersion !== record.version) {
    throw versionStale(expectedVersion, record.version);
  }

  const { name, birthDate } = validateBasics(input, record);
  const draft = (record.draftData ?? {}) as DraftData;
  const nextDraft: DraftData = {
    ...draft,
    ownPedigreeCode:
      input.ownPedigreeCode === undefined ? draft.ownPedigreeCode : trimmedOrNull(input.ownPedigreeCode),
    sirePedigreeCode:
      input.sirePedigreeCode === undefined ? draft.sirePedigreeCode : trimmedOrNull(input.sirePedigreeCode),
    damPedigreeCode:
      input.damPedigreeCode === undefined ? draft.damPedigreeCode : trimmedOrNull(input.damPedigreeCode),
  };

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animals)
      .set({
        name,
        breedId: input.breedId === undefined ? record.breedId : trimmedOrNull(input.breedId),
        sex: input.sex === undefined ? record.sex : (input.sex ?? null),
        birthDate,
        birthDateApproximate: input.birthDateApproximate ?? record.birthDateApproximate,
        color: input.color === undefined ? record.color : trimmedOrNull(input.color),
        markings: input.markings === undefined ? record.markings : trimmedOrNull(input.markings),
        declaredMicrochipNumber:
          input.declaredMicrochipNumber === undefined
            ? record.declaredMicrochipNumber
            : trimmedOrNull(input.declaredMicrochipNumber),
        origin: input.origin ?? record.origin,
        draftStep: input.step ?? record.draftStep,
        draftData: nextDraft,
        version: record.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(animals.id, animalId), eq(animals.version, record.version)))
      .returning();
    if (!updated) throw conflict('پیش‌نویس هم‌زمان تغییر کرده است.');
    return updated;
  });
}

/** Remembers where to come back to before the owner leaves to register a parent. */
export async function rememberReturn(
  database: Database,
  actor: Actor,
  animalId: string,
  returnTo: ResumeContext,
): Promise<void> {
  const record = await requireOwnedAnimal(database, actor, animalId);
  const draft = (record.draftData ?? {}) as DraftData;
  await database
    .update(animals)
    .set({ draftData: { ...draft, returnTo: resumeContext(returnTo) }, updatedAt: new Date() })
    .where(eq(animals.id, animalId));
}

export function draftOf(record: AnimalRecord): DraftData {
  return (record.draftData ?? {}) as DraftData;
}

/**
 * Resolve one parent by its pedigree code.
 *
 * A missing code and a code that matches nothing are both NOT_FOUND, which §9.3
 * treats as a genuinely absent parent. Only a failure of the query itself is a
 * LOOKUP_ERROR.
 */
export async function resolveParentByCode(
  database: DbClient,
  rawCode: string | null | undefined,
): Promise<ParentResolution> {
  const code = rawCode ? normalizePedigreeCode(rawCode) : '';
  if (code === '') return { state: 'NOT_FOUND' };

  try {
    const [row] = await database
      .select({ id: animals.id, generation: animals.generation, status: animals.status })
      .from(animals)
      .where(and(eq(animals.pedigreeCode, code), eq(animals.status, 'REGISTERED')))
      .limit(1);
    if (!row) return { state: 'NOT_FOUND' };
    return { state: 'RESOLVED', animalId: row.id, generation: row.generation };
  } catch (error) {
    return { state: 'LOOKUP_ERROR', detail: error instanceof Error ? error.message : 'lookup failed' };
  }
}

export interface LineageResult {
  readonly outcome: GenerationOutcome;
  readonly sire: ParentResolution;
  readonly dam: ParentResolution;
}

/**
 * Work out the lineage for the codes currently on the draft.
 *
 * This is a pure read: it computes and reports, and never writes. Applying the
 * result is a separate, audited step, which is what makes a rematch after
 * registering a missing parent an update rather than a new animal.
 */
export async function evaluateLineage(
  database: DbClient,
  record: AnimalRecord,
): Promise<LineageResult> {
  const draft = draftOf(record);
  const sire = await resolveParentByCode(database, draft.sirePedigreeCode);
  const dam = await resolveParentByCode(database, draft.damPedigreeCode);
  return { outcome: resolveGeneration(sire, dam, record.generation), sire, dam };
}

async function ancestorsOf(database: DbClient, animalId: string): Promise<readonly string[]> {
  const [row] = await database
    .select({ sire: animals.sireAnimalId, dam: animals.damAnimalId })
    .from(animals)
    .where(eq(animals.id, animalId))
    .limit(1);
  return [row?.sire, row?.dam].filter((value): value is string => typeof value === 'string');
}

/**
 * Apply a lineage result to the record.
 *
 * Self-links and cycles are refused before anything is written, and the outcome
 * is audited with the previous and the new generation so a rematch is visible
 * in the history rather than appearing as a fresh animal.
 */
export async function applyLineage(
  database: Database,
  actor: Actor,
  animalId: string,
  expectedVersion?: number,
): Promise<{ record: AnimalRecord; result: LineageResult }> {
  const record = await requireOwnedAnimal(database, actor, animalId);
  if (expectedVersion !== undefined && expectedVersion !== record.version) {
    throw versionStale(expectedVersion, record.version);
  }

  const result = await evaluateLineage(database, record);

  // A technical failure keeps the draft, the codes and the current generation.
  if (result.outcome.state === 'LOOKUP_ERROR') return { record, result };

  let sireId: string | null = null;
  let damId: string | null = null;
  if (result.outcome.state === 'COMPUTED') {
    sireId = (result.sire as { animalId: string }).animalId;
    damId = (result.dam as { animalId: string }).animalId;

    for (const parentId of [sireId, damId]) {
      if (parentId === animalId) throw validation('یک حیوان نمی‌تواند والد خودش باشد.');
      if (await wouldCreateCycle(animalId, parentId, (id) => ancestorsOf(database, id))) {
        throw validation('این پیوند نسب حلقه ایجاد می‌کند و پذیرفته نمی‌شود.');
      }
    }
    if (sireId === damId) throw validation('پدر و مادر نمی‌توانند یک رکورد باشند.');
  }

  const nextGeneration = result.outcome.state === 'COMPUTED' ? result.outcome.generation : 0;
  const nextOrigin: AnimalOrigin = result.outcome.state === 'COMPUTED' ? 'INTERNAL_G1PLUS' : 'G0';

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animals)
      .set({
        generation: nextGeneration,
        origin: nextOrigin,
        sireAnimalId: sireId,
        damAnimalId: damId,
        draftData: { ...draftOf(record), lastLineageState: result.outcome.state },
        version: record.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(animals.id, animalId), eq(animals.version, record.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_LINEAGE_RESOLVED',
      targetType: 'ANIMAL',
      targetId: animalId,
      targetVersion: record.version + 1,
      before: { generation: record.generation, origin: record.origin, sire: record.sireAnimalId, dam: record.damAnimalId },
      after: { generation: nextGeneration, origin: nextOrigin, sire: sireId, dam: damId, state: result.outcome.state },
    });

    return { record: updated, result };
  });
}

/**
 * Finish registration.
 *
 * The generation written here is whatever the server computed; nothing from the
 * request can influence it. No Pet ID and no pedigree code is issued, because
 * those belong to documents that have not been produced yet (§9.2).
 */
export async function registerAnimal(
  database: Database,
  actor: Actor,
  animalId: string,
  expectedVersion?: number,
): Promise<AnimalRecord> {
  await assertEligible(database, actor.accountId, 'ANIMAL_REGISTRATION');
  const record = await requireOwnedAnimal(database, actor, animalId);
  if (record.status === 'REGISTERED') return record;
  if (record.status !== 'DRAFT') throw conflict('این پرونده قابل ثبت نیست.');
  if (expectedVersion !== undefined && expectedVersion !== record.version) {
    throw versionStale(expectedVersion, record.version);
  }

  if (record.breedId === null) throw validation('نژاد را انتخاب کنید.');
  if (record.sex === null) throw validation('جنسیت را انتخاب کنید.');
  if (record.birthDate === null) throw validation('تاریخ تولد را وارد کنید.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animals)
      .set({ status: 'REGISTERED', registeredAt: new Date(), version: record.version + 1, updatedAt: new Date() })
      .where(and(eq(animals.id, animalId), eq(animals.version, record.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_REGISTERED',
      targetType: 'ANIMAL',
      targetId: animalId,
      targetVersion: record.version + 1,
      before: { status: 'DRAFT' },
      after: {
        status: 'REGISTERED',
        origin: updated.origin,
        generation: updated.generation,
        // Stated explicitly so the trail shows nothing official was issued here.
        petId: updated.petId,
        pedigreeCode: updated.pedigreeCode,
      },
    });
    return updated;
  });
}

/**
 * Fields the owner may still edit after registration (§10).
 *
 * Microchip number, sample code, genetic result and pedigree data are absent on
 * purpose: they are corrected through the process and the actor that owns them,
 * never from the general profile form.
 */
export interface AnimalEditInput {
  readonly name?: string | null;
  readonly color?: string | null;
  readonly markings?: string | null;
  readonly birthDateApproximate?: boolean;
}

const PROTECTED_FIELDS = [
  'generation',
  'origin',
  'petId',
  'pedigreeCode',
  'sireAnimalId',
  'damAnimalId',
  'declaredMicrochipNumber',
  'status',
  'ownerAccountId',
] as const;

export async function editAnimal(
  database: Database,
  actor: Actor,
  animalId: string,
  input: AnimalEditInput & Record<string, unknown>,
  expectedVersion?: number,
): Promise<AnimalRecord> {
  const record = await requireOwnedAnimal(database, actor, animalId);
  if (expectedVersion !== undefined && expectedVersion !== record.version) {
    throw versionStale(expectedVersion, record.version);
  }

  // A protected field arriving here is a bug or an attempt, not a typo: refuse
  // loudly rather than quietly dropping it.
  for (const field of PROTECTED_FIELDS) {
    if (field in input) {
      throw forbidden('این فیلد از فرم عمومی پروفایل قابل تغییر نیست: ' + field);
    }
  }

  const name = trimmedOrNull(input.name ?? record.name);
  if (name !== null && name.length > 60) throw validation('نام حیوان بیش از حد طولانی است.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animals)
      .set({
        name,
        color: input.color === undefined ? record.color : trimmedOrNull(input.color),
        markings: input.markings === undefined ? record.markings : trimmedOrNull(input.markings),
        birthDateApproximate: input.birthDateApproximate ?? record.birthDateApproximate,
        version: record.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(animals.id, animalId), eq(animals.version, record.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_UPDATED',
      targetType: 'ANIMAL',
      targetId: animalId,
      targetVersion: record.version + 1,
      before: { name: record.name, color: record.color, markings: record.markings },
      after: { name, color: updated.color, markings: updated.markings },
    });
    return updated;
  });
}

/** Animal photo. Stored privately like every other upload. */
export async function attachAnimalPhoto(
  database: Database,
  storageRoot: string,
  actor: Actor,
  animalId: string,
  file: { bytes: Uint8Array; originalName?: string | null },
): Promise<AnimalRecord> {
  const record = await requireOwnedAnimal(database, actor, animalId);
  return database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'ANIMAL_PHOTO',
      bytes: file.bytes,
      originalName: file.originalName ?? null,
    });
    const [updated] = await tx
      .update(animals)
      .set({ photoFileId: stored.id, version: record.version + 1, updatedAt: new Date() })
      .where(eq(animals.id, animalId))
      .returning();
    await recordAudit(tx, actor, {
      action: 'ANIMAL_PHOTO_ATTACHED',
      targetType: 'ANIMAL',
      targetId: animalId,
      targetVersion: record.version + 1,
      after: { photoFileId: stored.id, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return updated!;
  });
}

/** Direct family, read from records rather than from typed text (§9.3). */
export async function familyOf(database: DbClient, record: AnimalRecord) {
  const parentIds = [record.sireAnimalId, record.damAnimalId].filter(
    (value): value is string => typeof value === 'string',
  );
  const parents = parentIds.length
    ? await database
        .select()
        .from(animals)
        .where(or(...parentIds.map((id) => eq(animals.id, id))))
    : [];

  const offspring = await database
    .select()
    .from(animals)
    .where(or(eq(animals.sireAnimalId, record.id), eq(animals.damAnimalId, record.id)));

  return {
    sire: parents.find((p) => p.id === record.sireAnimalId) ?? null,
    dam: parents.find((p) => p.id === record.damAnimalId) ?? null,
    offspring,
  };
}

export async function breedOptions(database: DbClient) {
  return database
    .select()
    .from(referenceBreeds)
    .where(eq(referenceBreeds.isActive, true))
    .orderBy(referenceBreeds.sortOrder);
}

/** Draft the owner left open, used to resume the form from the dashboard. */
export async function openDraft(database: DbClient, actor: Actor): Promise<AnimalRecord | null> {
  const [row] = await database
    .select()
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'DRAFT'), isNull(animals.registeredAt)))
    .orderBy(sql`created_at desc`)
    .limit(1);
  return row ?? null;
}

export { assertPedigreeCode };
