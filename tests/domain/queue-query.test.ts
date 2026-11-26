/** Queue address and server-side slicing (P09 queue toolbar, RTO-001/003/004). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { likeOf, readQueueQuery, sliceQueue } from '../../src/domain/queue-query.ts';

const rows = [
  { name: 'ب', at: new Date('2026-01-03') },
  { name: 'الف', at: new Date('2026-01-01') },
  { name: 'پ', at: new Date('2026-01-02') },
];
const by = { text: (r: (typeof rows)[number]) => r.name, at: (r: (typeof rows)[number]) => r.at, name: (r: (typeof rows)[number]) => r.name };

test('oldest first by default, paged, unknown sort falls back', () => {
  const query = readQueueQuery({ sort: 'bogus', page: '2' });
  assert.equal(query.sort, 'oldest');
  const page = sliceQueue(rows, query, by, 2);
  assert.deepEqual(page.items.map((r) => r.name), ['ب']);
  assert.equal(page.total, 3);
  assert.equal(page.totalPages, 2);
});

test('search narrows the total but keeps the unfiltered count', () => {
  const page = sliceQueue(rows, readQueueQuery({ q: 'پ' }), by);
  assert.equal(page.total, 1);
  assert.equal(page.all, 3);
});

test('a page past the end clamps to the last page', () => {
  assert.equal(sliceQueue(rows, readQueueQuery({ page: '9' }), by, 2).page, 2);
});

test('LIKE escapes wildcards', () => {
  assert.equal(likeOf('a%_'), '%a\\%\\_%');
});
