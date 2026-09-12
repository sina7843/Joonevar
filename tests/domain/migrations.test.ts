/**
 * What makes the migrations reversible — Requirements-Phase-2 §23, PROMPT-019.
 *
 * Drizzle generates no `down` file, and writing one by hand for twenty-nine
 * migrations would be twenty-nine untested scripts that only ever run on the
 * worst day. The property that actually lets a release be rolled back is a
 * different one: every migration is additive, so the previous version of the
 * code still runs against the new schema. Nothing is dropped or renamed out
 * from under it (DEC-0179).
 *
 * That is a claim about the SQL itself, so it is checked against the SQL
 * itself, on disk, with no database involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');

const files = fs
  .readdirSync(FOLDER)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const read = (name: string): string => fs.readFileSync(path.join(FOLDER, name), 'utf8');

test('there are migrations to check, and each one is numbered once', () => {
  assert.ok(files.length >= 29, 'expected the phase 1 and phase 2 migrations');
  const numbers = files.map((name) => name.slice(0, 4));
  assert.equal(new Set(numbers).size, numbers.length, 'two migrations share a number');
});

test('no migration drops or renames what an older release still reads', () => {
  const destructive = /\b(drop\s+table|drop\s+column|rename\s+to|rename\s+column|drop\s+constraint)\b/i;
  for (const name of files) {
    const offending = read(name)
      .split('-->')
      .map((statement) => statement.trim())
      .filter((statement) => destructive.test(statement));
    assert.deepEqual(offending, [], name + ' removes or renames an existing object');
  }
});

test('a column only becomes required after the same migration fills it', () => {
  /*
   * `SET NOT NULL` is the one tightening an additive migration may still need.
   * It is safe only when the rows already have a value — otherwise the
   * migration fails on any database with data, which is every real one. So each
   * occurrence must be preceded, in its own file, by an UPDATE that fills that
   * column or by an ADD COLUMN carrying a DEFAULT.
   */
  const tighten = /ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)" SET NOT NULL/gi;
  let checked = 0;
  for (const name of files) {
    const sql = read(name);
    for (const match of sql.matchAll(tighten)) {
      const [statement, table, column] = match;
      const before = sql.slice(0, match.index);
      const filled =
        new RegExp('UPDATE "' + table + '"[\\s\\S]*?SET "' + column + '"', 'i').test(before) ||
        new RegExp('ADD COLUMN "' + column + '"[^;]*DEFAULT', 'i').test(before);
      assert.ok(filled, name + ': ' + statement + ' without filling the column first');
      checked += 1;
    }
  }
  // The rule is only worth having if it is actually exercised somewhere.
  assert.ok(checked >= 1, 'no tightening found to check');
});

test('every migration file is recorded in the journal, and every journal entry has a file', () => {
  const journal = JSON.parse(read('meta/_journal.json').toString()) as { entries: { tag: string }[] };
  const tags = journal.entries.map((entry) => entry.tag);
  const onDisk = files.map((name) => name.replace(/\.sql$/, ''));
  // A generated migration that never reached the journal never runs; a journal
  // entry without a file stops the runner on a clean database.
  assert.deepEqual([...tags].sort(), [...onDisk].sort());
});
