import type { MetadataRoute } from 'next';
import { applicationPrefixes } from '../src/authz/routes.ts';
import { robotsFor } from '../src/seo/robots.ts';
import { site } from '../src/public/request.ts';

// Read at request time: production and non-production answer differently (DEC-0151).
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return robotsFor(site(), applicationPrefixes());
}
