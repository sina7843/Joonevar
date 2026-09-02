import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_FOR_PRICE_FA,
  checkInRejection,
  distanceKm,
  locationEligibility,
  normalizeReferralCode,
  referralExpiry,
  REQUIRED_CAPABILITIES,
  SERVICES_BY_CONTEXT,
  type LocationFacts,
} from '../../src/domain/referral.ts';

const complete: LocationFacts = {
  isActive: true,
  licenceStatus: 'VALID',
  cityFa: 'تهران',
  addressFa: 'نشانی نمونه',
  phone: '02100000000',
  capabilities: ['IMPLANT', 'BLOOD_SAMPLE', 'PREGNANCY_CHECK'],
};

test('a complete licensed location is offered for every context it can serve', () => {
  assert.deepEqual(locationEligibility(complete, 'MICROCHIP'), { eligible: true });
  assert.deepEqual(locationEligibility(complete, 'DNA'), { eligible: true });
  assert.deepEqual(locationEligibility(complete, 'PREGNANCY'), { eligible: true });
});

test('an incomplete location gets no reduced path, only absence', () => {
  // §11.1: partial capability does not create an alternative route.
  const halfEquipped = { ...complete, capabilities: ['IMPLANT'] as const };
  const microchip = locationEligibility(halfEquipped, 'MICROCHIP');
  assert.equal(microchip.eligible, false);
  assert.match(microchip.eligible ? '' : microchip.reasonFa, /امکانات اجباری/);
  // Both microchip paths need blood sampling (§12.4), so neither is offered.
  assert.equal(locationEligibility(halfEquipped, 'DNA').eligible, false);
});

test('licence, address and activity are all required before a location is listed', () => {
  assert.equal(locationEligibility({ ...complete, licenceStatus: 'EXPIRED' }, 'MICROCHIP').eligible, false);
  assert.equal(locationEligibility({ ...complete, licenceStatus: 'NONE' }, 'MICROCHIP').eligible, false);
  assert.equal(locationEligibility({ ...complete, isActive: false }, 'MICROCHIP').eligible, false);
  assert.equal(locationEligibility({ ...complete, addressFa: null }, 'MICROCHIP').eligible, false);
  assert.equal(locationEligibility({ ...complete, phone: null }, 'MICROCHIP').eligible, false);
});

test('the mandatory facilities are exactly the ones the source names', () => {
  assert.deepEqual(REQUIRED_CAPABILITIES.MICROCHIP, ['IMPLANT', 'BLOOD_SAMPLE']);
  assert.deepEqual(REQUIRED_CAPABILITIES.DNA, ['BLOOD_SAMPLE']);
  assert.deepEqual(REQUIRED_CAPABILITIES.PREGNANCY, ['PREGNANCY_CHECK']);
  // Microchip is the only context with a per-animal choice (§11.2).
  assert.deepEqual(SERVICES_BY_CONTEXT.MICROCHIP, ['MICROCHIP_IMPLANT', 'MICROCHIP_VERIFICATION']);
});

test('the cost sentence is the approved one, unchanged', () => {
  assert.equal(CONTACT_FOR_PRICE_FA, 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.');
});

test('distance is a real distance, and identical points are zero', () => {
  assert.equal(distanceKm({ lat: 35.7, lng: 51.4 }, { lat: 35.7, lng: 51.4 }), 0);
  const km = distanceKm({ lat: 35.6892, lng: 51.389 }, { lat: 32.6546, lng: 51.668 });
  assert.ok(km > 300 && km < 360, 'Tehran to Isfahan is about 340 km, got ' + km);
});

test('expiry comes from the value passed in, never from a built-in number', () => {
  const issued = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(referralExpiry(issued, 21).toISOString(), '2026-01-22T00:00:00.000Z');
  assert.equal(referralExpiry(issued, 7).toISOString(), '2026-01-08T00:00:00.000Z');
  assert.throws(() => referralExpiry(issued, 0), RangeError);
  assert.throws(() => referralExpiry(issued, 1.5), RangeError);
});

const base = {
  referralStatus: 'ACTIVE' as const,
  expiresAt: new Date('2026-02-01T00:00:00.000Z'),
  requestStatus: 'ACTIVE' as const,
  requestVetAccountId: 'vet-1',
  requestLocationId: 'loc-1',
  presentedByVetAccountId: 'vet-1',
  presentedAtLocationId: 'loc-1',
  now: new Date('2026-01-10T00:00:00.000Z'),
};

test('a valid code at the right desk is accepted', () => {
  assert.equal(checkInRejection(base), null);
});

test('every invalid state has its own refusal', () => {
  assert.equal(checkInRejection({ ...base, presentedByVetAccountId: 'vet-2' }), 'WRONG_VET');
  assert.equal(checkInRejection({ ...base, presentedAtLocationId: 'loc-2' }), 'WRONG_LOCATION');
  assert.equal(checkInRejection({ ...base, referralStatus: 'CONSUMED' }), 'CONSUMED');
  assert.equal(checkInRejection({ ...base, referralStatus: 'CANCELLED' }), 'CANCELLED');
  assert.equal(checkInRejection({ ...base, referralStatus: 'SUPERSEDED' }), 'SUPERSEDED');
  assert.equal(checkInRejection({ ...base, now: new Date('2026-03-01T00:00:00.000Z') }), 'EXPIRED');
  assert.equal(checkInRejection({ ...base, requestStatus: 'CHECKED_IN' }), 'REQUEST_NOT_ACTIVE');
});

test('a code presented at the wrong desk is refused for that, whatever else is wrong', () => {
  // The message must not reveal that the code exists and is valid elsewhere.
  assert.equal(
    checkInRejection({ ...base, presentedByVetAccountId: 'vet-2', referralStatus: 'CONSUMED' }),
    'WRONG_VET',
  );
});

test('a code is compared in one shape however it was entered', () => {
  assert.equal(normalizeReferralCode('  hz-abc 234  '), 'HZ-ABC234');
});
