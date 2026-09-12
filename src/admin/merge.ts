/**
 * Merging duplicate directory records — Requirements-Phase-2 §21 (PROMPT-016).
 *
 * One service for the three Phase 2 directories, following the rule the breed
 * bank has used since PROMPT-003: the duplicate row is never deleted. It keeps
 * its history and its public address, that address points at the primary
 * record, and the change itself is audited with its reason so it can be
 * reviewed afterwards.
 *
 * The lists stop showing a merged record (its `published…` query excludes it),
 * while its own page still resolves — that is what makes the redirect real
 * rather than a broken link.
 */
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { centres, vetProfiles } from '../db/schema/vets.ts';
import { communities } from '../db/schema/communities.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { MERGE_KIND_FA, isMergeKind, mergeProblem, type MergeKind } from './merge-model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این رکورد هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') throw forbidden('ادغام رکورد تکراری فقط از محیط سوپرادمین ممکن است.');
}

/** What each directory calls its own columns; everything else is shared. */
const TABLES = {
  VET: {
    table: vetProfiles,
    id: vetProfiles.id,
    name: vetProfiles.displayNameFa,
    slug: vetProfiles.publicSlug,
    version: vetProfiles.version,
    mergedInto: vetProfiles.mergedIntoProfileId,
    /** The column's own key: an update must name it, not the select alias. */
    column: 'mergedIntoProfileId',
    targetType: 'VET_PROFILE',
    action: 'VET_PROFILE_MERGED',
  },
  CENTRE: {
    table: centres,
    id: centres.id,
    name: centres.displayNameFa,
    slug: centres.publicSlug,
    version: centres.version,
    mergedInto: centres.mergedIntoCentreId,
    column: 'mergedIntoCentreId',
    targetType: 'CENTRE',
    action: 'CENTRE_MERGED',
  },
  COMMUNITY: {
    table: communities,
    id: communities.id,
    name: communities.displayNameFa,
    slug: communities.publicSlug,
    version: communities.version,
    mergedInto: communities.mergedIntoCommunityId,
    column: 'mergedIntoCommunityId',
    targetType: 'COMMUNITY',
    action: 'COMMUNITY_MERGED',
  },
} as const;

export interface MergeRecordRow {
  readonly id: string;
  readonly nameFa: string;
  readonly slug: string | null;
  readonly version: number;
  readonly mergedIntoId: string | null;
}

async function rowById(database: DbClient, kind: MergeKind, id: string): Promise<MergeRecordRow | null> {
  if (!UUID.test(id)) return null;
  const t = TABLES[kind];
  const [row] = await database
    .select({ id: t.id, nameFa: t.name, slug: t.slug, version: t.version, mergedIntoId: t.mergedInto })
    .from(t.table)
    .where(eq(t.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The records an operator may choose from: everything that is not already a
 * duplicate. A record other duplicates point at stays in the list, because it
 * is a perfectly good primary.
 */
export async function mergeCandidates(database: DbClient, actor: Actor, kind: string): Promise<MergeRecordRow[]> {
  assertSuperadmin(actor);
  if (!isMergeKind(kind)) throw validation('نوع رکورد را انتخاب کنید.');
  const t = TABLES[kind];
  return database
    .select({ id: t.id, nameFa: t.name, slug: t.slug, version: t.version, mergedIntoId: t.mergedInto })
    .from(t.table)
    .where(isNull(t.mergedInto))
    .orderBy(t.name);
}

/** Records already marked duplicate, so the panel can show what was merged and where. */
export async function mergedRecords(database: DbClient, actor: Actor, kind: string) {
  assertSuperadmin(actor);
  if (!isMergeKind(kind)) throw validation('نوع رکورد را انتخاب کنید.');
  const t = TABLES[kind];
  const merged = await database
    .select({ id: t.id, nameFa: t.name, slug: t.slug, version: t.version, mergedIntoId: t.mergedInto })
    .from(t.table)
    .where(isNotNull(t.mergedInto))
    .orderBy(t.name);
  return Promise.all(
    merged.map(async (row) => ({ ...row, primary: await rowById(database, kind, row.mergedIntoId!) })),
  );
}

export interface MergeInput {
  readonly kind: string;
  readonly duplicateId: string;
  readonly primaryId: string;
  readonly expectedVersion: number;
  readonly reason: string;
}

/**
 * Mark one record a duplicate of another.
 *
 * Everything §21 asks for happens here: the duplicate keeps its row and its
 * address (the redirect), its relations are untouched (nothing is moved), the
 * audit entry carries the previous value and the reason (the history and the
 * review), and the guards keep a redirect one hop deep.
 */
export async function mergeRecord(database: Database, actor: Actor, input: MergeInput): Promise<MergeRecordRow> {
  assertSuperadmin(actor);
  if (!isMergeKind(input.kind)) throw validation('نوع رکورد را انتخاب کنید.');
  const kind: MergeKind = input.kind;
  const t = TABLES[kind];

  return database.transaction(async (tx) => {
    const duplicate = await rowById(tx, kind, input.duplicateId);
    const primary = await rowById(tx, kind, input.primaryId);
    if (duplicate === null || primary === null) throw notFound(MERGE_KIND_FA[kind] + ' پیدا نشد.');
    if (duplicate.version !== input.expectedVersion) throw conflict(STALE);

    const [dependent] = await tx
      .select({ id: t.id })
      .from(t.table)
      .where(eq(t.mergedInto, duplicate.id))
      .limit(1);

    const problem = mergeProblem({
      duplicateId: duplicate.id,
      primaryId: primary.id,
      duplicateAlreadyMerged: duplicate.mergedIntoId !== null,
      primaryAlreadyMerged: primary.mergedIntoId !== null,
      duplicateHasDependents: dependent !== undefined,
      reason: input.reason,
    });
    if (problem) throw validation(problem);

    // The patch names the table's own column; `mergedIntoId` is only the alias
    // these three directories are read through.
    const patch: Record<string, unknown> = {
      [t.column]: primary.id,
      version: duplicate.version + 1,
      updatedAt: new Date(),
    };
    const [updated] = await tx
      .update(t.table)
      .set(patch as never)
      .where(and(eq(t.id, duplicate.id), eq(t.version, duplicate.version)))
      .returning({ id: t.id, nameFa: t.name, slug: t.slug, version: t.version, mergedIntoId: t.mergedInto });
    if (!updated) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: t.action,
      targetType: t.targetType,
      targetId: updated.id,
      targetVersion: updated.version,
      before: { mergedIntoId: null },
      after: { mergedIntoId: primary.id, primaryNameFa: primary.nameFa, primarySlug: primary.slug },
      reason: input.reason.trim(),
    });
    return updated;
  });
}

/** The primary a merged record points at, for the canonical of its public page. */
export async function primaryOf(
  database: DbClient,
  kind: MergeKind,
  mergedIntoId: string | null,
): Promise<{ slug: string; nameFa: string } | null> {
  if (mergedIntoId === null) return null;
  const row = await rowById(database, kind, mergedIntoId);
  return row === null || row.slug === null ? null : { slug: row.slug, nameFa: row.nameFa };
}
