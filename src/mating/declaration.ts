/**
 * The personal declaration — §20, §17.3, §5, §23.
 *
 * This service records one thing only: that an agreement exists outside
 * Hamzist. It stores no terms, no text, no file, no image, no signature and no
 * share, because Hamzist neither keeps the agreement nor validates nor
 * arbitrates it. It is a separate route with its own entity and its own
 * statuses, it has no payment at all, and nothing in it can produce a permit,
 * official lineage, an official confirmed mating date or a Puppy Card.
 */
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { registrationSheets } from '../db/schema/documents.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { personalDeclarations, personalNotes } from '../db/schema/declarations.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertMobile } from '../domain/identity.ts';
import { normalizePedigreeCode } from '../domain/lineage.ts';
import { parseCivilDate, todayCivil, type CivilDate } from '../domain/calendar.ts';
import type { SmsSender } from '../adapters/registry.ts';
import { NO_OFFICIAL_EFFECT_NOTE_FA, SCOPE_NOTE_FA } from '../domain/declaration-copy.ts';
import type { Actor } from '../authz/actor.ts';

export type DeclarationRecord = typeof personalDeclarations.$inferSelect;
export type PersonalNoteRecord = typeof personalNotes.$inferSelect;

export {
  DECLARATION_STATUS_FA,
  NOTE_KIND_FA,
  NO_OFFICIAL_EFFECT_NOTE_FA,
  SCOPE_NOTE_FA,
  UNVERIFIED_NOTE_FA,
} from '../domain/declaration-copy.ts';

export interface ResolvedCounterparty {
  readonly animalId: string;
  readonly animalName: string | null;
  readonly ownerAccountId: string;
  readonly ownerMobile: string;
}

/**
 * Finds the counterparty's animal by an identifier of a real record — §20.
 *
 * A hand-typed animal is never accepted: the identifier has to resolve to an
 * animal that already exists in Hamzist. A microchip number, a Pet ID and a
 * pedigree code are all accepted because an animal may legitimately have only
 * one of them — a registration sheet and a pedigree are not prerequisites here.
 */
export async function resolveCounterpartyAnimal(
  database: DbClient,
  rawIdentifier: string,
): Promise<ResolvedCounterparty> {
  const identifier = rawIdentifier.trim();
  if (identifier === '') throw validation('شناسه حیوان طرف مقابل را وارد کنید.');

  const byChip = await database
    .select({ animalId: animals.id })
    .from(microchips)
    .innerJoin(animals, eq(animals.id, microchips.animalId))
    .where(eq(microchips.number, identifier))
    .limit(1);
  const bySheet = await database
    .select({ animalId: animals.id })
    .from(registrationSheets)
    .innerJoin(animals, eq(animals.id, registrationSheets.animalId))
    .where(eq(registrationSheets.petId, identifier.toUpperCase()))
    .limit(1);
  const byPedigree = await database
    .select({ animalId: animals.id })
    .from(pedigrees)
    .innerJoin(animals, eq(animals.id, pedigrees.animalId))
    .where(eq(pedigrees.pedigreeCode, normalizePedigreeCode(identifier)))
    .limit(1);

  const animalId = byChip[0]?.animalId ?? bySheet[0]?.animalId ?? byPedigree[0]?.animalId ?? null;
  if (!animalId) throw notFound('حیوانی با این شناسه در هم‌زیست پیدا نشد.');

  const [row] = await database
    .select({
      animalId: animals.id,
      animalName: animals.name,
      ownerAccountId: animals.ownerAccountId,
      ownerMobile: accounts.mobile,
      status: animals.status,
    })
    .from(animals)
    .innerJoin(accounts, eq(accounts.id, animals.ownerAccountId))
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!row) throw notFound('حیوانی با این شناسه در هم‌زیست پیدا نشد.');
  if (row.status !== 'REGISTERED') throw validation('پرونده این حیوان هنوز کامل ثبت نشده است.');
  return row;
}

/** The initiator's own registered animals; no sheet or pedigree is required. */
export async function ownAnimals(database: DbClient, actor: Actor) {
  return database
    .select({ id: animals.id, name: animals.name, sex: animals.sex })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'REGISTERED')))
    .orderBy(desc(animals.createdAt));
}

export interface StartDeclarationInput {
  readonly ownAnimalId: string;
  readonly counterpartyIdentifier: string;
  readonly counterpartyMobile: string;
}

/**
 * Opens a declaration and invites the other person — §20.
 *
 * The prerequisites are exactly the ones the source names: approved identity,
 * an active membership and two animal records that already exist. A
 * registration sheet or a pedigree is never asked for. The invited number must
 * be the owner of the animal that was named, so an invitation cannot be sent to
 * someone unrelated to that record.
 */
export async function startDeclaration(
  database: Database,
  actor: Actor,
  input: StartDeclarationInput,
  sms: SmsSender,
): Promise<DeclarationRecord> {
  await assertEligible(database, actor.accountId, 'PERSONAL_DECLARATION');

  const mine = (await ownAnimals(database, actor)).find((row) => row.id === input.ownAnimalId);
  if (!mine) throw notFound('پرونده حیوان شما پیدا نشد.');

  const other = await resolveCounterpartyAnimal(database, input.counterpartyIdentifier);
  if (other.animalId === mine.id) throw validation('حیوان طرف مقابل نمی‌تواند همان حیوان شما باشد.');
  if (other.ownerAccountId === actor.accountId) {
    throw validation('حیوان طرف مقابل باید متعلق به شخص دیگری باشد.');
  }

  const mobile = assertMobile(input.counterpartyMobile);
  // §20 and §23.4: the invitation goes to the owner of that record, never to a
  // number someone typed next to an animal that is not theirs.
  if (mobile !== other.ownerMobile) {
    throw validation('شماره واردشده با مالک این حیوان یکی نیست؛ دعوت ارسال نشد.');
  }

  const live = await database
    .select({ id: personalDeclarations.id })
    .from(personalDeclarations)
    .where(
      and(
        eq(personalDeclarations.initiatorAnimalId, mine.id),
        eq(personalDeclarations.counterpartyAnimalId, other.animalId),
        eq(personalDeclarations.status, 'PENDING_COUNTERPARTY_CONFIRMATION'),
      ),
    );
  if (live.length > 0) throw conflict('برای این دو حیوان یک اعلام در انتظار پاسخ وجود دارد.');

  const declaration = await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(personalDeclarations)
      .values({
        initiatorAccountId: actor.accountId,
        initiatorAnimalId: mine.id,
        counterpartyAnimalId: other.animalId,
        counterpartyAccountId: other.ownerAccountId,
        invitedMobile: mobile,
      })
      .returning();
    if (!row) throw conflict('ثبت اعلام توافق انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'PERSONAL_DECLARATION_STARTED',
      targetType: 'PERSONAL_DECLARATION',
      targetId: row.id,
      after: {
        initiatorAnimalId: mine.id,
        counterpartyAnimalId: other.animalId,
        counterpartyAccountId: other.ownerAccountId,
        status: row.status,
      },
    });
    await createNotification(tx, {
      recipientAccountId: other.ownerAccountId,
      kind: 'PERSONAL_DECLARATION_INVITATION',
      titleFa: 'دعوت به تأیید وجود توافق شخصی',
      bodyFa: 'یک اعلام توافق شخصی برای حیوان شما ثبت شده است؛ تأیید یا رد وجود آن با خود شماست. ' + SCOPE_NOTE_FA,
      resume: {
        entity: { type: 'PERSONAL_DECLARATION', id: row.id },
        step: 'DECLARATION_CONFIRMATION',
        originRoute: '/declaration/' + row.id,
      },
    });
    return row;
  });

  // The product's own SMS adapter. With no provider configured it writes to the
  // development outbox and refuses to exist in production, so nothing is sent
  // to a real person while this is being built (§20, last paragraph).
  await sms.send({
    to: mobile,
    text:
      'هم‌زیست: یک اعلام توافق شخصی برای حیوان شما ثبت شده است. برای تأیید یا رد، وارد حساب خود شوید: /declaration/' +
      declaration.id,
  });
  return declaration;
}

/** Both sides may read their own declaration; nobody else can. */
export async function declarationForParty(
  database: DbClient,
  actor: Actor,
  declarationId: string,
): Promise<DeclarationRecord> {
  const [row] = await database
    .select()
    .from(personalDeclarations)
    .where(eq(personalDeclarations.id, declarationId))
    .limit(1);
  if (!row) throw notFound('اعلام توافق پیدا نشد.');
  if (row.initiatorAccountId !== actor.accountId && row.counterpartyAccountId !== actor.accountId) {
    throw notFound('اعلام توافق پیدا نشد.');
  }
  return row;
}

export async function declarationsOfActor(
  database: DbClient,
  actor: Actor,
): Promise<readonly DeclarationRecord[]> {
  return database
    .select()
    .from(personalDeclarations)
    .where(
      or(
        eq(personalDeclarations.initiatorAccountId, actor.accountId),
        eq(personalDeclarations.counterpartyAccountId, actor.accountId),
      ),
    )
    .orderBy(desc(personalDeclarations.createdAt));
}

/**
 * The counterparty's own answer — §20.
 *
 * They confirm or deny that an agreement exists, from their own session. There
 * is no signing step and no second one-time code: the sign-in code of §6 is the
 * only OTP in this path.
 */
export async function respondToDeclaration(
  database: Database,
  actor: Actor,
  declarationId: string,
  input: { confirm: boolean; reasonFa?: string | null },
): Promise<DeclarationRecord> {
  const declaration = await declarationForParty(database, actor, declarationId);
  if (declaration.counterpartyAccountId !== actor.accountId) {
    throw forbidden('پاسخ به این اعلام با طرف مقابل است.');
  }
  if (declaration.status !== 'PENDING_COUNTERPARTY_CONFIRMATION') {
    throw conflict('این اعلام در انتظار پاسخ شما نیست.');
  }
  const reason = (input.reasonFa ?? '').trim();
  if (!input.confirm && reason.length < 3) throw validation('برای رد وجود توافق، ثبت دلیل الزامی است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(personalDeclarations)
      .set({
        status: input.confirm ? 'CONFIRMED' : 'REJECTED',
        respondedAt: new Date(),
        reasonFa: input.confirm ? null : reason,
        version: declaration.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(personalDeclarations.id, declaration.id),
          eq(personalDeclarations.version, declaration.version),
        ),
      )
      .returning();
    if (!row) throw conflict('این اعلام هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: input.confirm ? 'PERSONAL_DECLARATION_CONFIRMED' : 'PERSONAL_DECLARATION_REJECTED',
      targetType: 'PERSONAL_DECLARATION',
      targetId: row.id,
      targetVersion: row.version,
      reason: input.confirm ? null : reason,
      after: { status: row.status },
    });
    await createNotification(tx, {
      recipientAccountId: declaration.initiatorAccountId,
      kind: input.confirm ? 'PERSONAL_DECLARATION_CONFIRMED' : 'PERSONAL_DECLARATION_REJECTED',
      titleFa: input.confirm ? 'وجود توافق تأیید شد' : 'وجود توافق رد شد',
      bodyFa: input.confirm ? NO_OFFICIAL_EFFECT_NOTE_FA : reason,
      resume: {
        entity: { type: 'PERSONAL_DECLARATION', id: row.id },
        step: 'DECLARATION_RESULT',
        originRoute: '/declaration/' + row.id,
      },
    });
    return row;
  });
}

/** The initiator may withdraw an invitation that has not been answered. */
export async function cancelDeclaration(
  database: Database,
  actor: Actor,
  declarationId: string,
): Promise<DeclarationRecord> {
  const declaration = await declarationForParty(database, actor, declarationId);
  if (declaration.initiatorAccountId !== actor.accountId) throw forbidden('لغو با آغازکننده است.');
  if (declaration.status !== 'PENDING_COUNTERPARTY_CONFIRMATION') {
    throw conflict('این اعلام دیگر در انتظار پاسخ نیست.');
  }

  const [row] = await database
    .update(personalDeclarations)
    .set({ status: 'CANCELLED', version: declaration.version + 1, updatedAt: new Date() })
    .where(
      and(
        eq(personalDeclarations.id, declaration.id),
        eq(personalDeclarations.version, declaration.version),
      ),
    )
    .returning();
  if (!row) throw conflict('این اعلام هم‌زمان تغییر کرده است.');
  await recordAudit(database, actor, {
    action: 'PERSONAL_DECLARATION_CANCELLED',
    targetType: 'PERSONAL_DECLARATION',
    targetId: row.id,
    targetVersion: row.version,
    after: { status: row.status },
  });
  return row;
}

// ── Personal notes ────────────────────────────────────────────────────────

export async function notesOfDeclaration(
  database: DbClient,
  declarationId: string,
): Promise<readonly PersonalNoteRecord[]> {
  return database
    .select()
    .from(personalNotes)
    .where(eq(personalNotes.declarationId, declarationId))
    .orderBy(desc(personalNotes.createdAt));
}

/**
 * An optional personal note — §17.3, §20.
 *
 * It stays UNVERIFIED and stays here: no query that feeds the official
 * cooldown, timeline, allocation or any document ever reads this table.
 */
export async function addPersonalNote(
  database: Database,
  actor: Actor,
  declarationId: string,
  input: { kind: 'MATING_DATE' | 'PREGNANCY' | 'BIRTH'; noteDate?: string | null; noteFa?: string | null },
): Promise<PersonalNoteRecord> {
  const declaration = await declarationForParty(database, actor, declarationId);
  if (declaration.status === 'REJECTED' || declaration.status === 'CANCELLED') {
    throw conflict('برای اعلام ردشده یا لغوشده یادداشتی ثبت نمی‌شود.');
  }

  let noteDate: CivilDate | null = null;
  const raw = (input.noteDate ?? '').trim();
  if (raw !== '') {
    try {
      parseCivilDate(raw);
    } catch {
      throw validation('تاریخ واردشده معتبر نیست.');
    }
    if (raw > todayCivil()) throw validation('تاریخ یادداشت نمی‌تواند در آینده باشد.');
    noteDate = raw;
  }
  if (input.kind === 'MATING_DATE' && noteDate === null) throw validation('تاریخ جفت‌گیری شخصی را وارد کنید.');

  const [row] = await database
    .insert(personalNotes)
    .values({
      declarationId,
      kind: input.kind,
      noteDate,
      noteFa: input.noteFa?.trim() || null,
      recordedByAccountId: actor.accountId,
    })
    .returning();
  if (!row) throw conflict('ثبت یادداشت انجام نشد.');

  await recordAudit(database, actor, {
    action: 'PERSONAL_NOTE_RECORDED',
    targetType: 'PERSONAL_DECLARATION',
    targetId: declarationId,
    // The status is part of the record so a later reader cannot mistake it for
    // an official confirmation.
    after: { kind: row.kind, noteDate: row.noteDate, status: 'UNVERIFIED' },
  });
  return row;
}

// ── The view ──────────────────────────────────────────────────────────────

export interface DeclarationView {
  readonly declaration: DeclarationRecord;
  readonly notes: readonly PersonalNoteRecord[];
  readonly initiatorAnimalName: string | null;
  readonly counterpartyAnimalName: string | null;
  readonly initiatorName: string;
  readonly counterpartyName: string;
  /** Only the tail of the invited number is ever shown (§23.3). */
  readonly invitedMobileTail: string;
}

const maskMobile = (mobile: string): string => '••••' + mobile.slice(-4);

export async function declarationView(
  database: DbClient,
  actor: Actor,
  declarationId: string,
): Promise<DeclarationView> {
  const declaration = await declarationForParty(database, actor, declarationId);
  const [names, people, notes] = await Promise.all([
    database
      .select({ id: animals.id, name: animals.name })
      .from(animals)
      .where(inArray(animals.id, [declaration.initiatorAnimalId, declaration.counterpartyAnimalId])),
    database
      .select({ accountId: profiles.accountId, firstName: profiles.firstName, lastName: profiles.lastName })
      .from(profiles)
      .where(inArray(profiles.accountId, [declaration.initiatorAccountId, declaration.counterpartyAccountId])),
    notesOfDeclaration(database, declarationId),
  ]);
  const person = (accountId: string) => {
    const row = people.find((item) => item.accountId === accountId);
    return row ? row.firstName + ' ' + row.lastName.trim().slice(0, 1) + '.' : '—';
  };

  return {
    declaration,
    notes,
    initiatorAnimalName: names.find((row) => row.id === declaration.initiatorAnimalId)?.name ?? null,
    counterpartyAnimalName: names.find((row) => row.id === declaration.counterpartyAnimalId)?.name ?? null,
    initiatorName: person(declaration.initiatorAccountId),
    counterpartyName: person(declaration.counterpartyAccountId),
    invitedMobileTail: maskMobile(declaration.invitedMobile),
  };
}
