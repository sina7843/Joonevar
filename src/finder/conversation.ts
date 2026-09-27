/**
 * The finder conversation — PHASE-4 PROMPT-005.
 *
 * One per request, opened at preliminary acceptance, read and written by its
 * two parties only. It reuses the platform's messaging parts rather than the
 * listing thread's tables (those belong to a sale): the contact-detail policy
 * that masks phone numbers and addresses until both sides agree to reveal
 * them, private file storage for attachments, the durable rate limiter, the
 * moderation report table and the audit trail. No operator role reads a
 * conversation; a reported message reaches the moderation queue on its own.
 */
import { and, asc, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import type { Database, DbClient } from '../db/client.ts';
import { storedFiles } from '../db/schema/core.ts';
import { moderationReports } from '../db/schema/moderation.ts';
import { finderConversationBlocks, finderConversations, finderMessages } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import { applyContactPolicy } from '../marketplace/inquiry-model.ts';
import { reportInputProblems } from '../moderation/model.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderFlag } from './flags.ts';
import { assertFinderAccess, blockedBetween } from './sanctions.ts';
import type { FinderReportCategory } from './reports-model.ts';
import { BLOCKED_FA, contactsRevealed, counterpartOf, loadForParty, notifyFinder } from './requests.ts';
import { CHAT_STATUSES, type RequestStatus } from './request-model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function conversationOf(tx: DbClient, requestId: string) {
  const [row] = await tx.select().from(finderConversations).where(eq(finderConversations.requestId, requestId)).limit(1);
  return row ?? null;
}

async function blocked(tx: DbClient, conversationId: string, accountId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: finderConversationBlocks.id })
    .from(finderConversationBlocks)
    .where(and(eq(finderConversationBlocks.conversationId, conversationId), eq(finderConversationBlocks.blockerAccountId, accountId)))
    .limit(1);
  return rows.length > 0;
}

export async function postMessage(
  db: Database,
  storageRoot: string,
  actor: Actor,
  input: { requestId: string; bodyFa: string | null; file: { bytes: Uint8Array; originalName: string } | null },
  now: Date = new Date(),
) {
  await assertFinderFlag(db, 'finder.flag.chat');
  const body = input.bodyFa?.trim() ?? '';
  if (body === '' && !input.file) throw validation('پیام خالی است.');
  if (body.length > 2000) throw validation('پیام حداکثر ۲۰۰۰ نویسه است.');
  await assertWithinLimit(db, { action: 'FINDER_MESSAGE_POST', actor });
  return db.transaction(async (tx) => {
    const { request } = await loadForParty(tx, actor, input.requestId);
    if (!CHAT_STATUSES.includes(request.status as RequestStatus)) throw conflict('گفت‌وگو پس از پذیرش اولیه باز می‌شود و پس از پایان درخواست بسته است.');
    const conversation = await conversationOf(tx, request.id);
    if (!conversation) throw conflict('گفت‌وگو هنوز باز نشده است.');
    const other = counterpartOf(request, actor.accountId);
    if (await blocked(tx, conversation.id, other)) throw conflict('طرف مقابل دریافت پیام در این گفت‌وگو را بسته است.');
    // PROMPT-007: a finder-wide block and a suspension stop new messages too.
    await assertFinderAccess(tx, actor.accountId, now);
    if (await blockedBetween(tx, actor.accountId, other)) throw conflict(BLOCKED_FA);
    const policy = applyContactPolicy(body, contactsRevealed(request));
    const file = input.file
      ? await putPrivateFile(tx, storageRoot, actor, { ownerAccountId: actor.accountId, purpose: 'FINDER_MESSAGE_ATTACHMENT', bytes: input.file.bytes, originalName: input.file.originalName })
      : null;
    const [message] = await tx
      .insert(finderMessages)
      .values({ conversationId: conversation.id, senderAccountId: actor.accountId, bodyFa: body === '' ? null : policy.text, redacted: policy.redacted, fileId: file?.id ?? null, createdAt: now })
      .returning();
    await recordAudit(tx, actor, {
      action: 'FINDER_MESSAGE_POSTED',
      targetType: 'FINDER_CONVERSATION',
      targetId: conversation.id,
      after: { messageId: message!.id, redacted: policy.redacted, codes: policy.codes, attachment: file !== null },
    });
    await notifyFinder(tx, other, 'FINDER_MESSAGE_POSTED', 'پیام تازه در گفت‌وگوی جفت‌یابی', 'طرف مقابل پیام تازه‌ای فرستاده است.', request.id);
    return { message: message!, redacted: policy.redacted };
  });
}

export async function messagesOf(db: DbClient, actor: Actor, requestId: string) {
  const { request } = await loadForParty(db, actor, requestId);
  const conversation = await conversationOf(db, request.id);
  if (!conversation) return { conversation: null, messages: [], iBlocked: false };
  const messages = await db.select().from(finderMessages).where(eq(finderMessages.conversationId, conversation.id)).orderBy(asc(finderMessages.createdAt));
  return {
    conversation,
    // A hidden message keeps its place and loses its content.
    messages: messages.map((m) => (m.hiddenAt ? { ...m, bodyFa: null, fileId: null } : m)),
    iBlocked: await blocked(db, conversation.id, actor.accountId),
  };
}

export async function blockConversation(db: Database, actor: Actor, input: { requestId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const { request } = await loadForParty(tx, actor, input.requestId);
    const conversation = await conversationOf(tx, request.id);
    if (!conversation) throw conflict('گفت‌وگو هنوز باز نشده است.');
    await tx.insert(finderConversationBlocks).values({ conversationId: conversation.id, blockerAccountId: actor.accountId }).onConflictDoNothing();
    await recordAudit(tx, actor, { action: 'FINDER_CONVERSATION_BLOCKED', targetType: 'FINDER_CONVERSATION', targetId: conversation.id });
  });
}

/** A party reports the other's message; it reaches the queue (PROMPT-007) without anyone else reading the rest. */
export async function reportMessage(
  db: Database,
  actor: Actor,
  input: { messageId: string; reason: string; details: string | null; finderCategory?: FinderReportCategory | null },
  within?: (tx: DbClient, reportId: string) => Promise<void>,
): Promise<{ id: string }> {
  const problems = reportInputProblems({ reason: input.reason, details: input.details });
  if (problems.length > 0) throw validation(problems[0]!);
  if (!UUID.test(input.messageId)) throw notFound('این پیام پیدا نشد.');
  await assertWithinLimit(db, { action: 'REPORT_SUBMIT', actor });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ message: finderMessages, requestId: finderConversations.requestId })
      .from(finderMessages)
      .innerJoin(finderConversations, eq(finderConversations.id, finderMessages.conversationId))
      .where(eq(finderMessages.id, input.messageId))
      .limit(1);
    if (!row) throw notFound('این پیام پیدا نشد.');
    await loadForParty(tx, actor, row.requestId);
    if (row.message.senderAccountId === actor.accountId) throw validation('گزارش پیام خودتان ممکن نیست.');
    let id: string;
    try {
      const [created] = await tx
        .insert(moderationReports)
        .values({ targetKind: 'FINDER_MESSAGE' as never, reporterAccountId: actor.accountId, reason: input.reason as never, details: input.details?.trim() || null, finderMessageId: row.message.id, finderCategory: input.finderCategory ?? null })
        .returning({ id: moderationReports.id });
      id = created!.id;
    } catch (error) {
      if ((String(error) + String((error as { cause?: unknown }).cause ?? '')).includes('moderation_report_one_open_finder_message')) {
        throw conflict('گزارش باز شما درباره همین پیام ثبت شده است.');
      }
      throw error;
    }
    await recordAudit(tx, actor, { action: 'FINDER_MESSAGE_REPORTED', targetType: 'FINDER_MESSAGE', targetId: row.message.id, after: { reportId: id } });
    if (within) await within(tx, id);
    return { id };
  });
}

/** An attachment, to the two parties only. */
export async function attachmentFor(db: DbClient, storageRoot: string, actor: Actor, messageId: string): Promise<{ bytes: Buffer; mime: string }> {
  if (!UUID.test(messageId)) throw notFound('این فایل پیدا نشد.');
  const [row] = await db
    .select({ message: finderMessages, requestId: finderConversations.requestId, file: storedFiles })
    .from(finderMessages)
    .innerJoin(finderConversations, eq(finderConversations.id, finderMessages.conversationId))
    .innerJoin(storedFiles, eq(storedFiles.id, finderMessages.fileId))
    .where(eq(finderMessages.id, messageId))
    .limit(1);
  if (!row || row.message.hiddenAt) throw notFound('این فایل پیدا نشد.');
  await loadForParty(db, actor, row.requestId);
  return { bytes: await fs.readFile(resolveWithinRoot(storageRoot, row.file.storageKey)), mime: row.file.mime };
}
