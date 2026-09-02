/**
 * Cooldown boundaries — gate `cooldown-boundaries`.
 *
 * §17.2 fixes 14 days for males and six calendar months for females and forbids
 * turning the six months into an arbitrary number of days. These tests pin the
 * exact arithmetic: the day the window ends, the end-of-month clamp, leap-year
 * February, and the fact that no confirmed history produces no window at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarMonths,
  addDays,
  cooldownWindow,
  todayCivil,
  type CooldownPolicy,
} from '../../src/domain/calendar.ts';

/** The source's own numbers; the settings hold the same values. */
const POLICY: CooldownPolicy = { maleDays: 14, femaleMonths: 6 };

test('the male window is exactly 14 days and ends on the fourteenth day', () => {
  const base = '2026-03-01';
  const window = cooldownWindow('MALE', base, '2026-03-02', POLICY)!;
  assert.equal(window.baseDate, base);
  assert.equal(window.endsOn, '2026-03-15');

  // The day before the end is inside; the end day itself is already outside, so
  // the fourteenth full day has passed.
  assert.equal(cooldownWindow('MALE', base, '2026-03-14', POLICY)!.inWindow, true);
  assert.equal(cooldownWindow('MALE', base, '2026-03-15', POLICY)!.inWindow, false);
  assert.equal(cooldownWindow('MALE', base, '2026-03-16', POLICY)!.inWindow, false);

  // The base day itself is inside the window.
  assert.equal(cooldownWindow('MALE', base, base, POLICY)!.inWindow, true);
});

test('the male window counts days across a month and a year boundary', () => {
  assert.equal(cooldownWindow('MALE', '2026-12-25', '2026-12-26', POLICY)!.endsOn, '2027-01-08');
  assert.equal(cooldownWindow('MALE', '2028-02-20', '2028-02-21', POLICY)!.endsOn, '2028-03-05');
  // 2028 is a leap year, so the 14 days really do cross 29 February.
  assert.equal(addDays('2028-02-20', 14), '2028-03-05');
  assert.equal(addDays('2027-02-20', 14), '2027-03-06');
});

test('the female window is six calendar months, never a substituted day count', () => {
  const window = cooldownWindow('FEMALE', '2026-01-15', '2026-02-01', POLICY)!;
  assert.equal(window.endsOn, '2026-07-15');
  // Six months from 15 January is 15 July: 181 days here, 184 days from another
  // month. A fixed day count could not produce both.
  assert.notEqual(addDays('2026-01-15', 180), window.endsOn);
  assert.equal(cooldownWindow('FEMALE', '2026-05-15', '2026-06-01', POLICY)!.endsOn, '2026-11-15');
});

test('the six months clamp to the last valid day of the target month', () => {
  // 31 August + 6 months is 28 February, not 3 March.
  assert.equal(addCalendarMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(cooldownWindow('FEMALE', '2026-08-31', '2026-09-01', POLICY)!.endsOn, '2027-02-28');
  // The same day in a leap year clamps to 29 February.
  assert.equal(addCalendarMonths('2027-08-31', 6), '2028-02-29');
  assert.equal(cooldownWindow('FEMALE', '2027-08-31', '2027-09-01', POLICY)!.endsOn, '2028-02-29');
  // 31 March + 6 months is 30 September, and 31 May + 6 months is 30 November.
  assert.equal(addCalendarMonths('2026-03-31', 6), '2026-09-30');
  assert.equal(addCalendarMonths('2026-05-31', 6), '2026-11-30');
});

test('a female window that starts on 29 February clamps at both ends', () => {
  assert.equal(addCalendarMonths('2028-02-29', 6), '2028-08-29');
  assert.equal(addCalendarMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(cooldownWindow('FEMALE', '2028-02-29', '2028-03-01', POLICY)!.endsOn, '2028-08-29');
});

test('the female boundary day itself is outside the window', () => {
  const base = '2026-01-31';
  assert.equal(cooldownWindow('FEMALE', base, '2026-07-30', POLICY)!.inWindow, true);
  assert.equal(cooldownWindow('FEMALE', base, '2026-07-31', POLICY)!.inWindow, false);
  assert.equal(cooldownWindow('FEMALE', base, '2026-08-01', POLICY)!.inWindow, false);
});

test('no confirmed history produces no window and no invented base date', () => {
  assert.equal(cooldownWindow('MALE', null, '2026-09-02', POLICY), null);
  assert.equal(cooldownWindow('FEMALE', null, '2026-09-02', POLICY), null);
});

test('dates are civil days: the same instant in any zone is the same day here', () => {
  // A civil date carries no time and no zone, so "today" is derived once, in
  // UTC, and an evening in Tehran cannot shift a boundary by a day.
  const instant = new Date('2026-03-14T22:30:00.000Z');
  assert.equal(todayCivil(instant), '2026-03-14');
  assert.equal(todayCivil(new Date('2026-03-14T00:00:00.000Z')), '2026-03-14');
  assert.equal(todayCivil(new Date('2026-03-14T23:59:59.999Z')), '2026-03-14');

  // The comparison is a plain string comparison of `YYYY-MM-DD`, so no local
  // clock reading can move an animal in or out of its window.
  const window = cooldownWindow('MALE', '2026-03-01', todayCivil(instant), POLICY)!;
  assert.equal(window.inWindow, true);
  assert.equal(cooldownWindow('MALE', '2026-03-01', '2026-03-15', POLICY)!.inWindow, false);
});

test('a warning never withdraws the ability to continue', () => {
  // The window object says only whether today falls inside it. There is no flag
  // here that any screen could read as "blocked" (§17.2).
  const window = cooldownWindow('FEMALE', '2026-08-01', '2026-09-01', POLICY)!;
  assert.deepEqual(Object.keys(window).sort(), ['baseDate', 'endsOn', 'inWindow']);
  assert.equal(window.inWindow, true);
});
