import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPedigreeCode,
  generationLabel,
  normalizePedigreeCode,
  resolveGeneration,
  wouldCreateCycle,
  type ParentResolution,
} from '../../src/domain/lineage.ts';

const resolved = (generation: number, id = 'a-' + generation): ParentResolution => ({
  state: 'RESOLVED',
  animalId: id,
  generation,
});
const notFound: ParentResolution = { state: 'NOT_FOUND' };
const lookupError: ParentResolution = { state: 'LOOKUP_ERROR' };

test('the documented examples compute exactly as the source says', () => {
  // §9.3: G0×G0 → G1 and G2×G1 → G2.
  const g1 = resolveGeneration(resolved(0, 'sire'), resolved(0, 'dam'), 0);
  assert.equal(g1.state, 'COMPUTED');
  assert.ok(g1.state === 'COMPUTED' && g1.generation === 1);

  const g2 = resolveGeneration(resolved(2, 'sire'), resolved(1, 'dam'), 0);
  assert.ok(g2.state === 'COMPUTED' && g2.generation === 2);
});

test('the generation is one more than the lower parent, in either order', () => {
  assert.deepEqual(resolveGeneration(resolved(1, 's'), resolved(4, 'd'), 0), {
    state: 'COMPUTED',
    generation: 2,
    origin: 'INTERNAL_G1PLUS',
  });
  assert.deepEqual(resolveGeneration(resolved(4, 's'), resolved(1, 'd'), 0), {
    state: 'COMPUTED',
    generation: 2,
    origin: 'INTERNAL_G1PLUS',
  });
});

test('a genuinely missing parent gives G0 and names which one is missing', () => {
  const missingSire = resolveGeneration(notFound, resolved(3, 'dam'), 5);
  assert.equal(missingSire.state, 'PARENT_MISSING');
  assert.ok(missingSire.state === 'PARENT_MISSING');
  assert.equal(missingSire.generation, 0);
  assert.equal(missingSire.origin, 'G0');
  assert.deepEqual(missingSire.missing, ['SIRE']);

  const missingBoth = resolveGeneration(notFound, notFound, 0);
  assert.ok(missingBoth.state === 'PARENT_MISSING');
  assert.deepEqual(missingBoth.missing, ['SIRE', 'DAM']);
});

test('a technical lookup failure is never reported as a missing parent', () => {
  // §9.3: LOOKUP_ERROR keeps the draft and the current generation.
  const failed = resolveGeneration(lookupError, resolved(1, 'dam'), 3);
  assert.equal(failed.state, 'LOOKUP_ERROR');
  assert.ok(failed.state === 'LOOKUP_ERROR' && failed.keepGeneration === 3);

  // Even alongside a genuinely absent parent, the failure wins: a pedigree
  // animal must not be silently demoted to G0 because a query failed.
  const both = resolveGeneration(lookupError, notFound, 2);
  assert.equal(both.state, 'LOOKUP_ERROR');
  assert.ok(both.state === 'LOOKUP_ERROR' && both.keepGeneration === 2);
});

test('a self link is refused outright', async () => {
  assert.equal(await wouldCreateCycle('a', 'a', async () => []), true);
});

test('a link that would make an animal its own ancestor is refused', async () => {
  // child -> parent -> grandparent, and grandparent's parent would be the child.
  const tree = new Map<string, readonly string[]>([
    ['parent', ['grandparent']],
    ['grandparent', ['child']],
    ['child', []],
  ]);
  const ancestorsOf = async (id: string) => tree.get(id) ?? [];

  assert.equal(await wouldCreateCycle('child', 'parent', ancestorsOf), true);
});

test('an unrelated parent link is accepted', async () => {
  const tree = new Map<string, readonly string[]>([
    ['parent', ['grandparent']],
    ['grandparent', []],
    ['child', []],
  ]);
  assert.equal(await wouldCreateCycle('child', 'parent', async (id) => tree.get(id) ?? []), false);
});

test('an existing cycle in data cannot hang the walk', async () => {
  const tree = new Map<string, readonly string[]>([
    ['a', ['b']],
    ['b', ['a']],
  ]);
  assert.equal(await wouldCreateCycle('child', 'a', async (id) => tree.get(id) ?? []), false);
});

test('pedigree codes compare in one canonical shape', () => {
  assert.equal(normalizePedigreeCode('  hz-ped 001 '), 'HZ-PED001');
  assert.equal(assertPedigreeCode('hz-ped-001'), 'HZ-PED-001');
  assert.throws(() => assertPedigreeCode('ab'), /معتبر نیست/);
  assert.throws(() => assertPedigreeCode('x'.repeat(70)), /طولانی/);
});

test('the generation label is derived, never entered', () => {
  assert.equal(generationLabel(0), 'G0');
  assert.equal(generationLabel(3), 'G3');
});
