/**
 * Segmented sitemap — Requirements-Phase-2 §19.
 *
 * `/sitemap.xml` is an index of one `urlset` per section at
 * `/sitemaps/<section>.xml`. Each content prompt adds its own section here
 * (breeds, veterinarians, centres, articles…) listing only published records.
 *
 * `lastmod` is written only when a real modification time exists; a static page
 * has none, and a made-up date would tell crawlers something untrue.
 */
import { absoluteUrl } from './metadata.ts';
import { liveSections } from '../public/sections.ts';
import { db } from '../db/client.ts';
import { breedSitemapEntries } from '../breeds/service.ts';
import { contentSitemapEntries } from '../content/service.ts';
import { vetSitemapEntries } from '../vets/directory.ts';
import { centreSitemapEntries } from '../centres/service.ts';

export interface SitemapEntry {
  readonly path: string;
  readonly lastModified?: Date;
}

export const SITEMAP_SECTIONS: Readonly<Record<string, () => Promise<readonly SitemapEntry[]>>> = {
  pages: async () => liveSections().map((section) => ({ path: section.href })),
  // Published directory profiles of accounts that are not disabled (PROMPT-006).
  veterinarians: () => vetSitemapEntries(db()),
  // Published centres of accounts that are not disabled (PROMPT-008).
  centers: () => centreSitemapEntries(db()),
  // Published, unmerged breed pages with their real modification time (PROMPT-003).
  breeds: () => breedSitemapEntries(db()),
  // Visible content only; scheduled, hidden, archived and deleted items are left out (PROMPT-004).
  articles: () => contentSitemapEntries(db(), 'ARTICLE'),
  news: () => contentSitemapEntries(db(), 'NEWS'),
  announcements: () => contentSitemapEntries(db(), 'ANNOUNCEMENT'),
};

export function sitemapSection(id: string): (() => Promise<readonly SitemapEntry[]>) | null {
  return Object.hasOwn(SITEMAP_SECTIONS, id) ? SITEMAP_SECTIONS[id]! : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export function sitemapIndexXml(sectionIds: readonly string[], origin: string): string {
  const items = sectionIds
    .map((id) => '  <sitemap><loc>' + escapeXml(absoluteUrl(origin, '/sitemaps/' + id + '.xml')) + '</loc></sitemap>')
    .join('\n');
  return HEADER + '<sitemapindex xmlns="' + NS + '">\n' + items + '\n</sitemapindex>\n';
}

export function urlSetXml(entries: readonly SitemapEntry[], origin: string): string {
  const items = entries
    .map((entry) => {
      const lastmod = entry.lastModified ? '<lastmod>' + entry.lastModified.toISOString() + '</lastmod>' : '';
      return '  <url><loc>' + escapeXml(absoluteUrl(origin, entry.path)) + '</loc>' + lastmod + '</url>';
    })
    .join('\n');
  return HEADER + '<urlset xmlns="' + NS + '">\n' + items + '\n</urlset>\n';
}

export const XML_HEADERS = { 'content-type': 'application/xml; charset=utf-8' } as const;
