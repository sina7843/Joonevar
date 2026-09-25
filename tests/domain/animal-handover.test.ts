/**
 * The rules of the handover — PROMPT-007.
 *
 * The lifecycle, the code policy and the conditions that must still hold at the
 * instant an animal changes hands. All pure, so the exact behaviour of each
 * branch is pinned here and the database tests can be about what persists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterWrongAttempt,
  canMoveHandover,
  codeAttemptAllowed,
  handoverMovesFrom,
  handoverStatement,
  isHandoverFinal,
  isReschedulable,
  transferBlockers,
  HANDOVER_CODE_LENGTH,
  HANDOVER_STATUSES,
  HANDOVER_STATUS_FA,
  TRANSFER_CONDITIONS,
  TRANSFER_CONDITION_FA,
  type CodePolicy,
  type CodeState,
  type TransferFacts,
} from '../../src/marketplace/handover-model.ts';

const NOW = new Date('2026-05-01T10:00:00.000Z');

const policy: CodePolicy = { validityMinutes: 15, maxAttempts: 3, lockMinutes: 15, maxIssues: 5 };

const codeState = (over: Partial<CodeState> = {}): CodeState => ({
  codeHash: 'a'.repeat(64),
  codeExpiresAt: new Date(NOW.getTime() + 5 * 60_000),
  codeAttempts: 0,
  codeLockedUntil: null,
  codeMaxAttempts: 3,
  ...over,
});

const allTrue: TransferFacts = {
  depositVerified: true,
  minimumAgeReached: true,
  microchipRegistered: true,
  sellerStillAuthorised: true,
  animalTransferable: true,
  noExistingTransfer: true,
  noOpenDispute: true,
};

test('every status and every condition is named in Persian', () => {
  for (const status of HANDOVER_STATUSES) assert.ok(HANDOVER_STATUS_FA[status]);
  for (const condition of TRANSFER_CONDITIONS) assert.ok(TRANSFER_CONDITION_FA[condition]);
});

test('the seller can never finish a handover alone', () => {
  // Whatever the seller typed, the animal is in front of the buyer, so only the
  // buyer's own confirmation — or an administrator recording the meeting —
  // completes it.
  assert.ok(canMoveHandover('SELLER_ENTERED', 'COMPLETED', 'BUYER'));
  assert.ok(canMoveHandover('SELLER_ENTERED', 'COMPLETED', 'ADMIN'));
  assert.ok(!canMoveHandover('SELLER_ENTERED', 'COMPLETED', 'SELLER'));
  assert.ok(!canMoveHandover('SELLER_ENTERED', 'COMPLETED', 'SYSTEM'));

  // And nothing reaches completion without the seller's entry first.
  assert.ok(!canMoveHandover('SCHEDULED', 'COMPLETED', 'BUYER'));
  assert.ok(!canMoveHandover('CODE_ISSUED', 'COMPLETED', 'BUYER'));
});

test('only the buyer asks for a code, and expiry is nobody’s decision', () => {
  assert.ok(canMoveHandover('SCHEDULED', 'CODE_ISSUED', 'BUYER'));
  assert.ok(!canMoveHandover('SCHEDULED', 'CODE_ISSUED', 'SELLER'));
  assert.ok(canMoveHandover('CODE_ISSUED', 'EXPIRED', 'SYSTEM'));
  assert.ok(!canMoveHandover('CODE_ISSUED', 'EXPIRED', 'SELLER'));
});

test('a completed handover is the end of the road', () => {
  assert.ok(isHandoverFinal('COMPLETED'));
  assert.deepEqual(handoverMovesFrom('COMPLETED', 'BUYER'), []);
  assert.deepEqual(handoverMovesFrom('COMPLETED', 'SELLER'), []);
  assert.deepEqual(handoverMovesFrom('COMPLETED', 'ADMIN'), []);
  // A meeting that did not happen can be arranged again.
  assert.ok(isReschedulable('REFUSED'));
  assert.ok(isReschedulable('EXPIRED'));
  assert.ok(!isReschedulable('COMPLETED'));
  assert.ok(canMoveHandover('REFUSED', 'SCHEDULED', 'SELLER'));
});

test('a held handover is released by an administrator, not by either party', () => {
  assert.ok(canMoveHandover('CODE_ISSUED', 'ON_HOLD', 'SYSTEM'));
  assert.ok(canMoveHandover('ON_HOLD', 'SCHEDULED', 'ADMIN'));
  assert.ok(!canMoveHandover('ON_HOLD', 'SCHEDULED', 'BUYER'));
  assert.ok(!canMoveHandover('ON_HOLD', 'SCHEDULED', 'SELLER'));
});

test('a code is refused before its digits are ever compared', () => {
  assert.deepEqual(codeAttemptAllowed(codeState(), NOW), { state: 'OK' });

  const none = codeAttemptAllowed(codeState({ codeHash: null }), NOW);
  assert.equal(none.state, 'NO_CODE');

  const expired = codeAttemptAllowed(codeState({ codeExpiresAt: new Date(NOW.getTime() - 1000) }), NOW);
  assert.equal(expired.state, 'EXPIRED');

  const locked = codeAttemptAllowed(codeState({ codeLockedUntil: new Date(NOW.getTime() + 120_000) }), NOW);
  assert.equal(locked.state, 'LOCKED');
  if (locked.state === 'LOCKED') assert.equal(locked.retryAfterSeconds, 120);

  // A lock that has run out is simply over; nothing has to unlock it.
  const past = codeAttemptAllowed(codeState({ codeLockedUntil: new Date(NOW.getTime() - 1) }), NOW);
  assert.equal(past.state, 'OK');
});

test('wrong attempts are counted and the ceiling locks the code', () => {
  const first = afterWrongAttempt(codeState(), policy, NOW);
  assert.equal(first.attempts, 1);
  assert.equal(first.attemptsRemaining, 2);
  assert.equal(first.lockedUntil, null);

  const last = afterWrongAttempt(codeState({ codeAttempts: 2 }), policy, NOW);
  assert.equal(last.attempts, 3);
  assert.equal(last.attemptsRemaining, 0);
  assert.equal(last.lockedUntil?.toISOString(), '2026-05-01T10:15:00.000Z');

  // The ceiling frozen on the row wins over a setting changed since.
  const frozen = afterWrongAttempt(codeState({ codeMaxAttempts: 1 }), policy, NOW);
  assert.equal(frozen.attemptsRemaining, 0);
  assert.ok(frozen.lockedUntil);
});

test('the code is six digits, so guessing it has to be bounded', () => {
  assert.equal(HANDOVER_CODE_LENGTH, 6);
});

test('nothing that is false is left out of the answer', () => {
  assert.deepEqual(transferBlockers(allTrue), []);

  assert.deepEqual(transferBlockers({ ...allTrue, depositVerified: false }), ['DEPOSIT_VERIFIED']);
  assert.deepEqual(transferBlockers({ ...allTrue, minimumAgeReached: false }), ['MINIMUM_AGE_REACHED']);
  assert.deepEqual(transferBlockers({ ...allTrue, microchipRegistered: false }), ['MICROCHIP_REGISTERED']);
  assert.deepEqual(transferBlockers({ ...allTrue, sellerStillAuthorised: false }), ['SELLER_STILL_AUTHORISED']);
  assert.deepEqual(transferBlockers({ ...allTrue, animalTransferable: false }), ['ANIMAL_TRANSFERABLE']);
  assert.deepEqual(transferBlockers({ ...allTrue, noExistingTransfer: false }), ['NO_EXISTING_TRANSFER']);
  assert.deepEqual(transferBlockers({ ...allTrue, noOpenDispute: false }), ['NO_OPEN_DISPUTE']);

  // Several at once are all reported, not one per attempt.
  const many = transferBlockers({
    ...allTrue,
    microchipRegistered: false,
    minimumAgeReached: false,
    noOpenDispute: false,
  });
  assert.deepEqual([...many], ['MINIMUM_AGE_REACHED', 'MICROCHIP_REGISTERED', 'NO_OPEN_DISPUTE']);
});

test('the statement says what Hamzist witnessed and what it did not', () => {
  const text = handoverStatement({
    version: 'HANDOVER-STATEMENT-V1',
    animalNameFa: 'SYNTHETIC سگ',
    petId: 'PET-1',
    microchipNumber: '900000000000001',
    sellerMobile: '09990000001',
    buyerMobile: '09990000002',
    priceToman: 18_000_000n,
    depositToman: 550_000n,
    methodFa: 'تحویل حضوری',
    placeFa: 'تهران',
    at: NOW,
  });

  assert.match(text, /HANDOVER-STATEMENT-V1/);
  assert.match(text, /۱۸٬۰۰۰٬۰۰۰/);
  assert.match(text, /۵۵۰٬۰۰۰/);
  assert.match(text, /900000000000001/);
  // The limits of what the record means are part of the record.
  assert.match(text, /سلامت حیوان/);
  assert.match(text, /داوری نمی‌کند/);
  assert.match(text, /مالک پیشین/);

  // Missing identifiers are stated as missing rather than left blank.
  const bare = handoverStatement({
    version: 'V1',
    animalNameFa: 'بدون نام',
    petId: null,
    microchipNumber: null,
    sellerMobile: '09990000001',
    buyerMobile: '09990000002',
    priceToman: null,
    depositToman: null,
    methodFa: 'تحویل حضوری',
    placeFa: null,
    at: NOW,
  });
  assert.match(bare, /ثبت نشده/);
});
