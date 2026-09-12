/**
 * Conformance with the Design System brand handoff.
 *
 * The handoff is an official source, so the question a test can answer is not
 * "does this look right" but "is what we ship the file the Design System
 * delivered, at the size it delivered it". Anything scaled, redrawn or missing
 * fails here rather than in a screenshot nobody compares.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND_ASSETS,
  FAVICONS,
  MIN_MARK_CONTRAST,
  PRODUCT_SURFACE,
  PRODUCT_TONE,
  REVERSAL_RULES,
  isAllowedPairing,
} from '../../src/brand/assets.ts';
import { AA_NON_TEXT } from '../../src/a11y/contrast.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileOf = (asset: { path: string }): string => path.join(ROOT, 'public', asset.path.replace(/^\//, ''));

/** PNG header: width and height are two big-endian 32-bit fields after the IHDR marker. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('every asset the Design System delivered is shipped, at exactly the size it delivered', () => {
  assert.ok(BRAND_ASSETS.length >= 7);
  for (const asset of BRAND_ASSETS) {
    const file = fileOf(asset);
    assert.ok(fs.existsSync(file), 'missing brand asset ' + asset.path + ' (Figma ' + asset.figmaNode + ')');
    const size = pngSize(fs.readFileSync(file));
    assert.deepEqual(
      size,
      { width: asset.width, height: asset.height },
      asset.path + ' is ' + size.width + 'x' + size.height + ', the handoff delivers ' + asset.width + 'x' + asset.height,
    );
  }
});

test('each favicon size is its own artwork, not one image scaled three ways', () => {
  /*
   * Section 08: below 24px the mark ships as the simplified single-ink glyph,
   * because the interior detail muds together at favicon sizes. Shipping one
   * PNG and letting the browser scale it would quietly break that rule, and the
   * only visible symptom would be a muddy 16px icon nobody inspects.
   */
  assert.deepEqual(
    FAVICONS.map((asset) => asset.width),
    [16, 32, 48],
    'the handoff table lists 16, 32 and 48',
  );
  const digests = FAVICONS.map((asset) => fs.readFileSync(fileOf(asset)).toString('base64'));
  assert.equal(new Set(digests).size, FAVICONS.length, 'two favicon sizes are the same file');
});

test('the tone and surface the product renders is a pairing the handoff allows', () => {
  assert.equal(isAllowedPairing(PRODUCT_TONE, PRODUCT_SURFACE), true);
  // The forbidden pairings are stated, not merely absent, so removing one is a
  // visible change rather than a silent gap.
  assert.equal(isAllowedPairing('MONO_INK', 'DARK'), false);
  assert.equal(isAllowedPairing('MONO_LIGHT', 'LIGHT'), false);
  assert.equal(REVERSAL_RULES.filter((rule) => !rule.allowed).length, 2);
  for (const rule of REVERSAL_RULES) assert.notEqual(rule.noteFa.trim(), '');
});

test('the minimum contrast for the mark is the WCAG non-text ratio, read from one place', () => {
  // Not a second number that can drift from the one the contrast module uses.
  assert.equal(MIN_MARK_CONTRAST, AA_NON_TEXT);
});
