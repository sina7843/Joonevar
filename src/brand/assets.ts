/**
 * Brand assets and reversal rules — Hamzist Design System v1.0.3, *Brand*
 * (docs/design-system/design-system/brand.md, DEC-0225).
 *
 * Every file listed here is the system's delivered file, copied byte for byte
 * under its stable name: never redrawn, recoloured, stretched or rescaled. The
 * favicon sizes are three separate files because below 24px the mark is
 * different artwork. The rules are data so a test can check them.
 */

export interface BrandAsset {
  /** Public path, served from `public/`. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** Where this file sits in the design system package, so it can be re-checked. */
  readonly source: string;
}

const DS = 'docs/design-system/design-system/assets/brand/';

/** Brand › Files: one artwork per favicon size, not one image scaled three ways. */
export const FAVICONS: readonly BrandAsset[] = [
  { path: '/brand/favicon/favicon-16.png', width: 16, height: 16, source: DS + 'favicon/favicon-16.png' },
  { path: '/brand/favicon/favicon-32.png', width: 32, height: 32, source: DS + 'favicon/favicon-32.png' },
  { path: '/brand/favicon/favicon-48.png', width: 48, height: 48, source: DS + 'favicon/favicon-48.png' },
];

/** App icon option A (approved 11 Mehr 1405): the iOS touch icon. */
export const APPLE_ICON: BrandAsset = {
  path: '/brand/app-icon/apple-touch-icon-180.png',
  width: 180,
  height: 180,
  source: DS + 'app-icon/A/apple-touch-icon-180.png',
};

/** App icon option A at install sizes (web manifest). */
export const PWA_ICONS: readonly BrandAsset[] = [
  { path: '/brand/app-icon/pwa-192.png', width: 192, height: 192, source: DS + 'app-icon/A/pwa-192.png' },
  { path: '/brand/app-icon/pwa-512.png', width: 512, height: 512, source: DS + 'app-icon/A/pwa-512.png' },
];
export const PWA_MASKABLE: BrandAsset = {
  path: '/brand/app-icon/pwa-maskable-512.png',
  width: 512,
  height: 512,
  source: DS + 'app-icon/A/pwa-maskable-512.png',
};

/** The share image (OpenGraph), 1200×630. */
export const SOCIAL_ICON: BrandAsset = {
  path: '/brand/social/og-1200x630.png',
  width: 1200,
  height: 630,
  source: DS + 'social/og-1200x630.png',
};

/** The Persian horizontal lockup, the header mark. */
export const LOCKUP_FA: BrandAsset = {
  path: '/brand/logo/lockup-horizontal-fa-light.svg',
  width: 415.92,
  height: 92,
  source: DS + 'logo/lockup-horizontal-fa-light.svg',
};

/** The master symbol. */
export const SYMBOL: BrandAsset = {
  path: '/brand/logo/symbol.svg',
  width: 144,
  height: 162,
  source: DS + 'logo/symbol.svg',
};

export const BRAND_ASSETS: readonly BrandAsset[] = [
  ...FAVICONS,
  APPLE_ICON,
  ...PWA_ICONS,
  PWA_MASKABLE,
  SOCIAL_ICON,
  LOCKUP_FA,
  SYMBOL,
];

/** Manifest colours (Brand › app-icon): both follow the cream chrome. */
export const THEME_COLOR = '#FFFCF8';

export type BrandTone = 'FULL_COLOR' | 'MONO_INK' | 'MONO_LIGHT';
export type BrandSurface = 'LIGHT' | 'DARK';

export interface ReversalRule {
  readonly tone: BrandTone;
  readonly surface: BrandSurface;
  readonly allowed: boolean;
  readonly noteFa: string;
}

/**
 * Section 08, verbatim: one mark is one ink, interior detail is a knockout, and
 * the mark never sits on a surface within one step of its own value.
 */
export const REVERSAL_RULES: readonly ReversalRule[] = [
  { tone: 'FULL_COLOR', surface: 'LIGHT', allowed: true, noteFa: 'مجاز' },
  { tone: 'FULL_COLOR', surface: 'DARK', allowed: true, noteFa: 'مجاز؛ نارنجی برند روی تیره می‌ماند' },
  { tone: 'MONO_INK', surface: 'LIGHT', allowed: true, noteFa: 'مجاز؛ باید حداقل کنتراست ۳:۱ را رد کند' },
  { tone: 'MONO_LIGHT', surface: 'DARK', allowed: true, noteFa: 'مجاز؛ باید حداقل کنتراست ۳:۱ را رد کند' },
  { tone: 'MONO_INK', surface: 'DARK', allowed: false, noteFa: 'ممنوع؛ سیلوئت ناپدید می‌شود' },
  { tone: 'MONO_LIGHT', surface: 'LIGHT', allowed: false, noteFa: 'ممنوع؛ سیلوئت ناپدید می‌شود' },
];

/**
 * What the product actually renders.
 *
 * `app/globals.css` declares `color-scheme: light` and defines no dark palette,
 * so there is one surface and the header carries the full-colour lockup. If a
 * dark surface is ever introduced, this constant moves with it and the pairing
 * test below starts guarding the new combination.
 */
export const PRODUCT_SURFACE: BrandSurface = 'LIGHT';
export const PRODUCT_TONE: BrandTone = 'FULL_COLOR';

export function isAllowedPairing(tone: BrandTone, surface: BrandSurface): boolean {
  return REVERSAL_RULES.some((rule) => rule.tone === tone && rule.surface === surface && rule.allowed);
}

/** Section 08: the mark is a non-text element, so WCAG's non-text ratio applies. */
export const MIN_MARK_CONTRAST = 3;
