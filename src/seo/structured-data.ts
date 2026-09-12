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
 * FAQ for a page that really shows those questions and answers (§19).
 *
 * Emitted only from the questions the page itself renders, so the structured
 * data can never promise an answer a visitor cannot read.
 */
export function faqLd(
  input: { path: string; questions: ReadonlyArray<{ question: string; answer: string }> },
  origin: string,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'fa-IR',
    url: absoluteUrl(origin, input.path),
    mainEntity: input.questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

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

/**
 * Person for a published veterinarian, working at each public location as a
 * VeterinaryCare (§19). Contact details appear only where the page shows them.
 */
export function vetPersonLd(
  input: {
    name: string;
    path: string;
    description: string | null;
    telephone: string | null;
    specialties: readonly string[];
    locations: ReadonlyArray<{
      name: string;
      city: string | null;
      province: string | null;
      address: string | null;
      telephone: string | null;
    }>;
  },
  origin: string,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: input.name,
    jobTitle: 'دامپزشک',
    url: absoluteUrl(origin, input.path),
    ...(input.description ? { description: input.description } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.specialties.length > 0 ? { knowsAbout: [...input.specialties] } : {}),
    ...(input.locations.length > 0
      ? {
          worksFor: input.locations.map((location) => ({
            '@type': 'VeterinaryCare',
            name: location.name,
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'IR',
              ...(location.province ? { addressRegion: location.province } : {}),
              ...(location.city ? { addressLocality: location.city } : {}),
              ...(location.address ? { streetAddress: location.address } : {}),
            },
            ...(location.telephone ? { telephone: location.telephone } : {}),
          })),
        }
      : {}),
  };
}

/**
 * VeterinaryCare for a published centre and its public branches (§19). Only
 * facts the centre actually recorded: no rating, no price and no opening hour
 * that was not announced.
 */
export function veterinaryCareLd(
  input: {
    name: string;
    path: string;
    description: string | null;
    telephone: string | null;
    website: string | null;
    branches: ReadonlyArray<{
      name: string;
      city: string | null;
      province: string | null;
      address: string | null;
      telephone: string | null;
      latitude: number | null;
      longitude: number | null;
      isOpen24h: boolean;
      hours: ReadonlyArray<{ weekday: number; opensAt: string; closesAt: string }>;
    }>;
  },
  origin: string,
): JsonLd {
  // schema.org day names, in the order the product stores them (Saturday = 0).
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const branch = (b: (typeof input.branches)[number]): JsonLd => ({
    '@type': 'VeterinaryCare',
    name: b.name,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IR',
      ...(b.province ? { addressRegion: b.province } : {}),
      ...(b.city ? { addressLocality: b.city } : {}),
      ...(b.address ? { streetAddress: b.address } : {}),
    },
    ...(b.telephone ? { telephone: b.telephone } : {}),
    ...(b.latitude !== null && b.longitude !== null ? { geo: { '@type': 'GeoCoordinates', latitude: b.latitude, longitude: b.longitude } } : {}),
    ...(b.isOpen24h
      ? { openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS, opens: '00:00', closes: '23:59' }] }
      : b.hours.length > 0
        ? {
            openingHoursSpecification: b.hours.map((hour) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: DAYS[hour.weekday],
              opens: hour.opensAt,
              closes: hour.closesAt,
            })),
          }
        : {}),
  });

  const [first, ...rest] = input.branches;
  return {
    '@context': 'https://schema.org',
    '@type': 'VeterinaryCare',
    name: input.name,
    url: absoluteUrl(origin, input.path),
    inLanguage: 'fa-IR',
    ...(input.description ? { description: input.description } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.website ? { sameAs: [input.website] } : {}),
    ...(first ? { address: (branch(first) as { address: unknown }).address } : {}),
    ...(rest.length > 0 ? { department: rest.map(branch) } : {}),
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
