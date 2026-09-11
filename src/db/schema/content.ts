/**
 * CMS — Requirements-Phase-2 §12 (PROMPT-004).
 *
 * `content_item` holds what is live now; every save appends an immutable
 * snapshot to `content_revision`, so history is complete without a second copy
 * of every column. Authors are ordinary accounts (P2-D11), breeds are the Phase 1
 * breed row and species the taxonomy of PROMPT-003 — nothing here duplicates a
 * record that already exists (P2-D15).
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, referenceBreeds, species, storedFiles } from './core.ts';
import { contentKind, contentStatus } from './enums.ts';
import type { ContentSource } from '../../content/model.ts';

const now = sql`now()`;

/** Categories per content type, managed by the content admin. */
export const contentCategories = pgTable(
  'content_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: contentKind('kind').notNull(),
    slug: text('slug').notNull(),
    nameFa: text('name_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('content_category_kind_slug_key').on(t.kind, t.slug),
    uniqueIndex('content_category_kind_name_key').on(t.kind, t.nameFa),
  ],
);

export const contentItems = pgTable(
  'content_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: contentKind('kind').notNull(),
    /** Stable public address within its kind; a change leaves the old one in `content_slug_redirect`. */
    slug: text('slug').notNull(),
    status: contentStatus('status').notNull().default('DRAFT'),
    authorAccountId: uuid('author_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => contentCategories.id, { onDelete: 'restrict' }),
    speciesCode: text('species_code').references(() => species.code, { onDelete: 'restrict' }),
    breedId: uuid('breed_id').references(() => referenceBreeds.id, { onDelete: 'restrict' }),

    titleFa: text('title_fa').notNull(),
    summaryFa: text('summary_fa').notNull().default(''),
    bodyFa: text('body_fa').notNull().default(''),
    sources: jsonb('sources').$type<ContentSource[]>().notNull().default(sql`'[]'::jsonb`),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    imageFileId: uuid('image_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),
    imageAltFa: text('image_alt_fa'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    reviewedOn: date('reviewed_on'),

    /** When a PUBLISHED item becomes visible. In the future means scheduled — decided at read time, no scheduler. */
    publishAt: timestamp('publish_at', { withTimezone: true }),
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
    /** Why the content admin hid or deleted it; shown to the author, never to the public. */
    moderationNote: text('moderation_note'),
    /**
     * A correction the content admin asked for after a report (§13). The content
     * stays as it is; the author's next save answers it and clears it (DEC-0162).
     */
    correctionNote: text('correction_note'),
    correctionRequestedAt: timestamp('correction_requested_at', { withTimezone: true }),

    revisionNumber: integer('revision_number').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('content_item_kind_slug_key').on(t.kind, t.slug),
    index('content_item_public_idx').on(t.kind, t.status, t.publishAt),
    index('content_item_author_idx').on(t.authorAccountId),
    index('content_item_breed_idx').on(t.breedId),
  ],
);

/** One immutable snapshot per save (§12 Revision). */
export const contentRevisions = pgTable(
  'content_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    note: text('note'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('content_revision_number_key').on(t.contentId, t.number)],
);

/** Old addresses keep resolving after a rename (§19, §23). */
export const contentSlugRedirects = pgTable(
  'content_slug_redirect',
  {
    kind: contentKind('kind').notNull(),
    slug: text('slug').notNull(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.kind, t.slug] })],
);
