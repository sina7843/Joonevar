/**
 * Accessibility arithmetic — Phase 2 PROMPT-018.
 *
 * The part of §24's accessibility review that can be proved without a browser:
 * the contrast ratios of the token pairs the public pages actually render, and
 * that the values checked here are the ones `app/globals.css` really publishes.
 *
 * Keyboard, focus order, RTL and no-sideways-scroll are already owned by
 * `tests/browser/rtl.test.ts` and `tests/browser/visual.test.ts`; they are not
 * repeated here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AA_NON_TEXT,
  AA_NORMAL_TEXT,
  CONTRAST_PAIRS,
  TOKENS,
  contrastRatio,
  luminance,
  measurePairs,
  parseHex,
  ratioOf,
} from '../../src/a11y/contrast.ts';

test('the ratio maths matches the WCAG reference points', () => {
  // The two ends of the scale, exactly as the specification defines them.
  assert.equal(ratioOf('#000000', '#ffffff'), 21);
  assert.equal(ratioOf('#ffffff', '#ffffff'), 1);
  assert.equal(luminance('#ffffff'), 1);
  assert.equal(luminance('#000000'), 0);
  // Order does not change a ratio.
  assert.equal(ratioOf('#171a17', '#fffcf8'), ratioOf('#fffcf8', '#171a17'));
  // Mid grey on white is the well-known 4.54 boundary case.
  assert.ok(contrastRatio('#767676', '#ffffff') >= 4.5);
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.6);

  assert.deepEqual(parseHex('#fff'), parseHex('#ffffff'));
  assert.throws(() => parseHex('نارنجی'), /Not a hex colour/);
});

test('every pair the public pages render meets the level it is judged at', () => {
  const findings = measurePairs();
  const failures = findings.filter((finding) => !finding.passes);
  assert.deepEqual(
    failures.map((finding) => finding.nameFa + ': ' + finding.ratio + ' < ' + finding.required),
    [],
    'a token pair below its required ratio',
  );
  // The report quotes these numbers, so they are asserted to be real measurements.
  for (const finding of findings) {
    assert.ok(finding.ratio >= 1 && finding.ratio <= 21, finding.nameFa);
    assert.ok(finding.required === AA_NORMAL_TEXT || finding.required === AA_NON_TEXT, finding.nameFa);
  }
  assert.ok(findings.length >= 16, 'every rendered pair is covered');
});

test('the values checked here are the ones the stylesheet publishes', () => {
  // The design system's tokens.css is the one source (DEC-0225); globals.css only
  // aliases its variables. Semantic names are resolved through their var() chain.
  const css = fs.readFileSync(path.join('src', 'ui', 'design-system', 'tokens.css'), 'utf8');
  const vars = new Map<string, string>();
  for (const match of css.matchAll(/--([a-z0-9-]+):([^;}]+)/g)) if (!vars.has(match[1]!)) vars.set(match[1]!, match[2]!.trim());
  const published = (name: string): string => {
    let value = vars.get(name);
    for (let hops = 0; value !== undefined && value.startsWith('var(') && hops < 5; hops++) value = vars.get(value.slice(6, -1));
    assert.ok(value && /^#[0-9a-fA-F]{3,8}$/.test(value), 'token not found in tokens.css: ' + name);
    return value!.toLowerCase();
  };

  // A drift between this file and the stylesheet would make the whole check a
  // fiction, so the two are compared rather than trusted.
  assert.equal(TOKENS.bgCanvas, published('bg-chrome'));
  assert.equal(TOKENS.bgSurface, published('bg-surface'));
  assert.equal(TOKENS.textPrimary, published('text-primary'));
  assert.equal(TOKENS.textSecondary, published('text-secondary'));
  assert.equal(TOKENS.textBrand, published('text-brand'));
  assert.equal(TOKENS.actionPrimaryDefault, published('action-primary'));
  assert.equal(TOKENS.actionPrimaryOn, published('text-on-action'));
  assert.equal(TOKENS.statusErrorText, published('status-error-text'));
  assert.equal(TOKENS.statusWarningText, published('status-warning-text'));
  assert.equal(TOKENS.focusRing, published('focus-ring'));
});

test('disabled text is left out rather than held to a rule it is exempt from', () => {
  // WCAG 1.4.3 exempts disabled controls; asserting a ratio for them would be
  // inventing a requirement instead of checking one.
  assert.equal(
    CONTRAST_PAIRS.some((pair) => pair.foreground === TOKENS.textDisabled),
    false,
  );
  // It is still recorded as a token, so a later decision can revisit it.
  assert.equal(TOKENS.textDisabled, '#b9aea2');
});
