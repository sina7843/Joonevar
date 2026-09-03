/**
 * The release readiness review — gate `release-readiness-review`.
 *
 * This gate reads the artefacts a handover is judged by and refuses the two
 * failure modes that matter: a claim with no evidence behind it, and a claim of
 * production readiness that the state of the integrations does not support. It
 * asserts nothing about quality that a person has not already recorded; it
 * checks that what was recorded is complete and honest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const readJson = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'));

test('every prompt has a committed report, and none of them fakes its status', async () => {
  const manifest = await readJson(path.join('prompts', 'prompt-manifest.json'));
  const prompts: Array<{ id: string; requiredChecks?: string[] }> = manifest.prompts;
  assert.equal(prompts.length, 20);

  for (const prompt of prompts) {
    const file = path.join('docs', 'reports', prompt.id + '.json');
    // PROMPT-020 writes its own report at the end of this run; every earlier
    // one must already exist.
    if (prompt.id === 'PROMPT-020') continue;

    const report = await readJson(file);
    assert.equal(report.promptId, prompt.id);
    assert.equal(report.status, 'COMPLETE', prompt.id + ' must be COMPLETE');
    assert.ok(Array.isArray(report.changedFiles) && report.changedFiles.length > 0);
    assert.ok(Array.isArray(report.checks) && report.checks.length > 0);
    assert.deepEqual(report.blockers, [], prompt.id + ' must have no open blocker');

    // Every required gate really appears with a PASS and an evidence line that
    // says something, not a placeholder.
    for (const required of prompt.requiredChecks ?? []) {
      const check = report.checks.find((row: { id: string }) => row.id === required);
      assert.ok(check, prompt.id + ' is missing its required check ' + required);
      assert.equal(check.result, 'PASS', required + ' must be PASS in ' + prompt.id);
      assert.ok(
        typeof check.evidence === 'string' && check.evidence.length > 40,
        required + ' must carry real evidence in ' + prompt.id,
      );
      assert.ok(typeof check.command === 'string' && check.command.length > 0);
    }
  }
});

test('no acceptance row and no requirement section is left unmapped', async () => {
  const matrix = await fs.readFile('ACCEPTANCE_MATRIX.md', 'utf8');
  const rows = matrix.split('\n').filter((line) => /^\| A-\d{3} \|/.test(line));
  assert.equal(rows.length, 33, 'the matrix still has all 33 source rows');
  for (const row of rows) {
    assert.ok(!row.includes('NOT_STARTED'), 'unmapped acceptance row: ' + row.slice(0, 60));
    // A mapped row names where the evidence is.
    assert.ok(
      /tests\/|docs\/|src\//.test(row),
      'an acceptance row must point at real evidence: ' + row.slice(0, 60),
    );
  }

  const traceability = await fs.readFile('REQUIREMENTS_TRACEABILITY.md', 'utf8');
  const sections = traceability.split('\n').filter((line) => /^\| \[s\d{2}\]/.test(line));
  assert.equal(sections.length, 29, 'all 29 sections are listed');
  for (const section of sections) {
    assert.ok(!section.includes('NOT_STARTED'), 'unmapped section: ' + section.slice(0, 60));
  }
});

test('the handover documents exist and describe the real operating path', async () => {
  const runbook = await fs.readFile(path.join('docs', 'ops', 'runbook.md'), 'utf8');
  for (const needle of ['npm ci', 'npm run db:migrate', 'npm run build', 'tools/backup.mjs', 'tools/restore.mjs']) {
    assert.ok(runbook.includes(needle), 'the runbook must document ' + needle);
  }
  // The runbook has to state the production failure rule, not just the happy path.
  assert.ok(runbook.includes('SESSION_SECRET'));
  assert.ok(/production/i.test(runbook));

  const operator = await fs.readFile(path.join('docs', 'ops', 'operator-guide.md'), 'utf8');
  for (const needle of ['/assoc/kyc', '/assoc/members', '/assoc/permits', '/assoc/postal', '/genetics', '/admin/settings', '/vet']) {
    assert.ok(operator.includes(needle), 'the operator guide must cover ' + needle);
  }
  // §21.4: the 21-day referral setting and the single genetics centre are named.
  assert.ok(operator.includes('referral.validity_days'));
  assert.ok(operator.includes('۲۱ روز'));
  assert.ok(operator.includes('genetics_centre'));
  assert.ok(operator.includes('payment_account'));

  const acceptance = await fs.readFile(path.join('docs', 'qa', 'phase-1-acceptance.md'), 'utf8');
  assert.ok(acceptance.includes('UNVERIFIED'), 'the QA report keeps the unverified claim visible');
});

test('nothing claims production readiness that the integrations do not support', async () => {
  const reports = await fs.readdir(path.join('docs', 'reports'));
  const files = reports.filter((entry) => /^PROMPT-\d{3}\.json$/.test(entry));
  assert.ok(files.length >= 19);

  for (const file of files) {
    const report = await readJson(path.join('docs', 'reports', file));
    const readiness = report.readiness ?? {};
    // No external provider is configured in this package, so no report may say
    // otherwise, and none may call the product production-ready.
    assert.equal(readiness.production, 'NOT_READY', file + ' must not claim production readiness');
    assert.equal(
      readiness.integrations,
      'NOT_CONFIGURED',
      file + ' must not claim a configured integration',
    );
    assert.ok(
      Array.isArray(report.limitations) && report.limitations.length > 0,
      file + ' must state its real limitations',
    );
  }
});

test('the visual claim stays unverified until a reference exists', async () => {
  const record = await readJson(
    path.join('docs', 'reports', 'screenshots', 'prompt-019', 'visual-review.json'),
  );
  assert.equal(record.verdict, 'UNVERIFIED');
  assert.ok(record.covered.length > 0, 'the record says which screens were reviewed');

  // And no report may quietly upgrade that claim.
  const reports = await fs.readdir(path.join('docs', 'reports'));
  for (const file of reports.filter((entry) => /^PROMPT-\d{3}\.json$/.test(entry))) {
    const report = await readJson(path.join('docs', 'reports', file));
    assert.equal(report.readiness?.visual, 'UNVERIFIED', file + ' must keep the visual claim unverified');
  }
});

test('no real secret, tariff or account is committed as though it were verified', async () => {
  const example = await fs.readFile('.env.example', 'utf8');
  // The example file documents names and local defaults only.
  assert.ok(/#\s*SESSION_SECRET=/.test(example), 'the production secret is commented out, never valued');
  assert.ok(!/SESSION_SECRET=[A-Za-z0-9]{8,}/.test(example));

  // A tariff may ship with a starting figure so the product is usable on day
  // one, but it must never be dressed up as an announced tariff. §7 states the
  // membership figure, so that one cites the source; every other fee has to say
  // in its own note that it is an operating starting value the superadmin
  // changes, which is what keeps the claim honest.
  const keys = await fs.readFile(path.join('src', 'settings', 'keys.ts'), 'utf8');
  const feeBlocks = keys.split('key:').filter((block) => block.trimStart().startsWith("'fee."));
  assert.ok(feeBlocks.length >= 6);
  for (const block of feeBlocks) {
    const key = /^'(fee\.[a-z_]+)'/.exec(block.trimStart())?.[1] ?? '';
    const seed = /seedValue:\s*([^,\n]+)/.exec(block)?.[1]?.trim();
    if (key === 'fee.membership_toman') {
      assert.equal(seed, "'300000'", 'the documented baseline stays exactly as the source states it');
      assert.ok(block.includes('مبلغ مبنای مستند'), 'and it says it is the documented baseline');
      continue;
    }
    if (seed === 'null') continue;
    assert.match(seed ?? '', /^'\d+'$/, key + ' must be a plain amount, never an expression');
    assert.ok(
      block.includes('مقدار شروع عملیاتی است و تعرفه رسمی اعلام‌شده انجمن نیست'),
      key + ' must say it is a starting figure, not an announced tariff',
    );
  }
});
