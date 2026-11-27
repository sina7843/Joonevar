import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageState, associationTiles, countsByHref, type QueueCount } from '../../src/operations/service.ts';

const q = (key: string, href: string, waiting: number, oldestAt: string | null): QueueCount => ({
  key,
  titleFa: key,
  noteFa: key,
  href,
  waiting,
  oldestAt: oldestAt === null ? null : new Date(oldestAt),
});

test('an unset review clock never flags a case; a set one flags late and overdue (DEC-0241)', () => {
  assert.equal(ageState(40, { lateDays: null, overdueDays: null }), undefined);
  assert.equal(ageState(null, { lateDays: 3, overdueDays: 7 }), undefined);
  assert.equal(ageState(2, { lateDays: 3, overdueDays: 7 }), undefined);
  assert.equal(ageState(3, { lateDays: 3, overdueDays: 7 }), 'late');
  assert.equal(ageState(7, { lateDays: 3, overdueDays: 7 }), 'overdue');
  assert.equal(ageState(9, { lateDays: null, overdueDays: 7 }), 'overdue');
});

test('the association home groups twelve queues into the eight K13 tiles, adding counts and keeping the oldest', () => {
  const queues = [
    q('kyc', '/assoc/kyc', 2, '2026-01-05'),
    q('vet-students', '/assoc/vet-students', 1, '2026-01-03'),
    q('vet-doctors', '/assoc/vet-doctors', 0, null),
    q('vet-licences', '/assoc/vet-licences', 2, '2026-01-01'),
    q('vet-trusted', '/assoc/vet-trusted', 0, null),
    q('members', '/assoc/members', 0, null),
    q('clubs', '/assoc/clubs', 1, '2026-01-04'),
    q('club-ownership', '/assoc/clubs', 1, '2026-01-02'),
    q('kennels', '/assoc/kennels', 0, null),
    q('permits', '/assoc/permits', 0, null),
    q('foreign', '/assoc/foreign-pedigree', 0, null),
    q('postal', '/assoc/postal', 0, null),
  ];
  const tiles = associationTiles(queues);
  assert.deepEqual(
    tiles.map((tile) => tile.key),
    ['kyc', 'members', 'vets', 'permits', 'kennels', 'clubs', 'postal', 'foreign'],
  );
  const vets = tiles.find((tile) => tile.key === 'vets')!;
  assert.equal(vets.waiting, 3);
  assert.equal(vets.oldestAt?.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(tiles.find((tile) => tile.key === 'members')!.oldestAt, null);
  assert.equal(tiles.reduce((sum, tile) => sum + tile.waiting, 0), 7, 'no case is lost or counted twice');

  const nav = countsByHref(queues);
  assert.equal(nav.get('/assoc/clubs')?.waiting, 2, 'two queues opening one page add up on its nav item');
  assert.equal(nav.get('/assoc/clubs')?.oldestAt?.toISOString().slice(0, 10), '2026-01-02');
});
