/**
 * Request, contract and one-time-code rules — PHASE-4 PROMPT-005, pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyClauseChoices,
  canonicalJson,
  chipTail,
  codeMatches,
  commandProblem,
  contentHash,
  expiryProblem,
  hashCode,
  isDue,
  REQUEST_STATUSES,
  REQUIRED_CLAUSE_KEYS,
  templateProblem,
  termsProblem,
  CONFIRMATION_NAME_FA,
  NOT_A_LEGAL_SIGNATURE_FA,
  type ContractContent,
  type TemplateClause,
} from '../../src/finder/request-model.ts';

test('every command has its statuses and its party; nothing leaves a terminal status', () => {
  assert.equal(commandProblem('ACCEPT', 'WAITING_REVIEW', 'RECEIVER'), null);
  assert.ok(commandProblem('ACCEPT', 'WAITING_REVIEW', 'SENDER'));
  assert.ok(commandProblem('ACCEPT', 'PRELIMINARILY_ACCEPTED', 'RECEIVER'));
  assert.equal(commandProblem('START_CONTRACT', 'PRELIMINARILY_ACCEPTED', 'SENDER'), null);
  assert.ok(commandProblem('START_CONTRACT', 'NEGOTIATING', 'SENDER'), 'terms must be agreed first');
  assert.equal(commandProblem('CANCEL', 'CONTRACT_DRAFTING', 'RECEIVER'), null);
  assert.ok(commandProblem('CANCEL', 'CONTRACT_CONFIRMED', 'RECEIVER'), 'a confirmed contract is cancelled through the contract');
  for (const terminal of ['REJECTED', 'CANCELLED', 'EXPIRED', 'MATING_COMPLETED', 'MATING_NOT_COMPLETED'] as const) {
    for (const command of ['ACCEPT', 'REJECT', 'PROPOSE_TERMS', 'ACCEPT_TERMS', 'CANCEL', 'START_CONTRACT', 'MARK_NOT_COMPLETED'] as const) {
      assert.ok(commandProblem(command, terminal, 'SENDER') && commandProblem(command, terminal, 'RECEIVER'), terminal + ' ' + command);
    }
  }
  assert.equal(REQUEST_STATUSES.length, 10);
});

test('expiry: default or shorter, and only pre-contract statuses expire', () => {
  assert.equal(expiryProblem(null, 7), null);
  assert.equal(expiryProblem(3, 7), null);
  assert.ok(expiryProblem(8, 7));
  assert.ok(expiryProblem(0, 7));
  const past = new Date(Date.now() - 1000);
  assert.equal(isDue('WAITING_REVIEW', past, new Date()), true);
  assert.equal(isDue('CONTRACT_DRAFTING', past, new Date()), false);
  assert.equal(isDue('CONTRACT_CONFIRMED', past, new Date()), false);
});

test('terms are validated against a closed vocabulary and a sane window', () => {
  const ok = { route: 'PERSONAL', windowFrom: '2026-10-01', windowTo: '2026-10-10', cityFa: 'تهران', placeCategory: 'NEUTRAL', financialCategory: 'NO_PAYMENT' };
  assert.equal(termsProblem(ok, '2026-09-27'), null);
  assert.ok(termsProblem({ ...ok, route: 'ESCROW' }, '2026-09-27'));
  assert.ok(termsProblem({ ...ok, financialCategory: 'PAY_HAMZIST' }, '2026-09-27'));
  assert.ok(termsProblem({ ...ok, windowFrom: '2026-10-11' }, '2026-09-27'));
  assert.ok(termsProblem({ ...ok, windowTo: '2026-09-01', windowFrom: '2026-08-01' }, '2026-09-27'));
});

const clause = (key: string, required: boolean): TemplateClause => ({ key, required, titleFa: 't ' + key, bodyFa: 'b ' + key });
const full = [...REQUIRED_CLAUSE_KEYS.map((k) => clause(k, true)), clause('EXTRA', false)];

test('a template must carry every required clause as required', () => {
  assert.equal(templateProblem(full), null);
  assert.ok(templateProblem(full.filter((c) => c.key !== 'NATURAL_RISK')));
  assert.ok(templateProblem(full.map((c) => (c.key === 'TRAVEL' ? { ...c, required: false } : c))));
  assert.ok(templateProblem([...full, clause('EXTRA', false)]), 'duplicate key');
});

test('required clauses are always in a contract; optional ones only when chosen', () => {
  const none = applyClauseChoices(full, []);
  assert.equal(none.length, REQUIRED_CLAUSE_KEYS.length);
  const chosen = applyClauseChoices(full, [{ key: 'EXTRA', fillFa: ' دو بار ' }]);
  assert.equal(chosen.find((c) => c.key === 'EXTRA')?.fillFa, 'دو بار');
  assert.throws(() => applyClauseChoices(full, [{ key: 'NOT_IN_TEMPLATE', fillFa: null }]));
});

test('the content hash is canonical and changes with any change of content', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  const content = { templateId: 't', templateVersion: 1, requestId: 'r', financialDetailsFa: null, clauses: [] } as unknown as ContractContent;
  const other = { ...content, financialDetailsFa: 'x' } as ContractContent;
  assert.equal(contentHash(content), contentHash({ ...content }));
  assert.notEqual(contentHash(content), contentHash(other));
});

test('a code matches only its own hash, in constant form, and only as six digits', () => {
  const stored = hashCode('otp-1', '123456');
  assert.equal(codeMatches('otp-1', '123456', stored), true);
  assert.equal(codeMatches('otp-1', '123457', stored), false);
  assert.equal(codeMatches('otp-2', '123456', stored), false, 'salted by the code row');
  assert.equal(codeMatches('otp-1', '12345', stored), false);
  assert.equal(codeMatches('otp-1', "' or 1=1", stored), false);
});

test('a contract never carries a full chip number, and is never called a legal signature', () => {
  assert.equal(chipTail('985000000012345'), '…2345');
  assert.equal(chipTail(null), null);
  assert.ok(!CONFIRMATION_NAME_FA.includes('امضا'));
  assert.match(NOT_A_LEGAL_SIGNATURE_FA, /امضای قانونی تضمین‌شده/);
});
