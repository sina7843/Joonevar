/**
 * Privacy and anti-abuse rules — Phase 2 PROMPT-017.
 *
 * The pure half of §20: the window arithmetic every ceiling now shares, the
 * bulk-read cap, and the statement of the clauses themselves.
 *
 * What this file deliberately does not do is re-test the eight §20 behaviours
 * `tests/db/security.test.ts` already proves against a real database — private
 * file ownership, byte-level upload judgement, sign-in rate limiting, redaction,
 * session revocation, microchip uniqueness, visit-code scoping and KYC document
 * isolation. Repeating them here would add noise, not evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  HOUR_MS,
  MAX_BULK_ROWS,
  boundedRows,
  limitMessageFa,
  remainingInWindow,
  windowStart,
  withinLimit,
} from '../../src/privacy/limits.ts';
import { MAX_PAGE_SIZE } from '../../src/domain/pagination.ts';
import { PRIVACY_CLAUSES, PRIVACY_RULES, ruleFor } from '../../src/privacy/policy.ts';

const NOW = new Date('2026-09-12T10:00:00.000Z');

test('a ceiling counts actions, so the last allowed one is the ceiling-th', () => {
  assert.equal(withinLimit({ used: 0, ceiling: 3 }), true);
  assert.equal(withinLimit({ used: 2, ceiling: 3 }), true, 'the third action is still allowed');
  assert.equal(withinLimit({ used: 3, ceiling: 3 }), false, 'the fourth is refused');
  assert.equal(withinLimit({ used: 9, ceiling: 3 }), false);
  // A ceiling of zero closes the action entirely rather than allowing one.
  assert.equal(withinLimit({ used: 0, ceiling: 0 }), false);

  assert.equal(remainingInWindow({ used: 1, ceiling: 3 }), 2);
  assert.equal(remainingInWindow({ used: 5, ceiling: 3 }), 0, 'never negative');
});

test('the window is counted back from now, not from a stored clock', () => {
  assert.equal(windowStart(NOW, HOUR_MS).toISOString(), '2026-09-12T09:00:00.000Z');
  assert.equal(windowStart(NOW, DAY_MS).toISOString(), '2026-09-11T10:00:00.000Z');
  assert.equal(DAY_MS, 24 * HOUR_MS);
});

test('the refusal never tells a guesser how many attempts are left', () => {
  const daily = limitMessageFa(DAY_MS);
  const hourly = limitMessageFa(HOUR_MS);
  assert.match(daily, /۲۴ ساعت گذشته/);
  assert.match(hourly, /یک ساعت گذشته/);
  for (const message of [daily, hourly, limitMessageFa(5 * 60 * 1000)]) {
    assert.match(message, /بیش از حد مجاز/);
    // No digit and no ceiling: a count would be a hint about how to keep going.
    assert.equal(/[0-9]/.test(message), false, message);
    assert.equal(/باقی/.test(message), false, message);
  }
});

test('one bulk read can never take a whole table', () => {
  // No new ceiling was invented: it is the page ceiling the shared list
  // contract already enforces.
  assert.equal(MAX_BULK_ROWS, MAX_PAGE_SIZE);
  assert.equal(boundedRows(undefined, 20), 20, 'the caller keeps its own default');
  assert.equal(boundedRows(50, 20), 50);
  assert.equal(boundedRows(5_000, 20), MAX_PAGE_SIZE, 'an asked-for export is cut to the ceiling');
  assert.equal(boundedRows(0, 20), 1, 'a page of nothing is not a page');
  assert.equal(boundedRows(-10, 20), 1);
  assert.equal(boundedRows(Number.NaN, 20), 20);
  assert.equal(boundedRows(20.9, 20), 20, 'a fractional page size is floored');
  // A read with its own documented ceiling passes it in rather than adopting this one.
  assert.equal(boundedRows(5_000, 50, 200), 200);
});

test('every clause of §20 is stated once and names the code that enforces it', () => {
  assert.equal(PRIVACY_RULES.length, PRIVACY_CLAUSES.length);
  assert.deepEqual(
    PRIVACY_RULES.map((rule) => rule.clause),
    [...PRIVACY_CLAUSES],
    'the rules are listed in the order §20 names them',
  );
  for (const rule of PRIVACY_RULES) {
    assert.ok(rule.titleFa.trim() !== '', rule.clause);
    assert.ok(rule.ruleFa.length > 60, rule.clause + ' says what the product actually does');
    assert.ok(rule.enforcedIn.length > 0, rule.clause + ' names where it is enforced');
    for (const place of rule.enforcedIn) {
      assert.match(place, /^(src|app)\//, rule.clause + ' points at real code: ' + place);
    }
  }
  assert.equal(ruleFor('EXPORT_LIMIT').clause, 'EXPORT_LIMIT');
  // No clause is claimed twice.
  assert.equal(new Set(PRIVACY_RULES.map((rule) => rule.clause)).size, PRIVACY_RULES.length);
});
