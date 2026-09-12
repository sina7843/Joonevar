/**
 * Page metadata for the public site — Requirements-Phase-2 §19, §22.
 *
 * Every public page describes itself through `buildMetadata`, so the rules that
 * search engines see are decided once instead of per page:
 *
 *  - canonical, OpenGraph and Twitter URLs are absolute and built from the
 *    configured site origin, never from the request host (DEC-0150);
 *  - a query string or fragment never becomes canonical, so a filter or a
 *    tracking parameter cannot mint a second indexable copy of a page;
 *  - ARCHIVED stays reachable and followable but is not indexed;
 *  - DUPLICATE points its canonical at the record it duplicates and is not
 *    indexed, so a merge never leaves two competing results;
 *  - outside production nothing is indexed at all (DEC-0151).
 *
 * Pure: no environment, database or framework runtime, so it is tested directly.
 */
import type { Metadata } from 'next';

export const SITE_NAME = 'همزیست';

/** The official symbol from the Design System (`public/brand`, 144×162). */
export const SITE_IMAGE = { path: '/brand/logo-symbol.png', width: 144, height: 162 } as const;

export type IndexState = 'PUBLISHED' | 'ARCHIVED' | 'DUPLICATE';

export interface SiteContext {
  /** Origin only, e.g. `https://example.org` — see `siteUrl` in `src/config/env.ts`. */
  readonly origin: string;
  readonly production: boolean;
}

export interface PageSeo {
  readonly title: string;
  readonly description: string;
  /** Stable path of this page, starting with a single `/`. */
  readonly path: string;
  readonly state?: IndexState;
  /** Required for DUPLICATE: the path of the record this one duplicates. */
  readonly primaryPath?: string;
  readonly type?: 'website' | 'article';
  /**
   * A page that must never be indexed whatever its state: a search page is a
   * view of other pages, not a page of its own (§19).
   */
  readonly noindex?: boolean;
  /** The page's own image (a content image); otherwise the official symbol. */
  readonly image?: { readonly path: string; readonly alt: string };
}

export function absoluteUrl(origin: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('A page path must start with a single "/": ' + path);
  }
  const url = new URL(path, origin);
  url.search = '';
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

export function buildMetadata(page: PageSeo, site: SiteContext): Metadata {
  const title = page.title.trim();
  const description = page.description.trim();
  if (title === '' || description === '') {
    throw new Error('A public page needs a title and a description: ' + page.path);
  }

  const state = page.state ?? 'PUBLISHED';
  if (state === 'DUPLICATE' && !page.primaryPath) {
    throw new Error('A duplicate must name the record it duplicates: ' + page.path);
  }

  const canonical = absoluteUrl(site.origin, state === 'DUPLICATE' ? page.primaryPath! : page.path);
  const fullTitle = title.includes(SITE_NAME) ? title : title + ' | ' + SITE_NAME;
  const image = page.image
    ? { url: absoluteUrl(site.origin, page.image.path), alt: page.image.alt }
    : {
        url: absoluteUrl(site.origin, SITE_IMAGE.path),
        width: SITE_IMAGE.width,
        height: SITE_IMAGE.height,
        alt: SITE_NAME,
      };

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical },
    robots: { index: site.production && state === 'PUBLISHED' && page.noindex !== true, follow: site.production },
    openGraph: {
      type: page.type ?? 'website',
      locale: 'fa_IR',
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: canonical,
      images: [image],
    },
    twitter: { card: page.image ? 'summary_large_image' : 'summary', title: fullTitle, description, images: [image.url] },
  };
}
