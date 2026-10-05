/**
 * Forbidden-style check — CLAUDE-CODE-DESIGN-SYSTEM-RULES §1.2 and §3.
 *
 * Fails on hex/rgb colours, Tailwind palette colours and physical direction
 * utilities in `app/**` and `src/**`. Allowed: the system's own stylesheets in
 * `src/ui/design-system/`, the PDF/print templates (fixed A4 geometry), the
 * brand asset registry and server-side image/PDF generators listed below.
 *
 *   node tools/check-ds-styles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'src'];
const ALLOW = [
  /^src[\\/]ui[\\/]design-system[\\/]/,
  /^src[\\/]documents[\\/]pdf/,
  /[\\/]pdf[\\/]/,
  /print/i,
  /^src[\\/]documents[\\/]render\.ts$/,
  /^src[\\/]brand[\\/]assets\.ts$/,
  /^src[\\/]a11y[\\/]contrast\.ts$/,
  /^src[\\/]db[\\/]seed[\\/]/,
];
const RULES = [
  { name: 'hex colour', re: /(?<![&\w])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b(?=["'`;\s,)])/g, onlyInClass: false },
  { name: 'rgb/hsl colour', re: /\b(?:rgba?|hsla?)\(\s*\d/g, onlyInClass: false },
  {
    name: 'palette colour',
    re: /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g,
  },
  {
    name: 'physical direction',
    re: /(?<![\w-])(?:-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr)-[\w[\]().%-]+|text-left|text-right|float-left|float-right)(?![\w-])/g,
  },
];

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(full);
  }
};
ROOTS.forEach(walk);

const findings = [];
for (const file of files) {
  const rel = path.relative('.', file);
  if (ALLOW.some((re) => re.test(rel))) continue;
  if (rel === path.join('app', 'globals.css')) continue; // aliases only, checked by tests/domain/a11y.test.ts
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.re)) {
        // Physical utilities only count inside class strings.
        if (rule.name === 'physical direction' && !/class|className|cn\(|['"`]/.test(line)) continue;
        findings.push(rel + ':' + (index + 1) + '  ' + rule.name + '  ' + match[0]);
      }
    }
  });
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  console.error('\n' + findings.length + ' forbidden style(s). Use semantic tokens and logical properties (docs/design-system).');
  process.exit(1);
}
console.log('design-system style check: ' + files.length + ' files, no forbidden styles');
