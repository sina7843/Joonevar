import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBirthDate,
  assertMobile,
  assertNationalId,
  assertPersonName,
  isValidNationalId,
  maskMobile,
  normalizeMobile,
  normalizeOptionalDisplayName,
  normalizeOptionalPostalCode,
  toLatinDigits,
} from '../../src/domain/identity.ts';

test('Persian and Arabic digits are the same value as Latin digits', () => {
  assert.equal(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
  assert.equal(toLatinDigits('٠٩١٢٣٤٥٦٧٨٩'), '09123456789');
  assert.equal(assertMobile('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
});

test('every written form of a mobile number collapses to one stored value', () => {
  for (const input of [
    '09123456789',
    '+989123456789',
    '00989123456789',
    '989123456789',
    '9123456789',
    '0912 345 6789',
    '0912-345-6789',
  ]) {
    assert.equal(normalizeMobile(input), '09123456789', 'failed for ' + input);
  }
});

test('a non-mobile number is refused', () => {
  for (const input of ['0212345678', '091234567', '0912345678900', 'abcdefghijk', '']) {
    assert.throws(() => assertMobile(input), /شماره موبایل معتبر نیست/, 'accepted ' + input);
  }
});

test('the national id check digit is validated', () => {
  // Valid combinations computed from the standard check-digit rule.
  assert.equal(isValidNationalId('0499370899'), true);
  assert.equal(isValidNationalId('0790419904'), true);
  assert.equal(isValidNationalId('0084575948'), true);

  // Same digits with the last one altered must fail.
  assert.equal(isValidNationalId('0499370898'), false);
  assert.equal(isValidNationalId('1111111111'), false);
  assert.equal(isValidNationalId('123456789'), false);
  assert.equal(isValidNationalId('12345678901'), false);
});

test('national id errors distinguish shape from checksum', () => {
  assert.throws(() => assertNationalId('12'), /دقیقاً ده رقم/);
  assert.throws(() => assertNationalId('0499370898'), /معتبر نیست/);
  assert.equal(assertNationalId('۰۴۹۹۳۷۰۸۹۹'), '0499370899');
});

test('postal code is optional but validated when entered', () => {
  assert.equal(normalizeOptionalPostalCode(null), null);
  assert.equal(normalizeOptionalPostalCode(''), null);
  assert.equal(normalizeOptionalPostalCode('   '), null);
  assert.equal(normalizeOptionalPostalCode('1234567890'), '1234567890');
  assert.equal(normalizeOptionalPostalCode('12345-67890'), '1234567890');
  assert.throws(() => normalizeOptionalPostalCode('12345'), /ده رقم/);
});

test('display name is optional and trimmed', () => {
  assert.equal(normalizeOptionalDisplayName(''), null);
  assert.equal(normalizeOptionalDisplayName('  علی   رضایی '), 'علی رضایی');
  assert.throws(() => normalizeOptionalDisplayName('x'.repeat(61)), /طولانی/);
});

test('names and birth dates are validated', () => {
  assert.equal(assertPersonName('  علی  ', 'نام'), 'علی');
  assert.throws(() => assertPersonName('ع', 'نام'), /حداقل دو نویسه/);
  assert.equal(assertBirthDate('1990-05-20', '2026-09-02'), '1990-05-20');
  assert.throws(() => assertBirthDate('2030-01-01', '2026-09-02'), /در آینده/);
  assert.throws(() => assertBirthDate('1800-01-01', '2026-09-02'), /معتبر نیست/);
});

test('a mobile number is masked wherever it could be logged', () => {
  assert.equal(maskMobile('09123456789'), '0912***89');
  assert.ok(!maskMobile('09123456789').includes('345'));
});
