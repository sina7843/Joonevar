/**
 * Suggestion and claim rules without a database — Phase 2 PROMPT-009.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_DOCUMENT_KINDS,
  MAX_CLAIM_DOCUMENTS,
  SUGGESTION_KINDS,
  claimProblem,
  isClaimDocumentKind,
  isSuggestionKind,
  suggestionProblem,
} from '../../src/suggestions/model.ts';

test('a suggestion says what it is, where it is and where the information came from', () => {
  const good = { displayNameFa: 'کلینیک نمونه', cityId: 'c1', sourceFa: 'تابلوی مطب' };
  assert.equal(suggestionProblem(good), null);
  assert.match(suggestionProblem({ ...good, displayNameFa: '  ' }) ?? '', /نام/);
  assert.match(suggestionProblem({ ...good, displayNameFa: 'اب' }) ?? '', /سه نویسه/);
  assert.match(suggestionProblem({ ...good, cityId: '' }) ?? '', /شهر/);
  assert.match(suggestionProblem({ ...good, sourceFa: ' ' }) ?? '', /منبع/);
  assert.deepEqual([...SUGGESTION_KINDS], ['VET', 'CENTRE']);
  assert.ok(isSuggestionKind('CENTRE') && !isSuggestionKind('CLUB'));
});

test('a claim names the representative, their role and at least one document', () => {
  const good = { claimantNameFa: 'نماینده نمونه', roleFa: 'مدیر فنی', documents: 1 };
  assert.equal(claimProblem(good), null);
  assert.match(claimProblem({ ...good, claimantNameFa: '' }) ?? '', /نماینده/);
  assert.match(claimProblem({ ...good, roleFa: '   ' }) ?? '', /سمت/);
  assert.match(claimProblem({ ...good, documents: 0 }) ?? '', /مدرک/);
  assert.match(claimProblem({ ...good, documents: MAX_CLAIM_DOCUMENTS + 1 }) ?? '', /حداکثر/);
  assert.equal(claimProblem({ ...good, documents: MAX_CLAIM_DOCUMENTS }), null);
  for (const kind of CLAIM_DOCUMENT_KINDS) assert.ok(isClaimDocumentKind(kind));
  assert.ok(!isClaimDocumentKind('SELFIE'));
});
