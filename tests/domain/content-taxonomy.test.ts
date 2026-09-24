/**
 * The baseline content taxonomy and its rules — Phase 2.5 PROMPT-014.
 *
 * These are the categories the phase asks for. The list is data the seed
 * installs, so what matters here is that it is internally consistent, that the
 * subjects the phase names are actually present, and that material about an
 * outside body carries its source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_CATEGORY_SEED,
  EXTERNAL_BODY_NOTICE_FA,
  EXTERNAL_BODY_SLUGS,
  externalBodyProblem,
  isExternalBodyCategory,
  seedCategoriesOf,
} from '../../src/content/taxonomy.ts';
import { CONTENT_KINDS, contentSlugify, isValidContentSlug } from '../../src/content/model.ts';

test('every seeded category is addressable and unique inside its kind', () => {
  const seen = new Set<string>();
  for (const entry of CONTENT_CATEGORY_SEED) {
    assert.ok((CONTENT_KINDS as readonly string[]).includes(entry.kind), entry.kind);
    assert.ok(isValidContentSlug(entry.slug), entry.slug + ' is not a usable address');
    assert.equal(entry.slug, contentSlugify(entry.slug), entry.slug + ' is not in its normal form');
    assert.equal(entry.nameFa.trim(), entry.nameFa);
    assert.ok(entry.sortOrder > 0);
    const key = entry.kind + ':' + entry.slug;
    assert.equal(seen.has(key), false, 'duplicate category ' + key);
    seen.add(key);
  }
  // A name is unique per kind too: the database enforces it, so the seed cannot
  // ship a pair that would collide on first run.
  for (const kind of CONTENT_KINDS) {
    const names = seedCategoriesOf(kind).map((entry) => entry.nameFa);
    assert.equal(new Set(names).size, names.length, 'duplicate category name in ' + kind);
  }
});

test('the subjects Phase 2.5 §9 names all have a home', () => {
  const articles = seedCategoriesOf('ARTICLE').map((entry) => entry.slug);
  for (const slug of [
    'amuzesh-samaneh',
    'shajarenameh',
    'barge-sabti',
    'microchip',
    'mojavez-jofgiri',
    'parentage-test',
    'nezhadhaye-sag',
    'damepezeshk-motamad',
    'bimarestan-va-klinik',
    'anjoman',
    'club',
    'the-kennel-club',
    'american-kennel-club',
  ]) {
    assert.ok(articles.includes(slug), 'missing education category ' + slug);
  }
  assert.ok(seedCategoriesOf('NEWS').length >= 3, 'news has categories of its own');
  assert.ok(seedCategoriesOf('ANNOUNCEMENT').length >= 3, 'announcements have categories of their own');
  // A club post belongs to its club, so it has no site-wide category.
  assert.deepEqual(seedCategoriesOf('CLUB_POST'), []);
});

test('material about an outside body is educational, sourced and never claims a relationship', () => {
  for (const slug of EXTERNAL_BODY_SLUGS) {
    assert.equal(isExternalBodyCategory(slug), true);
    const entry = CONTENT_CATEGORY_SEED.find((row) => row.slug === slug)!;
    assert.equal(entry.attribution, 'EXTERNAL_BODY');
  }
  assert.equal(isExternalBodyCategory('shajarenameh'), false);
  assert.equal(isExternalBodyCategory(null), false);

  // Without a source it is not published; with one it is.
  assert.ok(externalBodyProblem({ categorySlug: 'the-kennel-club', sourceCount: 0 }));
  assert.equal(externalBodyProblem({ categorySlug: 'the-kennel-club', sourceCount: 1 }), null);
  assert.equal(externalBodyProblem({ categorySlug: 'shajarenameh', sourceCount: 0 }), null);

  // The notice says what it is and what it is not, in the product's own words.
  assert.ok(EXTERNAL_BODY_NOTICE_FA.includes('آموزشی'));
  assert.ok(EXTERNAL_BODY_NOTICE_FA.includes('وابستگی رسمی ندارد'));
  assert.ok(EXTERNAL_BODY_NOTICE_FA.includes('نماینده'));
});

test('the taxonomy names no organisation it is not writing about', () => {
  // The two outside bodies are named because the phase asks for material about
  // them; nothing else in the list is somebody else's registered name.
  const external = CONTENT_CATEGORY_SEED.filter((entry) => entry.attribution === 'EXTERNAL_BODY').map((entry) => entry.slug);
  assert.deepEqual(external, [...EXTERNAL_BODY_SLUGS]);
});
