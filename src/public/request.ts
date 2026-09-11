/**
 * Request-scoped values for public pages.
 *
 * The header, the page and its metadata may all ask who is signed in; `cache`
 * resolves the session once per request instead of once per component.
 */
import { cache } from 'react';
import { db } from '../db/client.ts';
import { currentActor } from '../authz/request-actor.ts';
import { env, isProduction, siteUrl } from '../config/env.ts';
import type { SiteContext } from '../seo/metadata.ts';

export const viewer = cache(() => currentActor(db()));

export function site(): SiteContext {
  const current = env();
  return { origin: siteUrl(current), production: isProduction(current) };
}
