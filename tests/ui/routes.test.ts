import test from 'node:test';
import assert from 'node:assert/strict';
import { accessForRoute, assertRouteAccess, canAccessRoute, selectContext, type RouteAccess } from '../../src/authz/routes.ts';
import { switchableContexts, type Actor, type AccountRoleName, type ActorContextName } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const actor = (context: ActorContextName, activeRoles: readonly AccountRoleName[] = []): Actor => ({
  accountId: 'acc-1' as AccountId,
  context,
  activeRoles,
});

test('unlisted routes are closed by default', () => {
  assert.deepEqual(accessForRoute('/some/new/page'), []);
  assert.equal(canAccessRoute(actor('SUPERADMIN', ['SUPERADMIN']), '/some/new/page'), false);
});

test('only the status page, sign-in and health are open', () => {
  assert.equal(accessForRoute('/'), 'PUBLIC');
  assert.equal(accessForRoute('/login'), 'PUBLIC');
  assert.equal(accessForRoute('/api/health'), 'PUBLIC');
  assert.equal(canAccessRoute(null, '/'), true);
  assert.equal(canAccessRoute(null, '/dashboard'), false);
});

test('an anonymous visitor cannot reach any application route', () => {
  for (const path of ['/dashboard', '/animals/abc', '/vet', '/assoc', '/genetics', '/admin', '/kennels']) {
    assert.equal(canAccessRoute(null, path), false, path + ' must not be anonymous');
    assert.throws(() => assertRouteAccess(null, path), /Sign-in required/);
  }
});

test('the operational shells are separate and are not reachable by switching a public role', () => {
  const superadmin = actor('SUPERADMIN', ['SUPERADMIN']);
  assert.equal(canAccessRoute(superadmin, '/admin'), true);
  assert.equal(canAccessRoute(superadmin, '/admin/settings/fees'), true);
  assert.equal(canAccessRoute(superadmin, '/assoc'), false);
  assert.equal(canAccessRoute(superadmin, '/genetics'), false);

  // The same account acting as an ordinary user does not keep the shell.
  assert.equal(canAccessRoute(actor('USER', ['SUPERADMIN']), '/admin'), false);
  assert.equal(canAccessRoute(actor('USER', ['ASSOCIATION_OPERATOR']), '/assoc'), false);

  const association = actor('ASSOCIATION_OPERATOR', ['ASSOCIATION_OPERATOR']);
  assert.equal(canAccessRoute(association, '/assoc/foreign-pedigree'), true);
  assert.equal(canAccessRoute(association, '/genetics/results'), false);
  assert.equal(canAccessRoute(association, '/admin'), false);

  const genetics = actor('GENETICS_OPERATOR', ['GENETICS_OPERATOR']);
  assert.equal(canAccessRoute(genetics, '/genetics/receipts'), true);
  assert.equal(canAccessRoute(genetics, '/assoc'), false);
});

test('a context cannot be entered without the matching active role', () => {
  // Claiming a context in the request is not enough; the role must be active.
  assert.equal(canAccessRoute(actor('TRUSTED_VET', []), '/vet'), false);
  assert.equal(canAccessRoute(actor('TRUSTED_VET', ['TRUSTED_VET']), '/vet'), true);
  assert.equal(canAccessRoute(actor('BREEDER', ['BREEDER']), '/kennels'), true);
  assert.equal(canAccessRoute(actor('SUPERADMIN', []), '/admin'), false);
});

test('the vet panel is not part of the ordinary user surface', () => {
  const user = actor('USER');
  assert.equal(canAccessRoute(user, '/dashboard'), true);
  assert.equal(canAccessRoute(user, '/animals/abc'), true);
  assert.equal(canAccessRoute(user, '/vet'), false);
  assert.equal(canAccessRoute(user, '/vet/checkin'), false);

  const vet = actor('TRUSTED_VET', ['TRUSTED_VET']);
  assert.equal(canAccessRoute(vet, '/vet/samples'), true);
  assert.equal(canAccessRoute(vet, '/dashboard'), true);
});

test('becoming a breeder starts from the user context, and so does the kennel', () => {
  const user = actor('USER');
  assert.equal(canAccessRoute(user, '/breeder/activate'), true);
  // The breeder environment itself still needs the role.
  assert.equal(canAccessRoute(user, '/breeder'), false);
  // Registering a kennel does not: the role is what approval produces (§15.2).
  assert.equal(canAccessRoute(user, '/kennels'), true);
  assert.equal(canAccessRoute(user, '/kennels/abc'), true);

  const breeder = actor('BREEDER', ['BREEDER']);
  assert.equal(canAccessRoute(breeder, '/kennels/abc'), true);
  assert.equal(canAccessRoute(breeder, '/breeder'), true);
});

test('the longest matching prefix wins', () => {
  assert.deepEqual(accessForRoute('/breeder/activate'), ['USER', 'BREEDER']);
  assert.deepEqual(accessForRoute('/breeder'), ['BREEDER']);
  // A different route that merely starts with the same letters is not matched.
  assert.deepEqual(accessForRoute('/breeders'), []);
  assert.deepEqual(accessForRoute('/vets/finder'), ['USER', 'BREEDER', 'TRUSTED_VET']);
  assert.deepEqual(accessForRoute('/vet'), ['TRUSTED_VET']);
});

// Phase 2 boundary (DEC-0144). The public portal is built beside Phase 1, not on
// top of it: every Phase 1 prefix keeps exactly the access it shipped with, so a
// public page can never be opened by re-using, say, `/vets` or `/documents`.
const APP = ['USER', 'BREEDER', 'TRUSTED_VET'] as const;
const PHASE_1_ROUTES: Record<string, RouteAccess> = {
  '/': 'PUBLIC',
  '/login': 'PUBLIC',
  '/api/health': 'PUBLIC',
  '/dashboard': APP,
  '/notifications': APP,
  '/profile': APP,
  '/account': APP,
  '/membership': APP,
  '/animals': APP,
  '/requests': APP,
  '/registration': APP,
  '/pedigree': APP,
  '/vets': APP,
  '/declaration': APP,
  '/documents': APP,
  '/breeder/activate': ['USER', 'BREEDER'],
  '/breeder': ['BREEDER'],
  '/kennels': ['USER', 'BREEDER'],
  '/mating': ['USER', 'BREEDER'],
  '/puppy-cards': ['USER', 'BREEDER'],
  '/litters': ['USER', 'BREEDER'],
  '/vet': ['TRUSTED_VET'],
  '/assoc': ['ASSOCIATION_OPERATOR'],
  '/genetics': ['GENETICS_OPERATOR'],
  '/admin': ['SUPERADMIN'],
};

test('Phase 1 route access is pinned, including everything beneath each prefix', () => {
  for (const [prefix, access] of Object.entries(PHASE_1_ROUTES)) {
    assert.deepEqual(accessForRoute(prefix), access, prefix);
    if (prefix !== '/') assert.deepEqual(accessForRoute(prefix + '/some-id'), access, prefix + '/some-id');
  }
});

test('the reserved Phase 2 public namespace never inherits a Phase 1 rule', () => {
  const reserved = [
    '/veterinarians',
    '/centers',
    '/breeds',
    '/articles',
    '/news',
    '/announcements',
    '/associations',
    '/clubs',
    '/verify',
    '/services',
    '/about',
    '/search',
  ];
  for (const prefix of reserved) {
    assert.ok(!Object.keys(PHASE_1_ROUTES).includes(prefix), prefix + ' is a Phase 1 prefix');
    for (const path of [prefix, prefix + '/some-slug']) {
      const access = accessForRoute(path);
      // Closed until its own prompt opens it, or public once it has — never a Phase 1 context list.
      assert.ok(access === 'PUBLIC' || access.length === 0, path + ' falls under a Phase 1 rule');
    }
  }
});

test('trailing slashes and query strings do not change the decision', () => {
  assert.equal(canAccessRoute(actor('USER'), '/dashboard/'), true);
  assert.equal(canAccessRoute(actor('USER'), '/dashboard?tab=requests'), true);
  assert.equal(canAccessRoute(actor('USER'), '/admin/'), false);
  assert.equal(canAccessRoute(actor('USER'), '/admin?x=1'), false);
});

test('the role switcher never offers an operational context', () => {
  assert.deepEqual(switchableContexts(['SUPERADMIN', 'ASSOCIATION_OPERATOR', 'GENETICS_OPERATOR']), ['USER']);
  assert.deepEqual(switchableContexts(['BREEDER', 'SUPERADMIN']), ['USER', 'BREEDER']);
  assert.deepEqual(switchableContexts(['TRUSTED_VET']), ['USER', 'TRUSTED_VET']);
});

test('the denial names the context and the path without leaking anything else', () => {
  assert.throws(
    () => assertRouteAccess(actor('USER', ['SUPERADMIN']), '/admin/settings'),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('USER') &&
      error.message.includes('/admin/settings'),
  );
});

test('the guard picks a context the account already holds and never invents one', () => {
  // An association operator visiting the public app is served as an ordinary user.
  assert.equal(
    selectContext(actor('ASSOCIATION_OPERATOR', ['ASSOCIATION_OPERATOR']), ['USER', 'BREEDER', 'TRUSTED_VET']),
    'USER',
  );
  // The same person visiting their shell URL enters the operational context.
  assert.equal(
    selectContext(actor('USER', ['ASSOCIATION_OPERATOR']), ['ASSOCIATION_OPERATOR']),
    'ASSOCIATION_OPERATOR',
  );
  // An account without the role gets nothing to select, so the route is denied.
  assert.equal(selectContext(actor('USER', []), ['ASSOCIATION_OPERATOR']), null);
  assert.equal(selectContext(actor('USER', ['BREEDER']), ['SUPERADMIN']), null);
  // The current context wins when it is already allowed.
  assert.equal(selectContext(actor('BREEDER', ['BREEDER']), ['USER', 'BREEDER']), 'BREEDER');
});
