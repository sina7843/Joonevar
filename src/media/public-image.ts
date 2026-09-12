/**
 * Public images of directory records — breeds, centres, veterinarians,
 * associations and clubs.
 *
 * The rule is the one DEC-0160 already set for content images, extended rather
 * than copied: the file itself stays in private storage and is served through
 * `/media/[id]` only while the record that carries it is public. Hiding,
 * unpublishing or deleting the record takes its image down with it, and every
 * other id answers the same 404.
 *
 * One descriptor per record kind instead of four near-identical services. What
 * differs between kinds is only the table, the column that holds the file, the
 * status that makes the record public and the audit action; everything else is
 * the same work, so it is written once. Authorisation is deliberately NOT here:
 * each service knows who may edit its own record and calls in after deciding.
 */
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import fs from 'node:fs/promises';
import type { Database, DbClient } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import { recordAudit } from '../audit/service.ts';
import { findFile, putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { storedFiles, referenceBreeds } from '../db/schema/core.ts';
import { centres, vetProfiles } from '../db/schema/vets.ts';
import { communities } from '../db/schema/communities.ts';

export const IMAGE_KINDS = ['BREED', 'CENTRE', 'VET_PROFILE', 'COMMUNITY'] as const;
export type PublicImageKind = (typeof IMAGE_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Descriptor {
  readonly purpose: 'BREED_IMAGE' | 'CENTRE_IMAGE' | 'VET_PROFILE_IMAGE' | 'COMMUNITY_IMAGE';
  readonly auditAction: string;
  readonly targetType: string;
  /** The record row, or undefined when there is none with that id. */
  byId(database: DbClient, id: string): Promise<RecordRow | undefined>;
  /** The record carrying this file, only when the record is public. */
  publicByFile(database: DbClient, fileId: string): Promise<{ id: string } | undefined>;
  write(database: DbClient, id: string, version: number, fileId: string, altFa: string): Promise<RecordRow | undefined>;
}

interface RecordRow {
  readonly id: string;
  readonly version: number;
  readonly imageFileId: string | null;
  /** The account the file is filed under, so a private listing stays with its owner. */
  readonly ownerAccountId: string | null;
}

/** Statuses at which a record and therefore its image are publicly readable. */
const VISIBLE_BREED = ['PUBLISHED', 'ARCHIVED'] as const;

const DESCRIPTORS: Record<PublicImageKind, Descriptor> = {
  BREED: {
    purpose: 'BREED_IMAGE',
    auditAction: 'BREED_IMAGE_ATTACHED',
    targetType: 'REFERENCE_BREED',
    async byId(database, id) {
      const [row] = await database
        .select({ id: referenceBreeds.id, version: referenceBreeds.version, imageFileId: referenceBreeds.imageFileId })
        .from(referenceBreeds)
        .where(eq(referenceBreeds.id, id))
        .limit(1);
      // A breed belongs to the register, not to an account.
      return row ? { ...row, ownerAccountId: null } : undefined;
    },
    async publicByFile(database, fileId) {
      const [row] = await database
        .select({ id: referenceBreeds.id })
        .from(referenceBreeds)
        .where(and(eq(referenceBreeds.imageFileId, fileId), inArray(referenceBreeds.profileStatus, [...VISIBLE_BREED])))
        .limit(1);
      return row;
    },
    async write(database, id, version, fileId, altFa) {
      const [row] = await database
        .update(referenceBreeds)
        .set({ imageFileId: fileId, imageAltFa: altFa, version: version + 1, updatedAt: new Date() })
        .where(and(eq(referenceBreeds.id, id), eq(referenceBreeds.version, version)))
        .returning({ id: referenceBreeds.id, version: referenceBreeds.version, imageFileId: referenceBreeds.imageFileId });
      return row ? { ...row, ownerAccountId: null } : undefined;
    },
  },
  CENTRE: {
    purpose: 'CENTRE_IMAGE',
    auditAction: 'CENTRE_IMAGE_ATTACHED',
    targetType: 'CENTRE',
    async byId(database, id) {
      const [row] = await database
        .select({
          id: centres.id,
          version: centres.version,
          imageFileId: centres.imageFileId,
          ownerAccountId: centres.ownerAccountId,
        })
        .from(centres)
        .where(eq(centres.id, id))
        .limit(1);
      return row;
    },
    async publicByFile(database, fileId) {
      const [row] = await database
        .select({ id: centres.id })
        .from(centres)
        .where(and(eq(centres.imageFileId, fileId), eq(centres.publicStatus, 'PUBLISHED')))
        .limit(1);
      return row;
    },
    async write(database, id, version, fileId, altFa) {
      const [row] = await database
        .update(centres)
        .set({ imageFileId: fileId, imageAltFa: altFa, version: version + 1, updatedAt: new Date() })
        .where(and(eq(centres.id, id), eq(centres.version, version)))
        .returning({
          id: centres.id,
          version: centres.version,
          imageFileId: centres.imageFileId,
          ownerAccountId: centres.ownerAccountId,
        });
      return row;
    },
  },
  VET_PROFILE: {
    purpose: 'VET_PROFILE_IMAGE',
    auditAction: 'VET_PROFILE_IMAGE_ATTACHED',
    targetType: 'VET_PROFILE',
    async byId(database, id) {
      const [row] = await database
        .select({
          id: vetProfiles.id,
          version: vetProfiles.version,
          imageFileId: vetProfiles.imageFileId,
          ownerAccountId: vetProfiles.accountId,
        })
        .from(vetProfiles)
        .where(eq(vetProfiles.id, id))
        .limit(1);
      return row;
    },
    async publicByFile(database, fileId) {
      const [row] = await database
        .select({ id: vetProfiles.id })
        .from(vetProfiles)
        .where(and(eq(vetProfiles.imageFileId, fileId), eq(vetProfiles.publicStatus, 'PUBLISHED')))
        .limit(1);
      return row;
    },
    async write(database, id, version, fileId, altFa) {
      const [row] = await database
        .update(vetProfiles)
        .set({ imageFileId: fileId, imageAltFa: altFa, version: version + 1, updatedAt: new Date() })
        .where(and(eq(vetProfiles.id, id), eq(vetProfiles.version, version)))
        .returning({
          id: vetProfiles.id,
          version: vetProfiles.version,
          imageFileId: vetProfiles.imageFileId,
          ownerAccountId: vetProfiles.accountId,
        });
      return row;
    },
  },
  COMMUNITY: {
    purpose: 'COMMUNITY_IMAGE',
    auditAction: 'COMMUNITY_IMAGE_ATTACHED',
    targetType: 'COMMUNITY',
    async byId(database, id) {
      const [row] = await database
        .select({
          id: communities.id,
          version: communities.version,
          imageFileId: communities.imageFileId,
          ownerAccountId: communities.ownerAccountId,
        })
        .from(communities)
        .where(eq(communities.id, id))
        .limit(1);
      return row;
    },
    async publicByFile(database, fileId) {
      const [row] = await database
        .select({ id: communities.id })
        .from(communities)
        .where(and(eq(communities.imageFileId, fileId), eq(communities.publicStatus, 'PUBLISHED')))
        .limit(1);
      return row;
    },
    async write(database, id, version, fileId, altFa) {
      const [row] = await database
        .update(communities)
        .set({ imageFileId: fileId, imageAltFa: altFa, version: version + 1, updatedAt: new Date() })
        .where(and(eq(communities.id, id), eq(communities.version, version)))
        .returning({
          id: communities.id,
          version: communities.version,
          imageFileId: communities.imageFileId,
          ownerAccountId: communities.ownerAccountId,
        });
      return row;
    },
  },
};

const byPurpose = new Map<string, Descriptor>(Object.values(DESCRIPTORS).map((d) => [d.purpose, d]));

export interface AttachImageInput {
  readonly kind: PublicImageKind;
  readonly recordId: string;
  readonly expectedVersion: number;
  readonly bytes: Uint8Array;
  readonly originalName: string | null;
  readonly altFa: string;
}

/**
 * Stores an image and hangs it on the record.
 *
 * The caller has already decided that this actor may edit this record: the
 * services own their own authorisation and this module owns the file.
 */
export async function attachPublicImage(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: AttachImageInput,
): Promise<{ recordId: string; fileId: string; version: number }> {
  const altFa = input.altFa.trim();
  if (altFa === '') throw validation('متن جایگزین تصویر را بنویسید؛ برای کسی که تصویر را نمی‌بیند لازم است.');
  const descriptor = DESCRIPTORS[input.kind];
  if (!UUID.test(input.recordId)) throw notFound('رکورد پیدا نشد.');

  return database.transaction(async (tx) => {
    const current = await descriptor.byId(tx, input.recordId);
    if (!current) throw notFound('رکورد پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict('این رکورد هم‌زمان تغییر کرده است.');

    const stored = await putPrivateFile(tx, storageRoot, actor, {
      // An unowned record has no account to file under, so it stays with the
      // operator who recorded it, exactly as the record itself does.
      ownerAccountId: current.ownerAccountId ?? actor.accountId,
      purpose: descriptor.purpose,
      bytes: input.bytes,
      originalName: input.originalName,
    });

    const row = await descriptor.write(tx, current.id, current.version, stored.id, altFa);
    if (!row) throw conflict('این رکورد هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: descriptor.auditAction,
      targetType: descriptor.targetType,
      targetId: row.id,
      targetVersion: row.version,
      before: { imageFileId: current.imageFileId },
      after: { imageFileId: stored.id, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return { recordId: row.id, fileId: stored.id, version: row.version };
  });
}

/**
 * The bytes behind a public image address, or null.
 *
 * Null covers every reason equally: a malformed id, a file that is not a public
 * image, and a record that is no longer public. A visitor cannot tell them
 * apart, which is the point.
 */
export async function publicRecordImage(
  database: DbClient,
  storageRoot: string,
  fileId: string,
): Promise<{ mime: string; bytes: Buffer; sha256: string } | null> {
  if (!UUID.test(fileId)) return null;
  const [file] = await database
    .select({ purpose: storedFiles.purpose })
    .from(storedFiles)
    .where(eq(storedFiles.id, fileId))
    .limit(1);
  if (!file) return null;
  const descriptor = byPurpose.get(file.purpose);
  if (!descriptor) return null;

  const shown = await descriptor.publicByFile(database, fileId);
  if (!shown) return null;

  const record = await findFile(database, fileId);
  const bytes = await fs.readFile(resolveWithinRoot(storageRoot, record.storageKey));
  // The stored digest lets the route answer a repeat view with 304 without ever
  // caching the decision that made the image public (DEC-0160, PROMPT-018).
  return { mime: record.mime, bytes, sha256: record.sha256 };
}

/** Exposed for the tests that pin the rules rather than re-deriving them. */
export const imagePurposes = (): readonly string[] => [...byPurpose.keys()];
export const visibleBreedStatuses = (): readonly string[] => [...VISIBLE_BREED];
export type { SQL };
