/**
 * Club posts — Requirements-Phase-2 §11, §12, §13 (PROMPT-010).
 *
 * A club post is an ordinary `content_item` row of kind CLUB_POST that belongs
 * to its club, not a second news system (P2-D15). Everything the CMS already
 * does keeps working on it: revisions, reports, the content admin's moderation
 * and the audit trail. What this module adds is who may write one — a club's
 * manager, and only while the superadmin's publishing permission is on (§11,
 * DEC-0170) — and the club's own status rules, which never include the content
 * admin's HIDDEN or DELETED.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { communities } from '../db/schema/communities.ts';
import { contentItems } from '../db/schema/content.ts';
import { allocateContentSlug, similarTitles, writeRevision, type ContentRow } from '../content/service.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { postingProblem, type CommunityKind } from './model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این نوشته هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const OWNER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
/** The club's own statuses. HIDDEN and DELETED belong to the content admin (DEC-0162). */
const CLUB_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
type ClubStatus = (typeof CLUB_STATUSES)[number];

const text = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

function bounded(value: string | null | undefined, max: number, labelFa: string): string | null {
  const out = text(value);
  if (out !== null && out.length > max) throw validation(labelFa + ' حداکثر ' + max.toLocaleString('fa-IR') + ' نویسه است.');
  return out;
}

/** The club this actor may write for, or a refusal that says why. */
async function writableClub(tx: DbClient, actor: Actor, communityId: string) {
  const [community] = UUID.test(communityId)
    ? await tx.select().from(communities).where(eq(communities.id, communityId)).limit(1)
    : [];
  if (!community) throw notFound('کلاب پیدا نشد.');
  const isOwner =
    community.ownerAccountId !== null && community.ownerAccountId === actor.accountId && OWNER_CONTEXTS.includes(actor.context);
  if (!isOwner && actor.context !== 'SUPERADMIN') throw forbidden('نوشته کلاب را فقط مدیر همان کلاب یا سوپرادمین می‌نویسد.');
  const problem = postingProblem({ kind: community.kind as CommunityKind, canPublishPosts: community.canPublishPosts });
  if (problem) throw forbidden(problem);
  return community;
}

async function postOf(tx: DbClient, actor: Actor, postId: string): Promise<ContentRow> {
  const [row] = UUID.test(postId) ? await tx.select().from(contentItems).where(eq(contentItems.id, postId)).limit(1) : [];
  if (!row || row.kind !== 'CLUB_POST' || row.communityId === null) throw notFound('نوشته پیدا نشد.');
  await writableClub(tx, actor, row.communityId);
  return row;
}

export async function createCommunityPost(
  database: Database,
  actor: Actor,
  input: { communityId: string; titleFa: string; confirmDuplicate?: boolean },
): Promise<ContentRow> {
  const titleFa = bounded(input.titleFa, 200, 'عنوان');
  if (titleFa === null) throw validation('عنوان نوشته را بنویسید.');

  return database.transaction(async (tx) => {
    const club = await writableClub(tx, actor, input.communityId);
    if (input.confirmDuplicate !== true) {
      const similar = await similarTitles(tx, 'CLUB_POST', titleFa);
      if (similar.length > 0) {
        throw conflict(
          'نوشته‌ای با همین عنوان وجود دارد: ' + similar.map((item) => '«' + item.titleFa + '»').join('، ') + '. اگر عمدی است، تأیید کنید.',
        );
      }
    }
    const slug = await allocateContentSlug(tx, 'CLUB_POST', titleFa);
    const [row] = await tx
      .insert(contentItems)
      .values({ kind: 'CLUB_POST', slug, titleFa, authorAccountId: actor.accountId, communityId: club.id })
      .returning();
    await writeRevision(tx, actor, row!, 'ساخت پیش‌نویس نوشته کلاب');
    await recordAudit(tx, actor, {
      action: 'CLUB_POST_CREATED',
      targetType: 'CONTENT_ITEM',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { communityId: club.id, slug, titleFa, status: row!.status },
    });
    return row!;
  });
}

export async function updateCommunityPost(
  database: Database,
  actor: Actor,
  input: { postId: string; expectedVersion: number; titleFa: string; summaryFa: string | null; bodyFa: string | null },
): Promise<ContentRow> {
  const next = {
    titleFa: bounded(input.titleFa, 200, 'عنوان'),
    summaryFa: bounded(input.summaryFa, 500, 'خلاصه') ?? '',
    bodyFa: bounded(input.bodyFa, 20000, 'متن') ?? '',
  };
  if (next.titleFa === null) throw validation('عنوان نوشته را بنویسید.');
  // Captured here: the narrowing is lost inside the transaction closure.
  const titleFa = next.titleFa;

  return database.transaction(async (tx) => {
    const current = await postOf(tx, actor, input.postId);
    if (current.status === 'HIDDEN' || current.status === 'DELETED') {
      throw conflict('این نوشته را ادمین محتوا از دسترس خارج کرده است؛ ویرایش آن از اینجا ممکن نیست.');
    }
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(contentItems)
      .set({
        titleFa,
        summaryFa: next.summaryFa,
        bodyFa: next.bodyFa,
        revisionNumber: current.revisionNumber + 1,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await writeRevision(tx, actor, row, 'ویرایش نوشته کلاب');
    await recordAudit(tx, actor, {
      action: 'CLUB_POST_UPDATED',
      targetType: 'CONTENT_ITEM',
      targetId: row.id,
      targetVersion: row.version,
      before: { titleFa: current.titleFa, summaryFa: current.summaryFa },
      after: { titleFa: row.titleFa, summaryFa: row.summaryFa },
    });
    return row;
  });
}

/**
 * DRAFT ↔ PUBLISHED and PUBLISHED → ARCHIVED. A post the content admin hid or
 * deleted is not moved from here: that decision is answered in the CMS.
 */
export async function changeCommunityPostStatus(
  database: Database,
  actor: Actor,
  input: { postId: string; expectedVersion: number; to: string },
  now: Date = new Date(),
): Promise<ContentRow> {
  if (!(CLUB_STATUSES as readonly string[]).includes(input.to)) throw validation('وضعیت انتخاب‌شده برای نوشته کلاب معتبر نیست.');
  const to: ClubStatus = input.to as ClubStatus;

  return database.transaction(async (tx) => {
    const current = await postOf(tx, actor, input.postId);
    if (current.status === 'HIDDEN' || current.status === 'DELETED') {
      throw conflict('این نوشته را ادمین محتوا از دسترس خارج کرده است؛ انتشار دوباره از اینجا ممکن نیست.');
    }
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.status === to) throw validation('نوشته همین حالا در این وضعیت است.');
    if (to === 'ARCHIVED' && current.status !== 'PUBLISHED') throw validation('فقط نوشته منتشرشده بایگانی می‌شود.');
    if (to === 'PUBLISHED') {
      if ((current.summaryFa ?? '').trim() === '' || (current.bodyFa ?? '').trim() === '') {
        throw validation('پیش از انتشار، خلاصه و متن نوشته را بنویسید.');
      }
    }

    const [row] = await tx
      .update(contentItems)
      .set({
        status: to,
        firstPublishedAt: to === 'PUBLISHED' ? (current.firstPublishedAt ?? now) : current.firstPublishedAt,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(contentItems.id, current.id), eq(contentItems.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CLUB_POST_STATUS_CHANGED',
      targetType: 'CONTENT_ITEM',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status },
    });
    return row;
  });
}

/** Every post of one club, for its manager: drafts, published, archived and what moderation did. */
export async function communityPosts(database: DbClient, actor: Actor, communityId: string) {
  await writableClub(database, actor, communityId);
  return database
    .select({
      id: contentItems.id,
      slug: contentItems.slug,
      titleFa: contentItems.titleFa,
      summaryFa: contentItems.summaryFa,
      bodyFa: contentItems.bodyFa,
      status: contentItems.status,
      version: contentItems.version,
      moderationNote: contentItems.moderationNote,
      correctionNote: contentItems.correctionNote,
      firstPublishedAt: contentItems.firstPublishedAt,
    })
    .from(contentItems)
    .where(and(eq(contentItems.communityId, communityId), eq(contentItems.kind, 'CLUB_POST')))
    .orderBy(desc(contentItems.updatedAt));
}

/** One published post under its club's public address. */
export async function publicCommunityPost(
  database: DbClient,
  communitySlug: string,
  postSlug: string,
  now: Date = new Date(),
) {
  const [row] = await database
    .select({ post: contentItems, communityNameFa: communities.displayNameFa, communitySlug: communities.publicSlug, kind: communities.kind })
    .from(contentItems)
    .innerJoin(communities, eq(communities.id, contentItems.communityId))
    .where(
      and(
        eq(contentItems.kind, 'CLUB_POST'),
        eq(contentItems.slug, postSlug),
        eq(communities.publicSlug, communitySlug),
        eq(communities.publicStatus, 'PUBLISHED'),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { post } = row;
  // Published, and either immediately or at a time that has come (DEC-0159).
  if (post.status !== 'PUBLISHED' || (post.publishAt !== null && post.publishAt > now)) return null;
  return {
    slug: post.slug,
    titleFa: post.titleFa,
    summaryFa: post.summaryFa,
    bodyFa: post.bodyFa,
    publishedAt: post.firstPublishedAt,
    updatedAt: post.updatedAt,
    communityNameFa: row.communityNameFa,
    communitySlug: row.communitySlug!,
  };
}
