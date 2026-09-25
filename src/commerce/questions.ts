/**
 * Questions asked in public — PROMPT-012.
 *
 * Shown only after a moderator has looked, because a public question is
 * exactly where somebody writes a telephone number for strangers to read.
 * The shop answers; the answer is part of the record and cannot be quietly
 * replaced, because a question whose answer changes is a different question.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { questions } from '../db/schema/trust.ts';
import { commerceProducts } from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import { applyContactPolicy } from '../marketplace/inquiry-model.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability } from './sellers.ts';

export type QuestionRow = typeof questions.$inferSelect;

/**
 * Ask something, of a shop or about a product.
 *
 * The same contact policy the transaction chat uses runs over the text, for
 * the same reason and with the same honesty about it: what it catches is
 * replaced and logged, and nothing here claims it catches everything.
 */
export async function askQuestion(
  database: Database,
  actor: Actor,
  input: { sellerId?: string | null; productId?: string | null; bodyFa: string },
): Promise<QuestionRow> {
  if (!actor.accountId) throw forbidden('برای پرسیدن باید وارد حساب شوید.');
  const bodyFa = input.bodyFa.trim();
  if (bodyFa.length < 5) throw validation('پرسش را کامل‌تر بنویسید.');
  if (bodyFa.length > 600) throw validation('پرسش طولانی‌تر از حد مجاز است.');

  const sellerId = input.sellerId ?? null;
  const productId = input.productId ?? null;
  if ((sellerId === null) === (productId === null)) {
    throw validation('پرسش یا درباره یک فروشگاه است یا درباره یک کالا.');
  }
  if (sellerId !== null) {
    const [seller] = await database
      .select({ status: commerceSellers.status })
      .from(commerceSellers)
      .where(eq(commerceSellers.id, sellerId))
      .limit(1);
    if (!seller) throw notFound('این فروشگاه پیدا نشد.');
  }
  if (productId !== null) {
    const [product] = await database
      .select({ status: commerceProducts.status })
      .from(commerceProducts)
      .where(eq(commerceProducts.id, productId))
      .limit(1);
    if (!product || product.status !== 'PUBLISHED') throw notFound('این کالا پیدا نشد.');
  }

  const policy = applyContactPolicy(bodyFa, false);
  const [row] = await database
    .insert(questions)
    .values({ sellerId, productId, subject: sellerId ? 'SELLER' : 'PRODUCT', askedByAccountId: actor.accountId, bodyFa: policy.text })
    .returning();

  await recordAudit(database, actor, {
    action: 'COMMERCE_QUESTION_ASKED',
    targetType: sellerId ? 'COMMERCE_SELLER' : 'COMMERCE_PRODUCT',
    targetId: (sellerId ?? productId)!,
    after: { questionId: row!.id, redacted: policy.redacted, codes: policy.codes },
  });
  return row!;
}

/** A moderator decides whether it may be shown at all. */
export async function decideQuestion(
  database: Database,
  actor: Actor,
  input: { questionId: string; to: 'PUBLISHED' | 'REJECTED'; reasonFa: string },
): Promise<QuestionRow> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const reasonFa = input.reasonFa.trim();
  if (input.to === 'REJECTED' && reasonFa.length < 5) throw validation('دلیل رد کردن را بنویسید.');
  const row = await loadQuestion(database, input.questionId);
  if (row.status !== 'PENDING') throw conflict('این پرسش پیش از این بررسی شده است.');

  const [updated] = await database
    .update(questions)
    .set({
      status: input.to,
      decisionReasonFa: reasonFa || null,
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(questions.id, row.id), eq(questions.version, row.version)))
    .returning();
  if (!updated) throw conflict('این پرسش در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_QUESTION_DECIDED',
    targetType: 'COMMERCE_QUESTION',
    targetId: row.id,
    targetVersion: row.version + 1,
    before: { status: row.status },
    after: { status: input.to, reasonFa: reasonFa || null },
  });
  return updated;
}

/** The shop answers. One answer, kept, because a replaced one is a different question. */
export async function answerQuestion(
  database: Database,
  actor: Actor,
  input: { questionId: string; answerFa: string },
): Promise<QuestionRow> {
  const answerFa = input.answerFa.trim();
  if (answerFa.length < 5) throw validation('پاسخ را کامل‌تر بنویسید.');
  const row = await loadQuestion(database, input.questionId);
  if (row.status !== 'PUBLISHED') throw conflict('تا تأیید پرسش، پاسخ ثبت نمی‌شود.');
  if (row.answerFa !== null) throw conflict('برای این پرسش پاسخی ثبت شده است.');

  const sellerId = row.sellerId ?? (await sellerOfProduct(database, row.productId!));
  if (sellerId === null) throw notFound('این پرسش پیدا نشد.');
  await assertSellerCapability(database, actor, sellerId, 'STORE_OPERATE');

  const policy = applyContactPolicy(answerFa, false);
  const [updated] = await database
    .update(questions)
    .set({
      status: 'ANSWERED',
      answerFa: policy.text,
      answeredByAccountId: actor.accountId,
      answeredAt: new Date(),
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(questions.id, row.id), eq(questions.version, row.version)))
    .returning();
  if (!updated) throw conflict('این پرسش در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await createNotification(database, {
    recipientAccountId: row.askedByAccountId,
    kind: 'COMMERCE_QUESTION_ANSWERED',
    titleFa: 'به پرسش شما پاسخ داده شد',
    bodyFa: policy.text.slice(0, 120),
    resume: {
      entity: { type: 'COMMERCE_QUESTION', id: row.id },
      step: 'ANSWER',
      originRoute: row.productId ? '/shop' : '/shop',
    },
  });
  return updated;
}

/** Which shop owns the offer behind a product, for a product question. */
async function sellerOfProduct(database: DbClient, productId: string): Promise<string | null> {
  const { sellerOffers } = await import('../db/schema/catalog.ts');
  const [row] = await database
    .select({ sellerId: sellerOffers.sellerId })
    .from(sellerOffers)
    .where(and(eq(sellerOffers.productId, productId), eq(sellerOffers.status, 'ACTIVE')))
    .limit(1);
  return row?.sellerId ?? null;
}

export async function loadQuestion(database: DbClient, questionId: string): Promise<QuestionRow> {
  const [row] = await database.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!row) throw notFound('این پرسش پیدا نشد.');
  return row;
}

/** What the public reads: published and answered ones, never the pending. */
export async function questionsOfProduct(database: DbClient, productId: string) {
  return database
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.productId, productId),
        // A pending question is not public, and a rejected one never becomes so.
        eq(questions.status, 'ANSWERED'),
      ),
    )
    .orderBy(desc(questions.answeredAt))
    .limit(30);
}

/** What one shop still has to answer. */
export async function questionsOfSeller(database: Database, actor: Actor, sellerId: string) {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  const { sellerOffers } = await import('../db/schema/catalog.ts');
  const own = await database
    .select({ productId: sellerOffers.productId })
    .from(sellerOffers)
    .where(eq(sellerOffers.sellerId, sellerId));
  const productIds = own.map((row) => row.productId);

  const rows = await database
    .select({ question: questions, productNameFa: commerceProducts.nameFa })
    .from(questions)
    .leftJoin(commerceProducts, eq(commerceProducts.id, questions.productId))
    .orderBy(desc(questions.createdAt))
    .limit(100);

  return rows
    .filter(
      (row) =>
        row.question.sellerId === sellerId ||
        (row.question.productId !== null && productIds.includes(row.question.productId)),
    )
    .filter((row) => row.question.status !== 'PENDING' && row.question.status !== 'REJECTED')
    .map((row) => ({ row: row.question, productNameFa: row.productNameFa }));
}

/** The moderator's queue: what nobody has looked at yet. */
export async function questionQueue(database: Database, actor: Actor) {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  return database
    .select({ question: questions, productNameFa: commerceProducts.nameFa, sellerNameFa: commerceSellers.displayNameFa })
    .from(questions)
    .leftJoin(commerceProducts, eq(commerceProducts.id, questions.productId))
    .leftJoin(commerceSellers, eq(commerceSellers.id, questions.sellerId))
    .where(eq(questions.status, 'PENDING'))
    .orderBy(questions.createdAt)
    .limit(50);
}
