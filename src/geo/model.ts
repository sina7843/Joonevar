/**
 * Geography, local pages and the map — Requirements-Phase-2 §2, §19, §20
 * (PROMPT-015).
 *
 * Three rules live here: how a city becomes a stable address, when a local page
 * is worth indexing, and when a place may be shown on a map at all. The last
 * one is a privacy rule before it is a feature: a location that its owner has
 * not made public is never drawn, never linked and never named.
 */

/** Zero-width non-joiner: a Persian word break that must not become a letter. */
const ZWNJ = String.fromCharCode(0x200c);

/**
 * The address a city is published at.
 *
 * The Persian name with its word breaks turned into hyphens. It stays Persian
 * on purpose: the sources carry no romanised city list, and inventing one would
 * bake a made-up name into a permanent URL (DEC-0175). Persian slugs are
 * already served elsewhere on this site, percent-encoded in the address.
 */
export function citySlug(nameFa: string): string {
  return (nameFa ?? '')
    .trim()
    .replace(new RegExp('[\\s' + ZWNJ + ']+', 'g'), '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export const placePath = (provinceCode: string, citySlugValue?: string | null): string =>
  '/places/' + provinceCode + (citySlugValue ? '/' + citySlugValue : '');

export interface PlaceCounts {
  readonly vets: number;
  readonly centres: number;
  readonly communities: number;
}

export const placeTotal = (counts: PlaceCounts): number => counts.vets + counts.centres + counts.communities;

/**
 * §19: «صفحات کم‌محتوا … index نمی‌شوند».
 *
 * A place page exists for every province and city — a visitor may always ask —
 * but it is offered to search engines only once it actually lists something.
 */
export const isIndexablePlace = (counts: PlaceCounts): boolean => placeTotal(counts) > 0;

export type MapState =
  /** No map service is configured, so no map is drawn and the address stays as text. */
  | 'NO_PROVIDER'
  /** The location is not published by its owner: nothing about it is shown (§20). */
  | 'NOT_PUBLIC'
  /** Published, but nobody recorded where it is. */
  | 'NO_COORDINATES'
  | 'VISIBLE';

/**
 * Whether this place may be drawn on a map.
 *
 * Order matters: a location that is not public fails before the question of
 * coordinates is even asked, so a private address can never reach a map URL.
 */
export function mapState(input: {
  readonly providerConfigured: boolean;
  readonly isPublic: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
}): MapState {
  if (!input.isPublic) return 'NOT_PUBLIC';
  if (!input.providerConfigured) return 'NO_PROVIDER';
  if (input.latitude === null || input.longitude === null) return 'NO_COORDINATES';
  return 'VISIBLE';
}

export const MAP_STATE_FA: Record<Exclude<MapState, 'VISIBLE' | 'NOT_PUBLIC'>, string> = {
  NO_PROVIDER: 'نقشه هنوز پیکربندی نشده است؛ نشانی اعلام‌شده در متن آمده است.',
  NO_COORDINATES: 'مختصاتی برای این محل ثبت نشده است.',
};

/**
 * Fill an operator-supplied embed template.
 *
 * The provider's URL is never guessed here: the superadmin records a template
 * with `{lat}`, `{lng}` and `{key}` placeholders, and this only substitutes
 * them. Any other placeholder is left alone, and a template that does not ask
 * for coordinates is refused — a map of nowhere is worse than no map.
 */
export function mapEmbedUrl(template: string, input: { latitude: number; longitude: number; apiKey: string | null }): string | null {
  const text = (template ?? '').trim();
  if (text === '' || !text.startsWith('https://')) return null;
  if (!text.includes('{lat}') || !text.includes('{lng}')) return null;
  return text
    .replaceAll('{lat}', String(input.latitude))
    .replaceAll('{lng}', String(input.longitude))
    .replaceAll('{key}', encodeURIComponent(input.apiKey ?? ''));
}

/**
 * What a visitor may read about where a place is.
 *
 * A street address belongs to the record only while its owner publishes it;
 * everything else keeps the city, which the directory already shows (§20).
 */
export function publicAddress(input: { isPublic: boolean; addressFa: string | null }): string | null {
  if (!input.isPublic) return null;
  const value = (input.addressFa ?? '').trim();
  return value === '' ? null : value;
}

/** Coordinates a page may print, rounded to the precision a public map needs. */
export function publicCoordinates(input: {
  isPublic: boolean;
  latitude: number | null;
  longitude: number | null;
}): { latitude: number; longitude: number } | null {
  if (!input.isPublic || input.latitude === null || input.longitude === null) return null;
  return { latitude: Number(input.latitude.toFixed(5)), longitude: Number(input.longitude.toFixed(5)) };
}
