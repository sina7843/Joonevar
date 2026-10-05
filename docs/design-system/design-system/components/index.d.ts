/**
 * Hamzist design system — `window.Hamzist` runtime helpers (components/bundle.js).
 * The component library itself is CSS-first: `components/bundle.css` (`.hz-*` classes);
 * each component's markup and props are documented in `components/<Name>/README.md`.
 */
export interface HamzistHelpers {
  /** "stage-3" */
  version: string;
  /** «تعیین‌نشده» — shown for any value the system or an admin has not set. Never ۰. */
  UNSET: string;
  /** Latin digits → Persian digits. `faDigits(1405)` → «۱۴۰۵». */
  faDigits(value: string | number): string;
  /** Persian/Arabic digits → Latin (for parsing input). */
  latinDigits(value: string): string;
  /** null, undefined, "" or NaN. */
  isUnset(value: unknown): boolean;
  /** `toman(250000)` → «۲۵۰٬۰۰۰ تومان»; `toman(null)` → «تعیین‌نشده»; `{unit:false}` drops «تومان». */
  toman(value: number | null | undefined, opts?: { unit?: boolean }): string;
  /** Persian-digit count with «٬»; unset → «—». */
  number(value: number | null | undefined): string;
  /** Jalali date in Asia/Tehran: "long" «۱۰ مهر ۱۴۰۵» (default) or "short" «۱۴۰۵/۰۷/۱۰». */
  jalali(value: Date | string | number | null | undefined, style?: "long" | "short"): string;
  /** Search key: ي→ی, ك→ک, digits→Latin, ZWNJ→space, trimmed, lower-case. */
  normalize(text: string): string;
  /** Normalised mobile "09xxxxxxxxx" or null. Accepts Persian/Arabic digits and +98. */
  mobile(value: string): string | null;
  /** Iranian national id check-digit validation (10 digits). */
  nationalId(value: string): boolean;
  /** `<bdi class="hz-id" dir="ltr">RS-JTFZYEWD</bdi>` — escaped HTML for a Latin identifier inside Persian text. */
  idHtml(code: string): string;
}
declare global {
  interface Window { Hamzist: HamzistHelpers }
}
