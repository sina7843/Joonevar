/**
 * Identity value rules — §6.2.
 *
 * Persian and Arabic-Indic digits are normalised before anything else, because
 * a phone number or a national id typed on a Persian keyboard is the same value
 * as its Latin-digit form and must not be rejected or stored twice.
 */
import { validation } from './errors.ts';
import { parseCivilDate, type CivilDate } from './calendar.ts';

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

export function toLatinDigits(input: string): string {
  let out = '';
  for (const character of input) {
    const code = character.codePointAt(0)!;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) out += String(code - PERSIAN_ZERO);
    else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) out += String(code - ARABIC_ZERO);
    else out += character;
  }
  return out;
}

/**
 * Canonical mobile form is `09XXXXXXXXX`.
 *
 * The same number reaches us as +98…, 0098…, 98… or without the leading zero,
 * so all of them collapse to one stored value. Uniqueness of an account depends
 * on this being canonical.
 */
export function normalizeMobile(raw: string): string {
  const digitsOnly = toLatinDigits(raw)
    .replace(/[\s\-().‌]/g, '')
    .replace(/^\+/, '00');

  let national = digitsOnly;
  if (national.startsWith('0098')) national = national.slice(4);
  else if (national.startsWith('98') && national.length === 12) national = national.slice(2);
  else if (national.startsWith('0')) national = national.slice(1);

  return '0' + national;
}

export const MOBILE_PATTERN = /^09\d{9}$/;

export function assertMobile(raw: string): string {
  const normalized = normalizeMobile(raw);
  if (!MOBILE_PATTERN.test(normalized)) {
    throw validation('شماره موبایل معتبر نیست. شماره را به شکل ۰۹xxxxxxxxx وارد کنید.');
  }
  return normalized;
}

/**
 * Iranian national id: ten digits with a check digit.
 *
 * The check digit is part of the identifier's own format, not a product policy.
 * It is validated because the value becomes read-only once KYC is approved
 * (§6.4), so a single mistyped digit would be permanent. See DEC-0025.
 */
export const NATIONAL_ID_PATTERN = /^\d{10}$/;

export function isValidNationalId(raw: string): boolean {
  const value = toLatinDigits(raw).trim();
  if (!NATIONAL_ID_PATTERN.test(value)) return false;
  // All-identical digits pass the arithmetic but are never issued.
  if (/^(\d)\1{9}$/.test(value)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(value[i]) * (10 - i);
  const remainder = sum % 11;
  const check = Number(value[9]);
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

export function assertNationalId(raw: string): string {
  const value = toLatinDigits(raw).trim();
  if (!NATIONAL_ID_PATTERN.test(value)) throw validation('کد ملی باید دقیقاً ده رقم باشد.');
  if (!isValidNationalId(value)) throw validation('کد ملی واردشده معتبر نیست. لطفاً دوباره بررسی کنید.');
  return value;
}

/**
 * Postal code is optional, but §6.2 is explicit that an optional field is not
 * the same as an unvalidated one: if a value is entered it must be well formed.
 */
export const POSTAL_CODE_PATTERN = /^\d{10}$/;

export function normalizeOptionalPostalCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = toLatinDigits(raw).replace(/[\s-]/g, '');
  if (value === '') return null;
  if (!POSTAL_CODE_PATTERN.test(value)) throw validation('کدپستی باید ده رقم باشد.');
  return value;
}

export function assertPersonName(raw: string, field: string): string {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 2) throw validation(field + ' باید حداقل دو نویسه باشد.');
  if (value.length > 60) throw validation(field + ' بیش از حد طولانی است.');
  return value;
}

export function assertBirthDate(raw: string, today: CivilDate): CivilDate {
  const value = toLatinDigits(raw).trim();
  const parsed = parseCivilDate(value);
  if (value > today) throw validation('تاریخ تولد نمی‌تواند در آینده باشد.');
  if (parsed.year < 1900) throw validation('تاریخ تولد معتبر نیست.');
  return value;
}

/** Display name is optional and its visibility to others is the account holder's choice (§6.2). */
export function normalizeOptionalDisplayName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return null;
  if (value.length > 60) throw validation('نام نمایشی بیش از حد طولانی است.');
  return value;
}

/** Masked form for anything that may appear in a list or a log. */
export function maskMobile(mobile: string): string {
  return mobile.length === 11 ? mobile.slice(0, 4) + '***' + mobile.slice(-2) : '***';
}
