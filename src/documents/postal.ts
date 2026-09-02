/**
 * Postal requests — §14.6, D17.
 *
 * Phase one captures the request and confirms it was recorded. There is no
 * carrier integration, no tariff, no label, no tracking number and no delivery
 * state, so nothing here can be read as an actual dispatch. The request is tied
 * to a document that has really been issued to this person.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { residences } from '../db/schema/identity.ts';
import { postalRequests } from '../db/schema/pedigree.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { pedigreeForOwner } from './pedigree.ts';
import { sheetForOwner } from './registration-sheet.ts';
import type { Actor } from '../authz/actor.ts';

export type PostalRequestRecord = typeof postalRequests.$inferSelect;
export type PostalDocumentType = 'REGISTRATION_SHEET' | 'PEDIGREE';

export const POSTAL_DOCUMENT_FA: Record<PostalDocumentType, string> = {
  REGISTRATION_SHEET: 'برگه ثبتی',
  PEDIGREE: 'شجره‌نامه',
};

export interface PostalInput {
  readonly documentType: PostalDocumentType;
  readonly documentId: string;
  readonly recipientNameFa: string;
  readonly recipientPhone: string;
  readonly provinceFa?: string | null;
  readonly cityFa?: string | null;
  readonly addressFa: string;
  readonly postalCode?: string | null;
  readonly noteFa?: string | null;
}

const trimmed = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

/**
 * The address the person may prefill from — §14.6.
 *
 * A residence left empty at KYC time is fine (§6.2); it just means there is
 * nothing to prefill, never that this request is blocked.
 */
export async function savedAddress(database: DbClient, accountId: string) {
  const [row] = await database.select().from(residences).where(eq(residences.accountId, accountId)).limit(1);
  return row ?? null;
}

export async function createPostalRequest(
  database: Database,
  actor: Actor,
  input: PostalInput,
): Promise<PostalRequestRecord> {
  // The document has to exist and belong to this person before anything is
  // recorded; both lookups already answer "not found" for somebody else's.
  if (input.documentType === 'PEDIGREE') await pedigreeForOwner(database, actor, input.documentId);
  else await sheetForOwner(database, actor, input.documentId);

  const recipient = trimmed(input.recipientNameFa);
  const phone = trimmed(input.recipientPhone);
  const address = trimmed(input.addressFa);
  if (!recipient) throw validation('نام گیرنده لازم است.');
  if (!phone) throw validation('شماره تماس گیرنده لازم است.');
  if (!address) throw validation('نشانی گیرنده لازم است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(postalRequests)
      .values({
        ownerAccountId: actor.accountId,
        documentType: input.documentType,
        documentId: input.documentId,
        recipientNameFa: recipient,
        recipientPhone: phone,
        provinceFa: trimmed(input.provinceFa),
        cityFa: trimmed(input.cityFa),
        addressFa: address,
        postalCode: trimmed(input.postalCode),
        noteFa: trimmed(input.noteFa),
      })
      .returning();
    if (!row) throw conflict('ثبت درخواست ارسال انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'POSTAL_REQUEST_SUBMITTED',
      targetType: 'POSTAL_REQUEST',
      targetId: row.id,
      after: { documentType: row.documentType, documentId: row.documentId },
    });
    await createNotification(tx, {
      recipientAccountId: actor.accountId,
      kind: 'POSTAL_REQUEST_SUBMITTED',
      titleFa: 'درخواست ارسال پستی ثبت شد',
      bodyFa:
        'درخواست ارسال ' +
        POSTAL_DOCUMENT_FA[input.documentType] +
        ' ثبت شد. ثبت درخواست به معنی ارسال واقعی سند نیست.',
      resume: {
        entity: { type: 'POSTAL_REQUEST', id: row.id },
        step: 'POSTAL',
        originRoute: '/documents/postal/' + row.id,
      },
    });
    return row;
  });
}

export async function postalRequestsOfOwner(
  database: DbClient,
  actor: Actor,
): Promise<readonly PostalRequestRecord[]> {
  return database
    .select()
    .from(postalRequests)
    .where(eq(postalRequests.ownerAccountId, actor.accountId))
    .orderBy(desc(postalRequests.createdAt));
}

export async function ownerPostalRequest(
  database: DbClient,
  actor: Actor,
  id: string,
): Promise<PostalRequestRecord> {
  const [row] = await database.select().from(postalRequests).where(eq(postalRequests.id, id)).limit(1);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('درخواست ارسال پیدا نشد.');
  return row;
}

export async function postalRequestsForDocument(
  database: DbClient,
  actor: Actor,
  documentType: PostalDocumentType,
  documentId: string,
): Promise<readonly PostalRequestRecord[]> {
  return database
    .select()
    .from(postalRequests)
    .where(
      and(
        eq(postalRequests.ownerAccountId, actor.accountId),
        eq(postalRequests.documentType, documentType),
        eq(postalRequests.documentId, documentId),
      ),
    )
    .orderBy(desc(postalRequests.createdAt));
}
