/**
 * The seeded taxonomy and the public readers — Phase 2.5 PROMPT-014.
 *
 * That a fresh database already has the categories the phase names, that
 * re-seeding never overrules an admin, that only the content admin owns the
 * taxonomy, and that the public list can be searched and filtered without ever
 * showing what is not published.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { seedTaxonomies } from '../../src/db/seed/taxonomy.ts';
import { contentCategories, contentItems } from '../../src/db/schema/content.ts';
import { CONTENT_CATEGORY_SEED, isExternalBodyCategory } from '../../src/content/taxonomy.ts';
import { createCategory, publicContentBySlug, publicContentList, setCategoryActive } from '../../src/content/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let contentAdmin: Actor;
let author: Actor;
let counter = 0;

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  contentAdmin = actorFor(await createTestAccount(testDb.db, '09990440001'), 'CONTENT_ADMIN');
  author = actorFor(await createTestAccount(testDb.db, '09990440002'), 'AUTHOR');
});

after(async () => {
  await testDb?.drop();
});

const categoryOf = async (kind: string, slug: string) => {
  const [row] = await testDb.db
    .select()
    .from(contentCategories)
    .where(and(eq(contentCategories.kind, kind as 'ARTICLE'), eq(contentCategories.slug, slug)));
  return row ?? null;
};

/** A published item in one category, written straight onto the table. */
async function publish(input: { kind: 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT'; categorySlug: string; titleFa: string; summaryFa: string }) {
  counter += 1;
  const category = await categoryOf(input.kind, input.categorySlug);
  const [row] = await testDb.db
    .insert(contentItems)
    .values({
      kind: input.kind,
      slug: 'seeded-item-' + counter,
      titleFa: input.titleFa,
      summaryFa: input.summaryFa,
      bodyFa: 'متن آزمایشی.',
      authorAccountId: author.accountId,
      categoryId: category?.id ?? null,
      status: 'PUBLISHED',
      publishAt: new Date(Date.now() - 60_000),
      firstPublishedAt: new Date(Date.now() - 60_000),
      sources: [{ title: 'منبع آزمایشی', url: 'https://example.invalid/source' }],
    })
    .returning();
  return row!;
}

test('a fresh database already carries the categories Phase 2.5 asks for', async () => {
  const rows = await testDb.db.select().from(contentCategories);
  assert.equal(rows.length >= CONTENT_CATEGORY_SEED.length, true);
  for (const entry of CONTENT_CATEGORY_SEED) {
    const row = rows.find((candidate) => candidate.kind === entry.kind && candidate.slug === entry.slug);
    assert.ok(row, 'missing ' + entry.kind + ':' + entry.slug);
    assert.equal(row!.nameFa, entry.nameFa);
    assert.equal(row!.isActive, true);
  }
  // The two outside bodies are there, as their own subjects.
  assert.ok(rows.some((row) => isExternalBodyCategory(row.slug)));
});

test('re-seeding adds nothing twice and never overrules an admin', async () => {
  const before = await testDb.db.select().from(contentCategories);
  const retired = await categoryOf('ARTICLE', 'microchip');
  await setCategoryActive(testDb.db, contentAdmin, { categoryId: retired!.id, active: false });
  const renamed = await categoryOf('ARTICLE', 'anjoman');
  await testDb.db.update(contentCategories).set({ nameFa: 'انجمن (نام دلخواه ادمین)' }).where(eq(contentCategories.id, renamed!.id));

  const result = await seedTaxonomies(testDb.db);
  const categories = result.find((entry) => entry.name === 'content_category')!;
  assert.equal(categories.inserted, 0, 'a second run inserts nothing');

  const after = await testDb.db.select().from(contentCategories);
  assert.equal(after.length, before.length);
  assert.equal((await categoryOf('ARTICLE', 'microchip'))!.isActive, false, 'a retired category stays retired');
  assert.equal((await categoryOf('ARTICLE', 'anjoman'))!.nameFa, 'انجمن (نام دلخواه ادمین)', 'a renamed category keeps its name');

  // Put it back for the rest of the suite.
  await setCategoryActive(testDb.db, contentAdmin, { categoryId: retired!.id, active: true });
});

test('the taxonomy belongs to the content admin alone', async () => {
  await assert.rejects(
    () => createCategory(testDb.db, author, { kind: 'ARTICLE', nameFa: 'دسته نویسنده', slug: 'daste-nevisandeh' }),
    code('FORBIDDEN'),
  );
  const someone = actorFor(await createTestAccount(testDb.db, '09990440003'), 'USER');
  await assert.rejects(() => createCategory(testDb.db, someone, { kind: 'NEWS', nameFa: 'دسته کاربر', slug: 'daste-karbar' }), code('FORBIDDEN'));
  const clubCategory = await categoryOf('ARTICLE', 'club');
  await assert.rejects(
    () => setCategoryActive(testDb.db, author, { categoryId: clubCategory!.id, active: false }),
    code('FORBIDDEN'),
  );

  // The admin may add one of their own, and the same name twice is a conflict.
  const added = await createCategory(testDb.db, contentAdmin, { kind: 'ARTICLE', nameFa: 'دسته تازه ادمین', slug: 'daste-taze-admin' });
  assert.ok(added.id);
  await assert.rejects(
    () => createCategory(testDb.db, contentAdmin, { kind: 'ARTICLE', nameFa: 'دسته تازه ادمین', slug: 'daste-taze-admin' }),
    code('CONFLICT'),
  );
  // A category of one kind does not collide with the same name under another.
  const news = await createCategory(testDb.db, contentAdmin, { kind: 'NEWS', nameFa: 'دسته تازه ادمین', slug: 'daste-taze-admin' });
  assert.equal(news.kind, 'NEWS');
});

test('the public list is filtered by category and searched by words, and shows only what is published', async () => {
  const visible = await publish({
    kind: 'ARTICLE',
    categorySlug: 'shajarenameh',
    titleFa: 'شجره‌نامه چگونه صادر می‌شود',
    summaryFa: 'از ثبت درخواست تا صدور سند.',
  });
  await publish({
    kind: 'ARTICLE',
    categorySlug: 'microchip',
    titleFa: 'میکروچیپ و آنچه باید بدانید',
    summaryFa: 'چیپ یک‌بار برای همیشه بسته می‌شود.',
  });
  const hidden = await publish({
    kind: 'ARTICLE',
    categorySlug: 'shajarenameh',
    titleFa: 'نوشته پنهان درباره شجره‌نامه',
    summaryFa: 'نباید دیده شود.',
  });
  await testDb.db.update(contentItems).set({ status: 'HIDDEN' }).where(eq(contentItems.id, hidden.id));

  const all = await publicContentList(testDb.db, { kind: 'ARTICLE', page: 1 });
  const slugs = all.items.map((item) => item.slug);
  assert.ok(slugs.includes(visible.slug));
  assert.equal(slugs.includes(hidden.slug), false, 'hidden content is not public');

  const filtered = await publicContentList(testDb.db, { kind: 'ARTICLE', categorySlug: 'microchip', page: 1 });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0]!.titleFa, 'میکروچیپ و آنچه باید بدانید');

  const searched = await publicContentList(testDb.db, { kind: 'ARTICLE', term: 'شجره', page: 1 });
  assert.equal(searched.items.length, 1, 'the hidden one does not come back through search either');
  assert.equal(searched.items[0]!.slug, visible.slug);

  // The summary is searched too, and a word nobody wrote finds nothing.
  assert.equal((await publicContentList(testDb.db, { kind: 'ARTICLE', term: 'صدور سند', page: 1 })).items.length, 1);
  assert.equal((await publicContentList(testDb.db, { kind: 'ARTICLE', term: 'واژه‌ای که نیست', page: 1 })).items.length, 0);

  // A search term is data, not SQL: a wildcard and a quote find nothing and break nothing.
  for (const term of ['%', "' or 1=1 --", '\\']) {
    const result = await publicContentList(testDb.db, { kind: 'ARTICLE', term, page: 1 });
    assert.equal(result.items.length, 0, 'the term ' + term + ' matched something');
  }

  // Category and search narrow together.
  const both = await publicContentList(testDb.db, { kind: 'ARTICLE', categorySlug: 'microchip', term: 'شجره', page: 1 });
  assert.equal(both.items.length, 0);
});

test('a page about an outside body carries its category so the reader is told what it is', async () => {
  const item = await publish({
    kind: 'ARTICLE',
    categorySlug: 'the-kennel-club',
    titleFa: 'The Kennel Club چه می‌کند',
    summaryFa: 'معرفی آموزشی با استناد به منابع اعلام‌شده.',
  });
  const page = await publicContentBySlug(testDb.db, 'ARTICLE', item.slug);
  assert.equal(page?.kind, 'content');
  assert.equal(page!.kind === 'content' && page.categorySlug, 'the-kennel-club');
  assert.equal(page!.kind === 'content' && isExternalBodyCategory(page.categorySlug), true);

  const other = await publicContentBySlug(testDb.db, 'ARTICLE', 'seeded-item-1');
  assert.ok(other);
  assert.equal(other.kind === 'content' && isExternalBodyCategory(other.categorySlug), false);
});
