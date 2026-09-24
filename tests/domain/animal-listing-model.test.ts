/**
 * Listing rules without a database — PROMPT-003.
 *
 * The lifecycle, what has to be said before publication, and the two age
 * questions. The point of pinning these here is that the same answers are used
 * by the screen and by the server action, so a hidden button and a refused
 * request can never disagree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMove,
  deliverableFrom,
  DELIVERY_METHODS,
  DESCRIPTION_MIN,
  EDITABLE_STATUSES,
  handoverAge,
  isEditable,
  isPublic,
  LISTING_STATUSES,
  LISTING_STATUS_FA,
  LIVE_LISTING_STATUSES,
  movesFrom,
  publicationBlockers,
  PUBLIC_LISTING_STATUSES,
  type ListingContent,
  type ListingStatus,
} from '../../src/marketplace/listing-model.ts';

const complete: ListingContent = {
  priceMode: 'EXACT',
  priceToman: 12_000_000n,
  descriptionFa: 'ت'.repeat(DESCRIPTION_MIN),
  reasonForSaleFa: 'نقل مکان به شهر دیگر',
  provinceCode: 'tehran',
  cityId: '00000000-0000-4000-8000-000000000001',
  vaccinationStatus: 'YES',
  neuterStatus: 'NO',
  deliveryMethods: ['IN_PERSON'],
  imageCount: 3,
};

test('every status has a Persian name and the live set is the one the index enforces', () => {
  for (const status of LISTING_STATUSES) {
    assert.ok(LISTING_STATUS_FA[status], status + ' must be nameable in Persian');
  }
  // A suspended advert still holds its animal: a moderator's hold must not be
  // escapable by starting a second one.
  assert.deepEqual([...LIVE_LISTING_STATUSES].sort(), ['DRAFT', 'PAUSED', 'PUBLISHED', 'RESERVED', 'SUSPENDED']);
  assert.ok(LIVE_LISTING_STATUSES.includes('SUSPENDED'));
  // Sold, expired and removed release it, so the new owner can sell later.
  for (const free of ['SOLD', 'EXPIRED', 'REMOVED'] as const) {
    assert.ok(!LIVE_LISTING_STATUSES.includes(free));
  }
});

test('the public sees published and reserved, and nothing else', () => {
  assert.deepEqual([...PUBLIC_LISTING_STATUSES], ['PUBLISHED', 'RESERVED']);
  for (const status of LISTING_STATUSES) {
    assert.equal(isPublic(status), status === 'PUBLISHED' || status === 'RESERVED', status);
  }
  // A draft is private, so its pictures are not served either.
  assert.ok(!isPublic('DRAFT'));
  assert.ok(!isPublic('PAUSED'));
  assert.ok(!isPublic('SUSPENDED'));
});

test('a seller can never claim a sale or a reservation by pressing a button', () => {
  // RESERVED comes only from a verified deposit and SOLD only from a completed
  // handover, both of which are SYSTEM moves made inside their own transaction.
  for (const from of LISTING_STATUSES) {
    assert.ok(!canMove(from, 'RESERVED', 'SELLER'), from + ' → RESERVED must not be a seller move');
    assert.ok(!canMove(from, 'SOLD', 'SELLER'), from + ' → SOLD must not be a seller move');
    assert.ok(!canMove(from, 'SUSPENDED', 'SELLER'), from + ' → SUSPENDED must not be a seller move');
    assert.ok(!canMove(from, 'EXPIRED', 'SELLER'), from + ' → EXPIRED must not be a seller move');
  }
  assert.ok(canMove('PUBLISHED', 'RESERVED', 'SYSTEM'));
  assert.ok(canMove('RESERVED', 'SOLD', 'SYSTEM'));
  assert.ok(canMove('PUBLISHED', 'SUSPENDED', 'MODERATOR'));
});

test('a suspended advert is released only by the moderator who held it', () => {
  assert.deepEqual([...movesFrom('SUSPENDED', 'SELLER')], []);
  assert.deepEqual([...movesFrom('SUSPENDED', 'MODERATOR')].sort(), ['PUBLISHED', 'REMOVED']);
});

test('a seller pauses, resumes, removes and republishes an expired advert', () => {
  assert.deepEqual([...movesFrom('DRAFT', 'SELLER')].sort(), ['PUBLISHED', 'REMOVED']);
  assert.deepEqual([...movesFrom('PUBLISHED', 'SELLER')].sort(), ['PAUSED', 'REMOVED']);
  assert.deepEqual([...movesFrom('PAUSED', 'SELLER')].sort(), ['PUBLISHED', 'REMOVED']);
  assert.deepEqual([...movesFrom('EXPIRED', 'SELLER')].sort(), ['PUBLISHED', 'REMOVED']);
  // Nothing at all comes back from a completed sale.
  assert.deepEqual([...movesFrom('SOLD', 'SELLER')], []);
  assert.deepEqual([...movesFrom('SOLD', 'MODERATOR')], []);
  assert.deepEqual([...movesFrom('REMOVED', 'SELLER')], []);
});

test('a sold or reserved advert is history and stops being editable', () => {
  assert.deepEqual([...EDITABLE_STATUSES].sort(), ['DRAFT', 'EXPIRED', 'PAUSED', 'PUBLISHED']);
  for (const frozen of ['RESERVED', 'SOLD', 'SUSPENDED', 'REMOVED'] as ListingStatus[]) {
    assert.ok(!isEditable(frozen), frozen + ' must not be editable');
  }
});

test('a complete listing has nothing blocking publication', () => {
  assert.deepEqual(publicationBlockers(complete, 3), []);
});

test('every missing requirement is reported at once, not one per attempt', () => {
  const blockers = publicationBlockers(
    {
      priceMode: null,
      priceToman: null,
      descriptionFa: 'کوتاه',
      reasonForSaleFa: '',
      provinceCode: null,
      cityId: null,
      vaccinationStatus: null,
      neuterStatus: null,
      deliveryMethods: [],
      imageCount: 0,
    },
    3,
  );
  // Price mode, description, reason, place, two disclosures, delivery, images.
  assert.equal(blockers.length, 8);
  assert.ok(blockers.some((b) => b.includes('نوع قیمت')));
  assert.ok(blockers.some((b) => b.includes('دلیل فروش')));
  assert.ok(blockers.some((b) => b.includes('استان و شهر')));
  assert.ok(blockers.some((b) => b.includes('واکسیناسیون')));
  assert.ok(blockers.some((b) => b.includes('عقیم‌سازی')));
  assert.ok(blockers.some((b) => b.includes('روش تحویل')));
  assert.ok(blockers.some((b) => b.includes('تصویر')));
});

test('the minimum number of photos is whatever the managed setting says', () => {
  assert.deepEqual(publicationBlockers({ ...complete, imageCount: 2 }, 3).length, 1);
  assert.deepEqual(publicationBlockers({ ...complete, imageCount: 2 }, 2), []);
  assert.equal(publicationBlockers({ ...complete, imageCount: 4 }, 5).length, 1);
});

test('an exact price needs a figure and a negotiable one does not', () => {
  assert.deepEqual(publicationBlockers({ ...complete, priceMode: 'NEGOTIABLE', priceToman: null }, 3), []);
  const blockers = publicationBlockers({ ...complete, priceToman: null }, 3);
  assert.equal(blockers.length, 1);
  assert.ok(blockers[0]!.includes('مبلغ'));
  assert.equal(publicationBlockers({ ...complete, priceToman: 0n }, 3).length, 1);
});

test('«نمی‌دانم» is an answer; leaving it blank is not', () => {
  // A listing that quietly says "not vaccinated" because nobody answered is a
  // false statement about somebody's animal, so UNKNOWN has to be sayable.
  assert.deepEqual(publicationBlockers({ ...complete, vaccinationStatus: 'UNKNOWN' }, 3), []);
  assert.deepEqual(publicationBlockers({ ...complete, neuterStatus: 'UNKNOWN' }, 3), []);
  assert.equal(publicationBlockers({ ...complete, vaccinationStatus: '' }, 3).length, 1);
  assert.equal(publicationBlockers({ ...complete, neuterStatus: 'MAYBE' }, 3).length, 1);
});

test('at least one delivery method has to be offered, and only real ones exist', () => {
  assert.deepEqual([...DELIVERY_METHODS], ['IN_PERSON', 'SELLER_LOCATION', 'VET_CLINIC']);
  assert.equal(publicationBlockers({ ...complete, deliveryMethods: [] }, 3).length, 1);
  assert.deepEqual(publicationBlockers({ ...complete, deliveryMethods: ['VET_CLINIC', 'IN_PERSON'] }, 3), []);
});

test('the earliest handover date is the birth date plus the managed minimum age', () => {
  const from = deliverableFrom('2026-01-01', 56);
  assert.equal(from?.toISOString().slice(0, 10), '2026-02-26');
  assert.equal(deliverableFrom(null, 56), null);
  assert.equal(deliverableFrom('not-a-date', 56), null);
});

test('a listing may be published before the minimum age, and handover may not', () => {
  const born = '2026-09-01';
  const early = handoverAge(born, 56, new Date('2026-09-20T00:00:00Z'));
  assert.equal(early.allowed, false);
  assert.ok(early.reasonFa!.includes('آگهی می‌تواند منتشر بماند'));
  assert.equal(early.from?.toISOString().slice(0, 10), '2026-10-27');

  const later = handoverAge(born, 56, new Date('2026-11-01T00:00:00Z'));
  assert.equal(later.allowed, true);
  assert.equal(later.reasonFa, null);

  // Exactly on the day counts as reached.
  assert.equal(handoverAge(born, 56, new Date('2026-10-27T00:00:00Z')).allowed, true);
});

test('an unknown date of birth is not a satisfied condition', () => {
  const unknown = handoverAge(null, 56, new Date());
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.from, null);
  assert.ok(unknown.reasonFa!.includes('تاریخ تولد'));
});
