/**
 * Structured data (schema.org JSON-LD) — Requirements-Phase-2 §19.
 *
 * Only facts the platform actually holds are emitted: no contact point, social
 * profile, rating or address is added for the organisation until real data for
 * it exists. Entity types for vets, centres and articles are added by the
 * prompts that publish those records.
 */
import { SITE_IMAGE, SITE_NAME, absoluteUrl } from './metadata.ts';

// Built from code points: the literal characters are invisible and easily lost.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const BACKSLASH = String.fromCharCode(92);

export type JsonLd = Readonly<Record<string, unknown>>;

/**
 * Article / NewsArticle for one published piece (§19). The author is a Person
 * only when the author chose to show their name; otherwise the platform is the
 * author, exactly as the page itself signs it.
 */
export function articleLd(
  input: {
    type: 'Article' | 'NewsArticle';
    headline: string;
    description: string;
    path: string;
    datePublished: Date;
    dateModified: Date;
    authorName: string;
    authorIsPerson: boolean;
    imagePath: string | null;
  },
  origin: string,
): JsonLd {
  const url = absoluteUrl(origin, input.path);
  return {
    '@context': 'https://schema.org',
    '@type': input.type,
    headline: input.headline.slice(0, 110),
    description: input.description,
    inLanguage: 'fa-IR',
    url,
    mainEntityOfPage: url,
    datePublished: input.datePublished.toISOString(),
    dateModified: input.dateModified.toISOString(),
    author: input.authorIsPerson ? { '@type': 'Person', name: input.authorName } : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteUrl(origin, SITE_IMAGE.path) },
    },
    ...(input.imagePath ? { image: [absoluteUrl(origin, input.imagePath)] } : {}),
  };
}

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export function organizationLd(origin: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl(origin, '/'),
    logo: absoluteUrl(origin, SITE_IMAGE.path),
  };
}

export function websiteLd(origin: string): JsonLd {
  // No SearchAction: site search does not exist until PROMPT-012.
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl(origin, '/'),
    inLanguage: 'fa-IR',
  };
}

export function breadcrumbLd(crumbs: readonly Crumb[], origin: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(origin, crumb.path),
    })),
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is not safe there: a title containing `</script>` would
 * close the element and turn the rest of the value into markup. Every character
 * that can end the element or start an HTML construct is escaped, along with
 * the two line separators that break older JavaScript parsers.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR).join(BACKSLASH + 'u2028')
    .split(PARAGRAPH_SEPARATOR).join(BACKSLASH + 'u2029');
}
