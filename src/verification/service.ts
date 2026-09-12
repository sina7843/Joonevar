/**
 * Document verification — Requirements-Phase-2 §17 (PROMPT-014).
 *
 * The answer is read from the Phase 1 documents themselves: no public copy of a
 * document is kept, so nothing here can drift from what was issued. The only
 * row this module writes is an attempt, which exists to limit guessing.
 */
import { createHash } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { registrationSheets } from '../db/schema/documents.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { puppyCards } from '../db/schema/breeding.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds, species } from '../db/schema/core.ts';
import { verificationAttempts } from '../db/schema/verification.ts';
import { readInt } from '../settings/service.ts';
import { validation } from '../domain/errors.ts';
import {
  DOCUMENT_KIND_FA,
  publicAnimalFacts,
  readCode,
  type DocumentKind,
  type PublicAnimalFacts,
  type VerificationState,
} from './model.ts';

export const VERIFICATION_LIMIT_KEY = 'verification.attempt_hourly_limit';

/** The forwarded address, hashed: the log counts tries, it does not track people. */
export function clientKeyOf(forwarded: string | null): string {
  const first = (forwarded ?? '').split(',')[0]?.trim() ?? '';
  return createHash('sha256').update(first === '' ? 'unknown' : first).digest('hex');
}

export interface VerificationAnswer {
  readonly state: VerificationState;
  readonly kindFa: string | null;
  readonly code: string | null;
  readonly issuedAt: Date | null;
  readonly animal: PublicAnimalFacts | null;
  /** Why a document is no longer the current one, where a notice exists. */
  readonly noticeFa: string | null;
}

const EMPTY = (state: VerificationState, code: string | null = null): VerificationAnswer => ({
  state,
  kindFa: null,
  code,
  issuedAt: null,
  animal: null,
  noticeFa: null,
});

async function animalFacts(database: DbClient, animalId: string): Promise<PublicAnimalFacts> {
  const [row] = await database
    .select({
      sex: animals.sex,
      birthDate: animals.birthDate,
      speciesFa: species.nameFa,
      breedFa: referenceBreeds.nameFa,
    })
    .from(animals)
    .leftJoin(species, eq(species.code, animals.species))
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(eq(animals.id, animalId))
    .limit(1);
  return publicAnimalFacts({
    speciesFa: row?.speciesFa ?? null,
    breedFa: row?.breedFa ?? null,
    sex: row?.sex ?? null,
    birthDate: row?.birthDate ?? null,
  });
}

async function lookup(
  database: DbClient,
  shape: { kind: DocumentKind; byPetId: boolean; code: string },
): Promise<VerificationAnswer> {
  if (shape.kind === 'REGISTRATION_SHEET') {
    const [sheet] = await database
      .select()
      .from(registrationSheets)
      .where(shape.byPetId ? eq(registrationSheets.petId, shape.code) : eq(registrationSheets.sheetNo, shape.code))
      .limit(1);
    if (!sheet) return EMPTY('NOT_FOUND', shape.code);
    return {
      state: 'VALID',
      kindFa: DOCUMENT_KIND_FA.REGISTRATION_SHEET,
      // The answer names the document, whichever of its two codes was asked for.
      code: sheet.sheetNo,
      issuedAt: sheet.issuedAt,
      animal: await animalFacts(database, sheet.animalId),
      noticeFa: null,
    };
  }

  if (shape.kind === 'PEDIGREE') {
    const [pedigree] = await database.select().from(pedigrees).where(eq(pedigrees.pedigreeCode, shape.code)).limit(1);
    if (!pedigree) return EMPTY('NOT_FOUND', shape.code);
    // A later corrected parentage result supersedes what this document stated.
    const replaced = pedigree.correctionNoticeFa !== null;
    return {
      state: replaced ? 'REPLACED' : 'VALID',
      kindFa: DOCUMENT_KIND_FA.PEDIGREE,
      code: pedigree.pedigreeCode,
      issuedAt: pedigree.issuedAt,
      animal: await animalFacts(database, pedigree.animalId),
      noticeFa: pedigree.correctionNoticeFa,
    };
  }

  const [card] = await database.select().from(puppyCards).where(eq(puppyCards.cardNo, shape.code)).limit(1);
  if (!card) return EMPTY('NOT_FOUND', shape.code);
  return {
    state: 'VALID',
    kindFa: DOCUMENT_KIND_FA.PUPPY_CARD,
    code: card.cardNo,
    issuedAt: card.issuedAt,
    // A puppy card belongs to a puppy inside a litter, not to a registered
    // animal, so there is no animal record to describe here.
    animal: null,
    noticeFa: null,
  };
}

/**
 * Answer one verification, and record the attempt.
 *
 * Repeated attempts from one place are limited by a managed ceiling (§17): past
 * it, the answer says so instead of telling a guesser whether a code exists.
 */
export async function verifyDocument(
  database: Database,
  input: { code: string; clientKey: string },
  now: Date = new Date(),
): Promise<VerificationAnswer> {
  const shape = readCode(input.code);
  if (input.code.trim() === '') throw validation('کد سند را بنویسید.');

  const limit = await readInt(database, VERIFICATION_LIMIT_KEY);
  const since = new Date(now.getTime() - 3_600_000);
  const [recent] = await database
    .select({ value: count() })
    .from(verificationAttempts)
    .where(and(eq(verificationAttempts.clientKey, input.clientKey), gte(verificationAttempts.createdAt, since)));

  if (Number(recent?.value ?? 0) >= limit) {
    await database
      .insert(verificationAttempts)
      .values({ clientKey: input.clientKey, code: shape?.code ?? '', outcome: 'RATE_LIMITED', createdAt: now });
    return EMPTY('RATE_LIMITED', shape?.code ?? null);
  }

  const answer = shape === null ? EMPTY('NOT_FOUND') : await lookup(database, shape);
  await database
    .insert(verificationAttempts)
    .values({ clientKey: input.clientKey, code: shape?.code ?? '', outcome: answer.state, createdAt: now });
  return answer;
}
