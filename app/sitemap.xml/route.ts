import { SITEMAP_SECTIONS, XML_HEADERS, sitemapIndexXml } from '../../src/seo/sitemap.ts';
import { site } from '../../src/public/request.ts';

export const dynamic = 'force-dynamic';

/** Sitemap index: one entry per section (DEC-0152). */
export function GET(): Response {
  return new Response(sitemapIndexXml(Object.keys(SITEMAP_SECTIONS), site().origin), { headers: XML_HEADERS });
}
