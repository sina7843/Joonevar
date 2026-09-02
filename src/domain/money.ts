/**
 * Money contract — Requirements §22.
 *
 * The product speaks Toman. Every stored amount is an exact integer number of
 * Toman held as bigint; no float ever touches a monetary path.
 *
 * Iranian payment gateways settle in Rial. 1 Toman = 10 Rial exactly, so the
 * conversion is a pure integer scale and is reversible only for Rial amounts
 * that are whole Toman. Both directions are total functions that throw rather
 * than round, because a silent rounding here becomes a wrong receipt.
 */

export const RIAL_PER_TOMAN = 10n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** A monetary product setting is either configured with a real amount, or it is not. Never 0 by default. */
export type MoneyValue =
  | { readonly configured: true; readonly toman: bigint }
  | { readonly configured: false };

export const NOT_CONFIGURED_MONEY: MoneyValue = { configured: false };

export function toman(amount: bigint | number | string): bigint {
  let value: bigint;
  if (typeof amount === 'bigint') {
    value = amount;
  } else if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount)) throw new MoneyError(`Toman amount must be a safe integer: ${amount}`);
    value = BigInt(amount);
  } else {
    if (!/^-?\d+$/.test(amount.trim())) throw new MoneyError(`Toman amount must be an integer string: ${amount}`);
    value = BigInt(amount.trim());
  }
  if (value < 0n) throw new MoneyError(`Toman amount must not be negative: ${value}`);
  return value;
}

export function configuredMoney(amount: bigint | number | string): MoneyValue {
  return { configured: true, toman: toman(amount) };
}

/** Amount actually sent to the gateway. */
export function tomanToRial(amountToman: bigint): bigint {
  if (amountToman < 0n) throw new MoneyError(`Toman amount must not be negative: ${amountToman}`);
  return amountToman * RIAL_PER_TOMAN;
}

/** Amount read back from a gateway callback. A non-whole Toman amount is a real mismatch, not a rounding case. */
export function rialToToman(amountRial: bigint): bigint {
  if (amountRial < 0n) throw new MoneyError(`Rial amount must not be negative: ${amountRial}`);
  if (amountRial % RIAL_PER_TOMAN !== 0n) {
    throw new MoneyError(`Rial amount ${amountRial} is not a whole Toman amount; refusing to round`);
  }
  return amountRial / RIAL_PER_TOMAN;
}

/**
 * Reading an amount for a payment path. A missing tariff must stop the payment
 * with a named reason; it must never be treated as free (§22, §29.2).
 */
export function requireConfiguredToman(value: MoneyValue, settingKey: string): bigint {
  if (!value.configured) {
    throw new MoneyError(`Monetary setting "${settingKey}" is NOT_CONFIGURED; no amount may be assumed`);
  }
  return value.toman;
}

/** Persisted representation: exact decimal string, so no driver turns it into a float. */
export function tomanToColumn(amountToman: bigint): string {
  return amountToman.toString();
}

export function tomanFromColumn(column: string | null): MoneyValue {
  if (column === null || column.trim() === '') return NOT_CONFIGURED_MONEY;
  return configuredMoney(column);
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** Display helper. Returns null when nothing is configured so the UI shows «تعیین‌نشده» instead of a number. */
export function formatTomanFa(value: MoneyValue): string | null {
  if (!value.configured) return null;
  const grouped = value.toman.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return grouped.replace(/\d/g, (d) => FA_DIGITS[Number(d)]!) + ' تومان';
}
