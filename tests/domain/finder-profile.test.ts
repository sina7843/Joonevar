/**
 * Mating profile rules and the public picture rendition — PHASE-4 PROMPT-003.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsRequests,
  ageInMonths,
  ageRequestProblem,
  completeness,
  cooldownState,
  eligibilityProblems,
  holdsCapacity,
  lastMatingFa,
  lifeEventProblem,
  lifeStatus,
  NO_CONFIRMED_MATING_FA,
  ownerMayMove,
  publiclyListed,
  type EligibilityFacts,
  type RuleFacts,
} from '../../src/finder/profile-model.ts';
import { stripImageMetadata } from '../../src/media/strip-metadata.ts';

const eligible: EligibilityFacts = {
  actorIsOwner: true,
  ownerKycApproved: true,
  animalStatus: 'REGISTERED',
  speciesOpen: true,
  lifeStatus: 'ACTIVE',
  hasOfficialChip: true,
  hasBreed: true,
  hasSex: true,
  hasBirthDate: true,
  fertility: 'NOT_STERILIZED',
  hasFullBodyImage: true,
  hasFaceImage: true,
};

test('an animal meeting every condition has no problem, and each condition fails on its own', () => {
  assert.deepEqual(eligibilityProblems(eligible), []);
  const cases: Array<[Partial<EligibilityFacts>, string]> = [
    [{ actorIsOwner: false }, 'NOT_OWNER'],
    [{ ownerKycApproved: false }, 'KYC'],
    [{ animalStatus: 'DRAFT' }, 'NOT_REGISTERED'],
    [{ speciesOpen: false }, 'SPECIES_CLOSED'],
    [{ lifeStatus: 'MISSING' }, 'LIFE'],
    [{ hasOfficialChip: false }, 'CHIP'],
    [{ hasBirthDate: false }, 'IDENTITY'],
    [{ fertility: null }, 'FERTILITY_UNDECLARED'],
    [{ fertility: 'STERILIZED' }, 'STERILIZED'],
    [{ hasFullBodyImage: false }, 'FULL_BODY'],
    [{ hasFaceImage: false }, 'FACE'],
  ];
  for (const [change, code] of cases) {
    assert.deepEqual(
      eligibilityProblems({ ...eligible, ...change }).map((p) => p.code),
      [code],
      code,
    );
  }
});

test('pedigree adds completeness and is never a condition', () => {
  assert.ok(!('hasPedigree' in eligible));
  const base = { hasPedigree: false, identityVerifiedByVet: true, imageCount: 2, hasVideo: false, hasPreferences: false };
  assert.equal(completeness(base).score, 1);
  assert.equal(completeness({ ...base, hasPedigree: true }).score, 2);
});

test('life events: death is final, missing ends with found, archive ends with restore', () => {
  assert.equal(lifeStatus([]), 'ACTIVE');
  assert.equal(lifeStatus(['MISSING']), 'MISSING');
  assert.equal(lifeStatus(['MISSING', 'FOUND']), 'ACTIVE');
  assert.equal(lifeStatus(['ARCHIVED', 'RESTORED', 'DECEASED']), 'DECEASED');
  assert.equal(lifeEventProblem('ACTIVE', 'FOUND') !== null, true, 'nothing to find');
  assert.equal(lifeEventProblem('MISSING', 'DECEASED'), null, 'a missing animal can be recorded dead');
  assert.match(lifeEventProblem('DECEASED', 'RESTORED')!, /فوت/);
});

test('the owner moves between the three owner states; coordination is not the owner’s to leave', () => {
  assert.ok(ownerMayMove('READY', 'TEMPORARILY_UNAVAILABLE'));
  assert.ok(ownerMayMove('INVITE_ONLY', 'READY'));
  assert.ok(ownerMayMove('READY', 'INACTIVE'));
  assert.ok(!ownerMayMove('INACTIVE', 'READY'), 'activation goes through eligibility and capacity');
  assert.ok(!ownerMayMove('COORDINATING', 'READY'));
  assert.ok(!ownerMayMove('MATCH_SELECTED', 'INACTIVE'));
  assert.ok(holdsCapacity('TEMPORARILY_UNAVAILABLE') && !holdsCapacity('INACTIVE'));
  assert.ok(!publiclyListed('TEMPORARILY_UNAVAILABLE') && publiclyListed('COORDINATING'));
  assert.ok(acceptsRequests('READY') && !acceptsRequests('INVITE_ONLY'));
});

const rule = (over: Partial<RuleFacts> = {}): RuleFacts => ({
  id: 'r',
  version: 1,
  minAgeMonths: 12,
  maxAgeMonths: 96,
  cooldownDays: 14,
  cooldownMonths: null,
  cooldownMode: 'WARN',
  ...over,
});

test('age closes requests outside the range, and an unset range closes them with a reason', () => {
  assert.equal(ageInMonths('2024-03-15', '2025-03-14'), 11);
  assert.equal(ageInMonths('2024-03-15', '2025-03-15'), 12);
  assert.equal(ageRequestProblem(rule(), 12), null);
  assert.match(ageRequestProblem(rule(), 11)!, /کمتر از حداقل/);
  assert.match(ageRequestProblem(rule(), 97)!, /بیشتر از حداکثر/);
  assert.match(ageRequestProblem(rule({ minAgeMonths: null, maxAgeMonths: null }), 30)!, /تعیین نشده/);
  assert.match(ageRequestProblem(null, 30)!, /تعیین نشده/);
});

test('cooldown comes from the rule and the last confirmed date, warning unless the rule blocks', () => {
  assert.equal(cooldownState(rule(), null, '2026-06-01').state, 'NO_HISTORY');
  const male = cooldownState(rule(), '2026-06-01', '2026-06-10');
  assert.equal(male.state, 'IN_COOLDOWN');
  assert.equal(male.endsOn, '2026-06-15');
  assert.match(male.fa, /فقط هشدار/);
  assert.equal(cooldownState(rule(), '2026-06-01', '2026-06-15').state, 'CLEAR', 'the end is exclusive');
  const female = cooldownState(rule({ cooldownDays: null, cooldownMonths: 6, cooldownMode: 'BLOCK' }), '2026-01-31', '2026-07-30');
  assert.equal(female.endsOn, '2026-07-31');
  assert.match(female.fa, /بسته است/);
});

test('the last mating is an exact Persian date with elapsed days, or the fixed empty text', () => {
  assert.equal(lastMatingFa(null, '2026-09-01'), NO_CONFIRMED_MATING_FA);
  assert.equal(NO_CONFIRMED_MATING_FA, 'سابقه جفت‌گیری تأییدشده ثبت نشده');
  const text = lastMatingFa('2026-06-02', '2026-09-15');
  assert.match(text, /خرداد/);
  assert.match(text, /۱۰۵ روز قبل$/);
});

const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];

test('the public rendition of a JPEG drops EXIF, GPS and comments and keeps the image data', () => {
  const gps = [...Buffer.from('Exif\0\0GPS 35.6892N 51.3890E')];
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, gps),
    ...segment(0xfe, [...Buffer.from('home address')]),
    ...segment(0xdb, [0, 1, 2, 3]),
    0xff, 0xda, 0, 4, 9, 9, 0x11, 0x22, 0x33,
    0xff, 0xd9,
  ]);
  const clean = stripImageMetadata(jpeg);
  const text = Buffer.from(clean).toString('latin1');
  assert.ok(!text.includes('GPS') && !text.includes('Exif') && !text.includes('home address'));
  assert.ok(text.includes('JFIF'));
  assert.deepEqual([...clean.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...clean.subarray(-2)], [0xff, 0xd9]);
  assert.ok(Buffer.from(clean).includes(Buffer.from([0x11, 0x22, 0x33])), 'scan data kept');
});

test('the public rendition of a PNG drops text and EXIF chunks; anything unparseable is refused', () => {
  const chunk = (type: string, data: number[]) => {
    const len = data.length;
    return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...Buffer.from(type), ...data, 0, 0, 0, 0];
  };
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...chunk('tEXt', [...Buffer.from('Location\0Tehran')]),
    ...chunk('eXIf', [...Buffer.from('GPS')]),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND', []),
  ]);
  const text = Buffer.from(stripImageMetadata(png)).toString('latin1');
  assert.ok(!text.includes('Tehran') && !text.includes('eXIf') && !text.includes('tEXt'));
  assert.ok(text.includes('IHDR') && text.includes('IDAT') && text.includes('IEND'));
  assert.throws(() => stripImageMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x01])), /خوانا نیست/);
  assert.throws(() => stripImageMetadata(new Uint8Array([1, 2, 3, 4])), /JPEG یا PNG/);
});
