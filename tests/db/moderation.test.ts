/**
 * Reports and moderation — Phase 2 PROMPT-005.
 *
 * On a migrated database: reporting visible content once while open and within
 * the daily limit, a queue that never shows who reported, each decision closing
 * every open report with its actor, time and reason, the content rules those
 * decisions go through, author notifications, correction requests answered by
 * the author's next save, publisher restrictions that end by date or when lifted,
 * and two moderators deciding at the same moment.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { contentItems } from '../../src/db/schema/content.ts';
import { moderationReports, publisherRestrictions } from '../../src/db/schema/moderation.ts';
import {
  changeContentStatus,
  createContent,
  publicContentBySlug,
  updateContent,
  type ContentFieldsInput,
  type ContentRow,
} from '../../src/content/service.ts';
import {
  decideContentReports,
  liftRestriction,
  openReportQueue,
  reportsForContent,
  restrictionHistory,
  submitContentReport,
} from '../../src/moderation/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let author: Actor;
let otherAuthor: Actor;
let admin: Actor;
let reporter: Actor;
let secondReporter: Actor;
let counter = 0;
const HOUR = 60 * 60 * 1000;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  author = actorFor(await createTestAccount(testDb.db, '09990720001'), 'AUTHOR');
  otherAuthor = actorFor(await createTestAccount(testDb.db, '09990720002'), 'AUTHOR');
  admin = actorFor(await createTestAccount(testDb.db, '09990720003'), 'CONTENT_ADMIN');
  reporter = actorFor(await createTestAccount(testDb.db, '09990720004'));
  secondReporter = actorFor(await createTestAccount(testDb.db, '09990720005'));
});

after(async () => {
  await testDb?.drop();
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

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

async function draft(by: Actor = author): Promise<ContentRow> {
  counter += 1;
  const created = await createContent(testDb.db, by, { kind: 'NEWS', titleFa: 'خبر برای بررسی ' + counter });
  return updateContent(testDb.db, by, fields(created, { summaryFa: 'خلاصه', bodyFa: 'متن خبر' }));
}

async function published(by: Actor = author): Promise<ContentRow> {
  const row = await draft(by);
  return changeContentStatus(testDb.db, by, { contentId: row.id, expectedVersion: row.version, to: 'PUBLISHED' });
}

const reload = async (id: string): Promise<ContentRow> => {
  const [row] = await testDb.db.select().from(contentItems).where(eq(contentItems.id, id));
  return row!;
};

const report = (by: Actor, item: ContentRow, reason = 'INCORRECT_INFO', details: string | null = null) =>
  submitContentReport(testDb.db, by, { contentId: item.id, reason, details });

test('a signed-in person reports visible content once while the report is open, within the daily limit', async () => {
  const unpublished = await draft();
  await assert.rejects(() => report(reporter, unpublished), code('NOT_FOUND'), 'a draft cannot be reported');

  const now = new Date();
  const scheduledDraft = await draft();
  await changeContentStatus(
    testDb.db,
    author,
    { contentId: scheduledDraft.id, expectedVersion: scheduledDraft.version, to: 'PUBLISHED', publishAt: new Date(now.getTime() + HOUR) },
    now,
  );
  await assert.rejects(() => report(reporter, scheduledDraft), code('NOT_FOUND'), 'scheduled content is not public yet');

  const item = await published();
  await assert.rejects(() => report(actorFor(author.accountId), item), code('VALIDATION'), 'not one’s own content');
  await assert.rejects(() => report(reporter, item, 'OTHER', ' '), code('VALIDATION'));
  await assert.rejects(() => report(reporter, item, 'NOT_A_REASON'), code('VALIDATION'));

  const created = await report(reporter, item, 'HEALTH_MISINFORMATION', 'بند دوم توصیه خطرناکی دارد');
  await assert.rejects(() => report(reporter, item, 'SPAM'), code('CONFLICT'), 'one open report per person per item');

  const [event] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'CONTENT_REPORTED'), eq(auditEvents.targetId, item.id)));
  assert.equal(event!.actorAccountId, reporter.accountId);
  assert.deepEqual(event!.metadata, { reportId: created.id, reason: 'HEALTH_MISINFORMATION' });

  // The daily limit comes from managed data.
  await testDb.db.execute(sql`update product_setting set value = '2'::jsonb where key = 'moderation.report_daily_limit'`);
  const limited = actorFor(await createTestAccount(testDb.db, '09990720099'));
  await report(limited, await published());
  await report(limited, await published());
  const overLimit = await published();
  await assert.rejects(() => report(limited, overLimit), code('RATE_LIMITED'));
  await testDb.db.execute(sql`update product_setting set value = '10'::jsonb where key = 'moderation.report_daily_limit'`);
});

test('the queue groups open reports per item, belongs to the content admin and never shows who reported', async () => {
  const item = await published();
  await report(reporter, item, 'OFFENSIVE');
  await report(secondReporter, item, 'SPAM');

  await assert.rejects(() => openReportQueue(testDb.db, author, { page: 1 }), code('FORBIDDEN'));
  await assert.rejects(() => openReportQueue(testDb.db, reporter, { page: 1 }), code('FORBIDDEN'));

  const queue = await openReportQueue(testDb.db, admin, { page: 1, pageSize: 100 });
  const entry = queue.items.find((row) => row.contentId === item.id);
  assert.equal(entry?.openReports, 2);
  assert.deepEqual([...(entry?.reasons ?? [])].sort(), ['OFFENSIVE', 'SPAM']);

  const detail = await reportsForContent(testDb.db, admin, item.id);
  assert.equal(detail?.open.length, 2);
  for (const shown of detail!.open) assert.ok(!('reporterAccountId' in shown), 'the reporter is not exposed');
  assert.equal(await reportsForContent(testDb.db, admin, '00000000-0000-4000-8000-000000000000'), null);
});

test('dismissing closes every open report with its decision, reason, actor and time, exactly once', async () => {
  const item = await published();
  await report(reporter, item);
  await report(secondReporter, item);

  await assert.rejects(
    () => decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'DISMISS', reason: ' ' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => decideContentReports(testDb.db, author, { contentId: item.id, decision: 'DISMISS', reason: 'x' }),
    code('FORBIDDEN'),
  );

  const result = await decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'DISMISS', reason: 'منبع درست است' });
  assert.equal(result.closed, 2);
  const rows = await testDb.db.select().from(moderationReports).where(eq(moderationReports.contentId, item.id));
  for (const row of rows) {
    assert.equal(row.status, 'DISMISSED');
    assert.equal(row.decision, 'DISMISS');
    assert.equal(row.decisionReason, 'منبع درست است');
    assert.equal(row.decidedByAccountId, admin.accountId);
    assert.ok(row.decidedAt instanceof Date);
  }
  assert.equal((await reload(item.id)).status, 'PUBLISHED', 'dismissing changes nothing on the content');
  const toAuthor = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, author.accountId));
  assert.ok(!toAuthor.some((row) => row.entityId === item.id), 'a dismissed report does not bother the author');

  await assert.rejects(
    () => decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'HIDE', reason: 'x' }),
    code('CONFLICT'),
    'nothing is left to decide',
  );
  // A new report can be made once the earlier one is closed.
  await report(reporter, item);
});

test('hiding and soft-deleting go through the content rules and tell the author', async () => {
  const hidden = await published();
  await report(reporter, hidden);
  await decideContentReports(testDb.db, admin, { contentId: hidden.id, decision: 'HIDE', reason: 'ادعای سلامت بی‌منبع' });
  const afterHide = await reload(hidden.id);
  assert.equal(afterHide.status, 'HIDDEN');
  assert.equal(afterHide.moderationNote, 'ادعای سلامت بی‌منبع');
  assert.equal(await publicContentBySlug(testDb.db, 'NEWS', hidden.slug), null);
  await assert.rejects(() => report(secondReporter, hidden), code('NOT_FOUND'), 'hidden content is no longer reportable');

  const [notice] = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, author.accountId), eq(notifications.entityId, hidden.id)));
  assert.equal(notice!.kind, 'CONTENT_MODERATION_HIDE');
  assert.equal(notice!.originRoute, '/author/content/' + hidden.id);
  assert.equal((await testDb.db.select().from(moderationReports).where(eq(moderationReports.contentId, hidden.id)))[0]!.status, 'ACTIONED');

  const deleted = await published();
  await report(reporter, deleted);
  await decideContentReports(testDb.db, admin, { contentId: deleted.id, decision: 'SOFT_DELETE', reason: 'هرزنامه' });
  assert.equal((await reload(deleted.id)).status, 'DELETED');

  const events = (await testDb.db.select().from(auditEvents).where(eq(auditEvents.targetId, deleted.id))).map((row) => row.action);
  assert.ok(events.includes('CONTENT_STATUS_CHANGED') && events.includes('CONTENT_REPORTS_DECIDED'));
});

test('a correction request keeps the content up until the author’s next save answers it', async () => {
  const item = await published();
  await report(reporter, item);
  await decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'REQUEST_CORRECTION', reason: 'تاریخ خبر نادرست است' });

  const requested = await reload(item.id);
  assert.equal(requested.status, 'PUBLISHED');
  assert.equal(requested.correctionNote, 'تاریخ خبر نادرست است');
  assert.equal((await publicContentBySlug(testDb.db, 'NEWS', item.slug))?.kind, 'content', 'still public');
  const [notice] = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.entityId, item.id), eq(notifications.kind, 'CONTENT_MODERATION_REQUEST_CORRECTION')));
  assert.ok(notice);

  const corrected = await updateContent(testDb.db, author, fields(requested, { bodyFa: 'متن اصلاح‌شده' }));
  assert.equal(corrected.correctionNote, null);
  assert.equal(corrected.correctionRequestedAt, null);
  const [addressed] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, item.id), eq(auditEvents.action, 'CONTENT_CORRECTION_ADDRESSED')));
  assert.deepEqual(addressed!.before, { correctionNote: 'تاریخ خبر نادرست است' });
});

test('a restricted publisher cannot publish or change public content until the restriction ends or is lifted', async () => {
  const live = await published(otherAuthor);
  const pending = await draft(otherAuthor);
  await report(reporter, live);

  const now = new Date();
  await assert.rejects(
    () => decideContentReports(testDb.db, admin, { contentId: live.id, decision: 'RESTRICT_PUBLISHER', reason: 'x', restrictUntil: new Date(now.getTime() - HOUR) }),
    code('VALIDATION'),
  );
  const until = new Date(now.getTime() + HOUR);
  await decideContentReports(testDb.db, admin, { contentId: live.id, decision: 'RESTRICT_PUBLISHER', reason: 'انتشار مکرر ادعای بی‌منبع', restrictUntil: until }, now);

  await assert.rejects(
    () => changeContentStatus(testDb.db, otherAuthor, { contentId: pending.id, expectedVersion: pending.version, to: 'PUBLISHED' }),
    /محدود/,
  );
  const liveNow = await reload(live.id);
  await assert.rejects(() => updateContent(testDb.db, otherAuthor, fields(liveNow, { bodyFa: 'تغییر' })), code('FORBIDDEN'));
  const editedDraft = await updateContent(testDb.db, otherAuthor, fields(pending, { bodyFa: 'پیش‌نویس هنوز ویرایش می‌شود' }));
  assert.equal(editedDraft.bodyFa, 'پیش‌نویس هنوز ویرایش می‌شود');

  const [notice] = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, otherAuthor.accountId), eq(notifications.kind, 'CONTENT_MODERATION_RESTRICT_PUBLISHER')));
  assert.equal(notice!.originRoute, '/author');

  // A second restriction while one is in force is refused, and the report stays open.
  await report(secondReporter, live);
  await assert.rejects(
    () => decideContentReports(testDb.db, admin, { contentId: live.id, decision: 'RESTRICT_PUBLISHER', reason: 'دوباره' }, now),
    code('VALIDATION'),
  );
  assert.equal((await reportsForContent(testDb.db, admin, live.id))?.open.length, 1);

  // It ends by its own date — no job, just the clock.
  const later = new Date(until.getTime() + 60_000);
  const republished = await changeContentStatus(
    testDb.db,
    otherAuthor,
    { contentId: editedDraft.id, expectedVersion: editedDraft.version, to: 'PUBLISHED' },
    later,
  );
  assert.equal(republished.status, 'PUBLISHED');

  // An indefinite restriction is lifted with a reason.
  const second = await published(author);
  await report(reporter, second);
  await decideContentReports(testDb.db, admin, { contentId: second.id, decision: 'RESTRICT_PUBLISHER', reason: 'تا بررسی بیشتر' });
  const [restriction] = await testDb.db
    .select()
    .from(publisherRestrictions)
    .where(and(eq(publisherRestrictions.accountId, author.accountId), sql`${publisherRestrictions.liftedAt} is null`));
  assert.equal(restriction!.endsAt, null);
  const authorDraft = await draft(author);
  await assert.rejects(
    () => changeContentStatus(testDb.db, author, { contentId: authorDraft.id, expectedVersion: authorDraft.version, to: 'PUBLISHED' }),
    code('FORBIDDEN'),
  );

  await assert.rejects(() => liftRestriction(testDb.db, admin, { restrictionId: restriction!.id, reason: '' }), code('VALIDATION'));
  await assert.rejects(() => liftRestriction(testDb.db, author, { restrictionId: restriction!.id, reason: 'x' }), code('FORBIDDEN'));
  await liftRestriction(testDb.db, admin, { restrictionId: restriction!.id, reason: 'نویسنده منابع را اضافه کرد' });
  const nowPublished = await changeContentStatus(testDb.db, author, {
    contentId: authorDraft.id,
    expectedVersion: authorDraft.version,
    to: 'PUBLISHED',
  });
  assert.equal(nowPublished.status, 'PUBLISHED');
  await assert.rejects(
    () => liftRestriction(testDb.db, admin, { restrictionId: restriction!.id, reason: 'دوباره' }),
    code('NOT_FOUND'),
  );
  const history = await restrictionHistory(testDb.db, admin);
  assert.equal(history.find((row) => row.id === restriction!.id)?.active, false);
});

test('two moderators deciding at the same moment: one decision is recorded, the other is told', async () => {
  const item = await published();
  await report(reporter, item);
  const outcomes = await Promise.allSettled([
    decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'DISMISS', reason: 'نخست' }),
    decideContentReports(testDb.db, admin, { contentId: item.id, decision: 'HIDE', reason: 'دوم' }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
  assert.equal((rejected.reason as { code?: string }).code, 'CONFLICT');
  const rows = await testDb.db.select().from(moderationReports).where(eq(moderationReports.contentId, item.id));
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0]!.status, 'OPEN');
});
