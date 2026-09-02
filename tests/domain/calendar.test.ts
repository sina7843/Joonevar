import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarMonths, addDays, cooldownWindow, daysInMonth, isLeapYear } from '../../src/domain/calendar.ts';

const POLICY = { maleDays: 14, femaleMonths: 6 };

test('six months is calendar addition, clamped at month end', () => {
  assert.equal(addCalendarMonths('2026-01-31', 6), '2026-07-31');
  // 31 August + 6 months lands in February, which has no 31st.
  assert.equal(addCalendarMonths('2025-08-31', 6), '2026-02-28');
  assert.equal(addCalendarMonths('2023-08-31', 6), '2024-02-29');
  assert.equal(addCalendarMonths('2025-10-31', 6), '2026-04-30');
});

test('six months is not 180 days', () => {
  const base = '2026-01-31';
  assert.notEqual(addCalendarMonths(base, 6), addDays(base, 180));
});

test('month arithmetic crosses the year boundary', () => {
  assert.equal(addCalendarMonths('2026-09-15', 6), '2027-03-15');
  assert.equal(addCalendarMonths('2026-12-31', 6), '2027-06-30');
});

test('leap year rules are the real Gregorian rules', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
});

test('male cooldown is 14 days from the last mutually confirmed date', () => {
  const window = cooldownWindow('MALE', '2026-09-01', '2026-09-10', POLICY);
  assert.equal(window?.endsOn, '2026-09-15');
  assert.equal(window?.inWindow, true);
  assert.equal(cooldownWindow('MALE', '2026-09-01', '2026-09-20', POLICY)?.inWindow, false);
});

test('female cooldown uses the six calendar month window', () => {
  const window = cooldownWindow('FEMALE', '2026-08-31', '2026-12-01', POLICY);
  assert.equal(window?.endsOn, '2027-02-28');
  assert.equal(window?.inWindow, true);
});

test('no confirmed history produces no warning and invents no base date', () => {
  assert.equal(cooldownWindow('FEMALE', null, '2026-09-02', POLICY), null);
  assert.equal(cooldownWindow('MALE', null, '2026-09-02', POLICY), null);
});

test('invalid civil dates are rejected rather than coerced', () => {
  assert.throws(() => addCalendarMonths('2026-02-30', 1), RangeError);
  assert.throws(() => addDays('2026-13-01', 1), RangeError);
  assert.throws(() => addDays('not-a-date', 1), RangeError);
});
