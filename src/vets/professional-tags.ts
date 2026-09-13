/**
 * The veterinary professional tag — Phase 2.5 PROMPT-002.
 *
 * These functions take the caller's transaction on purpose: a tag changes
 * because something else happened (a review decision, a verified payment, an
 * expiry), and if that something fails the tag must not have changed either.
 *
 * A tag is what the public reads. It is never what the server trusts: contexts
 * and operations are opened only by `account_role` (DEC-0188), so nothing here
 * reads or writes a role.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { vetProfessionalCases, vetProfiles, vetTagAssignments } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { isPracticeScope, isVetTag, tagScopeProblem, vetTagLabel, type VetPracticeScope, type VetTag } from './professional-model.ts';

export type VetTagRow = typeof vetTagAssignments.$inferSelect;

/**
 * Who may change someone's tag: the reviewer side, or the server itself (null)
 * acting on a verified event. The association admin of Phase 2.5 is the Phase 1
 * association operator (DEC-0145, DEC-0190); the Phase 2 review environment keeps
 * the cases it already reviews.
 */
const TAG_AUTHORITY_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'REVIEW_OPERATOR', 'SUPERADMIN'];

function assertTagAuthority(actor: Actor | null, accountId: string): void {
  if (actor === null) return;
  if (!TAG_AUTHORITY_CONTEXTS.includes(actor.context)) throw forbidden('Tag حرفه‌ای فقط با تصمیم بررسی‌کننده یا رویداد تأییدشده سرور تغییر می‌کند.');
  if (actor.accountId === accountId) throw forbidden('Tag حرفه‌ای حساب خودتان را نمی‌توانید تغییر دهید.');
}

const uniqueViolation = (error: unknown): boolean =>
  ((error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code) === '23505';

const TARGET = 'VET_TAG';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function currentVetTag(database: DbClient, accountId: string): Promise<VetTagRow | null> {
  const [row] = await database
    .select()
    .from(vetTagAssignments)
    .where(and(eq(vetTagAssignments.accountId, accountId), isNull(vetTagAssignments.endedAt)))
    .limit(1);
  return row ?? null;
}

/** The whole history, oldest first: for the account itself and for the reviewer side. */
export async function vetTagHistory(database: DbClient, actor: Actor, accountId: string): Promise<VetTagRow[]> {
  if (actor.accountId !== accountId && !TAG_AUTHORITY_CONTEXTS.includes(actor.context)) throw forbidden();
  return database.select().from(vetTagAssignments).where(eq(vetTagAssignments.accountId, accountId)).orderBy(asc(vetTagAssignments.startedAt), asc(vetTagAssignments.createdAt));
}

/** The current tag as the public sees it, or null. */
export async function publicVetTag(database: DbClient, accountId: string): Promise<{ tag: VetTag; labelFa: string } | null> {
  const row = await currentVetTag(database, accountId);
  return row ? { tag: row.tag, labelFa: vetTagLabel(row.tag, row.practiceScope) } : null;
}

export interface TagSource {
  readonly type: string;
  readonly id?: string | null;
}

/**
 * Serialises every tag change of one account. Two changes at once would each
 * see the same current tag; the row lock makes the second wait and then see the
 * first one's result. The unique index is the last word if anything slips past.
 */
async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  await tx.execute(sql`select id from account where id = ${accountId} for update`);
}

async function endCurrent(tx: DbClient, current: VetTagRow, actor: Actor | null, reasonFa: string, now: Date): Promise<void> {
  const [ended] = await tx
    .update(vetTagAssignments)
    .set({ endedAt: now, endReasonFa: reasonFa, endedByAccountId: actor?.accountId ?? null })
    .where(and(eq(vetTagAssignments.id, current.id), isNull(vetTagAssignments.endedAt)))
    .returning({ id: vetTagAssignments.id });
  if (!ended) throw conflict('Tag حرفه‌ای این حساب هم‌زمان تغییر کرد؛ دوباره تلاش کنید.');
}

/**
 * Makes `tag` the account's one current tag, ending the previous one. Asking for
 * the tag it already has changes nothing and returns it, so a replayed verified
 * event cannot write a second row.
 */
export async function replaceVetTag(
  tx: DbClient,
  actor: Actor | null,
  input: { accountId: string; tag: string; practiceScope: string | null; reasonFa: string; source: TagSource },
  now: Date = new Date(),
): Promise<VetTagRow> {
  assertTagAuthority(actor, input.accountId);
  if (!isVetTag(input.tag)) throw validation('Tag حرفه‌ای معتبر نیست.');
  if (input.practiceScope !== null && !isPracticeScope(input.practiceScope)) throw validation('عمومی یا متخصص بودن معتبر نیست.');
  const tag = input.tag;
  const practiceScope = input.practiceScope as VetPracticeScope | null;
  const problem = tagScopeProblem(tag, practiceScope, input.source.type);
  if (problem) throw validation(problem);
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل تغییر Tag را بنویسید.');

  await lockAccount(tx, input.accountId);
  if (tag === 'STUDENT') {
    // The student tag follows a verified student case of this very account, never a request alone (PROMPT-004).
    const caseId = input.source.type === 'VET_STUDENT_CASE' && UUID.test(input.source.id ?? '') ? input.source.id! : null;
    const [studentCase] = caseId ? await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, caseId)).limit(1) : [];
    if (!studentCase || studentCase.accountId !== input.accountId || studentCase.caseType !== 'STUDENT' || studentCase.status !== 'VERIFIED_STUDENT') {
      throw conflict('Tag دانشجو فقط از پرونده دانشجویی تأییدشده همین حساب داده می‌شود.');
    }
  } else {
    const [profile] = await tx.select({ applicantType: vetProfiles.applicantType }).from(vetProfiles).where(eq(vetProfiles.accountId, input.accountId)).limit(1);
    if (profile?.applicantType === 'STUDENT') throw conflict('دانشجوی دامپزشکی Tag دکتر، دارای پروانه یا معتمد نمی‌گیرد.');
  }
  // The licensed and trusted tags follow a payment the server verified, never a person's decision:
  // no reviewer, association admin or superadmin writes them by hand (PROMPT-007, DEC-0193).
  if ((tag === 'LICENSED' || tag === 'TRUSTED') && actor !== null) {
    throw forbidden('Tag دارای پروانه و معتمد فقط پس از پرداخت تأییدشده سرور ثبت می‌شود، نه با تصمیم دستی.');
  }
  const current = await currentVetTag(tx, input.accountId);
  if (current && current.tag === tag && current.practiceScope === practiceScope) return current;
  if (current) await endCurrent(tx, current, actor, reasonFa, now);

  let row: VetTagRow;
  try {
    [row] = (await tx
      .insert(vetTagAssignments)
      .values({
        accountId: input.accountId,
        tag,
        practiceScope,
        startedAt: now,
        sourceType: input.source.type,
        sourceId: input.source.id ?? null,
        grantedByAccountId: actor?.accountId ?? null,
      })
      .returning()) as [VetTagRow];
  } catch (error) {
    throw uniqueViolation(error) ? conflict('Tag حرفه‌ای این حساب هم‌زمان تغییر کرد؛ دوباره تلاش کنید.') : error;
  }

  await recordAudit(tx, actor, {
    action: 'VET_TAG_REPLACED',
    targetType: TARGET,
    targetId: row.id,
    before: current ? { tag: current.tag, practiceScope: current.practiceScope, assignmentId: current.id } : null,
    after: { accountId: row.accountId, tag: row.tag, practiceScope: row.practiceScope },
    reason: reasonFa,
    metadata: { sourceType: row.sourceType, sourceId: row.sourceId },
  });
  return row;
}

/** Ends the current tag without a successor — a suspension, or an expiry with nothing to fall back to. */
export async function endVetTag(
  tx: DbClient,
  actor: Actor | null,
  input: { accountId: string; reasonFa: string; source: TagSource },
  now: Date = new Date(),
): Promise<VetTagRow | null> {
  assertTagAuthority(actor, input.accountId);
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل پایان Tag را بنویسید.');
  await lockAccount(tx, input.accountId);
  const current = await currentVetTag(tx, input.accountId);
  if (!current) return null;
  await endCurrent(tx, current, actor, reasonFa, now);
  await recordAudit(tx, actor, {
    action: 'VET_TAG_ENDED',
    targetType: TARGET,
    targetId: current.id,
    before: { tag: current.tag, practiceScope: current.practiceScope },
    after: { endedAt: now.toISOString() },
    reason: reasonFa,
    metadata: { sourceType: input.source.type, sourceId: input.source.id ?? null },
  });
  return current;
}
