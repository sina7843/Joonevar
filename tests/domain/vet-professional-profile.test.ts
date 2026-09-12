/**
 * The canonical veterinary professional profile without a database — Phase 2.5 PROMPT-003.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { VET_CASE_STATUSES } from '../../src/vets/professional-model.ts';
import {
  CASE_STATUS_FA,
  PUBLIC_FORBIDDEN_KEYS,
  isIsoDate,
  normalizeInstagram,
  normalizeWebsite,
  professionalFieldProblems,
  publicProfessionalView,
  type ProfessionalFields,
} from '../../src/vets/professional-profile-model.ts';

const doctor: ProfessionalFields = {
  applicantType: 'DOCTOR',
  studentNumber: null,
  universityFa: null,
  practiceScope: 'GENERAL',
  councilCode: 'SYN-100',
  councilVerified: true,
  hasLicence: true,
  licenceCode: 'LIC-1',
  licenceDate: '2025-04-01',
  licenceFileId: '00000000-0000-4000-8000-000000000001',
  licenceVerified: true,
};

const student: ProfessionalFields = {
  applicantType: 'STUDENT',
  studentNumber: '981234',
  universityFa: 'دانشگاه آزمایشی',
  practiceScope: null,
  councilCode: null,
  councilVerified: false,
  hasLicence: null,
  licenceCode: null,
  licenceDate: null,
  licenceFileId: null,
  licenceVerified: false,
};

test('a complete doctor and a complete student are both valid', () => {
  assert.deepEqual(professionalFieldProblems(doctor), []);
  assert.deepEqual(professionalFieldProblems(student), []);
  // An old doctor record that never answered the licence question is valid as it is.
  assert.deepEqual(professionalFieldProblems({ ...doctor, practiceScope: 'NOT_DECLARED', hasLicence: null, licenceCode: null, licenceDate: null, licenceFileId: null, licenceVerified: false }), []);
});

test('every combination the product rules out is refused', () => {
  const invalid: Array<[string, ProfessionalFields]> = [
    ['student with a council code', { ...student, councilCode: 'SYN-1' }],
    ['student with a scope', { ...student, practiceScope: 'SPECIALIST' }],
    ['student with a licence answer', { ...student, hasLicence: false }],
    ['doctor with a student number', { ...doctor, studentNumber: '1' }],
    ['no applicant type with a scope', { ...student, applicantType: null, studentNumber: null, universityFa: null, practiceScope: 'GENERAL' }],
    ['licence code while declaring no licence', { ...doctor, hasLicence: false, licenceVerified: false }],
    ['licence code with the question unanswered', { ...doctor, hasLicence: null, licenceVerified: false }],
    ['licence verified without its file', { ...doctor, licenceFileId: null }],
    ['licence verified without its date', { ...doctor, licenceDate: null }],
    ['council verified without a code', { ...doctor, councilCode: null }],
    ['an impossible licence date', { ...doctor, licenceDate: '2025-02-30' }],
  ];
  for (const [label, fields] of invalid) {
    assert.ok(professionalFieldProblems(fields).length > 0, label);
  }
});

test('dates are calendar dates, not anything Date can parse', () => {
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2023-02-29'), false);
  assert.equal(isIsoDate('2024-2-1'), false);
  assert.equal(isIsoDate('1403/01/01'), false);
});

test('a website opens over http or https only, and an Instagram handle is stored bare', () => {
  assert.deepEqual(normalizeWebsite('clinic.example.org'), { value: 'https://clinic.example.org/' });
  assert.deepEqual(normalizeWebsite('  '), { value: null });
  for (const bad of ['javascript:alert(1)', 'ftp://clinic.example.org', 'https://user:pass@clinic.example.org', 'localhost']) {
    assert.ok('problem' in normalizeWebsite(bad), bad);
  }
  assert.deepEqual(normalizeInstagram('@Clinic.Vet'), { value: 'clinic.vet' });
  assert.deepEqual(normalizeInstagram('https://www.instagram.com/clinic_vet/'), { value: 'clinic_vet' });
  assert.ok('problem' in normalizeInstagram('clinic vet'));
  assert.ok('problem' in normalizeInstagram('<script>'));
});

test('every workflow status has a Persian label', () => {
  for (const status of VET_CASE_STATUSES) assert.ok(CASE_STATUS_FA[status], status);
});

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key);
      keysDeep(inner, out);
    }
  }
  return out;
}

test('the public view carries the tag and what was chosen for publication, and nothing private', () => {
  const view = publicProfessionalView({
    slug: 'vet-0123456789',
    displayNameFa: 'دکتر آزمایشی',
    councilCode: 'SYN-100',
    showCouncilCode: false,
    phone: '02100000000',
    showPhone: false,
    clinicNameFa: 'کلینیک آزمایشی',
    websiteUrl: 'https://clinic.example.org/',
    instagramHandle: 'clinic.vet',
    tag: { tag: 'LICENSED', practiceScope: 'SPECIALIST' },
    servicesFa: ['کاشت میکروچیپ'],
    equipmentFa: ['دستگاه میکروچیپ‌ریدر'],
  });
  assert.equal(view.tagFa, 'دکتر دامپزشک - متخصص - دارای پروانه فعالیت');
  assert.equal(view.councilCode, null, 'the council code only with consent');
  assert.equal(view.phone, null, 'the phone only with consent');
  assert.deepEqual(view.declaredEquipmentFa, ['دستگاه میکروچیپ‌ریدر']);
  const keys = keysDeep(view);
  for (const forbidden of PUBLIC_FORBIDDEN_KEYS) assert.equal(keys.includes(forbidden), false, forbidden);
  // Plain JSON: it survives a round trip unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
});
