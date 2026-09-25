/**
 * What a store is and who may act in it — PROMPT-008.
 *
 * Pure rules: the lifecycle, the scoped roles, what an application is missing,
 * and the shape of the things a seller types.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMoveSeller,
  capabilitiesOf,
  isIbanShape,
  isSellerEditable,
  isSellerTrading,
  keepsRecords,
  maskIban,
  normaliseIban,
  planExpired,
  planProblems,
  planWindow,
  roleAllows,
  sellerMovesFrom,
  submissionBlockers,
  APPLICABLE_KINDS,
  SELLER_CAPABILITIES,
  SELLER_KINDS,
  SELLER_KIND_FA,
  SELLER_ROLES,
  SELLER_ROLE_FA,
  SELLER_STATUSES,
  SELLER_STATUS_FA,
  type SellerFormFacts,
} from '../../src/commerce/seller-model.ts';

const complete: SellerFormFacts = {
  displayNameFa: 'فروشگاه آزمایشی',
  legalNameFa: 'کسب‌وکار آزمایشی',
  businessTypeFa: 'پت‌شاپ',
  nationalIdentifier: '10000000000',
  representativeNameFa: 'نماینده آزمایشی',
  representativePhone: '02100000000',
  provinceCode: 'THR',
  cityId: 'city-1',
  addressFa: 'نشانی آزمایشی',
  settlementIban: 'IR820540102680020817909002',
  settlementHolderNameFa: 'کسب‌وکار آزمایشی',
  shippingPolicyFa: 'ارسال در همان شهر',
  returnPolicyFa: 'مرجوعی تا هفت روز',
  agreementVersion: 'AGREEMENT-V1',
  ownerKycApproved: true,
  hasLicenceDocument: false,
  licenceRequired: null,
};

test('every kind, status and role is named in Persian', () => {
  for (const kind of SELLER_KINDS) assert.ok(SELLER_KIND_FA[kind]);
  for (const status of SELLER_STATUSES) assert.ok(SELLER_STATUS_FA[status]);
  for (const role of SELLER_ROLES) assert.ok(SELLER_ROLE_FA[role]);
});

test('only the two kinds the product decision names can apply', () => {
  // The platform's own store is a kind, but nobody applies as it.
  assert.deepEqual([...APPLICABLE_KINDS], ['PET_SHOP', 'VERIFIED_BUSINESS']);
  assert.ok(SELLER_KINDS.includes('PLATFORM'));
});

test('a store becomes active because a period began, not because somebody said so', () => {
  assert.ok(canMoveSeller('APPROVED', 'ACTIVE', 'SYSTEM'));
  assert.ok(!canMoveSeller('APPROVED', 'ACTIVE', 'REVIEWER'));
  assert.ok(!canMoveSeller('APPROVED', 'ACTIVE', 'SELLER'));
  // And nothing jumps the review.
  assert.ok(!canMoveSeller('DRAFT', 'APPROVED', 'REVIEWER'));
  assert.ok(!canMoveSeller('SUBMITTED', 'ACTIVE', 'SYSTEM'));
});

test('a correction goes back to the applicant and returns the same way', () => {
  assert.ok(canMoveSeller('UNDER_REVIEW', 'NEEDS_CORRECTION', 'REVIEWER'));
  assert.ok(canMoveSeller('NEEDS_CORRECTION', 'SUBMITTED', 'SELLER'));
  assert.ok(!canMoveSeller('NEEDS_CORRECTION', 'APPROVED', 'REVIEWER'));
  assert.ok(isSellerEditable('DRAFT'));
  assert.ok(isSellerEditable('NEEDS_CORRECTION'));
  assert.ok(!isSellerEditable('UNDER_REVIEW'), 'a file under review is not being edited under the reviewer');
  assert.ok(!isSellerEditable('ACTIVE'));
});

test('suspension is reversible, termination is not, and neither deletes anything', () => {
  assert.ok(canMoveSeller('ACTIVE', 'SUSPENDED', 'REVIEWER'));
  assert.ok(canMoveSeller('SUSPENDED', 'ACTIVE', 'REVIEWER'));
  assert.ok(canMoveSeller('SUSPENDED', 'TERMINATED', 'REVIEWER'));
  assert.deepEqual(sellerMovesFrom('TERMINATED', 'REVIEWER'), []);
  assert.deepEqual(sellerMovesFrom('REJECTED', 'REVIEWER'), []);
  for (const status of SELLER_STATUSES) assert.ok(keepsRecords(status), status);
  assert.ok(isSellerTrading('ACTIVE'));
  assert.ok(!isSellerTrading('SUSPENDED'));
});

test('a role says what it may do inside one store and nothing outside it', () => {
  // Staff run the shop; they cannot change who owns it or where its money goes.
  assert.ok(roleAllows('STAFF', 'STORE_OPERATE'));
  assert.ok(!roleAllows('STAFF', 'STORE_EDIT'));
  assert.ok(!roleAllows('STAFF', 'STORE_BILLING'));
  assert.ok(!roleAllows('STAFF', 'STORE_MEMBERS'));

  assert.ok(roleAllows('ADMIN', 'STORE_EDIT'));
  assert.ok(roleAllows('ADMIN', 'STORE_SUBMIT'));
  assert.ok(!roleAllows('ADMIN', 'STORE_BILLING'), 'billing is the owner’s');
  assert.ok(!roleAllows('ADMIN', 'STORE_MEMBERS'), 'membership is the owner’s');

  // The owner holds everything, and the list is the whole list.
  assert.deepEqual([...capabilitiesOf('OWNER')].sort(), [...SELLER_CAPABILITIES].sort());
});

test('everything an application is missing is reported at once', () => {
  assert.deepEqual(submissionBlockers(complete), []);

  const bare = submissionBlockers({
    ...complete,
    displayNameFa: null,
    nationalIdentifier: null,
    settlementIban: null,
    agreementVersion: null,
    ownerKycApproved: false,
  });
  assert.equal(bare.length, 5);
  assert.ok(bare.some((line) => line.includes('احراز هویت')));
  assert.ok(bare.some((line) => line.includes('شبا')));
  assert.ok(bare.some((line) => line.includes('قرارداد')));
});

test('a licence is demanded only where somebody recorded that it is required', () => {
  // Nobody has said: the licence is asked for but not enforced, because which
  // licence the law requires is not something this product decides.
  assert.deepEqual(submissionBlockers({ ...complete, licenceRequired: null, hasLicenceDocument: false }), []);
  // Recorded as not required: still not enforced.
  assert.deepEqual(submissionBlockers({ ...complete, licenceRequired: false, hasLicenceDocument: false }), []);
  // Recorded as required: now it is.
  const required = submissionBlockers({ ...complete, licenceRequired: true, hasLicenceDocument: false });
  assert.equal(required.length, 1);
  assert.match(required[0]!, /مجوز/);
  assert.deepEqual(submissionBlockers({ ...complete, licenceRequired: true, hasLicenceDocument: true }), []);
});

test('two spellings of one account are one account, and it is masked when shown', () => {
  const spaced = 'IR82 0540 1026 8002 0817 9090 02';
  const persian = 'IR۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲';
  assert.equal(normaliseIban(spaced), 'IR820540102680020817909002');
  assert.equal(normaliseIban(persian), 'IR820540102680020817909002');
  assert.ok(isIbanShape(spaced));
  assert.ok(!isIbanShape('IR82054010268002081790900'), 'one digit short is not an IBAN');
  assert.ok(!isIbanShape('DE82054010268002081790900212'));

  const masked = maskIban(spaced);
  assert.ok(masked.startsWith('IR82'));
  assert.ok(masked.endsWith('9002'));
  assert.ok(!masked.includes('0540102680020817'), 'the middle is not shown');
});

test('a plan period is a window, and an expired one is expired when read', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const window = planWindow(from, 30);
  assert.equal(window.endsAt.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.ok(!planExpired(window.endsAt, new Date('2026-06-30T23:59:59.000Z')));
  assert.ok(planExpired(window.endsAt, new Date('2026-07-01T00:00:00.000Z')));
  assert.ok(!planExpired(null, new Date()));
});

test('a plan cannot be published with figures that mean nothing', () => {
  const base = { durationDays: 30, productLimit: 10, commissionPercentBp: 500, capabilities: {} };
  assert.deepEqual(planProblems(base), []);
  assert.equal(planProblems({ ...base, durationDays: 0 }).length, 1);
  assert.equal(planProblems({ ...base, commissionPercentBp: 10_001 }).length, 1);
  assert.equal(planProblems({ ...base, productLimit: 0 }).length, 1);
  assert.deepEqual(planProblems({ ...base, productLimit: null }), [], 'no ceiling is a valid plan');
  assert.equal(planProblems({ ...base, capabilities: { maxActivePromotions: -1 } }).length, 1);
});
