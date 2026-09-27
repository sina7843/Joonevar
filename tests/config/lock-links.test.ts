/**
 * Every "next step" link a locked service offers leads to a page that exists.
 *
 * Two of them pointed at routes that were never built (`/pedigree/request`,
 * `/registration/batch`); the first one even reached a dynamic page that read
 * "request" as an animal id and failed as a server error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as locks from '../../src/domain/eligibility/locks.ts';

/** True when app/ has a page for this path, counting route groups and dynamic segments. */
function pageExists(route: string): boolean {
  const segments = route.split('?')[0]!.split('/').filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // A route group like (public) adds no segment.
    for (const group of entries.filter((e) => /^\(.*\)$/.test(e.name))) if (walk(path.join(dir, group.name), rest)) return true;
    if (rest.length === 0) return fs.existsSync(path.join(dir, 'page.tsx'));
    const [head, ...tail] = rest;
    // A literal folder wins; a dynamic one is a fallback, which is exactly how
    // /pedigree/request ended up at /pedigree/[animalId], so it does not count.
    return entries.some((e) => e.name === head) && walk(path.join(dir, head!), tail);
  };
  return walk('app', segments);
}

test('every lock call-to-action points at a page that exists as a literal route', () => {
  const ctas = (Object.values(locks) as unknown[])
    .filter((value): value is { cta: { href: string } } => typeof value === 'object' && value !== null && 'cta' in value)
    .map((lock) => lock.cta.href);
  assert.ok(ctas.length >= 5);
  for (const href of ctas) assert.ok(pageExists(href), href + ' has no page');
});
