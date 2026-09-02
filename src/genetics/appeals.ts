/**
 * Appeals against a Parentage Result — §14.5, D19.
 *
 * The appeal is filed inside Hamzist from the exact result and animal, goes to
 * the same fixed centre, and is answered there. It is not permission to edit
 * the official result: a correction is a new result version, and the disputed
 * result stays in the record with the appeal attached to it.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { parentageResults } from '../db/schema/genetics.ts';
import { parentageAppeals } from '../db/schema/pedigree.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { noticeCorrectedResult } from '../documents/pedigree.ts';
import type { Actor } from '../authz/actor.ts';

export type AppealRecord = typeof parentageAppeals.$inferSelect;

export const APPEAL_STATUS_FA: Record<string, string> = {
  SUBMITTED: 'ثبت‌شده',
  UNDER_REVIEW: 'در حال بررسی مرکز ژنتیک',
  ANSWERED: 'پاسخ داده شد',
};

function assertCentre(actor: Actor): void {
  if (actor.context !== 'GENETICS_OPERATOR') throw forbidden('این عملیات فقط در محیط مرکز ژنتیک انجام می‌شود.');
}

/**
 * Files an appeal from the result the owner is looking at.
 *
 * There is no fee and no deadline here, because the source defines neither and
 * neither is invented. Filing an appeal does not delete the sample or the
 * result, and it does not start a resampling by itself.
 */
export async function submitAppeal(
  database: Database,
  actor: Actor,
  input: { resultId: string; messageFa: string },
): Promise<AppealRecord> {
  const message = input.messageFa.trim();
  if (message.length < 10) throw validation('متن اعتراض را کامل‌تر بنویسید.');

  const [result] = await database
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.id, input.resultId))
    .limit(1);
  if (!result) throw notFound('نتیجه پیدا نشد.');

  const [animal] = await database.select().from(animals).where(eq(animals.id, result.animalId)).limit(1);
  if (!animal || animal.ownerAccountId !== actor.accountId) throw notFound('نتیجه پیدا نشد.');

  const open = await database
    .select({ id: parentageAppeals.id })
    .from(parentageAppeals)
    .where(
      and(
        eq(parentageAppeals.resultId, input.resultId),
        inArray(parentageAppeals.status, ['SUBMITTED', 'UNDER_REVIEW']),
      ),
    );
  if (open.length > 0) throw conflict('برای این نتیجه اعتراض بازی ثبت شده است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(parentageAppeals)
      .values({
        resultId: result.id,
        animalId: result.animalId,
        ownerAccountId: actor.accountId,
        messageFa: message,
      })
      .returning();
    if (!row) throw conflict('ثبت اعتراض انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'PARENTAGE_APPEAL_SUBMITTED',
      targetType: 'PARENTAGE_RESULT',
      targetId: result.id,
      after: { appealId: row.id, animalId: result.animalId },
    });
    return row;
  });
}

export async function appealsOfOwner(database: DbClient, actor: Actor): Promise<readonly AppealRecord[]> {
  return database
    .select()
    .from(parentageAppeals)
    .where(eq(parentageAppeals.ownerAccountId, actor.accountId))
    .orderBy(desc(parentageAppeals.createdAt));
}

export async function appealsOfAnimal(
  database: DbClient,
  animalId: string,
): Promise<readonly AppealRecord[]> {
  return database
    .select()
    .from(parentageAppeals)
    .where(eq(parentageAppeals.animalId, animalId))
    .orderBy(desc(parentageAppeals.createdAt));
}

export async function ownerAppeal(
  database: DbClient,
  actor: Actor,
  id: string,
): Promise<AppealRecord> {
  const [row] = await database.select().from(parentageAppeals).where(eq(parentageAppeals.id, id)).limit(1);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('اعتراض پیدا نشد.');
  return row;
}

export async function appealQueue(database: DbClient, actor: Actor): Promise<readonly AppealRecord[]> {
  assertCentre(actor);
  return database
    .select()
    .from(parentageAppeals)
    .where(inArray(parentageAppeals.status, ['SUBMITTED', 'UNDER_REVIEW']))
    .orderBy(parentageAppeals.createdAt);
}

export async function findAppeal(database: DbClient, id: string): Promise<AppealRecord | null> {
  const [row] = await database.select().from(parentageAppeals).where(eq(parentageAppeals.id, id)).limit(1);
  return row ?? null;
}

/** The centre takes the appeal into review, so the owner sees it moved. */
export async function takeAppeal(database: Database, actor: Actor, id: string): Promise<AppealRecord> {
  assertCentre(actor);
  const current = await findAppeal(database, id);
  if (!current) throw notFound('اعتراض پیدا نشد.');
  if (current.status !== 'SUBMITTED') throw conflict('این اعتراض در وضعیت ثبت‌شده نیست.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(parentageAppeals)
      .set({ status: 'UNDER_REVIEW', version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(parentageAppeals.id, id), eq(parentageAppeals.version, current.version)))
      .returning();
    if (!row) throw conflict('این اعتراض هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'PARENTAGE_APPEAL_TAKEN',
      targetType: 'PARENTAGE_APPEAL',
      targetId: id,
      after: { status: 'UNDER_REVIEW' },
    });
    await createNotification(tx, {
      recipientAccountId: current.ownerAccountId,
      kind: 'PARENTAGE_APPEAL_UNDER_REVIEW',
      titleFa: 'اعتراض شما در حال بررسی است',
      bodyFa: 'مرکز ژنتیک اعتراض را در دست بررسی گرفت؛ پاسخ در همین پرونده ثبت می‌شود.',
      resume: {
        entity: { type: 'PARENTAGE_APPEAL', id },
        step: 'APPEAL',
        originRoute: '/pedigree/appeals/' + id,
      },
    });
    return row;
  });
}

export interface AppealAnswer {
  readonly appealId: string;
  readonly responseFa: string;
  /** When the centre concludes the result needs correcting (§14.5). */
  readonly correctResult?: { readonly technicalNoteFa?: string | null };
  readonly expectedVersion?: number;
}

/**
 * The centre's answer — §14.5.
 *
 * A correction is a **new version** of the same result. The disputed version
 * stays exactly where it was, linked to the appeal, and an already issued
 * document is left untouched with a notice beside it (§19, D17-adjacent
 * conservatism). Nothing here revokes anything.
 */
export async function answerAppeal(
  database: Database,
  actor: Actor,
  input: AppealAnswer,
): Promise<AppealRecord> {
  assertCentre(actor);
  const response = input.responseFa.trim();
  if (response.length < 3) throw validation('ثبت پاسخ الزامی است.');

  const current = await findAppeal(database, input.appealId);
  if (!current) throw notFound('اعتراض پیدا نشد.');
  if (current.status === 'ANSWERED') throw conflict('این اعتراض قبلاً پاسخ داده شده است.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw versionStale(input.expectedVersion, current.version);
  }

  const [disputed] = await database
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.id, current.resultId))
    .limit(1);
  if (!disputed) throw notFound('نتیجه مورد اعتراض پیدا نشد.');

  return database.transaction(async (tx) => {
    let correctedResultId: string | null = null;

    if (input.correctResult) {
      const [latest] = await tx
        .select()
        .from(parentageResults)
        .where(eq(parentageResults.animalId, current.animalId))
        .orderBy(desc(parentageResults.resultVersion))
        .limit(1);
      const [corrected] = await tx
        .insert(parentageResults)
        .values({
          animalId: current.animalId,
          sampleId: disputed.sampleId,
          status: disputed.status,
          resultVersion: (latest?.resultVersion ?? disputed.resultVersion) + 1,
          supersedesResultId: disputed.id,
          sireResultId: disputed.sireResultId,
          damResultId: disputed.damResultId,
          technicalNoteFa: input.correctResult.technicalNoteFa?.trim() || null,
          recordedByAccountId: actor.accountId,
          processedAt: new Date(),
          finalisedAt: disputed.status === 'FINAL' ? new Date() : null,
        })
        .returning();
      if (!corrected) throw conflict('ثبت نتیجه اصلاحی انجام نشد.');
      correctedResultId = corrected.id;

      await recordAudit(tx, actor, {
        action: 'PARENTAGE_RESULT_CORRECTED',
        targetType: 'ANIMAL',
        targetId: current.animalId,
        before: { resultId: disputed.id, resultVersion: disputed.resultVersion },
        after: { resultId: corrected.id, resultVersion: corrected.resultVersion, appealId: current.id },
      });
      // An already issued document keeps its own bytes and provenance.
      await noticeCorrectedResult(tx, current.animalId, corrected.resultVersion);
    }

    const [row] = await tx
      .update(parentageAppeals)
      .set({
        status: 'ANSWERED',
        responseFa: response,
        correctedResultId,
        reviewedByAccountId: actor.accountId,
        reviewedAt: new Date(),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(parentageAppeals.id, current.id), eq(parentageAppeals.version, current.version)))
      .returning();
    if (!row) throw conflict('این اعتراض هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'PARENTAGE_APPEAL_ANSWERED',
      targetType: 'PARENTAGE_APPEAL',
      targetId: current.id,
      after: { correctedResultId, disputedResultId: disputed.id },
    });
    await createNotification(tx, {
      recipientAccountId: current.ownerAccountId,
      kind: 'PARENTAGE_APPEAL_ANSWERED',
      titleFa: 'پاسخ مرکز ژنتیک به اعتراض شما',
      bodyFa: correctedResultId
        ? response + ' نتیجه اصلاحی به‌صورت نسخه جدید ثبت شد و نتیجه قبلی در سابقه می‌ماند.'
        : response,
      resume: {
        entity: { type: 'PARENTAGE_APPEAL', id: current.id },
        step: 'APPEAL',
        originRoute: '/pedigree/appeals/' + current.id,
      },
    });
    return row;
  });
}
