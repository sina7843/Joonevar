/**
 * The club rule engine — Phase 2.5 PROMPT-013.
 *
 * These tests are the security boundary of the feature: a club writes its own
 * rules, so what the validator accepts is exactly what the club can make the
 * product do. Anything outside the allowlist has to be refused, and evaluation
 * has to stay a pure function of the facts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUB_RULE_KINDS,
  MAX_RULE_DEPTH,
  MAX_RULE_NODES,
  SAMPLE_FACTS,
  evaluateRules,
  isRuleTree,
  ruleTreeAsks,
  ruleTreeKinds,
  validateRuleTree,
  type ClubApplicantFacts,
  type ClubRuleNode,
} from '../../src/clubs/rules-model.ts';

const BREED = '11111111-2222-3333-4444-555555555555';
const CONTEXT = { termsVersion: 'v1', breedNamesFa: { [BREED]: 'ژرمن شپرد' } };

const facts = (over: Partial<ClubApplicantFacts> = {}): ClubApplicantFacts => ({ ...SAMPLE_FACTS, ...over });

const all = (...children: ClubRuleNode[]): ClubRuleNode => ({ type: 'GROUP', op: 'ALL', children });
const any = (...children: ClubRuleNode[]): ClubRuleNode => ({ type: 'GROUP', op: 'ANY', children });
const rule = (kind: (typeof CLUB_RULE_KINDS)[number], params?: Record<string, unknown>): ClubRuleNode => ({ type: 'RULE', kind, params });

test('only the allowlisted questions and parameters survive validation', () => {
  assert.deepEqual(validateRuleTree(all(rule('ACCOUNT_ACTIVE'))).problems, []);
  assert.deepEqual(validateRuleTree(all(rule('OWNS_DOG', { minCount: 2, breedId: BREED }))).problems, []);

  // A rule nobody implemented, a parameter nobody accepts, a value out of range.
  assert.equal(validateRuleTree(all({ type: 'RULE', kind: 'OWNS_HORSE' } as never)).problems.length, 1);
  assert.equal(validateRuleTree(all(rule('OWNS_DOG', { breed: BREED }))).problems.length, 1);
  assert.equal(validateRuleTree(all(rule('OWNS_DOG', { minCount: 0 }))).problems.length, 1);
  assert.equal(validateRuleTree(all(rule('OWNS_DOG', { minCount: 999 }))).problems.length, 1);
  assert.equal(validateRuleTree(all(rule('OWNS_DOG', { breedId: 'drop table animal' }))).problems.length, 1);
  assert.equal(validateRuleTree(all(rule('VET_STATUS', { status: 'SUPERADMIN' }))).problems.length, 1);
  // A required parameter that was left out.
  assert.equal(validateRuleTree(all(rule('VET_STATUS'))).problems.length, 1);
});

test('nothing that looks like code can be stored as a rule', () => {
  for (const attempt of [
    // An own "__proto__" key, the way a hand-written JSON body would carry it.
    { type: 'RULE', kind: 'ACCOUNT_ACTIVE', params: JSON.parse('{"__proto__":{"polluted":true}}') },
    { type: 'EXPR', expression: "facts.dogCount > 0 || process.exit(1)" },
    { type: 'RULE', kind: 'eval' },
    'ACCOUNT_ACTIVE',
    42,
    null,
    ['ACCOUNT_ACTIVE'],
    { type: 'GROUP', op: 'NAND', children: [] },
    { type: 'GROUP', op: 'ALL', children: [] },
  ]) {
    assert.equal(isRuleTree(attempt), false, JSON.stringify(attempt));
  }
  // The prototype was not touched by the attempt above.
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('groups nest only so far and a rule set stays bounded', () => {
  let deep: ClubRuleNode = rule('ACCOUNT_ACTIVE');
  for (let level = 0; level <= MAX_RULE_DEPTH; level += 1) deep = all(deep);
  assert.ok(validateRuleTree(deep).problems.length > 0, 'one level past the limit is refused');

  let fits: ClubRuleNode = rule('ACCOUNT_ACTIVE');
  for (let level = 0; level < MAX_RULE_DEPTH; level += 1) fits = all(fits);
  assert.deepEqual(validateRuleTree(fits).problems, []);

  const wide = all(...Array.from({ length: MAX_RULE_NODES + 5 }, () => rule('ACCOUNT_ACTIVE')));
  assert.ok(validateRuleTree(wide).problems.some((problem) => problem.includes('ساده‌تر')));
});

test('ALL and ANY combine the way a club would read them', () => {
  const tree = all(
    rule('ACCOUNT_ACTIVE'),
    any(rule('ASSOCIATION_MEMBERSHIP'), rule('KENNEL_APPROVED')),
    rule('OWNS_DOG', { minCount: 2, breedId: BREED }),
  );
  assert.deepEqual(validateRuleTree(tree).problems, []);

  // Neither alternative: the ANY group explains both of its ways in.
  const none = evaluateRules(tree, facts({ dogCountByBreed: { [BREED]: 2 } }), CONTEXT);
  assert.equal(none.met, false);
  assert.equal(none.unmetFa.length, 2);
  assert.ok(none.unmetFa.some((reason) => reason.includes('عضویت معتبر انجمن')));
  assert.ok(none.unmetFa.some((reason) => reason.includes('کنل')));

  // One alternative is enough, and a satisfied ANY explains nothing.
  const viaKennel = evaluateRules(tree, facts({ kennelApproved: true, dogCountByBreed: { [BREED]: 2 } }), CONTEXT);
  assert.equal(viaKennel.met, true);
  assert.deepEqual(viaKennel.unmetFa, []);

  // The breed requirement counts that breed, not dogs in general.
  const wrongBreed = evaluateRules(tree, facts({ kennelApproved: true, dogCount: 5, dogCountByBreed: {} }), CONTEXT);
  assert.equal(wrongBreed.met, false);
  assert.equal(wrongBreed.unmetFa.length, 1);
  assert.ok(wrongBreed.unmetFa[0]!.includes('ژرمن شپرد'), 'the breed is named in words, not as an id');
});

test('a changed fact changes the answer and nothing else', () => {
  const tree = all(rule('IDENTITY_VERIFIED'), rule('MICROCHIP', { minCount: 2 }), rule('PEDIGREE'));
  const before = evaluateRules(tree, facts(), CONTEXT);
  assert.equal(before.met, false);
  assert.deepEqual(before.unmetStages, { fact: 2, flow: 0 });

  const after = evaluateRules(tree, facts({ chippedDogCount: 2, pedigreeCount: 1 }), CONTEXT);
  assert.equal(after.met, true);
  assert.deepEqual(after.unmetFa, []);
  // Evaluation is pure: the same facts give the same answer, and the facts object
  // is never written to.
  const frozen = Object.freeze(facts({ chippedDogCount: 2, pedigreeCount: 1 }));
  assert.deepEqual(evaluateRules(tree, frozen, CONTEXT).unmetFa, []);
});

test('fact rules decide eligibility; joining steps are counted apart', () => {
  const tree = all(rule('ASSOCIATION_MEMBERSHIP'), rule('TERMS_ACCEPTED'), rule('FEE_PAID'), rule('CLUB_APPROVAL'));
  const ineligible = evaluateRules(tree, facts(), CONTEXT);
  assert.deepEqual(ineligible.unmetStages, { fact: 1, flow: 3 });

  const midJourney = evaluateRules(tree, facts({ associationMembershipValid: true }), CONTEXT);
  assert.equal(midJourney.unmetStages.fact, 0);
  assert.equal(midJourney.unmetStages.flow, 3);

  const done = evaluateRules(
    tree,
    facts({ associationMembershipValid: true, acceptedTermsVersion: 'v1', feePaid: true, clubApproved: true }),
    CONTEXT,
  );
  assert.equal(done.met, true);

  // Accepting an older version of the terms is not accepting the current one.
  const stale = evaluateRules(
    tree,
    facts({ associationMembershipValid: true, acceptedTermsVersion: 'v0', feePaid: true, clubApproved: true }),
    CONTEXT,
  );
  assert.equal(stale.met, false);
  assert.equal(stale.unmetStages.flow, 1);
});

test('a trusted vet satisfies a licensed requirement, and not the other way round', () => {
  const licensed = all(rule('VET_STATUS', { status: 'LICENSED' }));
  const trusted = all(rule('VET_STATUS', { status: 'TRUSTED' }));
  assert.equal(evaluateRules(licensed, facts({ vetStatus: 'TRUSTED' }), CONTEXT).met, true);
  assert.equal(evaluateRules(licensed, facts({ vetStatus: 'LICENSED' }), CONTEXT).met, true);
  assert.equal(evaluateRules(licensed, facts(), CONTEXT).met, false);
  assert.equal(evaluateRules(trusted, facts({ vetStatus: 'LICENSED' }), CONTEXT).met, false);
  assert.equal(evaluateRules(trusted, facts({ vetStatus: 'TRUSTED' }), CONTEXT).met, true);
});

test('the club can see what its own rule set asks for', () => {
  const tree = all(rule('ACCOUNT_ACTIVE'), any(rule('FEE_PAID'), rule('CLUB_APPROVAL')));
  assert.deepEqual(ruleTreeKinds(tree), ['ACCOUNT_ACTIVE', 'FEE_PAID', 'CLUB_APPROVAL']);
  assert.equal(ruleTreeAsks(tree, 'FEE_PAID'), true);
  assert.equal(ruleTreeAsks(tree, 'PEDIGREE'), false);
});
