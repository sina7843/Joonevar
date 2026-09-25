/**
 * What the catalogue allows — PROMPT-009.
 *
 * The lifecycles, the canonical spelling of a variant, what a category demands,
 * the arithmetic of stock, and the limits on a bulk tool. All pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableStock,
  bulkPriceProblems,
  canMoveOffer,
  canMoveProduct,
  canReserve,
  compareOffers,
  isBarcodeShape,
  isCategorySellable,
  isProductEditable,
  isProductPublic,
  isSkuShape,
  moveDelta,
  normaliseBarcode,
  normaliseSku,
  reservationExpired,
  specificationProblems,
  variantKey,
  variantLabel,
  variantProblems,
  BULK_LIMIT,
  OFFER_CONDITION_FA,
  OFFER_CONDITIONS,
  PHARMACEUTICAL_BLOCK_FA,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_FA,
  type AttributeDefinition,
  type OfferComparison,
} from '../../src/commerce/catalog-model.ts';

const foodAttributes: readonly AttributeDefinition[] = [
  { key: 'weight', labelFa: 'وزن', kind: 'VARIANT', required: true },
  { key: 'flavour', labelFa: 'طعم', kind: 'VARIANT', options: ['مرغ', 'ماهی'] },
  { key: 'lifeStage', labelFa: 'رده سنی', kind: 'SPECIFICATION', required: true },
];

test('every status and condition is named in Persian', () => {
  for (const status of PRODUCT_STATUSES) assert.ok(PRODUCT_STATUS_FA[status]);
  for (const condition of OFFER_CONDITIONS) assert.ok(OFFER_CONDITION_FA[condition]);
});

test('a seller’s product is reviewed before anybody sees it', () => {
  assert.ok(canMoveProduct('DRAFT', 'PENDING_REVIEW', 'SELLER'));
  assert.ok(!canMoveProduct('DRAFT', 'PUBLISHED', 'SELLER'));
  assert.ok(!canMoveProduct('PENDING_REVIEW', 'PUBLISHED', 'SELLER'));
  assert.ok(canMoveProduct('PENDING_REVIEW', 'PUBLISHED', 'REVIEWER'));
  assert.ok(isProductEditable('DRAFT'));
  assert.ok(isProductEditable('REJECTED'));
  assert.ok(!isProductEditable('PENDING_REVIEW'));
  assert.ok(isProductPublic('PUBLISHED'));
  assert.ok(!isProductPublic('MERGED'), 'a merged row is resolved, not shown as itself');
});

test('merging is a reviewer’s act and is one way', () => {
  assert.ok(canMoveProduct('PUBLISHED', 'MERGED', 'REVIEWER'));
  assert.ok(!canMoveProduct('PUBLISHED', 'MERGED', 'SELLER'));
  assert.ok(!canMoveProduct('MERGED', 'PUBLISHED', 'REVIEWER'));
  assert.ok(!canMoveProduct('MERGED', 'DRAFT', 'SELLER'));
});

test('an archived offer is history', () => {
  assert.ok(canMoveOffer('DRAFT', 'ACTIVE'));
  assert.ok(canMoveOffer('ACTIVE', 'PAUSED'));
  assert.ok(canMoveOffer('PAUSED', 'ACTIVE'));
  assert.ok(canMoveOffer('ACTIVE', 'ARCHIVED'));
  assert.ok(!canMoveOffer('ARCHIVED', 'ACTIVE'));
  assert.ok(!canMoveOffer('ACTIVE', 'ACTIVE'));
});

test('medicine is a prohibition with a reason, not a switch', () => {
  assert.ok(isCategorySellable('ALLOWED', true));
  assert.ok(!isCategorySellable('ALLOWED', false));
  assert.ok(!isCategorySellable('BLOCKED_PHARMACEUTICAL', true), 'enabled does not unblock it');
  assert.match(PHARMACEUTICAL_BLOCK_FA, /تنظیم عملیاتی نیست/);
  assert.match(PHARMACEUTICAL_BLOCK_FA, /تصمیم حقوقی/);
});

test('a category decides what a product may state', () => {
  assert.deepEqual(specificationProblems(foodAttributes, { lifeStage: 'بالغ' }), []);

  const missing = specificationProblems(foodAttributes, {});
  assert.equal(missing.length, 1);
  assert.match(missing[0]!, /رده سنی/);

  // An unknown key is refused rather than stored where nothing compares it.
  const unknown = specificationProblems(foodAttributes, { lifeStage: 'بالغ', secretField: 'x' });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0]!, /secretField/);

  // A variant axis is not a specification, so stating it here is unknown too.
  assert.equal(specificationProblems(foodAttributes, { lifeStage: 'بالغ', weight: '2' }).length, 1);
});

test('one combination has one spelling, whatever order it was typed in', () => {
  const a = variantKey({ weight: '۲ کیلو', flavour: 'مرغ' });
  const b = variantKey({ flavour: 'مرغ', weight: '۲ کیلو' });
  assert.equal(a, b);
  assert.equal(a, 'flavour=مرغ|weight=۲ کیلو');
  // Blank values are not part of the identity.
  assert.equal(variantKey({ weight: '۲ کیلو', flavour: '  ' }), 'weight=۲ کیلو');
  assert.equal(variantKey({}), '');
});

test('a variant is labelled in the category’s own words and checked against its axes', () => {
  assert.equal(variantLabel(foodAttributes.filter((a) => a.kind === 'VARIANT'), { weight: '۲ کیلو' }), 'وزن ۲ کیلو');
  assert.equal(variantLabel([], {}), 'تک‌نوع');

  const axes = foodAttributes.filter((a) => a.kind === 'VARIANT');
  assert.deepEqual(variantProblems(axes, { weight: '۲ کیلو', flavour: 'مرغ' }), []);
  assert.equal(variantProblems(axes, {}).length, 1, 'a category with axes needs at least one value');
  assert.equal(variantProblems(axes, { colour: 'قرمز' }).length, 1, 'an axis that does not exist here');
  assert.equal(variantProblems(axes, { flavour: 'گوشت' }).length, 1, 'a value outside the defined options');
});

test('stock arithmetic says what can actually be bought', () => {
  assert.equal(availableStock({ onHand: 10, reserved: 3 }), 7);
  assert.equal(availableStock({ onHand: 3, reserved: 3 }), 0);
  assert.equal(availableStock({ onHand: 0, reserved: 0 }), 0);
  assert.ok(canReserve({ onHand: 3, reserved: 2 }, 1));
  assert.ok(!canReserve({ onHand: 3, reserved: 2 }, 2));
  assert.ok(!canReserve({ onHand: 3, reserved: 0 }, 0));
});

test('each movement moves exactly the counters it should', () => {
  assert.deepEqual(moveDelta('RECEIVE', 5), { onHand: 5, reserved: 0 });
  assert.deepEqual(moveDelta('RETURN', 2), { onHand: 2, reserved: 0 });
  assert.deepEqual(moveDelta('ADJUST', -3), { onHand: -3, reserved: 0 });
  assert.deepEqual(moveDelta('RESERVE', 2), { onHand: 0, reserved: 2 });
  assert.deepEqual(moveDelta('RELEASE', 2), { onHand: 0, reserved: -2 });
  // A sale takes the goods and the hold that was covering them.
  assert.deepEqual(moveDelta('SELL', 2), { onHand: -2, reserved: -2 });
});

test('a hold is over when its moment passes', () => {
  const at = new Date('2026-07-01T12:00:00.000Z');
  assert.ok(!reservationExpired(at, new Date('2026-07-01T11:59:59.000Z')));
  assert.ok(reservationExpired(at, at));
});

test('a seller code and a barcode are checked as far as their shape and no further', () => {
  assert.equal(normaliseSku(' bag 2kg '), 'BAG-2KG');
  assert.ok(isSkuShape('BAG-2KG'));
  assert.ok(!isSkuShape('-LEADING'));
  assert.ok(!isSkuShape('کد'));

  assert.equal(normaliseBarcode('۶۲۶۱۱۰۰۵۰۰۰۱۱'), '6261100500011');
  assert.ok(isBarcodeShape('6261100500011'));
  assert.ok(!isBarcodeShape('123'), 'too short to be a barcode');
  assert.ok(!isBarcodeShape('123456789012345'), 'longer than GTIN-14');
});

test('a bulk change is bounded in size and in reach', () => {
  const line = (id: string, current: bigint, next: bigint) => ({ skuId: id, currentToman: current, nextToman: next });
  assert.deepEqual(bulkPriceProblems([line('a', 100_000n, 120_000n)]), []);

  // More than half is refused: at that size it is far likelier to be a slip.
  const big = bulkPriceProblems([line('a', 100_000n, 200_000n)]);
  assert.equal(big.length, 1);
  assert.match(big[0]!.messageFa, /۵۰/);

  assert.equal(bulkPriceProblems([line('a', 100_000n, 0n)]).length, 1);

  const many = Array.from({ length: BULK_LIMIT + 1 }, (_, index) => line(String(index), 100n, 110n));
  assert.equal(bulkPriceProblems(many).length, 1);
});

test('offers are compared on price and stock, with no way to know whose they are', () => {
  const offers: readonly OfferComparison[] = [
    { offerId: 'a', skuId: 'sku-a', sellerId: 's1', sellerNameFa: 'الف', priceToman: 90_000n, available: 2, condition: 'NEW' },
    { offerId: 'b', skuId: 'sku-b', sellerId: 's2', sellerNameFa: 'ب', priceToman: 80_000n, available: 0, condition: 'NEW' },
    { offerId: 'c', skuId: 'sku-c', sellerId: 's3', sellerNameFa: 'پ', priceToman: 85_000n, available: 5, condition: 'NEW' },
  ];
  const order = compareOffers(offers).map((offer) => offer.offerId);
  // In stock first, then cheapest: the out-of-stock cheapest one is last.
  assert.deepEqual(order, ['c', 'a', 'b']);

  // The comparison takes no seller identity beyond a name to sort ties by, so
  // there is nothing here that could favour the platform's own store.
  const tie = compareOffers([
    { offerId: 'x', skuId: 'sku-x', sellerId: 'platform', sellerNameFa: 'ب', priceToman: 50_000n, available: 1, condition: 'NEW' },
    { offerId: 'y', skuId: 'sku-y', sellerId: 'other', sellerNameFa: 'الف', priceToman: 50_000n, available: 1, condition: 'NEW' },
  ]).map((offer) => offer.offerId);
  assert.deepEqual(tie, ['y', 'x']);
});
