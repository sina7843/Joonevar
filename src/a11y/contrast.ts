/**
 * Contrast, computed rather than claimed — Requirements-Phase-2 §24
 * (PROMPT-018).
 *
 * "Contrast was checked" is the kind of sentence a report can contain without
 * anything behind it. So the check is arithmetic here: the real token values
 * the pages render, the pairs they are actually rendered in, and the WCAG 2.1
 * ratio each pair has to meet. A token that changes and breaks a pair fails a
 * test instead of quietly shipping.
 *
 * The tokens are the Design System's published values (`app/globals.css`). They
 * are copied here as data, not redefined: the test asserts the two stay equal,
 * so this file can never drift into a second source of truth.
 */

/** WCAG 2.1: normal text 4.5, large text and non-text UI 3.0 (1.4.3, 1.4.11). */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

const channel = (value: number): number => {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const value = hex.trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error('Not a hex colour: ' + hex);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, WCAG 2.1 §relative-luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded the way a report quotes it, without pretending to more precision. */
export const ratioOf = (foreground: string, background: string): number =>
  Math.round(contrastRatio(foreground, background) * 100) / 100;

/** The published token values, as the pages render them. */
export const TOKENS = {
  bgCanvas: '#fffcf8',
  bgSurface: '#ffffff',
  bgSubtle: '#faf7f2',
  bgBrandSubtle: '#fff6ed',
  textPrimary: '#171a17',
  textSecondary: '#685f57',
  textBrand: '#a83d0b',
  textDisabled: '#b9aea2',
  borderBrand: '#e46a1d',
  actionPrimaryDefault: '#c94f12',
  actionPrimaryOn: '#ffffff',
  actionSecondaryDefault: '#ffffff',
  actionSecondaryOn: '#171a17',
  statusNeutralText: '#4f4842',
  statusNeutralBg: '#faf7f2',
  statusInfoText: '#175cd3',
  statusInfoBg: '#eff8ff',
  statusSuccessText: '#166b48',
  statusSuccessBg: '#ecfdf3',
  statusWarningText: '#b54708',
  statusWarningBg: '#fffaeb',
  statusErrorText: '#b42318',
  statusErrorBg: '#fef3f2',
  focusRing: '#c94f12',
} as const;

export interface ContrastPair {
  readonly nameFa: string;
  readonly foreground: string;
  readonly background: string;
  readonly required: number;
  /** Why this pair is judged at this level. */
  readonly noteFa: string;
}

/**
 * Every pair the public pages actually put together.
 *
 * Disabled text is deliberately absent: WCAG 1.4.3 exempts it, and asserting a
 * ratio it is not required to meet would be inventing a rule rather than
 * checking one.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { nameFa: 'متن اصلی روی زمینه صفحه', foreground: TOKENS.textPrimary, background: TOKENS.bgCanvas, required: AA_NORMAL_TEXT, noteFa: 'متن عادی' },
  { nameFa: 'متن اصلی روی کارت', foreground: TOKENS.textPrimary, background: TOKENS.bgSurface, required: AA_NORMAL_TEXT, noteFa: 'متن عادی' },
  { nameFa: 'متن فرعی روی زمینه صفحه', foreground: TOKENS.textSecondary, background: TOKENS.bgCanvas, required: AA_NORMAL_TEXT, noteFa: 'توضیح و caption' },
  { nameFa: 'متن فرعی روی کارت', foreground: TOKENS.textSecondary, background: TOKENS.bgSurface, required: AA_NORMAL_TEXT, noteFa: 'توضیح و caption' },
  { nameFa: 'متن برند روی زمینه صفحه', foreground: TOKENS.textBrand, background: TOKENS.bgCanvas, required: AA_NORMAL_TEXT, noteFa: 'پیوندها' },
  { nameFa: 'متن برند روی زمینه برند', foreground: TOKENS.textBrand, background: TOKENS.bgBrandSubtle, required: AA_NORMAL_TEXT, noteFa: 'پیوند داخل بلوک برند' },
  { nameFa: 'متن دکمه اصلی', foreground: TOKENS.actionPrimaryOn, background: TOKENS.actionPrimaryDefault, required: AA_NORMAL_TEXT, noteFa: 'برچسب دکمه ۱۴px است، پس متن عادی شمرده می‌شود' },
  { nameFa: 'متن دکمه دوم', foreground: TOKENS.actionSecondaryOn, background: TOKENS.actionSecondaryDefault, required: AA_NORMAL_TEXT, noteFa: 'برچسب دکمه' },
  { nameFa: 'برچسب وضعیت خنثی', foreground: TOKENS.statusNeutralText, background: TOKENS.statusNeutralBg, required: AA_NORMAL_TEXT, noteFa: 'Badge' },
  { nameFa: 'برچسب وضعیت اطلاع', foreground: TOKENS.statusInfoText, background: TOKENS.statusInfoBg, required: AA_NORMAL_TEXT, noteFa: 'Badge و Alert' },
  { nameFa: 'برچسب وضعیت موفق', foreground: TOKENS.statusSuccessText, background: TOKENS.statusSuccessBg, required: AA_NORMAL_TEXT, noteFa: 'Badge و Alert' },
  { nameFa: 'برچسب وضعیت هشدار', foreground: TOKENS.statusWarningText, background: TOKENS.statusWarningBg, required: AA_NORMAL_TEXT, noteFa: 'Badge و Alert' },
  { nameFa: 'برچسب وضعیت خطا', foreground: TOKENS.statusErrorText, background: TOKENS.statusErrorBg, required: AA_NORMAL_TEXT, noteFa: 'Badge و Alert' },
  { nameFa: 'حلقه focus روی زمینه صفحه', foreground: TOKENS.focusRing, background: TOKENS.bgCanvas, required: AA_NON_TEXT, noteFa: 'نشانه غیرمتنی (۱.۴.۱۱)' },
  { nameFa: 'حلقه focus روی کارت', foreground: TOKENS.focusRing, background: TOKENS.bgSurface, required: AA_NON_TEXT, noteFa: 'نشانه غیرمتنی' },
  { nameFa: 'مرز برند روی کارت', foreground: TOKENS.borderBrand, background: TOKENS.bgSurface, required: AA_NON_TEXT, noteFa: 'مرز کنترل' },
];

export interface ContrastFinding extends ContrastPair {
  readonly ratio: number;
  readonly passes: boolean;
}

export const measurePairs = (): ContrastFinding[] =>
  CONTRAST_PAIRS.map((pair) => {
    const ratio = ratioOf(pair.foreground, pair.background);
    return { ...pair, ratio, passes: ratio >= pair.required };
  });
