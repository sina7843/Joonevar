import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, locked, toErrorBody, versionStale } from '../../src/domain/errors.ts';
import { parsePageRequest, pageOf, offsetOf, MAX_PAGE_SIZE } from '../../src/domain/pagination.ts';
import { resumeContext } from '../../src/domain/resume-context.ts';
import { ltrIsolate, newReferralCode, newSampleTrackingCode } from '../../src/domain/ids.ts';
import { canEnterContext, switchableContexts } from '../../src/authz/actor.ts';

test('a lock always carries reason, next prerequisite and CTA', () => {
  const error = locked({
    reason: 'برای دریافت شجره‌نامه ابتدا برگه ثبتی این حیوان باید صادر شود',
    nextPrerequisite: 'صدور برگه ثبتی',
    cta: { label: 'دریافت برگه ثبتی', href: '/registration/batch' },
  });
  const { status, body } = toErrorBody(error);
  assert.equal(status, 403);
  assert.equal(body.error.code, 'LOCKED');
  assert.equal(body.error.lock?.cta.href, '/registration/batch');
  assert.ok(body.error.lock?.nextPrerequisite);
});

test('an unexpected error leaks nothing', () => {
  const { status, body } = toErrorBody(new Error('connection to 10.0.0.5 failed: password authentication'));
  assert.equal(status, 500);
  assert.equal(body.error.message, 'Unexpected server error');
  assert.equal(body.error.code, 'INTERNAL');
});

test('a stale version approval is a distinct, reportable outcome', () => {
  const error = versionStale(2, 3);
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'VERSION_STALE');
  assert.deepEqual(error.detail, { expectedVersion: 2, actualVersion: 3 });
});

test('pagination has bounds and a stable offset', () => {
  assert.deepEqual(parsePageRequest(), { page: 1, pageSize: 20 });
  assert.equal(offsetOf(parsePageRequest({ page: 3, pageSize: 10 })), 20);
  assert.throws(() => parsePageRequest({ page: 0 }), /positive integer/);
  assert.throws(() => parsePageRequest({ pageSize: MAX_PAGE_SIZE + 1 }), /must not exceed/);
  const page = pageOf([1, 2], 5, { page: 1, pageSize: 2 });
  assert.equal(page.totalPages, 3);
  assert.equal(pageOf([], 0, { page: 1, pageSize: 2 }).totalPages, 0);
});

test('a resume context must point at the case and step, never at a list', () => {
  const context = resumeContext({
    entity: { type: 'VET_VISIT_REQUEST', id: 'r-1' },
    step: 'CHECK_IN',
    originRoute: '/requests/r-1',
  });
  assert.equal(context.step, 'CHECK_IN');
  assert.throws(
    () => resumeContext({ entity: { type: 'ANIMAL', id: 'a-1' }, step: 'x', originRoute: '/dashboard' }),
    /must point at the case/,
  );
  assert.throws(
    () => resumeContext({ entity: { type: 'ANIMAL', id: 'a-1' }, step: '', originRoute: '/animals/a-1' }),
    /requires a step/,
  );
});

test('referral and sample codes are distinct namespaces', () => {
  assert.match(newReferralCode(), /^HZ-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
  assert.match(newSampleTrackingCode(), /^SM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
  assert.notEqual(newReferralCode(), newReferralCode());
});

test('identifiers are isolated for RTL display without changing the value', () => {
  const isolated = ltrIsolate('HZ-ABC123');
  assert.ok(isolated.includes('HZ-ABC123'));
  assert.equal(isolated.codePointAt(0), 0x2068);
  assert.equal(isolated.codePointAt(isolated.length - 1), 0x2069);
});

test('the role switcher offers only active contexts and never an operational shell', () => {
  assert.deepEqual(switchableContexts([]), ['USER']);
  assert.deepEqual(switchableContexts(['BREEDER']), ['USER', 'BREEDER']);
  assert.deepEqual(switchableContexts(['TRUSTED_VET', 'BREEDER']), ['USER', 'BREEDER', 'TRUSTED_VET']);
  // A superadmin role does not add a slot to the public switcher (D10, D11).
  assert.deepEqual(switchableContexts(['SUPERADMIN']), ['USER']);
  assert.equal(canEnterContext([], 'TRUSTED_VET'), false);
  assert.equal(canEnterContext(['TRUSTED_VET'], 'TRUSTED_VET'), true);
  assert.equal(canEnterContext([], 'USER'), true);
});
