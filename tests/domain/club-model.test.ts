/**
 * Club rules that need no database — Phase 2.5 PROMPT-012.
 *
 * The lifecycle table and the capability table are the whole authorization
 * story of a club, so they are pinned here: who may move a club where, what each
 * role may do, and the fact that publication alone never makes a club public.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUB_LIFECYCLE,
  CLUB_ROLES,
  assignableClubRoles,
  clubIsPublic,
  clubLifecycleMove,
  clubRoleAllows,
  clubSubmissionBlockers,
  isClubLifecycle,
  isClubRole,
} from '../../src/clubs/model.ts';

test('a club walks from draft to active only through the association', () => {
  assert.equal(clubLifecycleMove('DRAFT', 'PENDING_VERIFICATION', 'OWNER')?.by, 'CLUB');
  assert.equal(clubLifecycleMove('DRAFT', 'PENDING_VERIFICATION', 'ADMIN')?.by, 'CLUB');
  // Nobody inside the club verifies it, whatever role they hold.
  assert.equal(clubLifecycleMove('PENDING_VERIFICATION', 'ACTIVE', 'OWNER'), null);
  assert.equal(clubLifecycleMove('PENDING_VERIFICATION', 'ACTIVE', 'SYSTEM')?.by, 'AUTHORITY');
  assert.equal(clubLifecycleMove('PENDING_VERIFICATION', 'NEEDS_CORRECTION', 'SYSTEM')?.by, 'AUTHORITY');
  assert.equal(clubLifecycleMove('NEEDS_CORRECTION', 'PENDING_VERIFICATION', 'OWNER')?.by, 'CLUB');
  // And a draft cannot skip the queue.
  assert.equal(clubLifecycleMove('DRAFT', 'ACTIVE', 'SYSTEM'), null);
});

test('suspension belongs to the association and archiving keeps the record', () => {
  assert.equal(clubLifecycleMove('ACTIVE', 'SUSPENDED', 'OWNER'), null);
  assert.equal(clubLifecycleMove('ACTIVE', 'SUSPENDED', 'SYSTEM')?.by, 'AUTHORITY');
  assert.equal(clubLifecycleMove('SUSPENDED', 'ACTIVE', 'SYSTEM')?.by, 'AUTHORITY');
  assert.equal(clubLifecycleMove('ACTIVE', 'ARCHIVED', 'OWNER')?.by, 'CLUB');
  assert.equal(clubLifecycleMove('ACTIVE', 'ARCHIVED', 'MODERATOR'), null);
  // Archived is the end of the line, and rejection only reaches the archive.
  for (const to of CLUB_LIFECYCLE) assert.equal(clubLifecycleMove('ARCHIVED', to, 'SYSTEM'), null);
  assert.equal(clubLifecycleMove('REJECTED', 'ACTIVE', 'SYSTEM'), null);
  assert.equal(clubLifecycleMove('REJECTED', 'ARCHIVED', 'SYSTEM')?.by, 'AUTHORITY');
});

test('each role may do exactly what its rung allows', () => {
  assert.equal(clubRoleAllows('MEMBER', 'VIEW'), true);
  assert.equal(clubRoleAllows('MEMBER', 'PROFILE'), false);
  assert.equal(clubRoleAllows('MODERATOR', 'MODERATE'), true);
  assert.equal(clubRoleAllows('MODERATOR', 'ASSIGN_MEMBER'), false);
  assert.equal(clubRoleAllows('ADMIN', 'SUBMIT'), true);
  assert.equal(clubRoleAllows('ADMIN', 'TRANSFER'), false);
  assert.equal(clubRoleAllows('OWNER', 'TRANSFER'), true);
  // The association verifies and disciplines; it does not run somebody's club.
  assert.equal(clubRoleAllows('SYSTEM', 'AUTHORITY'), true);
  assert.equal(clubRoleAllows('SYSTEM', 'PROFILE'), false);
  assert.equal(clubRoleAllows('SYSTEM', 'TRANSFER'), false);
  // Nobody at all is not a role.
  for (const role of [...CLUB_ROLES, 'SYSTEM'] as const) assert.equal(clubRoleAllows(null, 'VIEW'), false, role);
});

test('nobody hands out ownership as if it were a role', () => {
  assert.deepEqual(assignableClubRoles('OWNER'), ['ADMIN', 'MODERATOR', 'MEMBER']);
  assert.deepEqual(assignableClubRoles('ADMIN'), ['MODERATOR', 'MEMBER']);
  assert.deepEqual(assignableClubRoles('MODERATOR'), []);
  assert.deepEqual(assignableClubRoles('SYSTEM'), []);
  assert.deepEqual(assignableClubRoles(null), []);
  assert.equal(assignableClubRoles('OWNER').includes('OWNER' as never), false);
});

test('a club is public only when it is both verified and published', () => {
  assert.equal(clubIsPublic({ lifecycle: 'ACTIVE', publicStatus: 'PUBLISHED' }), true);
  assert.equal(clubIsPublic({ lifecycle: 'PENDING_VERIFICATION', publicStatus: 'PUBLISHED' }), false);
  assert.equal(clubIsPublic({ lifecycle: 'SUSPENDED', publicStatus: 'PUBLISHED' }), false);
  assert.equal(clubIsPublic({ lifecycle: 'ACTIVE', publicStatus: 'HIDDEN' }), false);
  assert.equal(clubIsPublic({ lifecycle: 'ACTIVE', publicStatus: 'DRAFT' }), false);
});

test('a club is not sent for verification half-written', () => {
  assert.deepEqual(clubSubmissionBlockers({ aboutFa: 'معرفی', contact: '021', ownedByAccount: true }), []);
  assert.equal(clubSubmissionBlockers({ aboutFa: '  ', contact: '021', ownedByAccount: true }).length, 1);
  assert.equal(clubSubmissionBlockers({ aboutFa: null, contact: null, ownedByAccount: false }).length, 3);
});

test('the guards refuse anything that is not one of the listed values', () => {
  assert.equal(isClubLifecycle('ACTIVE'), true);
  assert.equal(isClubLifecycle('active'), false);
  assert.equal(isClubLifecycle(undefined), false);
  assert.equal(isClubRole('OWNER'), true);
  assert.equal(isClubRole('SYSTEM'), false);
});
