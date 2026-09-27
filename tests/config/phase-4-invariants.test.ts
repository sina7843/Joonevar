/**
 * Phase 4 invariants, read from the source — PHASE-4 PROMPT-008.
 *
 * Promises a runtime test can only sample, checked here across the whole tree
 * so a later change cannot quietly break them:
 *  - the last mating is derived: one module writes it, and nothing exposes a setter;
 *  - Hamzist takes no money for a mating agreement: the only finder payment is the
 *    subscription, and there is no escrow, settlement or amount on a contract;
 *  - there is no public owner or kennel rating: confidential feedback is read on
 *    one operator page only;
 *  - finder private files are served by their own routes, never by the generic one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const read = (file: string) => fs.readFile(file, 'utf8');
const rel = (file: string) => file.split(path.sep).join('/');

test('the last mating has exactly one writer and no setter anywhere', async () => {
  const files = [...(await sourceFiles('src')), ...(await sourceFiles('app'))];
  const writers: string[] = [];
  for (const file of files) {
    const text = await read(file);
    if (/\.(insert|update|delete)\(animalLastMatings\)|(insert\s+into|update|delete\s+from)\s+"?animal_last_mating/i.test(text)) writers.push(rel(file));
    assert.ok(!/export\s+(async\s+)?function\s+set(Last)?Mating/i.test(text), rel(file) + ' exports a last-mating setter');
  }
  assert.deepEqual(writers, ['src/finder/last-mating.ts']);
  // And no page or route touches the projection directly.
  for (const file of await sourceFiles('app')) assert.ok(!(await read(file)).includes('animal_last_mating'), rel(file));
});

test('no mating payment, escrow or contract amount: the finder sells a subscription and nothing else', async () => {
  const billing = await read('src/db/schema/billing.ts');
  const services = [...billing.slice(billing.indexOf("pgEnum('payment_service'")).split(']')[0]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
  const finderServices = services.filter((s) => /FINDER|MATING/.test(s));
  // MATING_PERMIT is the association's official permit fee (Phase 1), not a payment between owners.
  assert.deepEqual(finderServices.sort(), ['MATING_FINDER_SUBSCRIPTION', 'MATING_PERMIT']);
  const schemas = (await read('src/db/schema/finder.ts')) + (await read('src/db/schema/mating.ts'));
  assert.ok(!/escrow|settlement|payout/i.test(schemas), 'no escrow or settlement in the finder or mating schema');
  const contractTables = schemas.slice(schemas.indexOf("'finder_contract'"));
  assert.ok(!/amount|toman|price/i.test(contractTables.slice(0, contractTables.indexOf("'finder_contract_approval'") + 2000)), 'a contract carries no amount');
  // Only the subscription service and its checkout action open a payment in the finder.
  const payers: string[] = [];
  for (const file of await sourceFiles('src/finder')) {
    if (/createBatch|startAttempt/.test(await read(file))) payers.push(rel(file));
  }
  assert.deepEqual(payers.sort(), ['src/finder/actions.ts', 'src/finder/subscriptions.ts']);
  assert.match(await read('src/finder/actions.ts'), /[sS]ubscription/);
});

test('there is no public rating: confidential feedback is read on one operator page', async () => {
  const readers: string[] = [];
  for (const file of await sourceFiles('app')) {
    if (/feedbackList|finderFeedback/.test(await read(file))) readers.push(rel(file));
  }
  assert.deepEqual(readers, ['app/market/finder/feedback/page.tsx']);
  // The finder's public pages show no owner or kennel rating (shop product ratings are Phase 3's own).
  for (const file of await sourceFiles(path.join('app', '(public)', 'mating-finder'))) {
    assert.ok(!/rating|feedback|FINDER_FEEDBACK/i.test(await read(file)), rel(file));
  }
});

test('finder private files never go through the generic file route', async () => {
  const policy = await read('src/authz/policy.ts');
  for (const purpose of ['FINDER_MESSAGE_ATTACHMENT', 'FINDER_CONTRACT_PDF', 'FINDER_REPORT_EVIDENCE']) {
    assert.match(policy, new RegExp(purpose + ':\\s*\\[\\],'), purpose + ' has no generic reviewer');
  }
});
