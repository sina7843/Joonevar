/**
 * Becoming a seller of goods — PROMPT-008.
 *
 * The shape of this module is the shape of the promise it has to keep: a store
 * is a tenant, and everything anybody does here is scoped to one of them.
 * There is no global "shop staff" role, so there is nothing to leak between
 * stores; membership of one store is asked about that store, every time.
 *
 * Two things it deliberately does not do. It does not decide which licence a
 * business must legally hold — the field records what the applicant has, and a
 * requirement is enforced only where an operator has recorded one. And it does
 * not verify a bank account: `ibanVerifiedAt` means a reviewer read the proof
 * and said so, with their name on it.
 */
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { commerceSellers, sellerDocuments, sellerMembers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { violates } from '../db/constraint.ts';
import { findCase } from '../identity/kyc.ts';
import { putPrivateFile, safeOriginalName } from '../files/storage.ts';
import { readMoney, readSetting, readText } from '../settings/service.ts';
import { resumeContext } from '../domain/resume-context.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from '../marketplace/model.ts';
import { assertFlagEnabled } from '../marketplace/flags.ts';
import {
  canMoveSeller,
  isIbanShape,
  isSellerEditable,
  maskIban,
  normaliseIban,
  roleAllows,
  submissionBlockers,
  APPLICABLE_KINDS,
  SELLER_STATUS_FA,
  type SellerCapability,
  type SellerFormFacts,
  type SellerKind,
  type SellerRole,
  type SellerStatus,
} from './seller-model.ts';

export type SellerRow = typeof commerceSellers.$inferSelect;
export type SellerMemberRow = typeof sellerMembers.$inferSelect;
export type SellerDocumentRow = typeof sellerDocuments.$inferSelect;

export const AGREEMENT_VERSION_KEY = 'market.shop.seller_agreement_version';
export const LICENCE_REQUIRED_KEY = 'market.shop.licence_required';
export const PLATFORM_SELLER_SLUG = 'hamzist';

// ── reading a store and who you are inside it ──────────────────────────────

export async function loadSeller(database: DbClient, sellerId: string): Promise<SellerRow> {
  const [row] = await database.select().from(commerceSellers).where(eq(commerceSellers.id, sellerId)).limit(1);
  if (!row) throw notFound('این فروشگاه پیدا نشد.');
  return row;
}

export interface Membership {
  readonly sellerId: string;
  readonly role: SellerRole;
}

/**
 * This account's live role inside one store.
 *
 * Asked per store and never cached into anything global: being an admin of one
 * shop says nothing at all about another, and that is the whole of the
 * isolation this prompt asks to be proved.
 */
export async function membershipOf(
  database: DbClient,
  sellerId: string,
  accountId: string,
): Promise<Membership | null> {
  const [row] = await database
    .select({ role: sellerMembers.role })
    .from(sellerMembers)
    .where(
      and(
        eq(sellerMembers.sellerId, sellerId),
        eq(sellerMembers.accountId, accountId),
        eq(sellerMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  return row ? { sellerId, role: row.role as SellerRole } : null;
}

/**
 * Refuse unless this actor may do this, inside this store.
 *
 * A stranger is told the store does not exist rather than that they are not in
 * it, so one account cannot enumerate other people's shops by watching which
 * answer comes back. An operational reviewer is not a member and does not get
 * seller capabilities here: their powers are the review actions below.
 */
export async function assertSellerCapability(
  database: DbClient,
  actor: Actor,
  sellerId: string,
  capability: SellerCapability,
): Promise<Membership> {
  const membership = await membershipOf(database, sellerId, actor.accountId);
  if (membership === null) throw notFound('این فروشگاه پیدا نشد.');
  if (!roleAllows(membership.role, capability)) throw forbidden();
  return membership;
}

/** Every store this account works in, for the picker on their own pages. */
export async function myStores(database: DbClient, actor: Actor) {
  return database
    .select({
      id: commerceSellers.id,
      displayNameFa: commerceSellers.displayNameFa,
      status: commerceSellers.status,
      kind: commerceSellers.kind,
      role: sellerMembers.role,
    })
    .from(sellerMembers)
    .innerJoin(commerceSellers, eq(commerceSellers.id, sellerMembers.sellerId))
    .where(and(eq(sellerMembers.accountId, actor.accountId), eq(sellerMembers.status, 'ACTIVE')))
    .orderBy(desc(commerceSellers.createdAt));
}

// ── applying ───────────────────────────────────────────────────────────────

/**
 * Start an application.
 *
 * The applicant becomes the owner member of their own store in the same
 * transaction, because a store with no owner is a store nobody can act in.
 */
export async function startSellerApplication(
  database: Database,
  actor: Actor,
  input: { kind: string; displayNameFa: string },
): Promise<SellerRow> {
  await assertFlagEnabled(database, 'market.flag.seller_onboarding_enabled');
  if (!(APPLICABLE_KINDS as readonly string[]).includes(input.kind)) {
    throw validation('نوع فروشنده انتخاب‌شده معتبر نیست.');
  }
  const displayNameFa = input.displayNameFa.trim();
  if (displayNameFa.length < 2) throw validation('نام نمایشی فروشگاه را وارد کنید.');

  const kyc = await findCase(database, actor.accountId);
  if (kyc?.status !== 'APPROVED') {
    throw conflict('برای ثبت فروشگاه، احراز هویت شما باید تأییدشده باشد.');
  }

  // One live application per account keeps the queue honest; a rejected or
  // terminated one does not block a fresh attempt.
  const existing = await database
    .select({ id: commerceSellers.id })
    .from(commerceSellers)
    .where(
      and(
        eq(commerceSellers.ownerAccountId, actor.accountId),
        inArray(commerceSellers.status, ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'ACTIVE', 'SUSPENDED']),
      ),
    )
    .limit(1);
  if (existing.length > 0) throw conflict('شما یک فروشگاه در جریان دارید؛ همان را ادامه دهید.');

  return database.transaction(async (tx) => {
    const [seller] = await tx
      .insert(commerceSellers)
      .values({
        ownerAccountId: actor.accountId,
        kind: input.kind as SellerKind,
        displayNameFa,
        status: 'DRAFT',
      })
      .returning();

    await tx.insert(sellerMembers).values({
      sellerId: seller!.id,
      accountId: actor.accountId,
      role: 'OWNER',
      status: 'ACTIVE',
      respondedAt: new Date(),
    });

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SELLER_STARTED',
      targetType: 'COMMERCE_SELLER',
      targetId: seller!.id,
      after: { kind: input.kind, displayNameFa },
    });
    return seller!;
  });
}

export interface SellerFormInput {
  readonly sellerId: string;
  readonly expectedVersion: number;
  readonly displayNameFa: string;
  readonly legalNameFa: string;
  readonly businessTypeFa: string;
  readonly nationalIdentifier: string;
  readonly representativeNameFa: string;
  readonly representativePhone: string;
  readonly contactEmail: string;
  readonly licenceKindFa: string;
  readonly licenceNumber: string;
  readonly licenceIssuedOn: string;
  readonly licenceExpiresOn: string;
  readonly provinceCode: string;
  readonly cityId: string;
  readonly addressFa: string;
  readonly postalCode: string;
  readonly settlementIban: string;
  readonly settlementHolderNameFa: string;
  readonly shippingPolicyFa: string;
  readonly returnPolicyFa: string;
}

/**
 * Save the application.
 *
 * Editing a settlement account undoes its verification: a reviewer confirmed
 * the account that was there when they looked, and nothing else.
 */
export async function saveSellerApplication(
  database: Database,
  actor: Actor,
  input: SellerFormInput,
): Promise<SellerRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  const seller = await loadSeller(database, input.sellerId);
  if (!isSellerEditable(seller.status as SellerStatus)) {
    throw conflict('فرم این فروشگاه در وضعیت «' + (SELLER_STATUS_FA[seller.status as SellerStatus] ?? seller.status) + '» قابل ویرایش نیست.');
  }

  const iban = input.settlementIban.trim() === '' ? null : normaliseIban(input.settlementIban);
  if (iban !== null && !isIbanShape(iban)) {
    throw validation('شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.');
  }
  const ibanChanged = iban !== seller.settlementIban;

  const now = new Date();
  try {
    const [updated] = await database
      .update(commerceSellers)
      .set({
        displayNameFa: input.displayNameFa.trim() || null,
        legalNameFa: input.legalNameFa.trim() || null,
        businessTypeFa: input.businessTypeFa.trim() || null,
        nationalIdentifier: input.nationalIdentifier.trim() || null,
        representativeNameFa: input.representativeNameFa.trim() || null,
        representativePhone: input.representativePhone.trim() || null,
        contactEmail: input.contactEmail.trim() || null,
        licenceKindFa: input.licenceKindFa.trim() || null,
        licenceNumber: input.licenceNumber.trim() || null,
        licenceIssuedOn: input.licenceIssuedOn.trim() || null,
        licenceExpiresOn: input.licenceExpiresOn.trim() || null,
        provinceCode: input.provinceCode.trim() || null,
        cityId: input.cityId.trim() || null,
        addressFa: input.addressFa.trim() || null,
        postalCode: input.postalCode.trim() || null,
        settlementIban: iban,
        settlementHolderNameFa: input.settlementHolderNameFa.trim() || null,
        // A changed account has not been verified; the previous verification
        // was about the previous account.
        ibanVerifiedAt: ibanChanged ? null : seller.ibanVerifiedAt,
        ibanVerifiedByAccountId: ibanChanged ? null : seller.ibanVerifiedByAccountId,
        shippingPolicyFa: input.shippingPolicyFa.trim() || null,
        returnPolicyFa: input.returnPolicyFa.trim() || null,
        version: seller.version + 1,
        updatedAt: now,
      })
      .where(and(eq(commerceSellers.id, seller.id), eq(commerceSellers.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این فروشگاه در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(database, actor, {
      action: 'COMMERCE_SELLER_SAVED',
      targetType: 'COMMERCE_SELLER',
      targetId: seller.id,
      targetVersion: updated.version,
      // Never the whole IBAN: the trail records that it changed, masked.
      after: {
        displayNameFa: updated.displayNameFa,
        nationalIdentifier: updated.nationalIdentifier,
        settlementIban: updated.settlementIban ? maskIban(updated.settlementIban) : null,
        ibanChanged,
      },
    });
    return updated;
  } catch (error) {
    if (violates(error, 'commerce_seller_identifier_key')) {
      throw conflict('کسب‌وکاری با همین شناسه ملی از قبل ثبت شده است.');
    }
    if (violates(error, 'commerce_seller_iban_key')) {
      throw conflict('این شماره شبا برای فروشگاه دیگری ثبت شده است.');
    }
    throw error;
  }
}

/** Accept the versioned seller agreement, recording which version and who. */
export async function acceptSellerAgreement(
  database: Database,
  actor: Actor,
  input: { sellerId: string },
): Promise<SellerRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  const seller = await loadSeller(database, input.sellerId);
  const version = await readText(database, AGREEMENT_VERSION_KEY);

  const now = new Date();
  const [updated] = await database
    .update(commerceSellers)
    .set({
      agreementVersion: version,
      agreementAcceptedAt: now,
      agreementAcceptedByAccountId: actor.accountId,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(eq(commerceSellers.id, seller.id))
    .returning();

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_AGREEMENT_ACCEPTED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    after: { agreementVersion: version },
  });
  return updated!;
}

export interface SellerDocumentInput {
  readonly sellerId: string;
  readonly kind: 'BUSINESS_LICENCE' | 'REPRESENTATIVE_ID' | 'BANK_PROOF' | 'OTHER';
  readonly noteFa?: string | null;
  readonly bytes: Uint8Array;
  readonly originalName: string | null;
}

/** Attach a document. A replaced one is superseded rather than deleted. */
export async function addSellerDocument(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: SellerDocumentInput,
): Promise<SellerDocumentRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  const seller = await loadSeller(database, input.sellerId);
  if (!isSellerEditable(seller.status as SellerStatus)) {
    throw conflict('در این وضعیت مدرک تازه‌ای افزوده نمی‌شود.');
  }

  return database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'SELLER_DOCUMENT',
      bytes: input.bytes,
      originalName: safeOriginalName(input.originalName),
    });

    if (input.kind !== 'OTHER') {
      await tx
        .update(sellerDocuments)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(sellerDocuments.sellerId, seller.id),
            eq(sellerDocuments.kind, input.kind),
            sql`${sellerDocuments.supersededAt} is null`,
          ),
        );
    }

    const [document] = await tx
      .insert(sellerDocuments)
      .values({
        sellerId: seller.id,
        kind: input.kind,
        fileId: stored.id,
        noteFa: input.noteFa?.trim() || null,
        addedByAccountId: actor.accountId,
      })
      .returning();

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SELLER_DOCUMENT_ADDED',
      targetType: 'COMMERCE_SELLER',
      targetId: seller.id,
      // The bytes and the name are never here: kind, type and size only.
      after: { kind: input.kind, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return document!;
  });
}

/** What this application is still missing, read from the real records. */
export async function applicationBlockers(
  database: DbClient,
  seller: SellerRow,
): Promise<readonly string[]> {
  const kyc = await findCase(database, seller.ownerAccountId);
  const licenceSetting = await readSetting(database, LICENCE_REQUIRED_KEY);
  const [licence] = await database
    .select({ id: sellerDocuments.id })
    .from(sellerDocuments)
    .where(
      and(
        eq(sellerDocuments.sellerId, seller.id),
        eq(sellerDocuments.kind, 'BUSINESS_LICENCE'),
        sql`${sellerDocuments.supersededAt} is null`,
      ),
    )
    .limit(1);

  const facts: SellerFormFacts = {
    displayNameFa: seller.displayNameFa,
    legalNameFa: seller.legalNameFa,
    businessTypeFa: seller.businessTypeFa,
    nationalIdentifier: seller.nationalIdentifier,
    representativeNameFa: seller.representativeNameFa,
    representativePhone: seller.representativePhone,
    provinceCode: seller.provinceCode,
    cityId: seller.cityId,
    addressFa: seller.addressFa,
    settlementIban: seller.settlementIban,
    settlementHolderNameFa: seller.settlementHolderNameFa,
    shippingPolicyFa: seller.shippingPolicyFa,
    returnPolicyFa: seller.returnPolicyFa,
    agreementVersion: seller.agreementVersion,
    ownerKycApproved: kyc?.status === 'APPROVED',
    hasLicenceDocument: licence !== undefined,
    licenceRequired: licenceSetting.configured ? licenceSetting.value === true : null,
  };
  return submissionBlockers(facts);
}

/** Send it for review — the same call for a first attempt and a correction. */
export async function submitSellerApplication(
  database: Database,
  actor: Actor,
  input: { sellerId: string; expectedVersion: number },
): Promise<SellerRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_SUBMIT');
  const seller = await loadSeller(database, input.sellerId);
  if (!canMoveSeller(seller.status as SellerStatus, 'SUBMITTED', 'SELLER')) {
    throw conflict('این فروشگاه در وضعیتی نیست که ارسال شود.');
  }

  const blockers = await applicationBlockers(database, seller);
  if (blockers.length > 0) throw validation(blockers[0]!);

  const now = new Date();
  const [updated] = await database
    .update(commerceSellers)
    .set({
      status: 'SUBMITTED',
      submittedAt: now,
      statusReasonFa: null,
      statusChangedAt: now,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(and(eq(commerceSellers.id, seller.id), eq(commerceSellers.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این فروشگاه در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_SUBMITTED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    before: { status: seller.status },
    after: { status: 'SUBMITTED' },
  });
  return updated;
}

// ── review ─────────────────────────────────────────────────────────────────

export interface ReviewDecisionInput {
  readonly sellerId: string;
  readonly to: 'UNDER_REVIEW' | 'NEEDS_CORRECTION' | 'APPROVED' | 'REJECTED';
  readonly reasonFa?: string | null;
  readonly expectedVersion: number;
}

/**
 * A reviewer's decision.
 *
 * Correcting and rejecting both require a reason, because both are answers the
 * applicant has to be able to act on. Approving does not create a trading
 * store: that needs a plan period, which needs a payment.
 */
export async function decideSellerApplication(
  database: Database,
  actor: Actor,
  input: ReviewDecisionInput,
): Promise<SellerRow> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  const seller = await loadSeller(database, input.sellerId);
  if (!canMoveSeller(seller.status as SellerStatus, input.to, 'REVIEWER')) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }
  const reasonFa = input.reasonFa?.trim() || null;
  if ((input.to === 'NEEDS_CORRECTION' || input.to === 'REJECTED') && reasonFa === null) {
    throw validation('دلیل این تصمیم را بنویسید؛ متقاضی باید بداند چه چیزی را اصلاح کند.');
  }

  const now = new Date();
  const [updated] = await database
    .update(commerceSellers)
    .set({
      status: input.to,
      statusReasonFa: reasonFa,
      statusChangedAt: now,
      reviewedByAccountId: actor.accountId,
      reviewedAt: now,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(and(eq(commerceSellers.id, seller.id), eq(commerceSellers.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این پرونده در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_REVIEWED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    targetVersion: updated.version,
    before: { status: seller.status },
    after: { status: input.to },
    reason: reasonFa,
  });
  await createNotification(database, {
    recipientAccountId: seller.ownerAccountId,
    kind: 'COMMERCE_SELLER_REVIEWED',
    titleFa: 'نتیجه بررسی فروشگاه شما',
    bodyFa: reasonFa ?? 'وضعیت پرونده فروشگاه شما به «' + (SELLER_STATUS_FA[input.to] ?? input.to) + '» تغییر کرد.',
    resume: resumeContext({
      entity: { type: 'COMMERCE_SELLER', id: seller.id },
      step: 'SELLER_APPLICATION',
      originRoute: '/account/seller',
    }),
  });
  return updated;
}

/** Confirm the settlement account from the proof, with the reviewer's name on it. */
export async function verifySettlementAccount(
  database: Database,
  actor: Actor,
  input: { sellerId: string; noteFa: string },
): Promise<SellerRow> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  const noteFa = input.noteFa.trim();
  if (noteFa === '') throw validation('توضیح بررسی مالکیت حساب را بنویسید.');
  const seller = await loadSeller(database, input.sellerId);
  if (seller.settlementIban === null) throw conflict('برای این فروشگاه شبایی ثبت نشده است.');

  const now = new Date();
  const [updated] = await database
    .update(commerceSellers)
    .set({
      ibanVerifiedAt: now,
      ibanVerifiedByAccountId: actor.accountId,
      ibanVerificationNoteFa: noteFa,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(eq(commerceSellers.id, seller.id))
    .returning();

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_IBAN_VERIFIED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    after: { settlementIban: maskIban(seller.settlementIban), holder: seller.settlementHolderNameFa },
    reason: noteFa,
  });
  return updated!;
}

/**
 * Stop a store trading, or end it.
 *
 * Neither deletes anything: the products, the orders and the money owed stay
 * exactly where they are, which is what makes a suspension reversible and a
 * termination answerable.
 */
export async function changeSellerStanding(
  database: Database,
  actor: Actor,
  input: { sellerId: string; to: 'SUSPENDED' | 'ACTIVE' | 'TERMINATED'; reasonFa: string; expectedVersion: number },
): Promise<SellerRow> {
  assertMarketplaceCapability(actor, 'SELLER_SUSPEND');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل این تصمیم را بنویسید؛ برای فروشنده و در تاریخچه ثبت می‌شود.');

  const seller = await loadSeller(database, input.sellerId);
  if (!canMoveSeller(seller.status as SellerStatus, input.to, 'REVIEWER')) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }

  const now = new Date();
  const [updated] = await database
    .update(commerceSellers)
    .set({
      status: input.to,
      statusReasonFa: reasonFa,
      statusChangedAt: now,
      version: seller.version + 1,
      updatedAt: now,
    })
    .where(and(eq(commerceSellers.id, seller.id), eq(commerceSellers.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این فروشگاه در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_STANDING_CHANGED',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    targetVersion: updated.version,
    before: { status: seller.status },
    after: { status: input.to, recordsKept: true },
    reason: reasonFa,
  });
  await createNotification(database, {
    recipientAccountId: seller.ownerAccountId,
    kind: 'COMMERCE_SELLER_STANDING_CHANGED',
    titleFa: 'وضعیت فروشگاه شما تغییر کرد',
    bodyFa: reasonFa,
    resume: resumeContext({
      entity: { type: 'COMMERCE_SELLER', id: seller.id },
      step: 'SELLER_APPLICATION',
      originRoute: '/account/seller',
    }),
  });
  return updated;
}

// ── who works here ─────────────────────────────────────────────────────────

/**
 * Invite somebody into this store.
 *
 * Only the owner, and never as a second owner: one store has one owner, and
 * handing a store over is a different act with different consequences than
 * adding a colleague.
 */
export async function inviteSellerMember(
  database: Database,
  actor: Actor,
  input: { sellerId: string; mobile: string; role: 'ADMIN' | 'STAFF' },
): Promise<SellerMemberRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_MEMBERS');
  if (input.role !== 'ADMIN' && input.role !== 'STAFF') throw validation('نقش انتخاب‌شده معتبر نیست.');

  const [person] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.mobile, input.mobile.trim()))
    .limit(1);
  if (!person) throw notFound('حسابی با این شماره پیدا نشد.');
  if (person.id === actor.accountId) throw validation('شما خودتان مالک این فروشگاه هستید.');

  return database.transaction(async (tx) => {
    let member: SellerMemberRow;
    try {
      const [row] = await tx
        .insert(sellerMembers)
        .values({
          sellerId: input.sellerId,
          accountId: person.id,
          role: input.role,
          status: 'ACTIVE',
          invitedByAccountId: actor.accountId,
          respondedAt: new Date(),
        })
        .returning();
      member = row!;
    } catch (error) {
      if (violates(error, 'seller_member_key')) throw conflict('این حساب از قبل در این فروشگاه هست.');
      throw error;
    }

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SELLER_MEMBER_ADDED',
      targetType: 'COMMERCE_SELLER',
      targetId: input.sellerId,
      after: { accountId: person.id, role: input.role },
    });
    await createNotification(tx, {
      recipientAccountId: person.id,
      kind: 'COMMERCE_SELLER_MEMBER_ADDED',
      titleFa: 'به یک فروشگاه افزوده شدید',
      bodyFa: 'شما به‌عنوان ' + (input.role === 'ADMIN' ? 'مدیر' : 'کارمند') + ' به یک فروشگاه افزوده شدید.',
      resume: resumeContext({
        entity: { type: 'COMMERCE_SELLER', id: input.sellerId },
        step: 'SELLER_MEMBERS',
        originRoute: '/account/seller',
      }),
    });
    return member;
  });
}

/** Remove somebody, or change what they may do. The owner cannot be removed. */
export async function changeSellerMember(
  database: Database,
  actor: Actor,
  input: { sellerId: string; memberId: string; role?: 'ADMIN' | 'STAFF'; remove?: boolean },
): Promise<void> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_MEMBERS');
  const [member] = await database
    .select()
    .from(sellerMembers)
    .where(and(eq(sellerMembers.id, input.memberId), eq(sellerMembers.sellerId, input.sellerId)))
    .limit(1);
  if (!member) throw notFound('این عضو پیدا نشد.');
  if (member.role === 'OWNER') throw validation('مالک فروشگاه از این مسیر تغییر نمی‌کند.');

  const now = new Date();
  await database.transaction(async (tx) => {
    if (input.remove) {
      await tx
        .update(sellerMembers)
        .set({ status: 'REMOVED', removedAt: now, version: member.version + 1, updatedAt: now })
        .where(eq(sellerMembers.id, member.id));
    } else if (input.role) {
      await tx
        .update(sellerMembers)
        .set({ role: input.role, version: member.version + 1, updatedAt: now })
        .where(eq(sellerMembers.id, member.id));
    } else {
      throw validation('تغییری مشخص نشده است.');
    }

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SELLER_MEMBER_CHANGED',
      targetType: 'COMMERCE_SELLER',
      targetId: input.sellerId,
      before: { accountId: member.accountId, role: member.role, status: member.status },
      after: input.remove ? { status: 'REMOVED' } : { role: input.role },
    });
  });
}

export async function sellerMembersOf(database: DbClient, sellerId: string) {
  return database
    .select({
      id: sellerMembers.id,
      accountId: sellerMembers.accountId,
      mobile: accounts.mobile,
      role: sellerMembers.role,
      status: sellerMembers.status,
      createdAt: sellerMembers.createdAt,
    })
    .from(sellerMembers)
    .innerJoin(accounts, eq(accounts.id, sellerMembers.accountId))
    .where(eq(sellerMembers.sellerId, sellerId))
    .orderBy(sellerMembers.createdAt);
}

// ── the platform's own store ───────────────────────────────────────────────

/**
 * Hamzist as an ordinary tenant.
 *
 * PRODUCT_DECISIONS §8 says the platform sells in the same model as everybody
 * else. Making that true rather than stated means it is a row in the same
 * table, with the same lifecycle and the same scoped roles — no branch anywhere
 * reads `kind = 'PLATFORM'` to decide what a store may do or where it ranks.
 * It is created with no owner privileges of its own beyond the superadmin who
 * runs it, and it still needs a plan period like any other store.
 */
export async function ensurePlatformSeller(database: Database, actor: Actor): Promise<SellerRow> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const [existing] = await database
    .select()
    .from(commerceSellers)
    .where(eq(commerceSellers.kind, 'PLATFORM'))
    .limit(1);
  if (existing) return existing;

  return database.transaction(async (tx) => {
    const [seller] = await tx
      .insert(commerceSellers)
      .values({
        ownerAccountId: actor.accountId,
        kind: 'PLATFORM',
        status: 'DRAFT',
        displayNameFa: 'فروشگاه همزیست',
        legalNameFa: 'فروشگاه همزیست',
        slug: PLATFORM_SELLER_SLUG,
        businessTypeFa: 'فروشگاه خود پلتفرم',
      })
      .returning();
    await tx.insert(sellerMembers).values({
      sellerId: seller!.id,
      accountId: actor.accountId,
      role: 'OWNER',
      status: 'ACTIVE',
      respondedAt: new Date(),
    });
    await recordAudit(tx, actor, {
      action: 'COMMERCE_PLATFORM_SELLER_CREATED',
      targetType: 'COMMERCE_SELLER',
      targetId: seller!.id,
      after: { kind: 'PLATFORM', slug: PLATFORM_SELLER_SLUG },
    });
    return seller!;
  });
}

// ── reads for the screens ──────────────────────────────────────────────────

export interface SellerQueueEntry {
  readonly id: string;
  readonly displayNameFa: string;
  readonly legalNameFa: string | null;
  readonly kind: string;
  readonly status: string;
  readonly submittedAt: Date | null;
  readonly ibanVerifiedAt: Date | null;
  readonly version: number;
}

/** Applications waiting on a person, oldest first. */
export async function sellerReviewQueue(
  database: DbClient,
  actor: Actor,
): Promise<readonly SellerQueueEntry[]> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  const rows = await database
    .select({
      id: commerceSellers.id,
      displayNameFa: commerceSellers.displayNameFa,
      legalNameFa: commerceSellers.legalNameFa,
      kind: commerceSellers.kind,
      status: commerceSellers.status,
      submittedAt: commerceSellers.submittedAt,
      ibanVerifiedAt: commerceSellers.ibanVerifiedAt,
      version: commerceSellers.version,
    })
    .from(commerceSellers)
    .where(inArray(commerceSellers.status, ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED']))
    .orderBy(commerceSellers.submittedAt);
  return rows.map((row) => ({ ...row, displayNameFa: row.displayNameFa ?? 'بدون نام' }));
}

export interface SellerDetailView {
  readonly seller: SellerRow;
  readonly maskedIban: string | null;
  readonly documents: readonly { id: string; kind: string; fileId: string; noteFa: string | null; createdAt: Date }[];
  readonly blockers: readonly string[];
  readonly placeFa: string | null;
}

/**
 * One store, for its own people or for a reviewer.
 *
 * The settlement account is masked here and read whole only where it is being
 * edited or verified, so a screenshot of a dashboard is not a bank account.
 */
export async function sellerDetail(
  database: DbClient,
  actor: Actor,
  sellerId: string,
): Promise<SellerDetailView> {
  const seller = await loadSeller(database, sellerId);
  const membership = await membershipOf(database, sellerId, actor.accountId);
  const isReviewer = hasMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  if (membership === null && !isReviewer) throw notFound('این فروشگاه پیدا نشد.');

  const documents = await database
    .select({
      id: sellerDocuments.id,
      kind: sellerDocuments.kind,
      fileId: sellerDocuments.fileId,
      noteFa: sellerDocuments.noteFa,
      createdAt: sellerDocuments.createdAt,
    })
    .from(sellerDocuments)
    .where(and(eq(sellerDocuments.sellerId, sellerId), sql`${sellerDocuments.supersededAt} is null`))
    .orderBy(sellerDocuments.createdAt);

  const [place] = seller.cityId
    ? await database
        .select({ cityFa: cities.nameFa, provinceFa: provinces.nameFa })
        .from(cities)
        .innerJoin(provinces, eq(provinces.code, cities.provinceCode))
        .where(eq(cities.id, seller.cityId))
        .limit(1)
    : [];

  return {
    seller,
    maskedIban: seller.settlementIban ? maskIban(seller.settlementIban) : null,
    documents,
    blockers: await applicationBlockers(database, seller),
    placeFa: place ? place.provinceFa + ' — ' + place.cityFa : null,
  };
}

/** Whether this file belongs to a store this actor may read documents of. */
export async function mayReadSellerDocument(
  database: DbClient,
  actor: Actor,
  fileId: string,
): Promise<boolean> {
  const [row] = await database
    .select({ sellerId: sellerDocuments.sellerId })
    .from(sellerDocuments)
    .where(eq(sellerDocuments.fileId, fileId))
    .limit(1);
  if (!row) return false;
  if (hasMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW')) return true;
  return (await membershipOf(database, row.sellerId, actor.accountId)) !== null;
}

/** Stores other than this one, for the isolation checks of the tests. */
export async function otherStores(database: DbClient, sellerId: string) {
  return database
    .select({ id: commerceSellers.id })
    .from(commerceSellers)
    .where(ne(commerceSellers.id, sellerId));
}

export const MAX_SHIPPING_FEE_KEY = 'market.shop.max_shipping_fee_toman';
export const MAX_FREE_SHIPPING_THRESHOLD_KEY = 'market.shop.max_free_shipping_threshold_toman';

/**
 * What this shop charges to deliver an order — PROMPT-010.
 *
 * The figure is the shop's own commercial term, so it is theirs to enter; the
 * platform only says how high it may go, and only when somebody has configured
 * that ceiling. An unconfigured ceiling does not become "no limit" silently:
 * it is simply not enforced, and the settings screen says the figure is
 * missing, which is the same discipline every other managed number follows.
 *
 * Zero is a real answer — free delivery, chosen. Not having answered is a
 * different state entirely, and it is the one that stops a checkout.
 */
export async function setShippingTerms(
  database: Database,
  actor: Actor,
  input: { sellerId: string; feeToman: bigint; freeThresholdToman: bigint | null },
): Promise<void> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_EDIT');
  if (input.feeToman < 0n) throw validation('هزینه ارسال نمی‌تواند منفی باشد.');
  if (input.freeThresholdToman !== null && input.freeThresholdToman < 0n) {
    throw validation('حد نصاب ارسال رایگان نمی‌تواند منفی باشد.');
  }

  const ceiling = await readMoney(database, MAX_SHIPPING_FEE_KEY);
  if (ceiling.configured && input.feeToman > ceiling.toman) {
    throw validation('سقف مجاز هزینه ارسال ' + ceiling.toman.toLocaleString('fa-IR') + ' تومان است.');
  }
  const thresholdCeiling = await readMoney(database, MAX_FREE_SHIPPING_THRESHOLD_KEY);
  if (
    input.freeThresholdToman !== null &&
    thresholdCeiling.configured &&
    input.freeThresholdToman > thresholdCeiling.toman
  ) {
    throw validation(
      'سقف مجاز حد نصاب ارسال رایگان ' + thresholdCeiling.toman.toLocaleString('fa-IR') + ' تومان است.',
    );
  }

  const seller = await loadSeller(database, input.sellerId);
  await database
    .update(commerceSellers)
    .set({
      shippingFeeToman: input.feeToman,
      freeShippingThresholdToman: input.freeThresholdToman,
      version: seller.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(commerceSellers.id, seller.id));

  await recordAudit(database, actor, {
    action: 'COMMERCE_SELLER_SHIPPING_TERMS_SET',
    targetType: 'COMMERCE_SELLER',
    targetId: seller.id,
    targetVersion: seller.version + 1,
    before: {
      feeToman: seller.shippingFeeToman?.toString() ?? null,
      freeThresholdToman: seller.freeShippingThresholdToman?.toString() ?? null,
    },
    after: {
      feeToman: input.feeToman.toString(),
      freeThresholdToman: input.freeThresholdToman?.toString() ?? null,
    },
  });
}
