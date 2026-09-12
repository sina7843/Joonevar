/**
 * Brand assets and reversal rules — Hamzist Design System handoff
 * (Figma 2GMJPgnnenGnr1zBN2yH5h), sections 04 Colorways, 05 App Icon & Favicon,
 * 06 Clear Space & Minimum Size and 08 Mono & Reversal Rules.
 *
 * Every file listed here is an official export used exactly as delivered: never
 * redrawn, recoloured, stretched or rescaled into another size. That last part
 * is why the favicon sizes are three separate files rather than one image the
 * browser scales: section 08 states that below 24px the mark ships as the
 * simplified single-ink glyph, because the interior detail muds together at
 * favicon sizes. A 16px favicon is therefore different artwork from a 48px one.
 *
 * The rules are stated here as data, next to the assets they govern, so a test
 * can check them instead of a document asserting them in prose.
 */

export interface BrandAsset {
  /** Public path, served from `public/`. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** The Design System node this file was exported from, so it can be re-checked. */
  readonly figmaNode: string;
}

/** Section 05: one artwork per size, not one image scaled three ways. */
export const FAVICONS: readonly BrandAsset[] = [
  { path: '/brand/favicon-16.png', width: 16, height: 16, figmaNode: '24:353' },
  { path: '/brand/favicon-32.png', width: 32, height: 32, figmaNode: '24:359' },
  { path: '/brand/favicon-48.png', width: 48, height: 48, figmaNode: '24:365' },
];

/** Section 05: iOS app icon, light appearance. */
export const APPLE_ICON: BrandAsset = {
  path: '/brand/app-icon-ios.png',
  width: 1024,
  height: 1024,
  figmaNode: '24:297',
};

/** Section 05: the square social avatar, used as the share image. */
export const SOCIAL_ICON: BrandAsset = {
  path: '/brand/app-icon-social.png',
  width: 512,
  height: 512,
  figmaNode: '24:321',
};

/** Section 02: the Persian horizontal lockup, the header mark. */
export const LOCKUP_FA: BrandAsset = {
  path: '/brand/logo-fa-horizontal.png',
  width: 334,
  height: 72,
  figmaNode: '14:2',
};

/** Section 01: the master symbol. */
export const SYMBOL: BrandAsset = {
  path: '/brand/logo-symbol.png',
  width: 144,
  height: 162,
  figmaNode: '4:21',
};

export const BRAND_ASSETS: readonly BrandAsset[] = [...FAVICONS, APPLE_ICON, SOCIAL_ICON, LOCKUP_FA, SYMBOL];

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
