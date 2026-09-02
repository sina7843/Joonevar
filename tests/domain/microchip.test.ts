import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMicrochipNumber,
  implantPreCheck,
  isUnusable,
  normalizeMicrochipNumber,
  rereadMatches,
  samplingRequiredFor,
  verificationOutcome,
} from '../../src/domain/microchip.ts';

const FREE = { numberBoundToAnimalId: null, animalBoundNumber: null };

test('a number is one canonical value however it was read', () => {
  assert.equal(normalizeMicrochipNumber(' 985 141-000000001 '), '985141000000001');
  assert.equal(assertMicrochipNumber('985141000000001'), '985141000000001');
  assert.throws(() => assertMicrochipNumber('98514100000000'), /۱۵ رقم/);
  assert.throws(() => assertMicrochipNumber('985141000000001X'), /۱۵ رقم/);
});

test('an implant is ready only when the number is free and the animal has none', () => {
  assert.deepEqual(implantPreCheck(FREE), { state: 'READY' });

  // §12.2: the animal already has a chip for life.
  assert.deepEqual(implantPreCheck({ ...FREE, animalBoundNumber: '985141000000001' }), {
    state: 'BLOCKED',
    conflict: 'ANIMAL_HAS_OTHER_CHIP',
  });

  // The number belongs to somebody else.
  assert.deepEqual(implantPreCheck({ ...FREE, numberBoundToAnimalId: 'other' }), {
    state: 'BLOCKED',
    conflict: 'BELONGS_TO_OTHER_ANIMAL',
  });
});

test('the verification table of §12.3, row by row', () => {
  // Same serial, same animal.
  assert.deepEqual(
    verificationOutcome('985141000000001', { numberBoundToAnimalId: 'a', animalBoundNumber: '985141000000001' }),
    { state: 'CONFIRMED' },
  );

  // The serial belongs to another animal.
  assert.deepEqual(
    verificationOutcome('985141000000002', { numberBoundToAnimalId: 'other', animalBoundNumber: null }),
    { state: 'CONFLICT', conflict: 'BELONGS_TO_OTHER_ANIMAL' },
  );

  // The animal has a different chip on record.
  assert.deepEqual(
    verificationOutcome('985141000000002', { numberBoundToAnimalId: null, animalBoundNumber: '985141000000001' }),
    { state: 'CONFLICT', conflict: 'SERIAL_MISMATCH' },
  );

  // A physical chip with no record at all is bindable — after the checks.
  assert.deepEqual(verificationOutcome('985141000000003', FREE), { state: 'BINDABLE' });
});

test('a serial that reads differently after implantation never binds', () => {
  assert.equal(rereadMatches('985141000000001', ' 985-141 000000001 '), true);
  assert.equal(rereadMatches('985141000000001', '985141000000002'), false);
});

test('blood sampling is mandatory in both microchip services', () => {
  assert.equal(samplingRequiredFor('MICROCHIP_IMPLANT'), true);
  assert.equal(samplingRequiredFor('MICROCHIP_VERIFICATION'), true);
});

test('the four unusable states are exactly the ones the source names', () => {
  for (const status of ['INVALID', 'INSUFFICIENT', 'DAMAGED', 'LOST'] as const) {
    assert.equal(isUnusable(status), true);
  }
  assert.equal(isUnusable('IN_CUSTODY'), false);
  assert.equal(isUnusable('SHIPPED'), false);
});
