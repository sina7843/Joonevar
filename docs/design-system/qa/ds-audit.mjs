#!/usr/bin/env node
/**
 * Hamzist design system v1.0.4 — code audit (step 1 of QA-FINAL-RECONCILIATION.md).
 *
 * Compares the App's code with the design system package and lists everything
 * missing or out of sync. No dependencies; read-only except the report.
 *
 *   node docs/design-system/qa/ds-audit.mjs                 # run from the App root
 *   node docs/design-system/qa/ds-audit.mjs --app <dir> --out <file.md> --json <file.json>
 *
 * Exit code 1 when any FAIL is found. REVIEW items are not failures by
 * themselves, but QA must close each one (implement it, or log a DEC + GAPS.md
 * row explaining why the design is right not to have it on that page).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(arg('--app', process.cwd()));
const OUT = path.resolve(APP, arg('--out', 'docs/qa/design-system/ds-audit.md'));
const JSON_OUT = arg('--json', null);
const inv = JSON.parse(fs.readFileSync(path.join(PKG, 'qa/ds-inventory.json'), 'utf8'));

const results = []; // {area, level: FAIL|REVIEW|OK, msg, items?}
const add = (area, level, msg, items) => results.push({ area, level, msg, items: items && items.length ? items : undefined });
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n');
const sameFile = (a, b) => {
  if (!exists(a) || !exists(b)) return false;
  const x = fs.readFileSync(a), y = fs.readFileSync(b);
  if (x.equals(y)) return true;
  return /\.(svg|css|md|json|txt|html)$/i.test(a) && norm(x.toString('utf8')) === norm(y.toString('utf8'));
};

// ---- collect code ---------------------------------------------------------
const CODE_ROOTS = ['app', 'src'];
const SKIP_DIR = /(^|[\\/])(node_modules|\.next|dist|build|coverage|\.git)([\\/]|$)/;
const codeFiles = [];
const walk = (dir) => {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP_DIR.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?|mjs|css)$/.test(e.name)) codeFiles.push(p);
  }
};
CODE_ROOTS.forEach((r) => walk(path.join(APP, r)));
const rel = (p) => path.relative(APP, p).split(path.sep).join('/');
const DS_DIR = /^src\/ui\/design-system\//;
const code = codeFiles.map((p) => ({ p: rel(p), t: read(p) }));
const appCode = code.filter((f) => !DS_DIR.test(f.p));
const allText = appCode.map((f) => f.t).join('\n');
if (!code.length) { console.error(`No app/ or src/ under ${APP}. Run from the App root or pass --app.`); process.exit(2); }

// hz- classes used by the app: literals + dynamic prefixes such as `hz-btn--${tone}`
const used = new Set(); const prefixes = new Set();
for (const f of appCode) {
  for (const m of f.t.matchAll(/hz-[a-z0-9]+(?:(?:--|__|-|_)[a-z0-9]+)*/g)) used.add(m[0]);
  for (const m of f.t.matchAll(/(hz-[a-z0-9_-]*?(?:--|__|-))\$\{/g)) prefixes.add(m[1]);
  for (const m of f.t.matchAll(/['"`](hz-[a-z0-9_-]*?(?:--|__|-))['"`]\s*\+/g)) prefixes.add(m[1]);
}
const isUsed = (c) => used.has(c) || [...prefixes].some((p) => c.startsWith(p));

// ---- 1. stylesheets in sync -------------------------------------------------
const appBundle = path.join(APP, 'src/ui/design-system/bundle.css');
const pkgBundle = path.join(PKG, 'design-system/components/bundle.css');
if (!exists(appBundle)) add('Stylesheets', 'FAIL', '`src/ui/design-system/bundle.css` is missing (copy `docs/design-system/design-system/components/bundle.css`).');
else if (!sameFile(appBundle, pkgBundle)) add('Stylesheets', 'FAIL', '`src/ui/design-system/bundle.css` differs from the design system v1.0.4 `components/bundle.css`. Copy it over unchanged (app-specific rules belong in app CSS, not in the bundle).');
else add('Stylesheets', 'OK', 'bundle.css is identical to v1.0.4.');
const appTokens = path.join(APP, 'src/ui/design-system/tokens.css');
const pkgTokens = path.join(PKG, 'design-system/tokens.css');
const stripFonts = (s) => norm(s).split('\n').filter((l) => !l.startsWith('@font-face')).join('\n');
if (!exists(appTokens)) add('Stylesheets', 'FAIL', '`src/ui/design-system/tokens.css` is missing.');
else if (stripFonts(read(appTokens)) !== stripFonts(read(pkgTokens))) add('Stylesheets', 'FAIL', '`src/ui/design-system/tokens.css` differs from v1.0.4 `tokens.css` (only the @font-face URLs may differ).');
else add('Stylesheets', 'OK', 'tokens.css matches v1.0.4 (font URLs aside).');
const globals = exists(path.join(APP, 'app/globals.css')) ? read(path.join(APP, 'app/globals.css')) : '';
if (!/design-system\/tokens\.css/.test(globals) || !/design-system\/bundle\.css/.test(globals)) add('Stylesheets', 'FAIL', '`app/globals.css` must import `src/ui/design-system/tokens.css` and `bundle.css`.');
const missingTok = inv.tokens.filter((t) => exists(appTokens) && !read(appTokens).includes(t + ':') && !read(appTokens).includes(t + ' :'));
if (missingTok.length) add('Tokens', 'FAIL', `${missingTok.length} tokens are not defined in the app tokens.css.`, missingTok);
else add('Tokens', 'OK', `${inv.tokens.length} tokens defined.`);

// ---- 2. fonts -----------------------------------------------------------------
const missingFonts = inv.fonts.files.filter((f) => !sameFile(path.join(APP, 'public/fonts', f), path.join(PKG, 'design-system/fonts', f)));
if (missingFonts.length) add('Fonts', 'FAIL', 'These IRANSansX woff2 files are missing from `public/fonts/` or differ from the package.', missingFonts);
else add('Fonts', 'OK', `${inv.fonts.files.length} IRANSansX woff2 files present and identical.`);
if (exists(appTokens)) {
  const t = read(appTokens);
  const faces = [...t.matchAll(/@font-face\{[^}]*font-family:'IRANSansX'[^}]*url\('([^']+)'\)[^}]*font-weight:(\d+)/g)];
  const weights = new Set(faces.map((m) => +m[2]));
  const missW = inv.fonts.weights.filter((w) => !weights.has(w));
  if (missW.length) add('Fonts', 'FAIL', '@font-face missing for weights', missW.map(String));
  const badUrl = faces.filter((m) => !exists(path.join(APP, 'public', m[1].replace(/^\//, '')))).map((m) => m[1]);
  if (badUrl.length) add('Fonts', 'FAIL', '@font-face URLs that do not resolve to a file in `public/`', badUrl);
}
const fontHits = [];
for (const f of appCode.filter((x) => !/^src\/db\/seed\//.test(x.p))) {
  for (const m of f.t.matchAll(/font-family\s*:\s*([^;}\n]+)|fontFamily\s*:\s*['"`]([^'"`]+)|font-\[(?:family-name:)?([^\]]+)\]/g)) {
    const v = (m[1] || m[2] || m[3] || '').trim();
    if (!/^(var\(--font|inherit|IRANSansX|"IRANSansX"|'IRANSansX')/.test(v)) fontHits.push(`${f.p}: ${v}`);
  }
  if (/fonts\.googleapis|next\/font\/google|FaNum/i.test(f.t)) fontHits.push(`${f.p}: Google Fonts / next/font/google / FaNum reference`);
}
if (fontHits.length) add('Fonts', 'FAIL', 'Font families other than IRANSansX (via the font tokens).', fontHits.slice(0, 40));

// ---- 3. brand -------------------------------------------------------------------
const brandBad = inv.brand.files.filter((b) => !sameFile(path.join(APP, b.target), path.join(PKG, b.source))).map((b) => `${b.target}  ←  ${b.source}`);
if (brandBad.length) add('Brand', 'FAIL', 'Brand files missing or different (app icon must be option A).', brandBad);
else add('Brand', 'OK', `${inv.brand.files.length} brand files present and identical (logo SVGs, app icon A, favicons, OG image).`);
if (!exists(path.join(APP, 'public/favicon.ico')) && !exists(path.join(APP, 'app/favicon.ico'))) add('Brand', 'FAIL', '`favicon.ico` must also be served from the site root (`public/favicon.ico` or `app/favicon.ico`).');
const layout = ['app/layout.tsx', 'app/layout.ts', 'app/layout.jsx'].map((p) => path.join(APP, p)).find(exists);
const lt = layout ? read(layout) : '';
const needMeta = ['/brand/favicon/favicon.svg', '/brand/app-icon/apple-touch-icon-180.png', '/brand/social/og-1200x630.png'];
const missMeta = needMeta.filter((u) => !lt.includes(u));
if (missMeta.length) add('Brand', 'FAIL', '`app/layout.tsx` metadata does not reference', missMeta);
const manifestFile = ['app/manifest.ts', 'app/manifest.json', 'app/manifest.webmanifest', 'public/manifest.webmanifest', 'public/manifest.json'].map((p) => path.join(APP, p)).find(exists);
if (!manifestFile) add('Brand', 'FAIL', 'No web manifest (brand.md › Manifest colours).');
else {
  const mt = read(manifestFile);
  const need = ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'FFFCF8'];
  const miss = need.filter((n) => !mt.toUpperCase().includes(n.toUpperCase()));
  if (miss.length) add('Brand', 'FAIL', `${rel(manifestFile)} is missing`, miss);
}
const retired = inv.brand.retiredFiles.filter((n) => allText.includes(n));
if (retired.length) add('Brand', 'FAIL', 'Code still references retired brand files.', retired);
const logoUses = ['lockup-horizontal-fa-light.svg', 'symbol.svg'].filter((n) => !allText.includes(n));
if (logoUses.length) add('Brand', 'REVIEW', 'Logo component does not reference (brand.md › Usage per shell)', logoUses);

// ---- 4. imagery ---------------------------------------------------------------------
const viaManifest = appCode.some((f) => f.t.includes('images-manifest.json'));
const imgMiss = viaManifest ? [] : inv.images.filter((i) => !allText.includes(i.file) && !exists(path.join(APP, 'public/brand/imagery', i.file))).map((i) => `${i.file} — ${i.slot}`);
if (imgMiss.length) add('Imagery', 'FAIL', `${imgMiss.length} of 78 approved photos are not used by the seed or the app.`, imgMiss);
else add('Imagery', 'OK', viaManifest ? 'The seed imports the photos from demo-content/images-manifest.json (78 entries). Confirm in QA that all 78 appear on screen.' : 'All 78 approved photos are referenced.');
const remote = [...allText.matchAll(/https?:\/\/(?!localhost)[^\s'"`)]+\.(?:jpe?g|png|webp|avif)/gi)].map((m) => m[0]);
if (remote.length) add('Imagery', 'FAIL', 'Remote images (only the approved photos are allowed).', [...new Set(remote)].slice(0, 20));

// ---- 5. status dictionary ----------------------------------------------------------------
const sdPath = path.join(APP, 'src/ui/status-dictionary.ts');
if (!exists(sdPath)) add('Status', 'FAIL', '`src/ui/status-dictionary.ts` is missing.');
else {
  const sd = read(sdPath);
  const miss = inv.statusKeys.filter((s) => !new RegExp(`\\b${s.key}\\b`).test(sd)).map((s) => `${s.key} — ${s.labelFa}`);
  const wrongLabel = inv.statusKeys.filter((s) => !s.labelFa.startsWith('—') && new RegExp(`\\b${s.key}\\b`).test(sd) && !sd.includes(s.labelFa)).map((s) => `${s.key} — ${s.labelFa}`);
  if (miss.length) add('Status', 'FAIL', 'Dictionary keys missing', miss);
  if (wrongLabel.length) add('Status', 'FAIL', 'Dictionary labels that differ from 07-status.md', wrongLabel);
  if (!miss.length && !wrongLabel.length) add('Status', 'OK', '81 keys with the approved labels.');
}
const localStatus = appCode.filter((f) => /_STATUS_FA\b/.test(f.t)).map((f) => f.p);
if (localStatus.length) add('Status', 'REVIEW', 'Module-level status label maps still in use (GAPS #4): map each to a dictionary key.', localStatus);

// ---- 6. icons ---------------------------------------------------------------------------
const ipPath = path.join(APP, 'src/ui/icon-paths.ts');
if (!exists(ipPath)) add('Icons', 'FAIL', '`src/ui/icon-paths.ts` is missing.');
else {
  const ip = read(ipPath);
  const NOT_ICON = new Set(['regular', 'fill', 'outline', 'path', 'paths', 'd', 'viewBox']);
  const keys = new Set([...ip.matchAll(/^\s*['"]?([a-zA-Z0-9]+)['"]?\s*:/gm)].map((m) => m[1]).filter((k) => !NOT_ICON.has(k)));
  const approved = new Set(inv.icons.map((i) => i.key));
  const miss = inv.icons.filter((i) => !keys.has(i.key)).map((i) => i.name);
  if (miss.length) add('Icons', 'FAIL', 'Approved icons missing from icon-paths.ts', miss);
  const extraUsed = [...keys].filter((k) => !approved.has(k) && k.length > 1 && new RegExp(`(?:name|icon|iconStart|iconEnd)=["'{\`]+${k}\\b|['"]${k}['"]`).test(appCode.filter((f) => f.p !== rel(ipPath)).map((f) => f.t).join('\n')));
  if (extraUsed.length) add('Icons', 'REVIEW', 'Icons outside the approved 128 still used by screens (04-iconography: one meaning = one icon).', extraUsed);
  if (!miss.length) add('Icons', 'OK', 'All 128 approved icons available.');
}

// ---- 7. components ------------------------------------------------------------------------
const compRows = [];
for (const c of inv.components) {
  const missPaths = c.codePaths.filter((p) => !exists(path.join(APP, p)));
  const missCls = c.classes.filter((k) => !isUsed(k));
  const coverage = c.classes.length ? Math.round(100 * (c.classes.length - missCls.length) / c.classes.length) : 100;
  if (missCls.length || missPaths.length) compRows.push(`${c.name} (${coverage}% of its classes used)${missPaths.length ? ` — files named in its README not found: ${missPaths.join(', ')}` : ''}${missCls.length ? ` — unused: ${missCls.join(' ')}` : ''}`);
}
if (compRows.length) add('Components', 'REVIEW', `${compRows.length} of ${inv.components.length} components have classes (variants, parts, states) the app never renders. Implement each one the pages need, from its README + preview.html.`, compRows);
else add('Components', 'OK', 'Every component class is used.');

// ---- 8. key screens ---------------------------------------------------------------------------
const ksRows = [];
for (const k of inv.keyScreens) for (const r of k.references) {
  const miss = r.classes.filter((c) => !isUsed(c));
  if (miss.length) ksRows.push(`${k.id} ${k.route} @${r.width} (${path.basename(r.html)}): ${miss.join(' ')}`);
}
if (ksRows.length) add('Key screens', 'REVIEW', 'Classes used by the key-screen markup that appear nowhere in the app — each is a part of the designed page that may be missing.', ksRows);
else add('Key screens', 'OK', 'Every class used by the key screens is used by the app.');
const evDir = path.join(APP, 'docs/qa/design-system/key-screens');
const evMiss = [];
for (const k of inv.keyScreens) for (const r of k.references) {
  const base = path.basename(r.html, '.html');
  if (!exists(path.join(evDir, `${base}.app.png`))) evMiss.push(`${base}.app.png`);
}
if (evMiss.length) add('Evidence', 'FAIL', `${evMiss.length} key-screen comparisons missing in docs/qa/design-system/key-screens/ (run qa/compare-key-screens.mjs).`, evMiss);
else add('Evidence', 'OK', 'Every key screen has an app screenshot next to its reference.');
const report = path.join(APP, 'docs/qa/design-system/QA-REPORT.md');
if (!exists(report)) add('Evidence', 'FAIL', '`docs/qa/design-system/QA-REPORT.md` is missing (QA-FINAL-RECONCILIATION.md › Report).');

// ---- output -------------------------------------------------------------------------------------
const order = { FAIL: 0, REVIEW: 1, OK: 2 };
results.sort((a, b) => order[a.level] - order[b.level]);
const n = (l) => results.filter((r) => r.level === l).length;
let md = `# Design system audit — v${inv.version}\n\nApp: \`${APP}\` · package: \`${rel(PKG) || PKG}\` · ${new Date().toISOString()}\n\n**FAIL ${n('FAIL')} · REVIEW ${n('REVIEW')} · OK ${n('OK')}**\n\n`;
for (const r of results) {
  md += `## ${r.level} · ${r.area}\n\n${r.msg}\n`;
  if (r.items) md += '\n' + r.items.map((i) => `- ${i}`).join('\n') + '\n';
  md += '\n';
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
if (JSON_OUT) fs.writeFileSync(path.resolve(APP, JSON_OUT), JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.level.padEnd(6)} ${r.area}: ${r.msg}${r.items ? ` (${r.items.length})` : ''}`);
console.log(`\nReport: ${OUT}\nFAIL ${n('FAIL')} · REVIEW ${n('REVIEW')} · OK ${n('OK')}`);
process.exit(n('FAIL') ? 1 : 0);
