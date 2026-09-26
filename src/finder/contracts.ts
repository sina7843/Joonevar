/**
 * The in-Hamzist mating contract — PHASE-4 PROMPT-005.
 *
 * Built from the superadmin's published template: required clauses cannot be
 * removed, optional ones are chosen and filled by the parties. Every edit is a
 * new numbered version with its own content hash. Each party confirms one
 * exact (version, hash) with a one-time code bound to that version, so an
 * approval never carries over to changed text, a replayed code is refused and
 * a code for an older version is refused. When both have confirmed the same
 * version the contract is CONFIRMED and a PDF of that version is stored once,
 * privately, and never regenerated over.
 *
 * Money: none. The financial category and any private details are recorded;
 * Hamzist collects, holds and guarantees nothing, and there is no payment,
 * escrow or refund path for this contract (PRODUCT_DECISIONS §9). The
 * confirmation is called «تأیید دوطرفه با کد یک‌بارمصرف», not a legal signature.
 */
import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, storedFiles } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { profiles as accountProfiles } from '../db/schema/identity.ts';
import {
  finderContractApprovals,
  finderContractOtps,
  finderContractTemplates,
  finderContracts,
  finderContractVersions,
  matingProfiles,
  matingRequests,
} from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { renderDocumentPdf } from '../documents/render.ts';
import { readInt } from '../settings/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { formatCivilDateFa } from '../domain/calendar.ts';
import type { SmsSender } from '../adapters/registry.ts';
import type { Actor } from '../authz/actor.ts';
import fs from 'node:fs/promises';
import { assertFinderFlag } from './flags.ts';
import { detachDownstream } from './downstream.ts';
import { assertFinderCapability, FINDER_SETTING_KEYS } from './model.ts';
import { counterpartOf, enterCoordination, loadForParty, lockAnimals, moveRequest, notifyFinder, releaseCoordination, type RequestRow } from './requests.ts';
import {
  applyClauseChoices,
  chipTail,
  codeMatches,
  commandProblem,
  CONFIRMATION_NAME_FA,
  contentHash,
  FINANCIAL_FA,
  hashCode,
  newCode,
  NO_PAYMENT_THROUGH_HAMZIST_FA,
  NOT_A_LEGAL_SIGNATURE_FA,
  PLACE_FA,
  ROUTE_FA,
  templateProblem,
  type ContractContent,
  type RequestStatus,
  type TemplateClause,
} from './request-model.ts';

export type ContractRow = typeof finderContracts.$inferSelect;
export type ContractVersionRow = typeof finderContractVersions.$inferSelect;
const STALE = 'قرارداد در این فاصله تغییر کرده است؛ نسخه تازه را ببینید.';

// ── templates ────────────────────────────────────────────────────────────────

export async function currentTemplate(db: DbClient) {
  const [row] = await db.select().from(finderContractTemplates).where(eq(finderContractTemplates.status, 'PUBLISHED')).limit(1);
  return row ?? null;
}

export async function publishTemplate(
  db: Database,
  actor: Actor,
  input: { titleFa: string; clauses: readonly TemplateClause[]; reasonFa: string; expectedCurrentVersion: number },
) {
  assertFinderCapability(actor, 'FINDER_CONFIG_WRITE');
  const titleFa = input.titleFa.trim();
  const reasonFa = input.reasonFa.trim();
  if (titleFa === '' || reasonFa === '') throw validation('عنوان و دلیل انتشار لازم است.');
  const problem = templateProblem(input.clauses);
  if (problem) throw validation(problem);
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(finderContractTemplates).where(eq(finderContractTemplates.status, 'PUBLISHED')).for('update').limit(1);
      if ((current?.version ?? 0) !== input.expectedCurrentVersion) throw conflict('قالب در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
      if (current) await tx.update(finderContractTemplates).set({ status: 'ARCHIVED', archivedAt: new Date() }).where(eq(finderContractTemplates.id, current.id));
      const [top] = await tx.select({ v: max(finderContractTemplates.version) }).from(finderContractTemplates);
      const [row] = await tx
        .insert(finderContractTemplates)
        .values({ version: (top?.v ?? 0) + 1, titleFa, clauses: input.clauses, reasonFa, publishedByAccountId: actor.accountId })
        .returning();
      await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_TEMPLATE_PUBLISHED', targetType: 'FINDER_CONTRACT_TEMPLATE', targetId: row!.id, targetVersion: row!.version, reason: reasonFa });
      return row!;
    });
  } catch (error) {
    if (violates(error, 'finder_template_one_published_key') || violates(error, 'finder_template_version_key')) {
      throw conflict('قالب در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
    }
    throw error;
  }
}

// ── content ──────────────────────────────────────────────────────────────────

async function partyFacts(tx: DbClient, accountId: string) {
  const [row] = await tx
    .select({ first: accountProfiles.firstName, last: accountProfiles.lastName, display: accountProfiles.displayName })
    .from(accounts)
    .leftJoin(accountProfiles, eq(accountProfiles.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);
  return { accountId, nameFa: [row?.first, row?.last].filter(Boolean).join(' ') || row?.display || 'مالک' };
}

async function animalFacts(tx: DbClient, animalId: string) {
  const [row] = await tx
    .select({ name: animals.name, breedFa: referenceBreeds.nameFa, chip: microchips.number, sex: animals.sex, owner: animals.ownerAccountId })
    .from(animals)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .leftJoin(microchips, eq(microchips.animalId, animals.id))
    .where(eq(animals.id, animalId))
    .limit(1);
  return row!;
}

export interface ContractChoices {
  readonly financialDetailsFa: string | null;
  readonly clauses: ReadonlyArray<{ readonly key: string; readonly fillFa: string | null }>;
}

async function buildContent(tx: DbClient, request: RequestRow, template: typeof finderContractTemplates.$inferSelect, choices: ContractChoices): Promise<ContractContent> {
  const [a, b] = await Promise.all([animalFacts(tx, request.senderAnimalId), animalFacts(tx, request.receiverAnimalId)]);
  const senderIsSire = a.sex === 'MALE';
  const [sireAnimal, damAnimal] = senderIsSire ? [a, b] : [b, a];
  const [sireAnimalId, damAnimalId] = senderIsSire ? [request.senderAnimalId, request.receiverAnimalId] : [request.receiverAnimalId, request.senderAnimalId];
  const [sireParty, damParty] = await Promise.all([partyFacts(tx, sireAnimal.owner), partyFacts(tx, damAnimal.owner)]);
  let clauses: ContractContent['clauses'];
  try {
    clauses = applyClauseChoices(template.clauses as TemplateClause[], choices.clauses);
  } catch {
    throw validation('بند انتخاب‌شده در قالب قرارداد نیست.');
  }
  const details = choices.financialDetailsFa?.trim() || null;
  if (details && details.length > 2000) throw validation('جزئیات مالی حداکثر ۲۰۰۰ نویسه است.');
  return {
    templateId: template.id,
    templateVersion: template.version,
    requestId: request.id,
    parties: { sire: sireParty, dam: damParty },
    animals: {
      sire: { animalId: sireAnimalId, nameFa: sireAnimal.name ?? 'بدون نام', breedFa: sireAnimal.breedFa, chipTail: chipTail(sireAnimal.chip) },
      dam: { animalId: damAnimalId, nameFa: damAnimal.name ?? 'بدون نام', breedFa: damAnimal.breedFa, chipTail: chipTail(damAnimal.chip) },
    },
    terms: {
      route: request.route,
      windowFrom: request.windowFrom,
      windowTo: request.windowTo,
      cityFa: request.cityFa,
      placeCategory: request.placeCategory,
      financialCategory: request.financialCategory,
      specialConditionsFa: request.specialConditionsFa,
    },
    financialDetailsFa: details,
    clauses,
  };
}

// ── commands ─────────────────────────────────────────────────────────────────

/**
 * Either side opens the contract from a preliminarily accepted request. This is
 * where the single-winner lock is taken: the request enters coordination for
 * both animals or the whole transaction fails.
 */
export async function startContract(db: Database, actor: Actor, input: { requestId: string; expectedVersion: number }, now: Date = new Date()) {
  await assertFinderFlag(db, 'finder.flag.contracts');
  const template = await currentTemplate(db);
  if (!template) throw conflict('متن قرارداد هنوز توسط مدیریت منتشر نشده است؛ تنظیم قرارداد فعلاً ممکن نیست.');
  return db.transaction(async (tx) => {
    const peek = await loadForParty(tx, actor, input.requestId, false);
    await lockAnimals(tx, [peek.request.senderAnimalId, peek.request.receiverAnimalId]);
    const { request, party } = await loadForParty(tx, actor, input.requestId, true);
    if (request.version !== input.expectedVersion) throw conflict('این درخواست در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
    const problem = commandProblem('START_CONTRACT', request.status as RequestStatus, party);
    if (problem) throw conflict(problem);
    if (request.pausedAt) throw conflict('یکی از دو حیوان در تنظیم قرارداد دیگری است.');
    await enterCoordination(tx, request, now);
    const moved = await moveRequest(tx, request, 'CONTRACT_DRAFTING', actor, null, {}, now);
    const content = await buildContent(tx, request, template, { financialDetailsFa: null, clauses: [] });
    const [contract] = await tx.insert(finderContracts).values({ requestId: request.id, templateId: template.id, createdAt: now, updatedAt: now }).returning();
    await tx.insert(finderContractVersions).values({ contractId: contract!.id, number: 1, content, contentHash: contentHash(content), createdByAccountId: actor.accountId, createdAt: now });
    await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_STARTED', targetType: 'FINDER_CONTRACT', targetId: contract!.id, after: { requestId: request.id, templateVersion: template.version } });
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_CONTRACT_READY', 'پیش‌نویس قرارداد آماده است', 'قرارداد جفت‌گیری را ببینید و تأیید کنید.', request.id);
    return { request: moved, contract: contract! };
  });
}

async function loadContractForParty(tx: DbClient, actor: Actor, contractId: string, lock: boolean) {
  const query = tx.select().from(finderContracts).where(eq(finderContracts.id, contractId)).limit(1);
  const [contract] = /^[0-9a-f-]{36}$/i.test(contractId) ? (lock ? await query.for('update') : await query) : [];
  if (!contract) throw notFound('این قرارداد پیدا نشد.');
  const { request, party } = await loadForParty(tx, actor, contract.requestId, lock);
  return { contract, request, party };
}

async function versionOf(tx: DbClient, contractId: string, number: number): Promise<ContractVersionRow | null> {
  const [row] = await tx.select().from(finderContractVersions).where(and(eq(finderContractVersions.contractId, contractId), eq(finderContractVersions.number, number))).limit(1);
  return row ?? null;
}

/** Any change is a new version; approvals of the previous one no longer count for it. */
export async function editContract(
  db: Database,
  actor: Actor,
  input: { contractId: string; expectedNumber: number; choices: ContractChoices },
  now: Date = new Date(),
): Promise<ContractVersionRow> {
  return db.transaction(async (tx) => {
    const { contract, request } = await loadContractForParty(tx, actor, input.contractId, true);
    if (contract.status !== 'DRAFTING') throw conflict('قرارداد دیگر قابل ویرایش نیست.');
    if (contract.currentNumber !== input.expectedNumber) throw conflict(STALE);
    const [template] = await tx.select().from(finderContractTemplates).where(eq(finderContractTemplates.id, contract.templateId)).limit(1);
    const content = await buildContent(tx, request, template!, input.choices);
    const number = contract.currentNumber + 1;
    const [row] = await tx
      .insert(finderContractVersions)
      .values({ contractId: contract.id, number, content, contentHash: contentHash(content), createdByAccountId: actor.accountId, createdAt: now })
      .returning();
    await tx.update(finderContracts).set({ currentNumber: number, version: contract.version + 1, updatedAt: now }).where(eq(finderContracts.id, contract.id));
    await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_EDITED', targetType: 'FINDER_CONTRACT', targetId: contract.id, targetVersion: number, after: { contentHash: row!.contentHash } });
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_CONTRACT_CHANGED', 'قرارداد تغییر کرد', 'نسخه ' + number.toLocaleString('fa-IR') + ' قرارداد ثبت شد و باید دوباره تأیید شود.', request.id);
    return row!;
  });
}

/**
 * Send a one-time code for this account to confirm this exact version. A second
 * request inside the resend interval is refused with the wait; after it, the
 * code is rotated and the old one stops working.
 */
export async function requestContractCode(
  db: Database,
  actor: Actor,
  sms: SmsSender,
  input: { contractId: string; number: number },
  now: Date = new Date(),
): Promise<{ otpId: string; expiresAt: Date }> {
  const [lifetime, maxAttempts, resend] = await Promise.all([
    readInt(db, FINDER_SETTING_KEYS.otpLifetimeSeconds),
    readInt(db, FINDER_SETTING_KEYS.otpMaxAttempts),
    readInt(db, FINDER_SETTING_KEYS.otpResendSeconds),
  ]);
  const sent = await db.transaction(async (tx) => {
    const { contract } = await loadContractForParty(tx, actor, input.contractId, true);
    if (contract.status !== 'DRAFTING') throw conflict('این قرارداد در انتظار تأیید نیست.');
    if (contract.currentNumber !== input.number) throw conflict(STALE);
    const version = (await versionOf(tx, contract.id, input.number))!;
    const [already] = await tx
      .select({ id: finderContractApprovals.id })
      .from(finderContractApprovals)
      .where(and(eq(finderContractApprovals.contractVersionId, version.id), eq(finderContractApprovals.accountId, actor.accountId)))
      .limit(1);
    if (already) throw conflict('شما همین نسخه را تأیید کرده‌اید.');
    const [open] = await tx
      .select()
      .from(finderContractOtps)
      .where(and(eq(finderContractOtps.contractVersionId, version.id), eq(finderContractOtps.accountId, actor.accountId)))
      .orderBy(desc(finderContractOtps.createdAt))
      .for('update')
      .limit(1);
    const code = newCode();
    const expiresAt = new Date(now.getTime() + lifetime * 1000);
    if (open && open.consumedAt === null && open.expiresAt > now) {
      const wait = resend - (now.getTime() - open.lastSentAt.getTime()) / 1000;
      if (wait > 0) throw conflict('برای کد تازه ' + Math.ceil(wait).toLocaleString('fa-IR') + ' ثانیه صبر کنید.');
      await tx
        .update(finderContractOtps)
        .set({ codeHash: hashCode(open.id, code), expiresAt, attempts: 0, lastSentAt: now })
        .where(eq(finderContractOtps.id, open.id));
      return { otpId: open.id, expiresAt, code };
    }
    const [row] = await tx
      .insert(finderContractOtps)
      .values({ contractVersionId: version.id, accountId: actor.accountId, contentHash: version.contentHash, codeHash: 'pending', expiresAt, maxAttempts, lastSentAt: now, createdAt: now })
      .returning();
    await tx.update(finderContractOtps).set({ codeHash: hashCode(row!.id, code) }).where(eq(finderContractOtps.id, row!.id));
    await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_CODE_SENT', targetType: 'FINDER_CONTRACT', targetId: contract.id, targetVersion: input.number });
    return { otpId: row!.id, expiresAt, code };
  });
  const [account] = await db.select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, actor.accountId)).limit(1);
  await sms.send({ to: account!.mobile, text: 'کد تأیید قرارداد جفت‌گیری همزیست (نسخه ' + input.number + '): ' + sent.code });
  return { otpId: sent.otpId, expiresAt: sent.expiresAt };
}

export type ConfirmOutcome =
  | { readonly state: 'APPROVED'; readonly confirmed: boolean }
  | { readonly state: 'INVALID_CODE'; readonly attemptsRemaining: number };

/**
 * Confirm one exact version with its code. Everything is checked under the
 * contract's row lock: the version is still the current one, the hash the
 * person was shown is that version's hash, the code belongs to this person and
 * this version and has not been used. A wrong code counts an attempt and
 * commits that count. The second matching approval confirms the contract.
 */
export async function confirmContract(
  db: Database,
  actor: Actor,
  input: { contractId: string; number: number; contentHash: string; otpId: string; code: string; ip: string | null; userAgent: string | null },
  now: Date = new Date(),
): Promise<ConfirmOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const { contract, request } = await loadContractForParty(tx, actor, input.contractId, true);
      if (contract.status !== 'DRAFTING') throw conflict('این قرارداد در انتظار تأیید نیست.');
      if (contract.currentNumber !== input.number) throw conflict(STALE);
      const version = (await versionOf(tx, contract.id, input.number))!;
      if (version.contentHash !== input.contentHash) throw conflict(STALE);
      const [otp] = /^[0-9a-f-]{36}$/i.test(input.otpId)
        ? await tx.select().from(finderContractOtps).where(eq(finderContractOtps.id, input.otpId)).for('update').limit(1)
        : [];
      if (!otp || otp.accountId !== actor.accountId || otp.contractVersionId !== version.id || otp.contentHash !== version.contentHash) {
        throw conflict('این کد برای این نسخه قرارداد صادر نشده است؛ کد تازه بگیرید.');
      }
      if (otp.consumedAt !== null) throw conflict('این کد قبلاً استفاده شده است.');
      if (otp.expiresAt <= now) throw conflict('مهلت این کد گذشته است؛ کد تازه بگیرید.');
      if (otp.attempts >= otp.maxAttempts) throw conflict('تعداد تلاش‌های نادرست به سقف رسید؛ کد تازه بگیرید.');
      if (!codeMatches(otp.id, input.code.trim(), otp.codeHash)) {
        await tx.update(finderContractOtps).set({ attempts: otp.attempts + 1 }).where(eq(finderContractOtps.id, otp.id));
        return { state: 'INVALID_CODE', attemptsRemaining: Math.max(0, otp.maxAttempts - otp.attempts - 1) } as const;
      }
      const [consumed] = await tx
        .update(finderContractOtps)
        .set({ consumedAt: now })
        .where(and(eq(finderContractOtps.id, otp.id), eq(finderContractOtps.attempts, otp.attempts)))
        .returning({ id: finderContractOtps.id });
      if (!consumed) throw conflict('این کد قبلاً استفاده شده است.');
      await tx.insert(finderContractApprovals).values({
        contractVersionId: version.id,
        accountId: actor.accountId,
        contentHash: version.contentHash,
        otpId: otp.id,
        ip: input.ip?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        approvedAt: now,
      });
      await recordAudit(tx, actor, {
        action: 'FINDER_CONTRACT_APPROVED',
        targetType: 'FINDER_CONTRACT',
        targetId: contract.id,
        targetVersion: input.number,
        after: { contentHash: version.contentHash, ip: input.ip, confirmationName: CONFIRMATION_NAME_FA },
      });
      const approvals = await tx.select().from(finderContractApprovals).where(eq(finderContractApprovals.contractVersionId, version.id));
      const both = [request.senderAccountId, request.receiverAccountId].every((id) => approvals.some((a) => a.accountId === id));
      if (!both) {
        await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_CONTRACT_APPROVED_BY_OTHER', 'طرف مقابل قرارداد را تأیید کرد', 'برای تأیید نهایی، همان نسخه را تأیید کنید.', request.id);
        return { state: 'APPROVED', confirmed: false } as const;
      }
      await tx
        .update(finderContracts)
        .set({ status: 'CONFIRMED', confirmedNumber: input.number, confirmedAt: now, version: contract.version + 1, updatedAt: now })
        .where(eq(finderContracts.id, contract.id));
      await moveRequest(tx, request, 'CONTRACT_CONFIRMED', actor, null, {}, now);
      // Only these two animals move to «جفت انتخاب‌شده».
      await tx
        .update(matingProfiles)
        .set({ state: 'MATCH_SELECTED', updatedAt: now })
        .where(and(inArray(matingProfiles.animalId, [request.senderAnimalId, request.receiverAnimalId]), eq(matingProfiles.state, 'COORDINATING')));
      await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_CONFIRMED', targetType: 'FINDER_CONTRACT', targetId: contract.id, targetVersion: input.number, after: { contentHash: version.contentHash } });
      for (const recipient of [request.senderAccountId, request.receiverAccountId]) {
        await notifyFinder(tx, recipient, 'FINDER_CONTRACT_CONFIRMED', 'قرارداد جفت‌گیری تأیید شد', 'هر دو طرف همان نسخه را تأیید کردند.', request.id);
      }
      return { state: 'APPROVED', confirmed: true } as const;
    });
  } catch (error) {
    if (violates(error, 'finder_contract_approval_key') || violates(error, 'finder_contract_approval_otp_key')) {
      throw conflict('این تأیید قبلاً ثبت شده است.');
    }
    throw error;
  }
}

/**
 * Cancel. A drafting contract is cancelled with its request. A confirmed one:
 * the first side's request waits for the other (bilateral); `unilateral` with a
 * reason cancels at once and is recorded as unilateral, reportable, with the
 * signed history kept.
 */
export async function cancelContract(
  db: Database,
  actor: Actor,
  input: { contractId: string; reasonFa: string; unilateral: boolean },
  now: Date = new Date(),
): Promise<ContractRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل لغو را بنویسید؛ در سابقه قرارداد می‌ماند.');
  return db.transaction(async (tx) => {
    const { contract, request } = await loadContractForParty(tx, actor, input.contractId, true);
    if (contract.status === 'CANCELLED') throw conflict('این قرارداد پیش‌تر لغو شده است.');
    const otherAsked = contract.cancelRequestedByAccountId !== null && contract.cancelRequestedByAccountId !== actor.accountId;
    if (contract.status === 'CONFIRMED' && !otherAsked && !input.unilateral) {
      const [asked] = await tx
        .update(finderContracts)
        .set({ cancelRequestedByAccountId: actor.accountId, cancelRequestedAt: now, updatedAt: now })
        .where(eq(finderContracts.id, contract.id))
        .returning();
      await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_CONTRACT_CANCEL_ASKED', 'درخواست لغو قرارداد', reasonFa, request.id);
      return asked!;
    }
    const kind = otherAsked ? 'BILATERAL' : 'UNILATERAL';
    const [row] = await tx
      .update(finderContracts)
      .set({ status: 'CANCELLED', cancelKind: kind, cancelledByAccountId: actor.accountId, cancelledAt: now, cancelReasonFa: reasonFa, version: contract.version + 1, updatedAt: now })
      .where(eq(finderContracts.id, contract.id))
      .returning();
    if (['CONTRACT_DRAFTING', 'CONTRACT_CONFIRMED'].includes(request.status)) {
      await moveRequest(tx, request, 'CANCELLED', actor, reasonFa, {}, now);
    }
    await releaseCoordination(tx, request.id, now);
    // PROMPT-006: the downstream link is detached, never rewritten.
    await detachDownstream(tx, actor, contract.id, reasonFa, now);
    await recordAudit(tx, actor, { action: 'FINDER_CONTRACT_CANCELLED', targetType: 'FINDER_CONTRACT', targetId: contract.id, after: { kind, wasConfirmed: contract.status === 'CONFIRMED' }, reason: reasonFa });
    await notifyFinder(tx, counterpartOf(request, actor.accountId), 'FINDER_CONTRACT_CANCELLED', kind === 'BILATERAL' ? 'قرارداد با توافق دو طرف لغو شد' : 'قرارداد یک‌طرفه لغو شد', reasonFa, request.id);
    return row!;
  });
}

// ── reading and the PDF ──────────────────────────────────────────────────────

export async function contractView(db: DbClient, actor: Actor, requestId: string) {
  const [contract] = await db.select().from(finderContracts).where(eq(finderContracts.requestId, requestId)).limit(1);
  if (!contract) return null;
  const { request } = await loadForParty(db, actor, requestId);
  const current = (await versionOf(db, contract.id, contract.currentNumber))!;
  const approvals = await db.select().from(finderContractApprovals).where(eq(finderContractApprovals.contractVersionId, current.id));
  const [template] = await db.select().from(finderContractTemplates).where(eq(finderContractTemplates.id, contract.templateId)).limit(1);
  return {
    contract,
    current,
    content: current.content as ContractContent,
    approvedByMe: approvals.some((a) => a.accountId === actor.accountId),
    approvedByOther: approvals.some((a) => a.accountId === counterpartOf(request, actor.accountId)),
    optionalClauses: (template!.clauses as TemplateClause[]).filter((c) => !c.required),
  };
}

function pdfSpec(content: ContractContent, contractId: string, hash: string, approvals: ReadonlyArray<{ nameFa: string; approvedAt: Date }>) {
  return {
    titleFa: 'قرارداد جفت‌گیری ثبت‌شده در همزیست',
    subtitleFa: CONFIRMATION_NAME_FA,
    identifierLabelFa: 'شناسه قرارداد',
    identifier: contractId,
    fields: [
      { labelFa: 'مالک نر', value: content.parties.sire.nameFa },
      { labelFa: 'مالک ماده', value: content.parties.dam.nameFa },
      { labelFa: 'حیوان نر', value: content.animals.sire.nameFa + ' — ' + (content.animals.sire.breedFa ?? '') + ' — چیپ ' + (content.animals.sire.chipTail ?? '—') },
      { labelFa: 'حیوان ماده', value: content.animals.dam.nameFa + ' — ' + (content.animals.dam.breedFa ?? '') + ' — چیپ ' + (content.animals.dam.chipTail ?? '—') },
      { labelFa: 'مسیر', value: ROUTE_FA[content.terms.route] },
      { labelFa: 'بازه', value: formatCivilDateFa(content.terms.windowFrom) + ' تا ' + formatCivilDateFa(content.terms.windowTo) },
      { labelFa: 'محل', value: content.terms.cityFa + ' — ' + PLACE_FA[content.terms.placeCategory] },
      { labelFa: 'نوع توافق مالی', value: FINANCIAL_FA[content.terms.financialCategory] },
      { labelFa: 'جزئیات مالی', value: content.financialDetailsFa ?? '—' },
      { labelFa: 'شرایط ویژه', value: content.terms.specialConditionsFa ?? '—' },
      { labelFa: 'قالب', value: 'نسخه ' + content.templateVersion },
      { labelFa: 'اثر محتوا (SHA-256)', value: hash },
      ...approvals.map((a) => ({ labelFa: 'تأیید', value: a.nameFa + ' — ' + a.approvedAt.toISOString() })),
    ],
    table: {
      captionFa: 'بندها',
      headersFa: ['بند', 'متن', 'تکمیل طرفین'],
      rows: content.clauses.map((c) => [c.titleFa + (c.required ? ' (اجباری)' : ''), c.bodyFa, c.fillFa ?? '—']),
    },
    footerFa: NOT_A_LEGAL_SIGNATURE_FA + ' ' + NO_PAYMENT_THROUGH_HAMZIST_FA,
  };
}

/** Render the confirmed version once and store it privately; an existing PDF is never replaced. */
export async function ensureContractPdf(db: Database, storageRoot: string, contractId: string): Promise<string | null> {
  const [contract] = await db.select().from(finderContracts).where(eq(finderContracts.id, contractId)).limit(1);
  if (!contract || contract.confirmedNumber === null) return null;
  if (contract.pdfFileId) return contract.pdfFileId;
  const version = (await versionOf(db, contract.id, contract.confirmedNumber))!;
  const approvals = await db
    .select({ accountId: finderContractApprovals.accountId, approvedAt: finderContractApprovals.approvedAt })
    .from(finderContractApprovals)
    .where(eq(finderContractApprovals.contractVersionId, version.id));
  const content = version.content as ContractContent;
  const names = new Map([[content.parties.sire.accountId, content.parties.sire.nameFa], [content.parties.dam.accountId, content.parties.dam.nameFa]]);
  const bytes = await renderDocumentPdf(pdfSpec(content, contract.id, version.contentHash, approvals.map((a) => ({ nameFa: names.get(a.accountId) ?? 'طرف قرارداد', approvedAt: a.approvedAt }))));
  const [request] = await db.select({ owner: matingRequests.senderAccountId }).from(matingRequests).where(eq(matingRequests.id, contract.requestId)).limit(1);
  return db.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, null, { ownerAccountId: request!.owner, purpose: 'FINDER_CONTRACT_PDF', bytes, originalName: 'contract.pdf' });
    const [set] = await tx
      .update(finderContracts)
      .set({ pdfFileId: stored.id })
      .where(and(eq(finderContracts.id, contract.id), isNull(finderContracts.pdfFileId)))
      .returning({ id: finderContracts.pdfFileId });
    return set?.id ?? contract.pdfFileId;
  });
}

/** The stored PDF, for the two parties only; each download is audited. */
export async function contractPdfFor(db: Database, storageRoot: string, actor: Actor, contractId: string): Promise<Buffer> {
  const { contract } = await loadContractForParty(db, actor, contractId, false);
  if (contract.confirmedNumber === null) throw conflict('این قرارداد هنوز تأیید نشده است.');
  const fileId = contract.pdfFileId ?? (await ensureContractPdf(db, storageRoot, contract.id));
  // Read directly: the party was checked above, and no operator role may reach this purpose.
  const [file] = await db.select({ storageKey: storedFiles.storageKey }).from(storedFiles).where(eq(storedFiles.id, fileId!)).limit(1);
  await recordAudit(db, actor, { action: 'FINDER_CONTRACT_PDF_DOWNLOADED', targetType: 'FINDER_CONTRACT', targetId: contract.id });
  return fs.readFile(resolveWithinRoot(storageRoot, file!.storageKey));
}
