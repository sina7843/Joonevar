/**
 * robots.txt rules — Requirements-Phase-2 §19, DEC-0151, DEC-0152.
 *
 * Outside production the whole site is closed to crawlers. In production the
 * signed-in application, the API and the development pages are disallowed; the
 * list of application prefixes comes from the route access map, so a new
 * application route is kept out of search without anyone remembering to.
 *
 * robots.txt matches by string prefix, so `Disallow: /vet` would also hide the
 * public `/veterinarians` directory. Each prefix is therefore written twice —
 * exact (`/vet$`) and as a folder (`/vet/`) — which keeps it from swallowing a
 * public section that merely starts with the same letters.
 */
import type { MetadataRoute } from 'next';
import { absoluteUrl, type SiteContext } from './metadata.ts';

const ALWAYS_CLOSED = ['/api', '/dev'];

export function robotsFor(site: SiteContext, applicationPrefixes: readonly string[]): MetadataRoute.Robots {
  if (!site.production) return { rules: [{ userAgent: '*', disallow: '/' }] };

  const disallow = [...ALWAYS_CLOSED, ...applicationPrefixes].flatMap((prefix) => [prefix + '$', prefix + '/']);
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: absoluteUrl(site.origin, '/sitemap.xml'),
  };
}

/** How a crawler reads one rule: `$` anchors the end, anything else is a prefix. */
export function robotsRuleMatches(rule: string, path: string): boolean {
  return rule.endsWith('$') ? path === rule.slice(0, -1) : path.startsWith(rule);
}
