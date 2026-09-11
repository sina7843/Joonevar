/**
 * CMS and content roles — Phase 2 PROMPT-004.
 *
 * On a migrated database: role grants with reason and audit, per-role content
 * types, revisions with version checks, object access between authors,
 * publication and scheduling decided at read time, moderation that the author
 * cannot undo, soft delete, archived pages, address redirects, revision
 * restore, categories, the public image rule and breed-related content.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { JPEG, actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, referenceBreeds } from '../../src/db/schema/core.ts';
import { contentItems } from '../../src/db/schema/content.ts';
import { contentRoleHolders, setContentRole } from '../../src/content/roles.ts';
import {
  allCategories,
  attachContentImage,
  changeContentStatus,
  contentForEditing,
  contentForPanel,
  contentSitemapEntries,
  createCategory,
  createContent,
  publicContentBySlug,
  publicContentImage,
  publicContentList,
  relatedContentForBreed,
  restoreRevision,
  setCategoryActive,
  updateContent,
  type ContentFieldsInput,
  type ContentRow,
} from '../../src/content/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let superadmin: Actor;
let author: Actor;
let otherAuthor: Actor;
let contentAdmin: Actor;
let ordinary: Actor;
let counter = 0;

const AUTHOR_MOBILE = '09990710002';

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-content-'));
  superadmin = actorFor(await createTestAccount(testDb.db, '09990710001'), 'SUPERADMIN');
  author = actorFor(await createTestAccount(testDb.db, AUTHOR_MOBILE), 'AUTHOR');
  otherAuthor = actorFor(await createTestAccount(testDb.db, '09990710003'), 'AUTHOR');
  contentAdmin = actorFor(await createTestAccount(testDb.db, '09990710004'), 'CONTENT_ADMIN');
  ordinary = actorFor(await createTestAccount(testDb.db, '09990710005'));
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const HOUR = 60 * 60 * 1000;

const fields = (row: ContentRow, patch: Partial<ContentFieldsInput> = {}): ContentFieldsInput => ({
  contentId: row.id,
  expectedVersion: row.version,
  slug: row.slug,
  titleFa: row.titleFa,
  summaryFa: row.summaryFa,
  bodyFa: row.bodyFa,
  sourcesText: row.sources.map((s) => (s.url ? s.title + ' | ' + s.url : s.title)).join('\n'),
  tagsText: row.tags.join(','),
  categoryId: row.categoryId,
  speciesCode: row.speciesCode,
  breedId: row.breedId,
  imageAltFa: row.imageAltFa,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  reviewedOn: row.reviewedOn,
  ...patch,
});

/** A complete draft of the given kind, ready to publish. */
async function readyDraft(actor: Actor, kind: 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT', label: string): Promise<ContentRow> {
  counter += 1;
  const created = await createContent(testDb.db, actor, { kind, titleFa: label + ' آزمایشی ' + counter });
  return updateContent(
    testDb.db,
    actor,
    fields(created, {
      summaryFa: 'خلاصه آزمایشی',
      bodyFa: 'بند اول متن آزمایشی.\n\nبند دوم.',
      sourcesText: kind === 'ARTICLE' ? 'SYNTHETIC منبع | https://example.org/source' : '',
      reviewedOn: kind === 'ARTICLE' ? '2026-01-10' : null,
    }),
  );
}

const publish = (actor: Actor, row: ContentRow, publishAt: Date | null = null, now?: Date) =>
  changeContentStatus(testDb.db, actor, { contentId: row.id, expectedVersion: row.version, to: 'PUBLISHED', publishAt }, now);

test('the superadmin grants and suspends content roles with a reason, and nobody else can', async () => {
  await assert.rejects(
    () => setContentRole(testDb.db, ordinary, { mobile: AUTHOR_MOBILE, role: 'AUTHOR', active: true, reason: 'x' }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => setContentRole(testDb.db, superadmin, { mobile: AUTHOR_MOBILE, role: 'AUTHOR', active: true, reason: ' ' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => setContentRole(testDb.db, superadmin, { mobile: '09990719999', role: 'AUTHOR', active: true, reason: 'x' }),
    code('NOT_FOUND'),
  );
  await assert.rejects(
    () => setContentRole(testDb.db, superadmin, { mobile: AUTHOR_MOBILE, role: 'SUPERADMIN', active: true, reason: 'x' }),
    code('VALIDATION'),
  );

  await setContentRole(testDb.db, superadmin, { mobile: AUTHOR_MOBILE, role: 'AUTHOR', active: true, reason: 'نویسنده آموزش' });
  const [granted] = await testDb.db
    .select()
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, author.accountId), eq(accountRoles.role, 'AUTHOR')));
  assert.equal(granted!.status, 'ACTIVE');
  await assert.rejects(
    () => setContentRole(testDb.db, superadmin, { mobile: AUTHOR_MOBILE, role: 'AUTHOR', active: true, reason: 'x' }),
    code('VALIDATION'),
  );

  await setContentRole(testDb.db, superadmin, { mobile: AUTHOR_MOBILE, role: 'AUTHOR', active: false, reason: 'پایان همکاری' });
  const holders = await contentRoleHolders(testDb.db, superadmin);
  assert.equal(holders.find((row) => row.accountId === author.accountId)?.status, 'SUSPENDED');

  const events = await testDb.db.select().from(auditEvents).where(eq(auditEvents.targetId, author.accountId));
  const suspended = events.find((row) => row.action === 'CONTENT_ROLE_SUSPENDED');
  assert.equal(suspended?.reason, 'پایان همکاری');
  assert.deepEqual(suspended?.before, { role: 'AUTHOR', status: 'ACTIVE' });
  assert.ok(events.some((row) => row.action === 'CONTENT_ROLE_GRANTED'));
});

test('authors write education and news only; each save is a revision with a version check', async () => {
  const draft = await createContent(testDb.db, author, { kind: 'ARTICLE', titleFa: 'مراقبت از توله در زمستان' });
  assert.equal(draft.slug, 'مراقبت-از-توله-در-زمستان');
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.revisionNumber, 1);

  await assert.rejects(() => createContent(testDb.db, author, { kind: 'ANNOUNCEMENT', titleFa: 'اطلاعیه' }), code('FORBIDDEN'));
  await assert.rejects(() => createContent(testDb.db, contentAdmin, { kind: 'CLUB_POST', titleFa: 'نوشته' }), code('FORBIDDEN'));
  await assert.rejects(() => createContent(testDb.db, ordinary, { kind: 'ARTICLE', titleFa: 'نوشته' }), code('FORBIDDEN'));

  // The same title again is a duplicate candidate until it is confirmed.
  await assert.rejects(
    () => createContent(testDb.db, author, { kind: 'ARTICLE', titleFa: 'مراقبت از توله در زمستان!' }),
    code('CONFLICT'),
  );
  const confirmed = await createContent(testDb.db, author, {
    kind: 'ARTICLE',
    titleFa: 'مراقبت از توله در زمستان',
    confirmDuplicate: true,
  });
  assert.equal(confirmed.slug, 'مراقبت-از-توله-در-زمستان-2');

  const saved = await updateContent(testDb.db, author, fields(draft, { summaryFa: 'خلاصه', tagsText: 'توله، زمستان' }));
  assert.equal(saved.revisionNumber, 2);
  assert.equal(saved.version, draft.version + 1);
  assert.deepEqual(saved.tags, ['توله', 'زمستان']);
  const [event] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'CONTENT_UPDATED'), eq(auditEvents.targetId, draft.id)));
  assert.deepEqual(event!.before, { summaryFa: '', tags: [] });

  await assert.rejects(() => updateContent(testDb.db, author, fields(draft, { summaryFa: 'قدیمی' })), code('CONFLICT'));
  const same = await updateContent(testDb.db, author, fields(saved));
  assert.equal(same.version, saved.version, 'saving unchanged fields records nothing');

  for (const patch of [
    { sourcesText: 'منبع | javascript:alert(1)' },
    { slug: 'Not Valid' },
    { reviewedOn: '2999-01-01' },
    { titleFa: ' ' },
    { breedId: '00000000-0000-4000-8000-000000000000' },
    { seoTitle: 'x'.repeat(71) },
  ]) {
    await assert.rejects(() => updateContent(testDb.db, author, fields(saved, patch)), code('VALIDATION'), JSON.stringify(patch));
  }
});

test('an author never reaches another author’s content', async () => {
  const mine = await readyDraft(author, 'NEWS', 'خبر نویسنده');
  await assert.rejects(() => updateContent(testDb.db, otherAuthor, fields(mine, { titleFa: 'ربوده' })), code('NOT_FOUND'));
  await assert.rejects(() => publish(otherAuthor, mine), code('NOT_FOUND'));
  assert.equal(await contentForEditing(testDb.db, otherAuthor, mine.id), null);
  const panel = await contentForPanel(testDb.db, otherAuthor, { page: 1 });
  assert.ok(!panel.items.some((item) => item.id === mine.id));
  const adminPanel = await contentForPanel(testDb.db, contentAdmin, { page: 1, pageSize: 100 });
  assert.ok(adminPanel.items.some((item) => item.id === mine.id), 'the content admin sees all content');
});

test('publishing needs content; scheduled content stays out of sight until its time; images follow visibility', async () => {
  const empty = await createContent(testDb.db, author, { kind: 'ARTICLE', titleFa: 'آموزش خالی ' + Date.now() });
  await assert.rejects(() => publish(author, empty), /خلاصه را بنویسید/);
  const unsourced = await updateContent(testDb.db, author, fields(empty, { summaryFa: 'خلاصه', bodyFa: 'متن' }));
  await assert.rejects(() => publish(author, unsourced), /منبع/);

  const article = await readyDraft(author, 'ARTICLE', 'آموزش منتشرشده');
  await assert.rejects(
    () => attachContentImage(testDb.db, storage, author, { contentId: article.id, expectedVersion: article.version, bytes: JPEG, originalName: 'a.jpg', altFa: ' ' }),
    code('VALIDATION'),
  );
  const withImage = await attachContentImage(testDb.db, storage, author, {
    contentId: article.id,
    expectedVersion: article.version,
    bytes: JPEG,
    originalName: 'a.jpg',
    altFa: 'توله در برف',
  });
  assert.equal(await publicContentImage(testDb.db, storage, withImage.imageFileId!), null, 'a draft image is not public');

  const live = await publish(author, withImage);
  assert.ok(live.publishAt instanceof Date && live.firstPublishedAt instanceof Date);
  const page = await publicContentBySlug(testDb.db, 'ARTICLE', live.slug);
  assert.equal(page?.kind === 'content' && page.state, 'VISIBLE');
  assert.ok((await publicContentList(testDb.db, { kind: 'ARTICLE', page: 1, pageSize: 100 })).items.some((i) => i.slug === live.slug));
  assert.ok((await contentSitemapEntries(testDb.db, 'ARTICLE')).some((e) => e.path === '/articles/' + live.slug));
  const image = await publicContentImage(testDb.db, storage, live.imageFileId!);
  assert.equal(image?.mime, 'image/jpeg');

  // Scheduled news: invisible now, visible once its time has come — no job involved.
  const now = new Date();
  const news = await readyDraft(author, 'NEWS', 'خبر زمان‌بندی‌شده');
  const scheduled = await publish(author, news, new Date(now.getTime() + HOUR), now);
  assert.equal(scheduled.status, 'PUBLISHED');
  assert.equal(await publicContentBySlug(testDb.db, 'NEWS', scheduled.slug, now), null);
  assert.ok(!(await publicContentList(testDb.db, { kind: 'NEWS', page: 1, pageSize: 100 }, now)).items.some((i) => i.slug === scheduled.slug));
  const later = new Date(now.getTime() + HOUR + 60_000);
  assert.equal((await publicContentBySlug(testDb.db, 'NEWS', scheduled.slug, later))?.kind, 'content');
  const panel = await contentForPanel(testDb.db, author, { page: 1, pageSize: 100 }, now);
  assert.equal(panel.items.find((item) => item.id === news.id)?.publicState, 'SCHEDULED');

  // Unpublishing takes the image down with the page.
  await changeContentStatus(testDb.db, author, { contentId: live.id, expectedVersion: live.version, to: 'DRAFT' });
  assert.equal(await publicContentImage(testDb.db, storage, live.imageFileId!), null);
});

test('the content admin hides content with a reason, the author cannot undo it, and restoring clears the note', async () => {
  const live = await publish(author, await readyDraft(author, 'NEWS', 'خبر برای بررسی'));
  await assert.rejects(
    () => changeContentStatus(testDb.db, contentAdmin, { contentId: live.id, expectedVersion: live.version, to: 'HIDDEN' }),
    code('VALIDATION'),
  );
  const hidden = await changeContentStatus(testDb.db, contentAdmin, {
    contentId: live.id,
    expectedVersion: live.version,
    to: 'HIDDEN',
    reason: 'نیازمند بررسی منبع',
  });
  assert.equal(hidden.moderationNote, 'نیازمند بررسی منبع');
  assert.equal(await publicContentBySlug(testDb.db, 'NEWS', live.slug), null);

  await assert.rejects(() => updateContent(testDb.db, author, fields(hidden, { titleFa: 'تلاش' })), code('FORBIDDEN'));
  await assert.rejects(
    () => changeContentStatus(testDb.db, author, { contentId: live.id, expectedVersion: hidden.version, to: 'PUBLISHED' }),
    code('FORBIDDEN'),
  );
  const editing = await contentForEditing(testDb.db, author, live.id);
  assert.deepEqual(editing?.moves, []);
  assert.equal(editing?.canEdit, false);

  const restored = await changeContentStatus(testDb.db, contentAdmin, {
    contentId: live.id,
    expectedVersion: hidden.version,
    to: 'PUBLISHED',
    reason: 'منبع تأیید شد',
  });
  assert.equal(restored.moderationNote, null);
  assert.equal((await publicContentBySlug(testDb.db, 'NEWS', live.slug))?.kind, 'content');
  const [event] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, live.id), eq(auditEvents.targetVersion, hidden.version)));
  assert.equal(event!.reason, 'نیازمند بررسی منبع');
  assert.deepEqual((event!.before as { status: string }).status, 'PUBLISHED');
});

test('an archived page stays reachable but unlisted; deleting is soft and only the content admin restores it', async () => {
  const live = await publish(author, await readyDraft(author, 'ARTICLE', 'آموزش بایگانی'));
  await assert.rejects(
    () => changeContentStatus(testDb.db, author, { contentId: live.id, expectedVersion: live.version, to: 'ARCHIVED' }),
    code('VALIDATION'),
  );
  const archived = await changeContentStatus(testDb.db, author, {
    contentId: live.id,
    expectedVersion: live.version,
    to: 'ARCHIVED',
    reason: 'قدیمی شده',
  });
  const page = await publicContentBySlug(testDb.db, 'ARTICLE', live.slug);
  assert.equal(page?.kind === 'content' && page.state, 'ARCHIVED');
  assert.ok(!(await publicContentList(testDb.db, { kind: 'ARTICLE', page: 1, pageSize: 100 })).items.some((i) => i.slug === live.slug));
  assert.ok(!(await contentSitemapEntries(testDb.db, 'ARTICLE')).some((e) => e.path.endsWith('/' + live.slug)));

  const deleted = await changeContentStatus(testDb.db, author, {
    contentId: live.id,
    expectedVersion: archived.version,
    to: 'DELETED',
    reason: 'دیگر لازم نیست',
  });
  assert.equal(await publicContentBySlug(testDb.db, 'ARTICLE', live.slug), null);
  const [kept] = await testDb.db.select().from(contentItems).where(eq(contentItems.id, live.id));
  assert.equal(kept!.status, 'DELETED', 'the row is kept');
  await assert.rejects(
    () => changeContentStatus(testDb.db, author, { contentId: live.id, expectedVersion: deleted.version, to: 'DRAFT', reason: 'x' }),
    code('FORBIDDEN'),
  );
  const back = await changeContentStatus(testDb.db, contentAdmin, {
    contentId: live.id,
    expectedVersion: deleted.version,
    to: 'DRAFT',
    reason: 'به درخواست نویسنده',
  });
  assert.equal(back.status, 'DRAFT');
});

test('a renamed address redirects, addresses are unique per type, and a revision can be restored', async () => {
  const live = await publish(author, await readyDraft(author, 'NEWS', 'خبر با نشانی'));
  const renamed = await updateContent(testDb.db, author, fields(live, { slug: live.slug + '-تازه', titleFa: 'عنوان تازه ' + live.id.slice(0, 6) }));
  assert.deepEqual(await publicContentBySlug(testDb.db, 'NEWS', live.slug), { kind: 'redirect', slug: renamed.slug });

  const other = await readyDraft(author, 'NEWS', 'خبر دیگر');
  await assert.rejects(() => updateContent(testDb.db, author, fields(other, { slug: live.slug })), code('CONFLICT'));
  // Another type may use the same address.
  const article = await readyDraft(author, 'ARTICLE', 'آموزش هم‌نشانی');
  const sameSlug = await updateContent(testDb.db, author, fields(article, { slug: renamed.slug }));
  assert.equal(sameSlug.slug, renamed.slug);

  const restored = await restoreRevision(testDb.db, author, {
    contentId: live.id,
    expectedVersion: renamed.version,
    revisionNumber: live.revisionNumber,
  });
  assert.equal(restored.titleFa, live.titleFa);
  assert.equal(restored.slug, live.slug);
  assert.equal(restored.revisionNumber, renamed.revisionNumber + 1);
  assert.deepEqual(await publicContentBySlug(testDb.db, 'NEWS', renamed.slug), { kind: 'redirect', slug: live.slug });
});

test('categories belong to the content admin and to one content type', async () => {
  await assert.rejects(() => createCategory(testDb.db, author, { kind: 'ARTICLE', nameFa: 'تغذیه', slug: '' }), code('FORBIDDEN'));
  const nutrition = await createCategory(testDb.db, contentAdmin, { kind: 'ARTICLE', nameFa: 'تغذیه', slug: '' });
  assert.equal(nutrition.slug, 'تغذیه');
  await assert.rejects(() => createCategory(testDb.db, contentAdmin, { kind: 'ARTICLE', nameFa: 'تغذیه', slug: 'x' }), code('CONFLICT'));
  const newsNutrition = await createCategory(testDb.db, contentAdmin, { kind: 'NEWS', nameFa: 'تغذیه', slug: '' });

  const article = await readyDraft(author, 'ARTICLE', 'آموزش تغذیه');
  await assert.rejects(() => updateContent(testDb.db, author, fields(article, { categoryId: newsNutrition.id })), code('VALIDATION'));
  const categorised = await publish(author, await updateContent(testDb.db, author, fields(article, { categoryId: nutrition.id })));

  const filtered = await publicContentList(testDb.db, { kind: 'ARTICLE', categorySlug: 'تغذیه', page: 1 });
  assert.deepEqual(
    filtered.items.map((item) => item.slug),
    [categorised.slug],
  );
  assert.equal(filtered.category?.id, nutrition.id);

  await setCategoryActive(testDb.db, contentAdmin, { categoryId: nutrition.id, active: false });
  assert.equal((await allCategories(testDb.db, contentAdmin)).find((row) => row.id === nutrition.id)?.isActive, false);
  const editing = await contentForEditing(testDb.db, author, categorised.id);
  assert.ok(editing?.categories.some((row) => row.id === nutrition.id), 'a retired category stays selectable where it is already used');
});

test('a breed page lists visible education and news about that breed, and nothing unpublished', async () => {
  const [breed] = await testDb.db.select().from(referenceBreeds).where(eq(referenceBreeds.nameEn, 'Beagle'));
  const article = await readyDraft(author, 'ARTICLE', 'آموزش بیگل');
  const linked = await publish(author, await updateContent(testDb.db, author, fields(article, { breedId: breed!.id })));
  assert.equal(linked.speciesCode, 'DOG', 'the species follows the breed');

  const now = new Date();
  const news = await readyDraft(author, 'NEWS', 'خبر بیگل');
  await publish(author, await updateContent(testDb.db, author, fields(news, { breedId: breed!.id })), new Date(now.getTime() + HOUR), now);

  const related = await relatedContentForBreed(testDb.db, breed!.id, now);
  assert.deepEqual(
    related.map((item) => item.slug),
    [linked.slug],
  );
});
