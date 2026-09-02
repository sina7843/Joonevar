/**
 * Calendar contract — DEC-0004 and DEC-0005.
 *
 * Dates are stored and computed in the Gregorian calendar and displayed in the
 * Persian calendar. Civil event dates (a mating date, a birth date) are plain
 * calendar days with no time zone; only record timestamps carry a time.
 *
 * §17.2 fixes the cooldown at 14 days for males and six months for females and
 * forbids silently substituting a day count for the six months. Month addition
 * here is calendar addition with a clamp to the last valid day of the target
 * month, so 31 August + 6 months is 28/29 February, never 3 March.
 */

/** A civil date with no time and no zone: `YYYY-MM-DD`. */
export type CivilDate = string;

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCivilDate(value: CivilDate): { year: number; month: number; day: number } {
  const m = CIVIL_DATE.exec(value);
  if (!m) throw new RangeError('Invalid civil date: ' + value);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) throw new RangeError('Invalid month in civil date: ' + value);
  if (day < 1 || day > daysInMonth(year, month)) throw new RangeError('Invalid day in civil date: ' + value);
  return { year, month, day };
}

export function formatCivilDate(year: number, month: number, day: number): CivilDate {
  return (
    String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  );
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const { year, month, day } = parseCivilDate(date);
  const utc = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const d = new Date(utc);
  return formatCivilDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Calendar month addition with end-of-month clamping. This is the single place
 * the "six months" rule is realised; nothing else may convert it to days.
 */
export function addCalendarMonths(date: CivilDate, months: number): CivilDate {
  const { year, month, day } = parseCivilDate(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatCivilDate(targetYear, targetMonth, clampedDay);
}

export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Cooldown windows (§17.2). The result is advisory: the caller shows a warning
 * with sex, base date and window end, and the continue CTA stays available.
 */
export type AnimalSex = 'MALE' | 'FEMALE';

export interface CooldownPolicy {
  readonly maleDays: number;
  readonly femaleMonths: number;
}

export interface CooldownWindow {
  readonly baseDate: CivilDate;
  readonly endsOn: CivilDate;
  readonly inWindow: boolean;
}

export function cooldownWindow(
  sex: AnimalSex,
  lastConfirmedDate: CivilDate | null,
  today: CivilDate,
  policy: CooldownPolicy,
): CooldownWindow | null {
  // No mutually confirmed history means no computed warning. Never invent a base date (§17.2).
  if (lastConfirmedDate === null) return null;
  const endsOn =
    sex === 'MALE'
      ? addDays(lastConfirmedDate, policy.maleDays)
      : addCalendarMonths(lastConfirmedDate, policy.femaleMonths);
  return { baseDate: lastConfirmedDate, endsOn, inWindow: compareCivilDates(today, endsOn) < 0 };
}

const FA_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Display only. The stored value never changes shape. */
export function formatCivilDateFa(date: CivilDate): string {
  const { year, month, day } = parseCivilDate(date);
  return FA_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}

export function todayCivil(now: Date = new Date()): CivilDate {
  return formatCivilDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}
