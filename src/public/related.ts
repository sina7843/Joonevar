/**
 * What else a reader might open from here.
 *
 * Every list is built from published records only, and a record never appears
 * beside itself. When there is nothing related, the caller gets an empty list
 * and shows nothing: a column of filler is worse than a narrower page.
 */
import { and, desc, eq, isNull, lte, ne } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { contentItems } from '../db/schema/content.ts';
import { centres, centreTypes } from '../db/schema/vets.ts';

export interface RelatedItem {
  readonly href: string;
  readonly titleFa: string;
  readonly noteFa: string | null;
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
}

const CONTENT_PATH: Record<string, string> = {
  ARTICLE: '/articles/',
  NEWS: '/news/',
  ANNOUNCEMENT: '/announcements/',
};

const KIND_FA: Record<string, string> = { ARTICLE: 'آموزش', NEWS: 'خبر', ANNOUNCEMENT: 'اطلاعیه' };

/** Visible content, newest first, optionally narrowed to one kind. */
export async function relatedContent(
  database: DbClient,
  options: { excludeId?: string; kind?: 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT'; limit?: number; now?: Date } = {},
): Promise<RelatedItem[]> {
  const now = options.now ?? new Date();
  const rows = await database
    .select({
      id: contentItems.id,
      kind: contentItems.kind,
      slug: contentItems.slug,
      titleFa: contentItems.titleFa,
      imageFileId: contentItems.imageFileId,
      imageAltFa: contentItems.imageAltFa,
      publishAt: contentItems.publishAt,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.status, 'PUBLISHED'),
        lte(contentItems.publishAt, now),
        options.kind ? eq(contentItems.kind, options.kind) : undefined,
        options.excludeId ? ne(contentItems.id, options.excludeId) : undefined,
      ),
    )
    .orderBy(desc(contentItems.publishAt))
    .limit(options.limit ?? 4);

  return rows.map((row) => ({
    href: (CONTENT_PATH[row.kind] ?? '/articles/') + row.slug,
    titleFa: row.titleFa,
    noteFa: KIND_FA[row.kind] ?? null,
    imageFileId: row.imageFileId,
    imageAltFa: row.imageAltFa,
  }));
}

/**
 * Centres a visitor may want next.
 *
 * The same kind of centre first, then the rest by name. A centre keeps its city
 * on its branches rather than on itself, so proximity is not what this list can
 * promise, and it does not pretend to.
 */
export async function similarCentres(
  database: DbClient,
  options: { excludeId?: string; excludeSlug?: string; typeCode?: string | null; limit?: number } = {},
): Promise<RelatedItem[]> {
  const limit = options.limit ?? 4;
  const rows = await database
    .select({
      id: centres.id,
      slug: centres.publicSlug,
      nameFa: centres.displayNameFa,
      typeFa: centreTypes.nameFa,
      typeCode: centres.typeCode,
      imageFileId: centres.imageFileId,
      imageAltFa: centres.imageAltFa,
    })
    .from(centres)
    .leftJoin(centreTypes, eq(centreTypes.code, centres.typeCode))
    .where(
      and(
        eq(centres.publicStatus, 'PUBLISHED'),
        isNull(centres.mergedIntoCentreId),
        options.excludeId ? ne(centres.id, options.excludeId) : undefined,
      ),
    );

  // A centre records its city on its branches, not on itself, so «مشابه» here
  // means the same kind of centre; the branch city is shown on the centre page.
  const score = (row: (typeof rows)[number]) => (options.typeCode && row.typeCode === options.typeCode ? 1 : 0);

  return rows
    .filter((row) => row.slug !== null && row.slug !== options.excludeSlug)
    .sort((a, b) => score(b) - score(a) || a.nameFa.localeCompare(b.nameFa, 'fa'))
    .slice(0, limit)
    .map((row) => ({
      href: '/centers/' + row.slug,
      titleFa: row.nameFa,
      noteFa: row.typeFa ?? null,
      imageFileId: row.imageFileId,
      imageAltFa: row.imageAltFa,
    }));
}

export const hasAny = (...lists: readonly RelatedItem[][]): boolean => lists.some((list) => list.length > 0);
