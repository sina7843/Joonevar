/**
 * Microchip implant and verification — §12.1, §12.2, §12.3, D08.
 *
 * One animal, one microchip, for life. Both halves of that are database
 * constraints rather than checks this module could forget: a unique index on
 * the animal and a unique index on the number. Everything below either binds a
 * new pair or records a conflict and stops; nothing replaces, transfers or
 * clears a binding.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { vetVisitRequests } from '../db/schema/vets.ts';
import { chipProcedures, microchipConflicts, microchips } from '../db/schema/clinical.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import {
  assertMicrochipNumber,
  CONFLICT_KIND_FA,
  implantPreCheck,
  rereadMatches,
  verificationOutcome,
  type ChipFacts,
  type ChipReadMethod,
  type ConflictKind,
} from '../domain/microchip.ts';
import type { Actor } from '../authz/actor.ts';

export type MicrochipRecord = typeof microchips.$inferSelect;
export type ChipProcedureRecord = typeof chipProcedures.$inferSelect;
export type ChipConflictRecord = typeof microchipConflicts.$inferSelect;
export type VisitRequestRecord = typeof vetVisitRequests.$inferSelect;

/**
 * Postgres reports a violated unique index here; the index name says which rule.
 * The driver error arrives wrapped by the query layer, so the cause is where the
 * code and the constraint name actually live.
 */
function uniqueViolation(error: unknown): string | null {
  for (const candidate of [error, (error as { cause?: unknown } | null)?.cause]) {
    const pg = candidate as { code?: string; constraint?: string } | null | undefined;
    if (pg?.code === '23505') return pg.constraint ?? '';
  }
  return null;
}

/**
 * The work belongs to the veterinarian who was assigned it and only while the
 * visit is actually open at the desk (§11.3, §21.1).
 */
export async function requireOpenVisit(
  database: DbClient,
  actor: Actor,
  requestId: string,
): Promise<VisitRequestRecord> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('این عملیات فقط توسط دامپزشک معتمد انجام می‌شود.');
  const [row] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  // Same answer for "not yours" and "does not exist" (§23.4).
  if (!row || row.vetAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  if (row.status !== 'CHECKED_IN') throw conflict('این پرونده در وضعیت پذیرش‌شده نیست.');
  return row;
}

export async function chipOfAnimal(database: DbClient, animalId: string): Promise<MicrochipRecord | null> {
  const [row] = await database.select().from(microchips).where(eq(microchips.animalId, animalId)).limit(1);
  return row ?? null;
}

export async function chipByNumber(database: DbClient, number: string): Promise<MicrochipRecord | null> {
  const [row] = await database.select().from(microchips).where(eq(microchips.number, number)).limit(1);
  return row ?? null;
}

async function factsFor(database: DbClient, animalId: string, number: string): Promise<ChipFacts> {
  const [byAnimal, byNumber] = await Promise.all([
    chipOfAnimal(database, animalId),
    chipByNumber(database, number),
  ]);
  return {
    animalBoundNumber: byAnimal?.number ?? null,
    numberBoundToAnimalId: byNumber?.animalId ?? null,
  };
}

export async function procedureOf(
  database: DbClient,
  requestId: string,
): Promise<ChipProcedureRecord | null> {
  const [row] = await database
    .select()
    .from(chipProcedures)
    .where(eq(chipProcedures.requestId, requestId))
    .limit(1);
  return row ?? null;
}

export async function conflictsOfAnimal(
  database: DbClient,
  animalId: string,
): Promise<readonly ChipConflictRecord[]> {
  return database
    .select()
    .from(microchipConflicts)
    .where(eq(microchipConflicts.animalId, animalId))
    .orderBy(desc(microchipConflicts.createdAt));
}

/** Writes the stop down. There is no field here that could later undo it. */
async function writeConflict(
  tx: DbClient,
  actor: Actor,
  input: { animalId: string; requestId: string; kind: ConflictKind; observedNumber: string | null },
): Promise<void> {
  const [row] = await tx
    .insert(microchipConflicts)
    .values({
      animalId: input.animalId,
      requestId: input.requestId,
      reportedByAccountId: actor.accountId,
      kind: input.kind,
      observedNumber: input.observedNumber,
      detailFa: CONFLICT_KIND_FA[input.kind],
    })
    .returning();
  await recordAudit(tx, actor, {
    action: 'MICROCHIP_CONFLICT_RECORDED',
    targetType: 'ANIMAL',
    targetId: input.animalId,
    reason: CONFLICT_KIND_FA[input.kind],
    after: { kind: input.kind, requestId: input.requestId, conflictId: row?.id ?? null },
  });
}

async function upsertProcedure(
  tx: DbClient,
  request: VisitRequestRecord,
  values: Partial<typeof chipProcedures.$inferInsert>,
): Promise<ChipProcedureRecord> {
  const [existing] = await tx
    .select()
    .from(chipProcedures)
    .where(eq(chipProcedures.requestId, request.id))
    .limit(1);

  if (!existing) {
    const [row] = await tx
      .insert(chipProcedures)
      .values({
        requestId: request.id,
        animalId: request.animalId,
        vetAccountId: request.vetAccountId,
        ...values,
      })
      .returning();
    if (!row) throw conflict('ثبت مراحل میکروچیپ انجام نشد.');
    return row;
  }

  const [row] = await tx
    .update(chipProcedures)
    .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
    .where(and(eq(chipProcedures.id, existing.id), eq(chipProcedures.version, existing.version)))
    .returning();
  if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');
  return row;
}

export type ReadOutcome =
  | { readonly state: 'READY_TO_IMPLANT' }
  | { readonly state: 'CONFIRMED' }
  | { readonly state: 'BINDABLE' }
  | { readonly state: 'CONFLICT'; readonly kind: ConflictKind; readonly messageFa: string };

/**
 * The first reading — §12.1, §12.2, §12.3.
 *
 * Every method ends here with one canonical number; the method travels with it
 * for the record. The reading itself is stored even when the answer is a
 * conflict, because what was observed is part of the trail.
 */
export async function recordChipRead(
  database: Database,
  actor: Actor,
  requestId: string,
  input: { number: string; method: ChipReadMethod },
): Promise<ReadOutcome> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (request.serviceType !== 'MICROCHIP_IMPLANT' && request.serviceType !== 'MICROCHIP_VERIFICATION') {
    throw validation('این خدمت میکروچیپ نیست.');
  }
  const number = assertMicrochipNumber(input.number);
  const facts = await factsFor(database, request.animalId, number);

  return database.transaction(async (tx) => {
    await upsertProcedure(tx, request, {
      preReadNumber: number,
      preReadMethod: input.method,
      preReadAt: new Date(),
    });
    await recordAudit(tx, actor, {
      action: 'MICROCHIP_READ',
      targetType: 'VET_VISIT_REQUEST',
      targetId: request.id,
      after: { method: input.method, serviceType: request.serviceType },
    });

    if (request.serviceType === 'MICROCHIP_IMPLANT') {
      const check = implantPreCheck(facts);
      if (check.state === 'BLOCKED') {
        await writeConflict(tx, actor, {
          animalId: request.animalId,
          requestId: request.id,
          kind: check.conflict,
          observedNumber: number,
        });
        return { state: 'CONFLICT', kind: check.conflict, messageFa: CONFLICT_KIND_FA[check.conflict] };
      }
      return { state: 'READY_TO_IMPLANT' };
    }

    const outcome = verificationOutcome(number, facts);
    if (outcome.state === 'CONFLICT') {
      await writeConflict(tx, actor, {
        animalId: request.animalId,
        requestId: request.id,
        kind: outcome.conflict,
        observedNumber: number,
      });
      return { state: 'CONFLICT', kind: outcome.conflict, messageFa: CONFLICT_KIND_FA[outcome.conflict] };
    }
    return outcome.state === 'CONFIRMED' ? { state: 'CONFIRMED' } : { state: 'BINDABLE' };
  });
}

/** The physical act, recorded as its own moment (§12.2). */
export async function confirmImplant(
  database: Database,
  actor: Actor,
  requestId: string,
): Promise<ChipProcedureRecord> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (request.serviceType !== 'MICROCHIP_IMPLANT') throw validation('این خدمت کاشت میکروچیپ نیست.');
  const procedure = await procedureOf(database, requestId);
  if (!procedure?.preReadNumber) throw conflict('ابتدا سریال پیش از کاشت خوانده شود.');
  if (procedure.implantConfirmedAt) throw conflict('کاشت قبلاً ثبت شده است.');

  // Re-checked here, because time passed since the first reading.
  const facts = await factsFor(database, request.animalId, procedure.preReadNumber);
  const check = implantPreCheck(facts);
  if (check.state === 'BLOCKED') throw conflict(CONFLICT_KIND_FA[check.conflict]);

  return database.transaction(async (tx) => {
    const row = await upsertProcedure(tx, request, { implantConfirmedAt: new Date() });
    await recordAudit(tx, actor, {
      action: 'MICROCHIP_IMPLANT_CONFIRMED',
      targetType: 'VET_VISIT_REQUEST',
      targetId: request.id,
      targetVersion: row.version,
    });
    return row;
  });
}

export type BindOutcome =
  | { readonly state: 'BOUND'; readonly chip: MicrochipRecord }
  | { readonly state: 'CONFLICT'; readonly kind: ConflictKind; readonly messageFa: string };

/**
 * Binds the number to the animal, permanently.
 *
 * The insert is the decision: two visits racing on the same number, or a second
 * chip for one animal, are both refused by the database rather than by a check
 * that could have read stale rows. A refusal becomes a recorded conflict, never
 * an overwrite.
 */
async function bind(
  database: Database,
  actor: Actor,
  request: VisitRequestRecord,
  input: { number: string; method: ChipReadMethod; via: 'IMPLANT' | 'EXISTING_UNREGISTERED' },
): Promise<BindOutcome> {
  try {
    return await database.transaction(async (tx) => {
      const [chip] = await tx
        .insert(microchips)
        .values({
          animalId: request.animalId,
          number: input.number,
          boundVia: input.via,
          readMethod: input.method,
          boundByAccountId: actor.accountId,
          locationId: request.locationId,
          requestId: request.id,
        })
        .returning();
      if (!chip) throw conflict('ثبت میکروچیپ انجام نشد.');

      await upsertProcedure(tx, request, { microchipId: chip.id });
      await recordAudit(tx, actor, {
        action: 'MICROCHIP_BOUND',
        targetType: 'ANIMAL',
        targetId: request.animalId,
        after: { boundVia: input.via, requestId: request.id, chipId: chip.id },
      });
      await createNotification(tx, {
        recipientAccountId: request.ownerAccountId,
        kind: 'MICROCHIP_BOUND',
        titleFa: 'میکروچیپ حیوان شما ثبت شد',
        bodyFa: 'شماره میکروچیپ به‌صورت دائمی به همین حیوان متصل شد و دیگر تغییر نمی‌کند.',
        resume: {
          entity: { type: 'ANIMAL', id: request.animalId },
          step: 'MICROCHIP',
          originRoute: '/animals/' + request.animalId,
        },
      });
      return { state: 'BOUND', chip };
    });
  } catch (error) {
    const constraint = uniqueViolation(error);
    if (constraint === null) throw error;
    const kind: ConflictKind =
      constraint === 'microchip_animal_key' ? 'ANIMAL_HAS_OTHER_CHIP' : 'DUPLICATE_NUMBER';
    await database.transaction(async (tx) => {
      await writeConflict(tx, actor, {
        animalId: request.animalId,
        requestId: request.id,
        kind,
        observedNumber: input.number,
      });
    });
    return { state: 'CONFLICT', kind, messageFa: CONFLICT_KIND_FA[kind] };
  }
}

/**
 * The reread after implantation — §12.2.
 *
 * A serial that does not match the one read before implantation is a conflict
 * and a stop; nothing is bound on a mismatch.
 */
export async function recordRereadAndBind(
  database: Database,
  actor: Actor,
  requestId: string,
  input: { number: string; method: ChipReadMethod },
): Promise<BindOutcome> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (request.serviceType !== 'MICROCHIP_IMPLANT') throw validation('این خدمت کاشت میکروچیپ نیست.');
  const procedure = await procedureOf(database, requestId);
  if (!procedure?.implantConfirmedAt) throw conflict('ابتدا انجام کاشت ثبت شود.');
  if (procedure.microchipId) throw conflict('میکروچیپ این حیوان قبلاً ثبت شده است.');

  const number = assertMicrochipNumber(input.number);
  await database.transaction(async (tx) => {
    await upsertProcedure(tx, request, {
      postReadNumber: number,
      postReadMethod: input.method,
      postReadAt: new Date(),
    });
  });

  if (!rereadMatches(procedure.preReadNumber ?? '', number)) {
    await database.transaction(async (tx) => {
      await writeConflict(tx, actor, {
        animalId: request.animalId,
        requestId: request.id,
        kind: 'SERIAL_MISMATCH',
        observedNumber: number,
      });
    });
    return { state: 'CONFLICT', kind: 'SERIAL_MISMATCH', messageFa: CONFLICT_KIND_FA.SERIAL_MISMATCH };
  }

  return bind(database, actor, request, { number, method: input.method, via: 'IMPLANT' });
}

/**
 * A physical chip that has no record — §12.3, last row.
 *
 * It binds only after the same two checks the implant path runs: the number is
 * free and the animal has none.
 */
export async function bindExistingChip(
  database: Database,
  actor: Actor,
  requestId: string,
): Promise<BindOutcome> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (request.serviceType !== 'MICROCHIP_VERIFICATION') throw validation('این خدمت تأیید میکروچیپ نیست.');
  const procedure = await procedureOf(database, requestId);
  if (!procedure?.preReadNumber) throw conflict('ابتدا شماره میکروچیپ خوانده شود.');
  if (procedure.microchipId) throw conflict('میکروچیپ این حیوان قبلاً ثبت شده است.');

  const number = procedure.preReadNumber;
  const outcome = verificationOutcome(number, await factsFor(database, request.animalId, number));
  if (outcome.state !== 'BINDABLE') {
    if (outcome.state === 'CONFIRMED') throw conflict('این شماره از قبل به همین حیوان متصل است.');
    throw conflict(CONFLICT_KIND_FA[outcome.conflict]);
  }

  return bind(database, actor, request, {
    number,
    method: procedure.preReadMethod ?? 'MANUAL',
    via: 'EXISTING_UNREGISTERED',
  });
}

/** Is the microchip half of this visit finished? */
export async function chipWorkDone(
  database: DbClient,
  request: VisitRequestRecord,
): Promise<boolean> {
  if (request.serviceType === 'MICROCHIP_IMPLANT') {
    const procedure = await procedureOf(database, request.id);
    return procedure?.microchipId !== null && procedure?.microchipId !== undefined;
  }
  if (request.serviceType === 'MICROCHIP_VERIFICATION') {
    const [chip, procedure] = await Promise.all([
      chipOfAnimal(database, request.animalId),
      procedureOf(database, request.id),
    ]);
    // Either the read confirmed the chip already on record, or an unregistered
    // physical chip was bound during this visit.
    return chip !== null && procedure?.preReadNumber === chip.number;
  }
  return true;
}

/** The animal's own record, for the profile and the service summary. */
export async function animalChipView(database: DbClient, animalId: string) {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  return {
    animal: animal ?? null,
    chip: await chipOfAnimal(database, animalId),
    conflicts: await conflictsOfAnimal(database, animalId),
  };
}
