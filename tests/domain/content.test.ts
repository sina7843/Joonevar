import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedMoves,
  bylineFor,
  canEditContent,
  contentSlugify,
  creatableKinds,
  effectivePublishAt,
  isValidContentSlug,
  parseSources,
  parseTags,
  publicState,
  publishBlockers,
  reasonRequired,
  TEAM_BYLINE,
} from '../../src/content/model.ts';

const cp = (...codes: number[]) => String.fromCharCode(...codes);
const NOW = new Date('2026-09-11T12:00:00Z');

test('an author writes education and news; announcements are the content admin’s; club posts wait for clubs', () => {
  assert.deepEqual(creatableKinds('AUTHOR'), ['ARTICLE', 'NEWS']);
  assert.deepEqual(creatableKinds('CONTENT_ADMIN'), ['ARTICLE', 'NEWS', 'ANNOUNCEMENT']);
  for (const role of ['AUTHOR', 'CONTENT_ADMIN'] as const) assert.ok(!creatableKinds(role).includes('CLUB_POST'));
});

test('an author moves only their own content, and not once the content admin has hidden or deleted it', () => {
  assert.deepEqual(allowedMoves('AUTHOR', 'DRAFT', true), ['PUBLISHED', 'DELETED']);
  assert.deepEqual(allowedMoves('AUTHOR', 'PUBLISHED', true), ['DRAFT', 'ARCHIVED']);
  assert.deepEqual(allowedMoves('AUTHOR', 'ARCHIVED', true), ['PUBLISHED', 'DELETED']);
  assert.deepEqual(allowedMoves('AUTHOR', 'DRAFT', false), []);
  assert.deepEqual(allowedMoves('AUTHOR', 'HIDDEN', true), []);
  assert.deepEqual(allowedMoves('AUTHOR', 'DELETED', true), []);

  assert.deepEqual(allowedMoves('CONTENT_ADMIN', 'PUBLISHED', false), ['DRAFT', 'ARCHIVED', 'DELETED', 'HIDDEN']);
  assert.deepEqual(allowedMoves('CONTENT_ADMIN', 'HIDDEN', false), ['DRAFT', 'PUBLISHED', 'DELETED']);
  assert.deepEqual(allowedMoves('CONTENT_ADMIN', 'DELETED', false), ['DRAFT']);

  assert.ok(canEditContent('AUTHOR', 'PUBLISHED', true));
  assert.ok(!canEditContent('AUTHOR', 'PUBLISHED', false));
  assert.ok(!canEditContent('AUTHOR', 'HIDDEN', true));
  assert.ok(canEditContent('CONTENT_ADMIN', 'HIDDEN', false));
  assert.ok(!canEditContent('CONTENT_ADMIN', 'DELETED', false));
});

test('a reason is required for moderation, archiving, deleting, restoring and acting on someone else’s content', () => {
  assert.equal(reasonRequired('AUTHOR', 'DRAFT', 'PUBLISHED', true), false);
  assert.equal(reasonRequired('AUTHOR', 'PUBLISHED', 'DRAFT', true), false);
  assert.equal(reasonRequired('AUTHOR', 'PUBLISHED', 'ARCHIVED', true), true);
  assert.equal(reasonRequired('AUTHOR', 'DRAFT', 'DELETED', true), true);
  assert.equal(reasonRequired('CONTENT_ADMIN', 'DRAFT', 'PUBLISHED', true), false);
  assert.equal(reasonRequired('CONTENT_ADMIN', 'DRAFT', 'PUBLISHED', false), true);
  assert.equal(reasonRequired('CONTENT_ADMIN', 'HIDDEN', 'PUBLISHED', true), true);
});

test('visibility is decided at the moment of reading: scheduled content is not visible yet', () => {
  const past = new Date('2026-09-11T11:59:00Z');
  const future = new Date('2026-09-12T08:00:00Z');
  assert.equal(publicState({ status: 'PUBLISHED', publishAt: past }, NOW), 'VISIBLE');
  assert.equal(publicState({ status: 'PUBLISHED', publishAt: NOW }, NOW), 'VISIBLE');
  assert.equal(publicState({ status: 'PUBLISHED', publishAt: future }, NOW), 'SCHEDULED');
  assert.equal(publicState({ status: 'PUBLISHED', publishAt: future }, new Date('2026-09-12T08:00:01Z')), 'VISIBLE');
  assert.equal(publicState({ status: 'PUBLISHED', publishAt: null }, NOW), 'NOT_PUBLIC');
  assert.equal(publicState({ status: 'ARCHIVED', publishAt: past }, NOW), 'ARCHIVED');
  for (const status of ['DRAFT', 'HIDDEN', 'DELETED'] as const) {
    assert.equal(publicState({ status, publishAt: past }, NOW), 'NOT_PUBLIC', status);
  }

  assert.equal(effectivePublishAt(null, NOW), NOW);
  assert.equal(effectivePublishAt(past, NOW), NOW, 'publishing cannot be backdated');
  assert.equal(effectivePublishAt(future, NOW), future);
});

test('education needs sources and a review date before publishing; news does not', () => {
  const base = { titleFa: 'عنوان', summaryFa: 'خلاصه', bodyFa: 'متن', sources: [], reviewedOn: null };
  assert.equal(publishBlockers({ ...base, kind: 'ARTICLE' }).length, 2);
  assert.deepEqual(publishBlockers({ ...base, kind: 'NEWS' }), []);
  assert.deepEqual(
    publishBlockers({ ...base, kind: 'ARTICLE', sources: [{ title: 'منبع', url: null }], reviewedOn: '2026-01-01' }),
    [],
  );
  assert.equal(publishBlockers({ ...base, kind: 'NEWS', bodyFa: '  ' }).length, 1);
});

test('addresses are readable Persian or latin, with one spelling', () => {
  assert.equal(contentSlugify('مراقبت از توله در زمستان'), 'مراقبت-از-توله-در-زمستان');
  assert.equal(contentSlugify('Puppy Care 101!'), 'puppy-care-101');
  assert.equal(contentSlugify('سگ' + cp(0x064a)), 'سگ' + cp(0x06cc), 'Arabic yeh becomes Persian');
  assert.equal(contentSlugify('نیم' + cp(0x200c) + 'فاصله'), 'نیم-فاصله');
  assert.equal(contentSlugify('س' + cp(0x064e) + 'گ'), 'سگ', 'short vowels are dropped');

  assert.ok(isValidContentSlug('مراقبت-از-توله'));
  assert.ok(isValidContentSlug('puppy-care-101'));
  for (const bad of ['Puppy', 'a--b', '-a', 'a b', 'سگ' + cp(0x064a), '', 'a'.repeat(81)]) {
    assert.ok(!isValidContentSlug(bad), bad);
  }
});

test('sources and tags are parsed from plain fields and validated', () => {
  const parsed = parseSources('کتاب مرجع\nراهنمای انجمن | https://example.org/guide\n\n');
  assert.deepEqual(parsed.sources, [
    { title: 'کتاب مرجع', url: null },
    { title: 'راهنمای انجمن', url: 'https://example.org/guide' },
  ]);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parseSources('منبع | javascript:alert(1)').problems.length, 1);
  assert.equal(parseSources(' | https://example.org').problems.length, 1);

  assert.deepEqual(parseTags('توله، تغذیه, توله\nزمستان'), ['توله', 'تغذیه', 'زمستان']);
  assert.equal(parseTags(Array.from({ length: 15 }, (_, i) => 'tag' + i).join(',')).length, 10);
});

test('the byline shows an author’s name only when they chose to show it', () => {
  assert.equal(bylineFor({ displayName: 'نویسنده نمونه', displayNameVisible: true }), 'نویسنده نمونه');
  assert.equal(bylineFor({ displayName: 'نویسنده نمونه', displayNameVisible: false }), TEAM_BYLINE);
  assert.equal(bylineFor({ displayName: '  ', displayNameVisible: true }), TEAM_BYLINE);
  assert.equal(bylineFor(null), TEAM_BYLINE);
});
