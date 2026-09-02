import test from 'node:test';
import assert from 'node:assert/strict';
import { accessForRoute, assertRouteAccess, canAccessRoute } from '../../src/authz/routes.ts';
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
  assert.equal(canAccessRoute(actor('BREEDER', []), '/kennels'), false);
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

test('becoming a breeder starts from the user context but kennels need the role', () => {
  const user = actor('USER');
  assert.equal(canAccessRoute(user, '/breeder/activate'), true);
  assert.equal(canAccessRoute(user, '/breeder'), false);
  assert.equal(canAccessRoute(user, '/kennels'), false);
  assert.equal(canAccessRoute(user, '/kennels/new'), false);

  const breeder = actor('BREEDER', ['BREEDER']);
  assert.equal(canAccessRoute(breeder, '/kennels/new'), true);
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
