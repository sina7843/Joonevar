/**
 * The status dictionary is the design system's file, not a second copy that
 * can drift: every key, label and tone matches status-dictionary.json, and each
 * tone is its family's tone (DS *Status dictionary*).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATUS_DICTIONARY, statusOf } from '../../src/ui/status-dictionary.ts';

const source = JSON.parse(fs.readFileSync('docs/design-system/sample-content/status-dictionary.json', 'utf8')) as {
  families: Record<string, { tone: string }>;
  statuses: Array<{ key: string; labelFa: string; tone: string; family: string }>;
};

test('every system status is in the code dictionary with the same label, tone and family', () => {
  assert.equal(Object.keys(STATUS_DICTIONARY).length, source.statuses.length);
  for (const status of source.statuses) {
    assert.deepEqual(statusOf(status.key), { labelFa: status.labelFa, tone: status.tone, family: status.family }, status.key);
  }
});

test('a tone is always its family tone, and an unknown key is not guessed', () => {
  for (const [key, entry] of Object.entries(STATUS_DICTIONARY)) {
    assert.equal(entry.tone, source.families[entry.family]!.tone, key);
  }
  assert.equal(statusOf('NOT_A_STATUS'), null);
});
