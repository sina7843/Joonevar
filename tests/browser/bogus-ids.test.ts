/**
 * Every dynamic page answers a bad id as "not found", never as a server error.
 *
 * A link to `/pedigree/request` reached `/pedigree/[animalId]`, which handed
 * "request" to a uuid column and failed with a 500 — and 23 other pages did the
 * same. This walks every dynamic route under app/ with a segment that is not an
 * id and with a well-formed id that does not exist, as a signed-in user, the
 * superadmin and the operator the route belongs to, and asserts no 5xx.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/db/client.ts';
import { createSession, revokeSession } from '../../src/identity/session.ts';
import type { ActorContextName } from '../../src/authz/actor.ts';
import { BASE_URL, DATABASE_URL } from './support.ts';

/** Dev fixture accounts (src/db/seed/dev-fixtures.ts) and the context each route family needs. */
const WHO: Record<string, [string, ActorContextName]> = {
  USER: ['09990000001', 'USER'],
  SUPERADMIN: ['09990000006', 'SUPERADMIN'],
  ASSOC: ['09990000004', 'ASSOCIATION_OPERATOR'],
  GEN: ['09990000005', 'GENETICS_OPERATOR'],
  VET: ['09990000003', 'TRUSTED_VET'],
  REVIEW: ['09990000009', 'REVIEW_OPERATOR'],
  CONTENT: ['09990000008', 'CONTENT_ADMIN'],
  AUTHOR: ['09990000007', 'AUTHOR'],
};
const familyOf = (route: string): string =>
  route.startsWith('/assoc') ? 'ASSOC'
  : route.startsWith('/genetics') ? 'GEN'
  : route.startsWith('/vet/') ? 'VET'
  : route.startsWith('/review') ? 'REVIEW'
  : route.startsWith('/content') ? 'CONTENT'
  : route.startsWith('/author') ? 'AUTHOR'
  : route.startsWith('/admin') || route.startsWith('/market') ? 'SUPERADMIN'
  : 'USER';

function dynamicRoutes(dir = 'app', prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const segment = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
    const route = prefix + segment;
    const full = path.join(dir, entry.name);
    if (/\[.+\]/.test(route) && (fs.existsSync(path.join(full, 'page.tsx')) || fs.existsSync(path.join(full, 'route.ts')))) out.push(route);
    out.push(...dynamicRoutes(full, route));
  }
  // Generated documents and sitemaps take a kind or a file name, not a record id.
  return out.filter((r) => !r.startsWith('/api/documents') && !r.startsWith('/sitemaps'));
}

const tokens = new Map<string, { token: string; sessionId: string }>();
let handle: ReturnType<typeof createDatabase>;

before(async () => {
  handle = createDatabase(DATABASE_URL);
  for (const [key, [mobile, context]] of Object.entries(WHO)) {
    const [row] = (await handle.db.execute<{ id: string }>(sql`select id from account where mobile = ${mobile}`)).rows;
    if (!row) continue; // a fixture that is not seeded here is simply not exercised
    const session = await createSession(handle.db, row.id, context);
    tokens.set(key, { token: session.token, sessionId: session.sessionId });
  }
});

after(async () => {
  for (const { sessionId } of tokens.values()) await revokeSession(handle.db, sessionId);
  await handle?.pool.end();
});

test('no dynamic page or route answers a bad or unknown id with a server error', async () => {
  const routes = dynamicRoutes();
  assert.ok(routes.length > 50, 'found ' + routes.length + ' dynamic routes');
  const failures: string[] = [];
  for (const route of routes) {
    for (const fake of ['request', '00000000-0000-4000-8000-000000000000']) {
      const url = route.replace(/\[[^\]]+\]/g, fake);
      for (const who of new Set([familyOf(route), 'USER', 'SUPERADMIN'])) {
        const session = tokens.get(who);
        const response = await fetch(BASE_URL + url, { headers: session ? { cookie: 'hz_session=' + session.token } : {}, redirect: 'manual' });
        if (response.status >= 500) failures.push(response.status + ' ' + url + ' as ' + who);
      }
    }
  }
  assert.deepEqual(failures, []);
});
