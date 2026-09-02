import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredMoney,
  formatTomanFa,
  MoneyError,
  NOT_CONFIGURED_MONEY,
  requireConfiguredToman,
  rialToToman,
  toman,
  tomanFromColumn,
  tomanToColumn,
  tomanToRial,
} from '../../src/domain/money.ts';

test('Toman amounts are exact integers', () => {
  assert.equal(toman(300000), 300000n);
  assert.equal(toman('300000'), 300000n);
  assert.equal(toman(0), 0n);
  assert.throws(() => toman(1.5), MoneyError);
  assert.throws(() => toman('1.5'), MoneyError);
  assert.throws(() => toman(-1), MoneyError);
});

test('gateway conversion is an exact integer scale in both directions', () => {
  assert.equal(tomanToRial(300000n), 3000000n);
  assert.equal(rialToToman(3000000n), 300000n);
  assert.equal(rialToToman(tomanToRial(987654321n)), 987654321n);
});

test('a Rial amount that is not a whole Toman is rejected instead of rounded', () => {
  assert.throws(() => rialToToman(3000005n), MoneyError);
});

test('large amounts survive the round trip without float loss', () => {
  // Beyond Number.MAX_SAFE_INTEGER once converted to Rial.
  const big = 9007199254740993n;
  assert.equal(rialToToman(tomanToRial(big)), big);
});

test('an unconfigured tariff is never treated as zero', () => {
  assert.equal(NOT_CONFIGURED_MONEY.configured, false);
  assert.throws(
    () => requireConfiguredToman(NOT_CONFIGURED_MONEY, 'fee.pedigree_toman'),
    (error: unknown) => error instanceof MoneyError && String(error.message).includes('fee.pedigree_toman'),
  );
  assert.equal(requireConfiguredToman(configuredMoney(1000), 'fee.x'), 1000n);
});

test('a null column reads back as NOT_CONFIGURED, not as 0', () => {
  assert.deepEqual(tomanFromColumn(null), NOT_CONFIGURED_MONEY);
  assert.deepEqual(tomanFromColumn(''), NOT_CONFIGURED_MONEY);
  assert.deepEqual(tomanFromColumn('0'), { configured: true, toman: 0n });
  assert.equal(tomanToColumn(300000n), '300000');
});

test('display shows nothing rather than a number when unconfigured', () => {
  assert.equal(formatTomanFa(NOT_CONFIGURED_MONEY), null);
  assert.equal(formatTomanFa(configuredMoney(300000)), '۳۰۰٬۰۰۰ تومان');
});
