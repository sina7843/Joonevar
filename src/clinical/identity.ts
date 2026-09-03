/**
 * The official identity of an animal, certified at the visit — §13, §12.5, §10.
 *
 * Everything the owner types before the visit is a declaration: nobody has seen
 * the animal yet. §13 makes the trusted veterinarian responsible for identity
 * («دامپزشک برای تأیید هویت»), and §12.5 puts the animal, its photo and its
 * identifiers in the final review the vet signs off. So the identity that ends
 * up on the registration sheet is the one the vet records in front of the
 * animal, not the one typed at home.
 *
 * Once recorded it does not change from the owner's side. §10 is explicit:
 * verified data is not rewritable from the profile form, and a correction goes
 * through the process and the actor responsible for that data. The declared
 * values are not destroyed — they stay in the audit row as `before`.
 */
import { and, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { requireOpenVisit } from './microchip.ts';

export interface OfficialIdentityInput {
  readonly name: string | null;
  readonly breedId: string;
  readonly sex: 'MALE' | 'FEMALE';
  readonly birthDate: string;
  readonly birthDateApproximate: boolean;
  readonly color: string | null;
  readonly markings: string | null;
}

const trimmed = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};

/** Whether the identity of this animal has already been certified. */
export async function identityVerified(database: DbClient, animalId: string): Promise<boolean> {
  const [row] = await database
    .select({ at: animals.identityVerifiedAt })
    .from(animals)
    .where(eq(animals.id, animalId))
    .limit(1);
  return row?.at != null;
}

/**
 * The veterinarian records what the animal actually is.
 *
 * This runs inside an open visit of the microchip path, before the chip is
 * bound: a number attached to an animal nobody has identified would be a
 * permanent link to an unverified record.
 */
export async function recordOfficialIdentity(
  database: Database,
  actor: Actor,
  requestId: string,
  input: OfficialIdentityInput,
): Promise<void> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (request.context !== 'MICROCHIP') {
    throw validation('ثبت هویت رسمی فقط در مسیر میکروچیپ انجام می‌شود.');
  }

  const [animal] = await database.select().from(animals).where(eq(animals.id, request.animalId)).limit(1);
  if (!animal) throw notFound('پرونده حیوان پیدا نشد.');
  if (animal.identityVerifiedAt !== null) {
    throw conflict('هویت رسمی این حیوان قبلاً ثبت شده است و تغییر نمی‌کند.');
  }

  const [breed] = await database
    .select({ id: referenceBreeds.id })
    .from(referenceBreeds)
    .where(eq(referenceBreeds.id, input.breedId))
    .limit(1);
  if (!breed) throw validation('نژاد انتخاب‌شده معتبر نیست.');

  if (input.sex !== 'MALE' && input.sex !== 'FEMALE') throw validation('جنسیت را انتخاب کنید.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw validation('تاریخ تولد را کامل وارد کنید.');
  // Nothing here is optional (DEC-0136): a certification with blanks in it
  // certifies nothing. The photo is the one exception, and it is not part of
  // what the veterinarian attests to.
  const name = trimmed(input.name);
  if (name === null) throw validation('نام حیوان را وارد کنید.');
  if (name.length > 60) throw validation('نام حیوان بیش از حد طولانی است.');
  const color = trimmed(input.color);
  if (color === null) throw validation('رنگ حیوان را وارد کنید.');
  const markings = trimmed(input.markings);
  if (markings === null) {
    throw validation('نشانه‌های ظاهری را وارد کنید؛ اگر نشانه‌ای ندارد، همین را بنویسید.');
  }

  await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animals)
      .set({
        name,
        breedId: input.breedId,
        sex: input.sex,
        birthDate: input.birthDate,
        birthDateApproximate: input.birthDateApproximate,
        color,
        markings,
        identityVerifiedAt: new Date(),
        identityVerifiedByAccountId: actor.accountId,
        identityVerifiedRequestId: request.id,
        version: animal.version + 1,
        updatedAt: new Date(),
      })
      // The version guard is the race arbiter: two desks cannot both certify.
      .where(and(eq(animals.id, animal.id), eq(animals.version, animal.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_IDENTITY_VERIFIED',
      targetType: 'ANIMAL',
      targetId: animal.id,
      targetVersion: updated.version,
      // What the owner had declared is kept here, not overwritten into nothing.
      before: {
        name: animal.name,
        breedId: animal.breedId,
        sex: animal.sex,
        birthDate: animal.birthDate,
        birthDateApproximate: animal.birthDateApproximate,
        color: animal.color,
        markings: animal.markings,
      },
      after: {
        name: updated.name,
        breedId: updated.breedId,
        sex: updated.sex,
        birthDate: updated.birthDate,
        birthDateApproximate: updated.birthDateApproximate,
        color: updated.color,
        markings: updated.markings,
        requestId: request.id,
      },
    });

    await createNotification(tx, {
      recipientAccountId: animal.ownerAccountId,
      kind: 'ANIMAL_IDENTITY_VERIFIED',
      titleFa: 'هویت رسمی حیوان ثبت شد',
      bodyFa:
        'دامپزشک معتمد مشخصات رسمی این حیوان را در محل ثبت کرد. این مشخصات از فرم پروفایل تغییر نمی‌کنند؛ اصلاح آن‌ها از همان مسیر و توسط همان مسئول انجام می‌شود.',
      resume: { entity: { type: 'ANIMAL', id: animal.id }, step: 'VIEW', originRoute: '/animals/' + animal.id },
    });
  });
}
