/**
 * Merging duplicate records — Phase 2 PROMPT-016.
 *
 * The pure half of §21: which merges are refused, and in what order an operator
 * is told why. The rules exist so a redirect is never more than one hop and a
 * merge is always explainable afterwards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUPLICATE_NOTICE_FA,
  MERGE_KINDS,
  MERGE_KIND_FA,
  MERGE_KIND_PATH,
  isMergeKind,
  mergeProblem,
  primaryPathOf,
} from '../../src/admin/merge-model.ts';

const ok = {
  duplicateId: 'a1',
  primaryId: 'b2',
  duplicateAlreadyMerged: false,
  primaryAlreadyMerged: false,
  duplicateHasDependents: false,
  reason: 'دو رکورد یک مرکزند',
};

test('the three directories of §21 each know their kind and their public address', () => {
  assert.deepEqual([...MERGE_KINDS], ['VET', 'CENTRE', 'COMMUNITY']);
  for (const kind of MERGE_KINDS) {
    assert.ok(MERGE_KIND_FA[kind].trim() !== '', kind);
    assert.match(MERGE_KIND_PATH[kind], /^\/[a-z]+\/$/, kind);
  }
  assert.equal(isMergeKind('VET'), true);
  assert.equal(isMergeKind('BREED'), false, 'the breed bank has its own merge since PROMPT-003');
  assert.equal(isMergeKind(null), false);
  assert.equal(primaryPathOf('CENTRE', 'centre-0123456789'), '/centers/centre-0123456789');
});

test('a valid merge passes, and a record is never its own duplicate', () => {
  assert.equal(mergeProblem(ok), null);
  assert.match(mergeProblem({ ...ok, primaryId: ok.duplicateId }) ?? '', /تکراریِ خودش/);
});

test('a redirect never grows a second hop', () => {
  // Already a duplicate: merging it again would chain two redirects.
  assert.match(mergeProblem({ ...ok, duplicateAlreadyMerged: true }) ?? '', /پیش‌تر/);
  // The chosen primary is itself a duplicate: the operator must pick the real one.
  assert.match(mergeProblem({ ...ok, primaryAlreadyMerged: true }) ?? '', /رکورد اصلیِ آن/);
  // Something already points here, so this record cannot start pointing elsewhere.
  assert.match(mergeProblem({ ...ok, duplicateHasDependents: true }) ?? '', /رکورد دیگری/);
});

test('identity is reported before policy, and a reason is always required', () => {
  // Both wrong: the operator hears the mistake, not the policy.
  assert.match(
    mergeProblem({ ...ok, primaryId: ok.duplicateId, duplicateAlreadyMerged: true }) ?? '',
    /تکراریِ خودش/,
  );
  assert.match(mergeProblem({ ...ok, reason: '   ' }) ?? '', /دلیل ادغام/);
  assert.match(mergeProblem({ ...ok, reason: '' }) ?? '', /تاریخچه/);
  // A reason cannot rescue a merge that breaks a rule.
  assert.match(mergeProblem({ ...ok, reason: 'دلیل دارد', duplicateAlreadyMerged: true }) ?? '', /پیش‌تر/);
});

test('a merged record still says what happened to it', () => {
  assert.match(DUPLICATE_NOTICE_FA, /رکورد اصلی/);
  // The notice never says the record was deleted, because it is not.
  assert.equal(/حذف/.test(DUPLICATE_NOTICE_FA), false);
});
