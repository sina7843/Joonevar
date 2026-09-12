/**
 * CMS service — Requirements-Phase-2 §12, §19, §20, §22 (PROMPT-004).
 *
 * Writers run in the author or content-admin environment only. Every write
 * checks the record against the actor (an author never learns that someone
 * else's content exists), carries the version it was made against, appends a
 * revision when content changes, and writes its audit row in the same
 * transaction. Public readers take no actor and see only what is visible at
 * the moment they ask — scheduling is a comparison, not a job (DEC-0159).
 */
import fs from 'node:fs/promises';
import { and, asc, count, desc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { contentCategories, contentItems, contentRevisions, contentSlugRedirects } from '../db/schema/content.ts';
import { referenceBreeds, species, storedFiles } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { findFile, putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { isReviewDate, normalizeForSearch } from '../breeds/model.ts';
import type { Actor } from '../authz/actor.ts';
import type { SitemapEntry } from '../seo/sitemap.ts';
import { activeRestrictionFor, restrictionMessage } from '../moderation/restrictions.ts';
import { blockedByRestriction } from '../moderation/model.ts';
import {
  KIND_PATH,
  allowedMoves,
  bylineFor,
  canEditContent,
  contentSlugify,
  creatableKinds,
  effectivePublishAt,
  isContentKind,
  isContentStatus,
  isValidContentSlug,
  parseSources,
  parseTags,
  publicState,
  publishBlockers,
  reasonRequired,
  type ContentKind,
  type ContentRole,
  type ContentStatus,
  type PublicState,
} from './model.ts';

export type ContentRow = typeof contentItems.$inferSelect;
export type CategoryRow = typeof contentCategories.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این محتوا هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید و تغییر را تکرار کنید.';
const TARGET = 'CONTENT_ITEM';

function roleOf(actor: Actor): ContentRole {
  if (actor.context === 'AUTHOR' || actor.context === 'CONTENT_ADMIN') return actor.context;
  throw forbidden('محتوا فقط در محیط نویسنده یا ادمین محتوا مدیریت می‌شود.');
}

function requireReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim();
  if (trimmed === '') throw validation('دلیل این تغییر را بنویسید؛ در تاریخچه ثبت می‌شود.');
  return trimmed;
}

const blankToNull = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === '' ? null : value.trim();

// ── Addresses, revisions, duplicates ──────────────────────────────────────

async function slugTaken(tx: DbClient, kind: ContentKind, slug: string, exceptId?: string): Promise<boolean> {
  const [item] = await tx
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.kind, kind), eq(contentItems.slug, slug)))
    .limit(1);
  if (item && item.id !== exceptId) return true;
  const [redirect] = await tx
    .select({ contentId: contentSlugRedirects.contentId })
    .from(contentSlugRedirects)
    .where(and(eq(contentSlugRedirects.kind, kind), eq(contentSlugRedirects.slug, slug)))
    .limit(1);
  return Boolean(redirect && redirect.contentId !== exceptId);
}

export async function allocateContentSlug(tx: DbClient, kind: ContentKind, title: string): Promise<string> {
  const base = contentSlugify(title) || 'content';
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : base + '-' + n;
    if (!(await slugTaken(tx, kind, candidate))) return candidate;
  }
}

/**
 * Existing content of the same type under the same title (§22 Duplicate
 * Candidate), with Persian letter variants, spacing and punctuation ignored.
 *
 * ponytail: scans one content type; move to the PROMPT-012 search index when a
 * type holds tens of thousands of items.
 */
export async function similarTitles(
  tx: DbClient,
  kind: ContentKind,
  titleFa: string,
  exceptId?: string,
): Promise<Array<{ id: string; titleFa: string; slug: string }>> {
  const key = normalizeForSearch(titleFa);
  if (key === '') return [];
  const rows = await tx
    .select({ id: contentItems.id, titleFa: contentItems.titleFa, slug: contentItems.slug })
    .from(contentItems)
    .where(and(eq(contentItems.kind, kind), ne(contentItems.status, 'DELETED')));
  return rows.filter((row) => row.id !== exceptId && normalizeForSearch(row.titleFa) === key);
}

const SNAPSHOT_FIELDS = [
  'slug',
  'titleFa',
  'summaryFa',
  'bodyFa',
  'sources',
  'tags',
  'categoryId',
  'speciesCode',
  'breedId',
  'imageFileId',
  'imageAltFa',
  'seoTitle',
  'seoDescription',
  'reviewedOn',
] as const;

type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];
export type ContentSnapshot = Pick<ContentRow, SnapshotField>;

const snapshotOf = (row: ContentRow): ContentSnapshot =>
  Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, row[field]])) as ContentSnapshot;

export async function writeRevision(tx: DbClient, actor: Actor, row: ContentRow, note: string | null): Promise<void> {
  await tx.insert(contentRevisions).values({
    contentId: row.id,
    number: row.revisionNumber,
    snapshot: snapshotOf(row),
    note,
    createdByAccountId: actor.accountId,
  });
}

function diff(before: ContentSnapshot, after: ContentSnapshot) {
  const was: Record<string, unknown> = {};
  const now: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      // The body can be long; the revision keeps it whole, the audit records that it changed.
      was[field] = field === 'bodyFa' ? '[متن در نسخه قبلی]' : before[field];
      now[field] = field === 'bodyFa' ? '[متن در نسخه تازه]' : after[field];
    }
  }
  return { was, now, changed: Object.keys(now).length > 0 };
}

async function loadForActor(tx: DbClient, actor: Actor, contentId: string) {
  const role = roleOf(actor);
  if (!UUID.test(contentId)) throw notFound('محتوا پیدا نشد.');
  const [row] = await tx.select().from(contentItems).where(eq(contentItems.id, contentId)).limit(1);
  // An author gets the same answer for someone else's content as for none at all (§20).
  if (!row || (role === 'AUTHOR' && row.authorAccountId !== actor.accountId)) throw notFound('محتوا پیدا نشد.');
  return { row, role, isOwner: row.authorAccountId === actor.accountId };
}

/** A publisher restriction stops an author publishing or changing public content (DEC-0162). */
async function assertNotRestricted(
  tx: DbClient,
  role: ContentRole,
  row: ContentRow,
  action: 'PUBLISH' | 'EDIT',
  now: Date,
): Promise<void> {
  if (role !== 'AUTHOR' || !blockedByRestriction(action, row.status)) return;
  const restriction = await activeRestrictionFor(tx, row.authorAccountId, now);
  if (restriction) throw forbidden(restrictionMessage(restriction));
}

async function applySlugChange(tx: DbClient, before: ContentRow, after: ContentRow): Promise<void> {
  if (before.slug === after.slug) return;
  await tx
    .delete(contentSlugRedirects)
    .where(
      and(
        eq(contentSlugRedirects.kind, after.kind),
        eq(contentSlugRedirects.slug, after.slug),
        eq(contentSlugRedirects.contentId, after.id),
      ),
    );
  await tx
    .insert(contentSlugRedirects)
    .values({ kind: after.kind, slug: before.slug, contentId: after.id })
    .onConflictDoNothing();
}

// ── Writers ───────────────────────────────────────────────────────────────

export async function createContent(
  database: Database,
  actor: Actor,
  input: { kind: string; titleFa: string; confirmDuplicate?: boolean },
): Promise<ContentRow> {
  const role = roleOf(actor);
  if (!isContentKind(input.kind) || !creatableKinds(role).includes(input.kind)) {
    throw forbidden('ساخت این نوع محتوا در این محیط ممکن نیست.');
  }
  const kind = input.kind;
  const titleFa = input.titleFa.trim();
  if (titleFa === '') throw validation('عنوان را بنویسید.');

  return database.transaction(async (tx) => {
    if (!input.confirmDuplicate) {
      const similar = await similarTitles(tx, kind, titleFa);
      if (similar.length > 0) {
        throw conflict(
          'محتوایی با همین عنوان وجود دارد: ' +
            similar.map((item) => '«' + item.titleFa + '»').join('، ') +
            '. اگر عنوان تکراری عمدی است، تأیید کنید.',
          { duplicates: similar },
        );
      }
    }
    const slug = await allocateContentSlug(tx, kind, titleFa);
    const [row] = await tx
      .insert(contentItems)
      .values({ kind, slug, titleFa, authorAccountId: actor.accountId })
      .returning();
    await writeRevision(tx, actor, row!, 'ساخت پیش‌نویس');
    await recordAudit(tx, actor, {
      action: 'CONTENT_CREATED',
      targetType: TARGET,
      targetId: row!.id,
      targetVersion: row!.version,
      after: { kind, slug, titleFa, status: row!.status },
      metadata: input.confirmDuplicate ? { duplicateTitleConfirmed: true } : null,
    });
    return row!;
  });
}

export interface ContentFieldsInput {
  readonly contentId: string;
  readonly expectedVersion: number;
  readonly slug: string;
  readonly titleFa: string;
  readonly summaryFa: string;
  readonly bodyFa: string;
  readonly sourcesText: string;
  readonly tagsText: string;
  readonly categoryId: string | null;
  readonly speciesCode: string | null;
  readonly breedId: string | null;
  readonly imageAltFa: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly reviewedOn: string | null;
}

/** Saves the fields of an item as a new revision. */
export async function updateContent(database: Database, actor: Actor, input: ContentFieldsInput): Promise<ContentRow> {
  const titleFa = input.titleFa.trim();
  if (titleFa === '') throw validation('عنوان را بنویسید.');
  const slug = input.slug.trim();
  if (!isValidContentSlug(slug)) {
    throw validation('نشانی صفحه فقط حروف فارسی یا لاتین کوچک، رقم و خط تیره است؛ مثلاً مراقبت-از-توله.');
  }
  const { sources, problems } = parseSources(input.sourcesText);
  if (problems.length > 0) throw validation(problems[0]!);
  const reviewedOn = blankToNull(input.reviewedOn);
  if (reviewedOn !== null && !isReviewDate(reviewedOn)) throw validation('تاریخ بازبینی باید روزی معتبر و گذشته باشد.');
  const seoTitle = blankToNull(input.seoTitle);
  const seoDescription = blankToNull(input.seoDescription);
  if (seoTitle !== null && seoTitle.length > 70) throw validation('عنوان SEO حداکثر ۷۰ نویسه است.');
  if (seoDescription !== null && seoDescription.length > 200) throw validation('توضیح SEO حداکثر ۲۰۰ نویسه است.');

  return database.transaction(async (tx) => {
    const { row: current, role, isOwner } = await loadForActor(tx, actor, input.contentId);
    if (!canEditContent(role, current.status, isOwner)) {
      throw forbidden(
        current.status === 'HIDDEN'
          ? 'این محتوا را ادمین محتوا پنهان کرده است و تا تصمیم او ویرایش نمی‌شود.'
          : 'این محتوا در این وضعیت ویرایش نمی‌شود.',
      );
    }
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    await assertNotRestricted(tx, role, current, 'EDIT', new Date());

    const categoryId = blankToNull(input.categoryId);
    if (categoryId !== null) {
      const [category] = UUID.test(categoryId)
        ? await tx.select().from(contentCategories).where(eq(contentCategories.id, categoryId)).limit(1)
        : [];
      if (!category || category.kind !== current.kind || (!category.isActive && category.id !== current.categoryId)) {
        throw validation('دسته انتخاب‌شده برای این نوع محتوا نیست.');
      }
    }
    let speciesCode = blankToNull(input.speciesCode);
    const breedId = blankToNull(input.breedId);
    if (breedId !== null) {
      const [breed] = UUID.test(breedId)
        ? await tx.select().from(referenceBreeds).where(eq(referenceBreeds.id, breedId)).limit(1)
        : [];
      if (!breed || breed.mergedIntoBreedId) throw validation('نژاد انتخاب‌شده در بانک نژاد نیست.');
      if (speciesCode !== null && speciesCode !== breed.speciesCode) throw validation('نژاد و گونه انتخاب‌شده با هم نمی‌خوانند.');
      speciesCode = breed.speciesCode;
    }
    if (speciesCode !== null) {
      const [row] = await tx.select().from(species).where(eq(species.code, speciesCode)).limit(1);
      if (!row) throw validation('گونه انتخاب‌شده در فهرست گونه‌ها نیست.');
    }
    if (slug !== current.slug && (await slugTaken(tx, current.kind, slug, current.id))) {
      throw conflict('این نشانی صفحه برای محتوای دیگری از همین نوع استفاده شده است.');
    }

    const next: ContentSnapshot = {
      slug,
      titleFa,
      summaryFa: input.summaryFa.trim(),
      bodyFa: input.bodyFa.trim(),
      sources,
      tags: parseTags(input.tagsText),
      categoryId,
      speciesCode,
      breedId,
      imageFileId: current.imageFileId,
      imageAltFa: blankToNull(input.imageAltFa),
      seoTitle,
      seoDescription,
      reviewedOn,
    };
    const change = diff(snapshotOf(current), next);
    if (!change.changed) return current;
    const clearsCorrection = isOwner && current.correctionNote !== null;
    if (current.status === 'PUBLISHED' || current.status === 'ARCHIVED') {
      const blockers = publishBlockers({ ...next, kind: current.kind });
      if (blockers.length > 0) throw validation('این محتوا منتشر شده است. ' + blockers[0]);
    }
    if (current.imageFileId !== null && next.imageAltFa === null) {
      throw validation('تصویر این محتوا متن جایگزین لازم دارد.');
    }

    const [row] = await tx
      .update(contentItems)
      .set({
        ...next,
        // The author's own save answers a correction request (DEC-0162).
        ...(clearsCorrection ? { correctionNote: null, correctionRequestedAt: null } : {}),
        revisionNumber: current.revisionNumber + 1,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await applySlugChange(tx, current, row);
    await writeRevision(tx, actor, row, null);
    if (clearsCorrection) {
      await recordAudit(tx, actor, {
        action: 'CONTENT_CORRECTION_ADDRESSED',
        targetType: TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { correctionNote: current.correctionNote },
        after: { correctionNote: null, revision: row.revisionNumber },
      });
    }
    await recordAudit(tx, actor, {
      action: 'CONTENT_UPDATED',
      targetType: TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: change.was,
      after: change.now,
      metadata: { revision: row.revisionNumber },
    });
    return row;
  });
}

/** Attaches the item's image; the file stays private and is served only while the content is visible (DEC-0160). */
export async function attachContentImage(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: { contentId: string; expectedVersion: number; bytes: Uint8Array; originalName: string | null; altFa: string },
): Promise<ContentRow> {
  const altFa = input.altFa.trim();
  if (altFa === '') throw validation('متن جایگزین تصویر را بنویسید؛ برای کسی که تصویر را نمی‌بیند لازم است.');

  return database.transaction(async (tx) => {
    const { row: current, role, isOwner } = await loadForActor(tx, actor, input.contentId);
    if (!canEditContent(role, current.status, isOwner)) throw forbidden('این محتوا در این وضعیت ویرایش نمی‌شود.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    await assertNotRestricted(tx, role, current, 'EDIT', new Date());

    // Owned by the author, so the author can preview it whoever uploaded it.
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: current.authorAccountId,
      purpose: 'CONTENT_IMAGE',
      bytes: input.bytes,
      originalName: input.originalName,
    });
    const [row] = await tx
      .update(contentItems)
      .set({
        imageFileId: stored.id,
        imageAltFa: altFa,
        revisionNumber: current.revisionNumber + 1,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await writeRevision(tx, actor, row, 'تصویر تازه');
    await recordAudit(tx, actor, {
      action: 'CONTENT_IMAGE_ATTACHED',
      targetType: TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { imageFileId: current.imageFileId },
      after: { imageFileId: stored.id, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return row;
  });
}

/** Publish (now or scheduled), unpublish, archive, hide, delete or restore — each within its role's moves. */
export async function changeContentStatus(
  database: Database,
  actor: Actor,
  input: { contentId: string; expectedVersion: number; to: string; reason?: string | null; publishAt?: Date | null },
  now: Date = new Date(),
): Promise<ContentRow> {
  return database.transaction((tx) => applyContentStatus(tx, actor, input, now));
}

/** The status change itself, for a caller already inside a transaction — a moderation decision. */
export async function applyContentStatus(
  tx: DbClient,
  actor: Actor,
  input: { contentId: string; expectedVersion: number; to: string; reason?: string | null; publishAt?: Date | null },
  now: Date = new Date(),
): Promise<ContentRow> {
  if (!isContentStatus(input.to)) throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const to = input.to;

  const { row: current, role, isOwner } = await loadForActor(tx, actor, input.contentId);
  const moves = allowedMoves(role, current.status, isOwner);
  if (moves.length === 0 && role === 'AUTHOR') {
    throw forbidden('این محتوا را ادمین محتوا ' + (current.status === 'HIDDEN' ? 'پنهان' : 'حذف') + ' کرده است.');
  }
  if (!moves.includes(to)) throw validation('این تغییر وضعیت برای این محتوا ممکن نیست.');
  if (current.version !== input.expectedVersion) throw conflict(STALE);
  if (to === 'PUBLISHED') await assertNotRestricted(tx, role, current, 'PUBLISH', now);
  const reason = reasonRequired(role, current.status, to, isOwner) ? requireReason(input.reason) : blankToNull(input.reason);

  let publishAt = current.publishAt;
  let firstPublishedAt = current.firstPublishedAt;
  if (to === 'PUBLISHED') {
    const blockers = publishBlockers(current);
    if (blockers.length > 0) throw validation(blockers[0]!);
    if (current.imageFileId !== null && blankToNull(current.imageAltFa) === null) {
      throw validation('تصویر این محتوا متن جایگزین لازم دارد.');
    }
    publishAt = effectivePublishAt(input.publishAt ?? null, now);
    firstPublishedAt = firstPublishedAt ?? publishAt;
  } else if (to === 'DRAFT') {
    publishAt = null;
  }
  const moderationNote = to === 'HIDDEN' || to === 'DELETED' ? reason : null;

  const [row] = await tx
    .update(contentItems)
    .set({ status: to, publishAt, firstPublishedAt, moderationNote, version: current.version + 1, updatedAt: new Date() })
    .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
    .returning();
  if (!row) throw conflict(STALE);
  await recordAudit(tx, actor, {
    action: 'CONTENT_STATUS_CHANGED',
    targetType: TARGET,
    targetId: row.id,
    targetVersion: row.version,
    before: { status: current.status, publishAt: current.publishAt },
    after: { status: row.status, publishAt: row.publishAt },
    reason,
  });
  return row;
}

/** Brings an earlier revision back as a new revision; history is never rewritten. */
export async function restoreRevision(
  database: Database,
  actor: Actor,
  input: { contentId: string; expectedVersion: number; revisionNumber: number },
): Promise<ContentRow> {
  return database.transaction(async (tx) => {
    const { row: current, role, isOwner } = await loadForActor(tx, actor, input.contentId);
    if (!canEditContent(role, current.status, isOwner)) throw forbidden('این محتوا در این وضعیت ویرایش نمی‌شود.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    await assertNotRestricted(tx, role, current, 'EDIT', new Date());
    const [revision] = await tx
      .select()
      .from(contentRevisions)
      .where(and(eq(contentRevisions.contentId, current.id), eq(contentRevisions.number, input.revisionNumber)))
      .limit(1);
    if (!revision) throw notFound('این نسخه پیدا نشد.');

    const snapshot = revision.snapshot as ContentSnapshot;
    if (snapshot.slug !== current.slug && (await slugTaken(tx, current.kind, snapshot.slug, current.id))) {
      throw conflict('نشانی آن نسخه حالا برای محتوای دیگری استفاده می‌شود؛ ابتدا نشانی را تغییر دهید.');
    }
    if (current.status === 'PUBLISHED' || current.status === 'ARCHIVED') {
      const blockers = publishBlockers({ ...snapshot, kind: current.kind });
      if (blockers.length > 0) throw validation('آن نسخه برای محتوای منتشرشده کامل نیست. ' + blockers[0]);
    }

    const [row] = await tx
      .update(contentItems)
      .set({ ...snapshot, revisionNumber: current.revisionNumber + 1, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await applySlugChange(tx, current, row);
    await writeRevision(tx, actor, row, 'بازگردانی نسخه ' + revision.number);
    await recordAudit(tx, actor, {
      action: 'CONTENT_REVISION_RESTORED',
      targetType: TARGET,
      targetId: row.id,
      targetVersion: row.version,
      metadata: { restoredRevision: revision.number, newRevision: row.revisionNumber },
    });
    return row;
  });
}

// ── Categories ────────────────────────────────────────────────────────────

function assertContentAdmin(actor: Actor): void {
  if (actor.context !== 'CONTENT_ADMIN') throw forbidden('دسته‌های محتوا فقط در محیط ادمین محتوا مدیریت می‌شوند.');
}

export async function allCategories(database: DbClient, actor: Actor): Promise<CategoryRow[]> {
  assertContentAdmin(actor);
  return database.select().from(contentCategories).orderBy(asc(contentCategories.kind), asc(contentCategories.sortOrder), asc(contentCategories.nameFa));
}

export async function createCategory(
  database: Database,
  actor: Actor,
  input: { kind: string; nameFa: string; slug: string },
): Promise<CategoryRow> {
  assertContentAdmin(actor);
  if (!isContentKind(input.kind)) throw validation('نوع محتوا را انتخاب کنید.');
  const nameFa = input.nameFa.trim();
  if (nameFa === '') throw validation('نام دسته را بنویسید.');
  const slug = blankToNull(input.slug) ?? contentSlugify(nameFa);
  if (!isValidContentSlug(slug)) throw validation('نشانی دسته فقط حروف، رقم و خط تیره است.');

  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(
        and(
          eq(contentCategories.kind, input.kind as ContentKind),
          or(eq(contentCategories.slug, slug), eq(contentCategories.nameFa, nameFa)),
        ),
      )
      .limit(1);
    if (existing) throw conflict('دسته‌ای با همین نام یا نشانی برای این نوع محتوا وجود دارد.');
    const [row] = await tx
      .insert(contentCategories)
      .values({ kind: input.kind as ContentKind, nameFa, slug })
      .returning();
    await recordAudit(tx, actor, {
      action: 'CONTENT_CATEGORY_CREATED',
      targetType: 'CONTENT_CATEGORY',
      targetId: row!.id,
      after: { kind: row!.kind, nameFa, slug },
    });
    return row!;
  });
}

export async function setCategoryActive(
  database: Database,
  actor: Actor,
  input: { categoryId: string; active: boolean },
): Promise<CategoryRow> {
  assertContentAdmin(actor);
  if (!UUID.test(input.categoryId)) throw notFound('دسته پیدا نشد.');
  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(contentCategories).where(eq(contentCategories.id, input.categoryId)).limit(1);
    if (!current) throw notFound('دسته پیدا نشد.');
    const [row] = await tx
      .update(contentCategories)
      .set({ isActive: input.active, updatedAt: new Date() })
      .where(eq(contentCategories.id, current.id))
      .returning();
    await recordAudit(tx, actor, {
      action: input.active ? 'CONTENT_CATEGORY_ENABLED' : 'CONTENT_CATEGORY_RETIRED',
      targetType: 'CONTENT_CATEGORY',
      targetId: current.id,
      before: { isActive: current.isActive },
      after: { isActive: row!.isActive },
    });
    return row!;
  });
}

// ── Panel readers ─────────────────────────────────────────────────────────

export interface PanelItem {
  readonly id: string;
  readonly kind: ContentKind;
  readonly titleFa: string;
  readonly slug: string;
  readonly status: ContentStatus;
  readonly publicState: PublicState;
  readonly publishAt: Date | null;
  readonly updatedAt: Date;
  readonly revisionNumber: number;
}

export async function contentForPanel(
  database: DbClient,
  actor: Actor,
  filter: { status?: ContentStatus | null; kind?: ContentKind | null; page: number; pageSize?: number },
  now: Date = new Date(),
): Promise<Page<PanelItem>> {
  const role = roleOf(actor);
  const conditions = [
    role === 'AUTHOR' ? eq(contentItems.authorAccountId, actor.accountId) : undefined,
    filter.status ? eq(contentItems.status, filter.status) : undefined,
    filter.kind ? eq(contentItems.kind, filter.kind) : undefined,
  ].filter((condition) => condition !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const request = { page: filter.page, pageSize: filter.pageSize ?? 20 };

  const rows = await database
    .select()
    .from(contentItems)
    .where(where)
    .orderBy(desc(contentItems.updatedAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const [counted] = await database.select({ value: count() }).from(contentItems).where(where);
  return pageOf(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      titleFa: row.titleFa,
      slug: row.slug,
      status: row.status,
      publicState: publicState(row, now),
      publishAt: row.publishAt,
      updatedAt: row.updatedAt,
      revisionNumber: row.revisionNumber,
    })),
    Number(counted?.value ?? 0),
    request,
  );
}

export async function contentForEditing(database: DbClient, actor: Actor, contentId: string, now: Date = new Date()) {
  let loaded;
  try {
    loaded = await loadForActor(database, actor, contentId);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') return null;
    throw error;
  }
  const { row, role, isOwner } = loaded;
  const [revisions, categories, breeds, speciesRows, authorProfile] = await Promise.all([
    database
      .select({
        number: contentRevisions.number,
        note: contentRevisions.note,
        createdAt: contentRevisions.createdAt,
      })
      .from(contentRevisions)
      .where(eq(contentRevisions.contentId, row.id))
      .orderBy(desc(contentRevisions.number))
      .limit(20),
    database
      .select()
      .from(contentCategories)
      .where(
        and(
          eq(contentCategories.kind, row.kind),
          row.categoryId ? or(eq(contentCategories.isActive, true), eq(contentCategories.id, row.categoryId)) : eq(contentCategories.isActive, true),
        ),
      )
      .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.nameFa)),
    database
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa, nameEn: referenceBreeds.nameEn })
      .from(referenceBreeds)
      .where(isNull(referenceBreeds.mergedIntoBreedId))
      .orderBy(asc(referenceBreeds.nameFa)),
    database.select().from(species).orderBy(asc(species.sortOrder)),
    database
      .select({ displayName: profiles.displayName, displayNameVisible: profiles.displayNameVisible })
      .from(profiles)
      .where(eq(profiles.accountId, row.authorAccountId))
      .limit(1),
  ]);
  return {
    row,
    role,
    isOwner,
    canEdit: canEditContent(role, row.status, isOwner),
    moves: allowedMoves(role, row.status, isOwner),
    publicState: publicState(row, now),
    byline: bylineFor(authorProfile[0] ?? null),
    restriction: await activeRestrictionFor(database, row.authorAccountId, now),
    revisions,
    categories,
    breeds,
    species: speciesRows,
  };
}

// ── Public readers ────────────────────────────────────────────────────────

const visibleNow = (kind: ContentKind, now: Date) =>
  and(eq(contentItems.kind, kind), eq(contentItems.status, 'PUBLISHED'), lte(contentItems.publishAt, now));

export interface ContentCard {
  readonly slug: string;
  readonly titleFa: string;
  readonly summaryFa: string;
  readonly publishAt: Date;
  readonly categoryNameFa: string | null;
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
}

export async function publicContentList(
  database: DbClient,
  query: { kind: ContentKind; categorySlug?: string | null; page: number; pageSize?: number },
  now: Date = new Date(),
) {
  const categories = await database
    .select()
    .from(contentCategories)
    .where(and(eq(contentCategories.kind, query.kind), eq(contentCategories.isActive, true)))
    .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.nameFa));
  const category = query.categorySlug ? (categories.find((row) => row.slug === query.categorySlug) ?? null) : null;

  const where = category ? and(visibleNow(query.kind, now), eq(contentItems.categoryId, category.id)) : visibleNow(query.kind, now);
  const request = { page: query.page, pageSize: query.pageSize ?? 12 };
  const rows = await database
    .select({ item: contentItems, categoryNameFa: contentCategories.nameFa })
    .from(contentItems)
    .leftJoin(contentCategories, eq(contentItems.categoryId, contentCategories.id))
    .where(where)
    .orderBy(desc(contentItems.publishAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const [counted] = await database.select({ value: count() }).from(contentItems).where(where);
  const [all] = await database.select({ value: count() }).from(contentItems).where(visibleNow(query.kind, now));

  const items: ContentCard[] = rows.map(({ item, categoryNameFa }) => ({
    slug: item.slug,
    titleFa: item.titleFa,
    summaryFa: item.summaryFa,
    publishAt: item.publishAt!,
    categoryNameFa,
    imageFileId: item.imageFileId,
    imageAltFa: item.imageAltFa,
  }));
  return {
    ...pageOf(items, Number(counted?.value ?? 0), request),
    visibleTotal: Number(all?.value ?? 0),
    categories,
    category,
  };
}

export type PublicContentPage =
  | { readonly kind: 'redirect'; readonly slug: string }
  | {
      readonly kind: 'content';
      readonly item: ContentRow;
      readonly state: 'VISIBLE' | 'ARCHIVED';
      readonly byline: string;
      readonly categoryNameFa: string | null;
      readonly breed: { readonly slug: string; readonly nameFa: string } | null;
    };

/**
 * One public item by address. Draft, scheduled, hidden and deleted content does
 * not exist from outside — the same 404 as a mistyped address.
 */
export async function publicContentBySlug(
  database: DbClient,
  kind: ContentKind,
  slug: string,
  now: Date = new Date(),
): Promise<PublicContentPage | null> {
  if (!isValidContentSlug(slug)) return null;
  const [row] = await database
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.kind, kind), eq(contentItems.slug, slug)))
    .limit(1);

  if (!row) {
    const [moved] = await database
      .select({ item: contentItems })
      .from(contentSlugRedirects)
      .innerJoin(contentItems, eq(contentSlugRedirects.contentId, contentItems.id))
      .where(and(eq(contentSlugRedirects.kind, kind), eq(contentSlugRedirects.slug, slug)))
      .limit(1);
    if (!moved) return null;
    const movedState = publicState(moved.item, now);
    return movedState === 'VISIBLE' || movedState === 'ARCHIVED' ? { kind: 'redirect', slug: moved.item.slug } : null;
  }

  const state = publicState(row, now);
  if (state !== 'VISIBLE' && state !== 'ARCHIVED') return null;

  const [author] = await database
    .select({ displayName: profiles.displayName, displayNameVisible: profiles.displayNameVisible })
    .from(profiles)
    .where(eq(profiles.accountId, row.authorAccountId))
    .limit(1);
  const [category] = row.categoryId
    ? await database.select({ nameFa: contentCategories.nameFa }).from(contentCategories).where(eq(contentCategories.id, row.categoryId)).limit(1)
    : [];
  const [breed] = row.breedId
    ? await database
        .select({ slug: referenceBreeds.slug, nameFa: referenceBreeds.nameFa, status: referenceBreeds.profileStatus })
        .from(referenceBreeds)
        .where(eq(referenceBreeds.id, row.breedId))
        .limit(1)
    : [];

  return {
    kind: 'content',
    item: row,
    state,
    byline: bylineFor(author ?? null),
    categoryNameFa: category?.nameFa ?? null,
    breed: breed && breed.status !== 'DRAFT' ? { slug: breed.slug, nameFa: breed.nameFa } : null,
  };
}

/** Visible education and news written about one breed — the breed page's related content. */
export async function relatedContentForBreed(
  database: DbClient,
  breedId: string,
  now: Date = new Date(),
  limit = 5,
): Promise<Array<{ kind: ContentKind; slug: string; titleFa: string }>> {
  return database
    .select({ kind: contentItems.kind, slug: contentItems.slug, titleFa: contentItems.titleFa })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.breedId, breedId),
        inArray(contentItems.kind, ['ARTICLE', 'NEWS']),
        eq(contentItems.status, 'PUBLISHED'),
        lte(contentItems.publishAt, now),
      ),
    )
    .orderBy(desc(contentItems.publishAt))
    .limit(limit);
}

export async function contentSitemapEntries(database: DbClient, kind: ContentKind, now: Date = new Date()): Promise<SitemapEntry[]> {
  const base = KIND_PATH[kind];
  if (base === null) return [];
  const rows = await database
    .select({ slug: contentItems.slug, updatedAt: contentItems.updatedAt })
    .from(contentItems)
    .where(visibleNow(kind, now))
    .orderBy(desc(contentItems.publishAt));
  return rows.map((row) => ({ path: base + '/' + row.slug, lastModified: row.updatedAt }));
}

/**
 * The bytes of a content image, for the public media route — only while some
 * visible or archived content shows it. Anything else is `null`, the same
 * answer as for an id that never existed (DEC-0160).
 */
export async function publicContentImage(
  database: DbClient,
  storageRoot: string,
  fileId: string,
  now: Date = new Date(),
): Promise<{ mime: string; bytes: Buffer; sha256: string } | null> {
  if (!UUID.test(fileId)) return null;
  const [shown] = await database
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.imageFileId, fileId),
        or(and(eq(contentItems.status, 'PUBLISHED'), lte(contentItems.publishAt, now)), eq(contentItems.status, 'ARCHIVED')),
      ),
    )
    .limit(1);
  if (!shown) return null;
  const [file] = await database.select({ purpose: storedFiles.purpose }).from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  if (!file || file.purpose !== 'CONTENT_IMAGE') return null;
  const record = await findFile(database, fileId);
  const bytes = await fs.readFile(resolveWithinRoot(storageRoot, record.storageKey));
  // The digest is already stored for every file; returning it lets the route
  // answer a repeat view with 304 without ever caching the decision that made
  // the image visible (DEC-0160, PROMPT-018).
  return { mime: record.mime, bytes, sha256: record.sha256 };
}
