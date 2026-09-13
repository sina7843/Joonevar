/**
 * Licensed veterinarian submission rules without a database — Phase 2.5 PROMPT-006.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeOriginalName } from '../../src/files/storage.ts';
import { detectMime } from '../../src/files/signature.ts';
import { tagForCaseStatus, vetCaseMove } from '../../src/vets/professional-model.ts';
import {
  LICENCE_DECISIONS,
  LICENCE_DECISION_OUTCOME,
  licenceFieldProblems,
  normalizeLicenceCode,
  type LicenceFields,
} from '../../src/vets/professional-profile-model.ts';
import { tehranToday } from '../../src/vets/licence-application.ts';

const valid: LicenceFields = {
  displayNameFa: 'دکتر آزمایشی',
  practiceScope: 'GENERAL',
  councilCode: 'SYN-100',
  licenceCode: 'LIC-2024/15',
  licenceDate: '2024-05-01',
  phone: '021-1234',
  cityId: null,
  websiteUrl: null,
  instagramHandle: null,
  clinicNameFa: null,
  serviceCodes: ['MICROCHIP_IMPLANT'],
};
const today = '2026-09-13';

test('a complete submission has no problem; a verified doctor does not repeat a name', () => {
  assert.deepEqual(licenceFieldProblems(valid, { today, newDoctor: true }), []);
  assert.deepEqual(licenceFieldProblems({ ...valid, displayNameFa: null }, { today, newDoctor: false }), []);
  assert.ok(licenceFieldProblems({ ...valid, displayNameFa: null }, { today, newDoctor: true }).length > 0);
});

test('every mandatory component is named when it is missing', () => {
  const empty = { ...valid, practiceScope: '', councilCode: '', licenceCode: '', licenceDate: '' };
  assert.equal(licenceFieldProblems(empty, { today, newDoctor: false }).length, 4);
});

test('the licence date must be a real calendar day, not in the future and not implausibly old', () => {
  for (const date of ['2025-02-30', '2024-13-01', '1403/02/01', '2024-5-1']) {
    assert.ok(licenceFieldProblems({ ...valid, licenceDate: date }, { today, newDoctor: false }).length > 0, date);
  }
  assert.ok(licenceFieldProblems({ ...valid, licenceDate: '2026-09-14' }, { today, newDoctor: false }).length > 0, 'tomorrow');
  assert.deepEqual(licenceFieldProblems({ ...valid, licenceDate: today }, { today, newDoctor: false }), [], 'today is fine');
  assert.ok(licenceFieldProblems({ ...valid, licenceDate: '1949-12-31' }, { today, newDoctor: false }).length > 0);
  // Just after midnight in Tehran it is already the next day there, while UTC is still on the previous one.
  assert.equal(tehranToday(new Date('2026-09-12T21:00:00Z')), '2026-09-13');
});

test('the licence code is independent of the council code and read the same however typed', () => {
  assert.equal(normalizeLicenceCode(' lic ۲۰۲۴/١٥ '), 'LIC2024/15');
  for (const code of ['AB', 'LIC 2024', 'LIC_2024', 'X'.repeat(31)]) {
    assert.ok(licenceFieldProblems({ ...valid, licenceCode: code }, { today, newDoctor: false }).length > 0, code);
  }
  assert.ok(licenceFieldProblems({ ...valid, practiceScope: 'NOT_DECLARED' }, { today, newDoctor: false }).length > 0);
});

test('optional fields are bounded and a service list is unique and well formed', () => {
  assert.ok(licenceFieldProblems({ ...valid, phone: 'call me' }, { today, newDoctor: false }).length > 0);
  assert.ok(licenceFieldProblems({ ...valid, clinicNameFa: 'ک'.repeat(121) }, { today, newDoctor: false }).length > 0);
  assert.ok(licenceFieldProblems({ ...valid, serviceCodes: ['A_B', 'A_B'] }, { today, newDoctor: false }).length > 0);
  assert.ok(licenceFieldProblems({ ...valid, serviceCodes: ["x'; drop"] }, { today, newDoctor: false }).length > 0);
});

test('approval opens payment and nothing more', () => {
  assert.equal(LICENCE_DECISION_OUTCOME.APPROVE, 'LICENSE_APPROVED_AWAITING_PAYMENT');
  for (const decision of LICENCE_DECISIONS) assert.ok(vetCaseMove('UNDER_REVIEW', LICENCE_DECISION_OUTCOME[decision], 'REVIEWER'), decision);
  assert.equal(tagForCaseStatus('LICENSE_APPROVED_AWAITING_PAYMENT', 'DOCTOR'), 'UNLICENSED', 'not the licensed tag');
  assert.equal(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'REVIEWER'), null, 'a reviewer never activates it');
  assert.equal(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'EXPIRED', 'SYSTEM'), null, 'waiting for payment does not expire');
});

test('a stored name is a safe label: no directory, no control or bidi characters, bounded', () => {
  assert.equal(safeOriginalName('../../etc/pass\u202Ewd.pdf'), 'passwd.pdf');
  assert.equal(safeOriginalName('C:\\Users\\x\\lic\u0000ence.png'), 'licence.png');
  assert.equal(safeOriginalName('  '), null);
  assert.equal(safeOriginalName('..'), null);
  assert.equal(safeOriginalName('a'.repeat(300) + '.pdf')!.length, 120);
});

test('file type comes from the bytes, not the name', () => {
  assert.equal(detectMime(new TextEncoder().encode('%PDF-1.7 licence')), 'application/pdf');
  assert.equal(detectMime(new TextEncoder().encode('just text renamed .png')), null);
});
