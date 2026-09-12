/**
 * Privacy and anti-abuse against a real database — Phase 2 PROMPT-017.
 *
 * Only what this prompt actually changed or newly stated is checked here: the
 * export ceiling that the operator queues never had, and the impersonation
 * guard on a national id. The eight §20 behaviours `tests/db/security.test.ts`
 * already proves — private file ownership, byte-level upload judgement, sign-in
 * rate limiting, redaction, session revocation, microchip uniqueness,
 * visit-code scoping and KYC document isolation — are not repeated.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { MAX_PAGE_SIZE } from '../../src/domain/pagination.ts';
import { signInWithVerifiedMobile, saveProfile } from '../../src/identity/account.ts';
import { suggestionQueue } from '../../src/suggestions/service.ts';
import { vetApplicationQueue } from '../../src/vets/onboarding.ts';
import { centreClaimQueue } from '../../src/centres/claims.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let reviewer: Actor;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  reviewer = actorFor(await createTestAccount(testDb.db, '09990710001'), 'REVIEW_OPERATOR');
});

after(async () => {
  await testDb?.drop();
});

test('an operator queue never returns a whole table, however large a page is asked for', async () => {
  // Every operator queue builds its own page object, which is exactly why each
  // had to be bounded: none of them passed through the shared list contract.
  const queues = [
    await suggestionQueue(testDb.db, reviewer, { view: 'OPEN', page: 1, pageSize: 100_000 }),
    await vetApplicationQueue(testDb.db, reviewer, { view: 'OPEN', page: 1, pageSize: 100_000 }),
    await centreClaimQueue(testDb.db, reviewer, { view: 'OPEN', page: 1, pageSize: 100_000 }),
  ];
  for (const queue of queues) {
    assert.equal(queue.pageSize, MAX_PAGE_SIZE, 'the answer is cut to the shared ceiling');
    assert.ok(queue.items.length <= MAX_PAGE_SIZE);
  }

  // The caller's own modest page size is still honoured.
  const small = await suggestionQueue(testDb.db, reviewer, { view: 'OPEN', page: 1, pageSize: 5 });
  assert.equal(small.pageSize, 5);
  const byDefault = await suggestionQueue(testDb.db, reviewer, { view: 'OPEN', page: 1 });
  assert.equal(byDefault.pageSize, 20);
});

test('a national id belongs to one account, and the refusal says so plainly', async () => {
  const first = await signInWithVerifiedMobile(testDb.db, '09990710003');
  const second = await signInWithVerifiedMobile(testDb.db, '09990710004');
  const identity = {
    firstName: 'نمونه',
    lastName: 'کاربر آزمایشی',
    displayName: 'نمایشی آزمایشی',
    nationalId: '0499370899',
    birthDate: '1990-01-01',
  };

  await saveProfile(testDb.db, actorFor(first.accountId), identity);
  // The second account cannot take the same identity: §20's impersonation rule
  // is a unique index, not a check someone can forget to call.
  await assert.rejects(
    saveProfile(testDb.db, actorFor(second.accountId), identity),
    /این کد ملی قبلاً برای حساب دیگری ثبت شده است/,
  );
});

/*
 * The ceilings themselves are deliberately not re-tested here. The
 * three-open-suggestions rule and the daily ceiling are already proven against
 * a real database by `tests/db/suggestions.test.ts` (PROMPT-009), the sign-in
 * ceiling by `tests/db/security.test.ts`, and the hourly verification ceiling
 * by `tests/db/verification.test.ts`. What this prompt changed about them —
 * that the window arithmetic and the refusal wording are now one shared rule
 * that never counts attempts back to a guesser — is proven without a database
 * in `tests/domain/privacy.test.ts`.
 */

