/**
 * The handoff rules and the warning-only cooldown — PHASE-4 PROMPT-006, pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handoffProblems,
  OFFICIAL_CONSEQUENCES_FA,
  PERSONAL_CONSEQUENCES_FA,
  type HandoffSide,
} from '../../src/finder/request-model.ts';
import { cooldownState, type RuleFacts } from '../../src/finder/profile-model.ts';
import { todayCivil } from '../../src/domain/calendar.ts';

const side = (over: Partial<HandoffSide> = {}): HandoffSide => ({
  expectedOwnerId: 'o1',
  ownerId: 'o1',
  status: 'REGISTERED',
  lifeStatus: 'ACTIVE',
  sex: 'MALE',
  species: 'DOG',
  resolvedBreedId: 'b1',
  hasChip: true,
  hasPedigree: false,
  ...over,
});
const sire = side();
const dam = side({ expectedOwnerId: 'o2', ownerId: 'o2', sex: 'FEMALE' });

test('the personal path needs current owners, chips, one breed and a male and a female — never a pedigree', () => {
  assert.deepEqual(handoffProblems('PERSONAL', sire, dam), []);
  assert.match(handoffProblems('PERSONAL', side({ ownerId: 'someone-else' }), dam).join(), /مالک/);
  assert.match(handoffProblems('PERSONAL', sire, { ...dam, hasChip: false }).join(), /میکروچیپ/);
  assert.match(handoffProblems('PERSONAL', side({ lifeStatus: 'DECEASED' }), dam).join(), /پرونده فعال/);
  assert.match(handoffProblems('PERSONAL', sire, { ...dam, sex: 'MALE' }).join(), /یک نر و یک ماده/);
  assert.match(handoffProblems('PERSONAL', sire, { ...dam, resolvedBreedId: 'b2' }).join(), /یک نژاد/);
  assert.match(handoffProblems('PERSONAL', side({ resolvedBreedId: null }), { ...dam, resolvedBreedId: null }).join(), /یک نژاد/, 'unknown breed is never "the same"');
});

test('the official path additionally needs an issued pedigree on both sides', () => {
  const problems = handoffProblems('OFFICIAL', sire, dam);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => /شجره‌نامه/.test(p)));
  assert.deepEqual(handoffProblems('OFFICIAL', { ...sire, hasPedigree: true }, { ...dam, hasPedigree: true }), []);
});

test('the consequence screens say what each path does not do', () => {
  assert.match(OFFICIAL_CONSEQUENCES_FA.join(' '), /مجوز صادر نمی‌کند/);
  assert.match(OFFICIAL_CONSEQUENCES_FA.join(' '), /بررسی/);
  assert.match(PERSONAL_CONSEQUENCES_FA.join(' '), /شماره مجوز/);
  assert.match(PERSONAL_CONSEQUENCES_FA.join(' '), /کارت توله/);
});

const rule = (over: Partial<RuleFacts>): RuleFacts => ({ id: 'r', version: 1, minAgeMonths: 12, maxAgeMonths: 120, cooldownDays: null, cooldownMonths: null, cooldownMode: 'WARN', ...over });

test('the baseline cooldown: male 14 days, female 6 calendar months, and only as a warning', () => {
  const male = rule({ cooldownDays: 14 });
  assert.equal(cooldownState(male, '2026-09-01', '2026-09-14').state, 'IN_COOLDOWN');
  assert.equal(cooldownState(male, '2026-09-01', '2026-09-15').state, 'CLEAR', 'the 14th day after is free');
  const female = rule({ cooldownMonths: 6 });
  const inWindow = cooldownState(female, '2026-08-31', '2027-02-27');
  assert.equal(inWindow.endsOn, '2027-02-28', 'six calendar months, clamped to the month end');
  assert.match(inWindow.fa, /فقط هشدار/);
  assert.equal(cooldownState(female, '2026-08-31', '2027-02-28').state, 'CLEAR');
  assert.equal(cooldownState(female, null, '2027-01-01').state, 'NO_HISTORY', 'no confirmed mating, no invented base');
});

test('Persian day boundary: 00:00 in Tehran is already the next civil day', () => {
  assert.equal(todayCivil(new Date('2026-03-20T20:29:59Z')), '2026-03-20');
  assert.equal(todayCivil(new Date('2026-03-20T20:30:00Z')), '2026-03-21', 'Nowruz 1405 starts at Tehran midnight');
});
