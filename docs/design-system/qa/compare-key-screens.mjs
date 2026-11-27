#!/usr/bin/env node
/**
 * Hamzist design system v1.0.4 — key-screen comparison (step 4 of QA-FINAL-RECONCILIATION.md).
 *
 * For every key-screen reference (key-screens/html/*.html, the exact markup of
 * the approved K1–K19 boards) it opens the reference and the running app page at
 * the same width, saves both full-page screenshots, and writes a structural diff:
 * section headings, design-system classes the app page lacks, primary buttons,
 * images without alt, horizontal scroll.
 *
 * Uses the App's own `playwright` dependency. Run from the App root:
 *
 *   node docs/design-system/qa/compare-key-screens.mjs --init
 *       → writes docs/qa/design-system/key-screen-routes.json (fill in real ids and the
 *         storage state of a signed-in fixture account for each role)
 *   node docs/design-system/qa/compare-key-screens.mjs --base http://localhost:3000
 *   node docs/design-system/qa/compare-key-screens.mjs --base http://localhost:3000 --only K01,K05
 *
 * Output (default docs/qa/design-system/key-screens/):
 *   <name>.ref.png  <name>.app.png  <name>.diff.md  and SUMMARY.md
 * Read every pair of images yourself: the diff finds missing parts, not visual drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.cwd();
const inv = JSON.parse(fs.readFileSync(path.join(PKG, 'qa/ds-inventory.json'), 'utf8'));
const CONFIG = path.resolve(APP, arg('--config', 'docs/qa/design-system/key-screen-routes.json'));
const OUT = path.resolve(APP, arg('--out', 'docs/qa/design-system/key-screens'));
const refs = inv.keyScreens.flatMap((k) => k.references.map((r) => ({ ...r, id: k.id, route: k.route, role: k.role, name: path.basename(r.html, '.html') })));

if (args.includes('--init')) {
  const tpl = {};
  for (const r of refs) tpl[r.name] = { path: r.route, role: r.role, storageState: null, note: r.route && r.route.includes('[') ? 'replace [..] with a demo record id that shows the hard case in key-screens/README.md' : '' };
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  if (fs.existsSync(CONFIG)) { console.error(`${path.relative(APP, CONFIG)} already exists; not overwritten.`); process.exit(1); }
  fs.writeFileSync(CONFIG, JSON.stringify(tpl, null, 2));
  console.log(`Wrote ${path.relative(APP, CONFIG)} with ${refs.length} entries. Fill in ids and storageState (Playwright storage state JSON of a signed-in fixture account for that role), then run with --base.`);
  process.exit(0);
}

const BASE = arg('--base', null);
if (!BASE) { console.error('Pass --base http://localhost:3000 (or run --init first).'); process.exit(2); }
if (!fs.existsSync(CONFIG)) { console.error(`Missing ${path.relative(APP, CONFIG)} — run with --init first.`); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const only = arg('--only', null)?.split(',').map((s) => s.trim().toUpperCase());
const todo = refs.filter((r) => !only || only.some((o) => r.name.toUpperCase().startsWith(o) || r.id === o));

const { chromium } = await import('playwright');
const exe = arg('--chromium', process.env.CHROMIUM_PATH);
const browser = await chromium.launch(exe ? { executablePath: exe } : {}); // run `npx playwright install chromium` once if it is missing
fs.mkdirSync(OUT, { recursive: true });

// Runs in the page: a structural outline that survives different data.
const outline = () => {
  const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const classes = new Set();
  document.querySelectorAll('[class]').forEach((e) => { if (!vis(e)) return; String(e.className.baseVal ?? e.className).split(/\s+/).forEach((c) => c.startsWith('hz-') && classes.add(c)); });
  return {
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => `${h.tagName.toLowerCase()} ${txt(h).slice(0, 80)}`),
    landmarks: ['header', 'nav', 'main', 'aside', 'footer'].map((t) => `${t}×${document.querySelectorAll(t).length}`).join(' '),
    primary: [...document.querySelectorAll('.hz-btn--primary')].filter(vis).map(txt),
    noAlt: [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt')).length,
    brokenImg: [...document.querySelectorAll('img')].filter((i) => vis(i) && i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')),
    hscroll: document.documentElement.scrollWidth > innerWidth,
    font: getComputedStyle(document.querySelector('main') || document.body).fontFamily,
    classes: [...classes].sort(),
  };
};

const shoot = async (url, width, storageState, file) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768, storageState: storageState ? path.resolve(APP, storageState) : undefined, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const res = await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => { errors.push(String(e)); return null; });
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(300);
  const o = await page.evaluate(outline).catch(() => null);
  await page.screenshot({ path: file, fullPage: true }).catch((e) => errors.push(String(e)));
  await ctx.close();
  return { o, status: res ? res.status() : 0, errors, finalUrl: res ? res.url() : url };
};

const norm = (h) => h.replace(/[۰-۹\d]+/g, '#').replace(/\s+/g, ' ').trim();
const summary = [];
for (const r of todo) {
  const c = cfg[r.name];
  const ref = await shoot(pathToFileURL(path.join(PKG, r.html)).href, r.width, null, path.join(OUT, `${r.name}.ref.png`));
  if (!c || !c.path || c.path.includes('[')) { summary.push(`| ${r.name} | ${r.width} | — | not configured (fill ${path.relative(APP, CONFIG)}) |`); continue; }
  const app = await shoot(new URL(c.path, BASE).href, r.width, c.storageState, path.join(OUT, `${r.name}.app.png`));
  const issues = [];
  if (!app.o) issues.push(`page did not render (HTTP ${app.status}) ${app.errors[0] || ''}`);
  else {
    if (app.status >= 400) issues.push(`HTTP ${app.status}`);
    if (new URL(app.finalUrl).pathname !== new URL(c.path, BASE).pathname) issues.push(`redirected to ${app.finalUrl} (sign-in state for role «${r.role}»?)`);
    const appH = new Set(app.o.headings.map(norm));
    const missH = ref.o.headings.filter((h) => !appH.has(norm(h)));
    if (missH.length) issues.push(`headings in the design but not on the page (static titles must match; record names may differ): ${missH.join(' · ')}`);
    const missC = ref.o.classes.filter((k) => !app.o.classes.includes(k));
    if (missC.length) issues.push(`design-system classes visible in the design but not on the page (${missC.length}): ${missC.join(' ')}`);
    if (app.o.primary.length > 1) issues.push(`${app.o.primary.length} primary buttons visible (one per view): ${app.o.primary.join(' · ')}`);
    if (app.o.hscroll) issues.push('horizontal scroll');
    if (app.o.noAlt) issues.push(`${app.o.noAlt} images without alt`);
    if (app.o.brokenImg.length) issues.push(`broken images: ${app.o.brokenImg.join(', ')}`);
    if (!/IRANSansX/.test(app.o.font)) issues.push(`body font is ${app.o.font}`);
    if (app.o.landmarks !== ref.o.landmarks) issues.push(`landmarks differ — design: ${ref.o.landmarks} · page: ${app.o.landmarks}`);
    if (app.errors.length) issues.push(`page errors: ${app.errors.slice(0, 3).join(' | ')}`);
  }
  const md = `# ${r.name} — ${r.id} \`${c.path}\` @${r.width}\n\nReference: \`${r.html}\` → \`${r.name}.ref.png\` · App → \`${r.name}.app.png\`\n\n` +
    (issues.length ? issues.map((i) => `- [ ] ${i}`).join('\n') : '- No structural difference found. Still compare the two images by eye: order, spacing, density, states.') +
    `\n\n## Headings\n\n| Design | Page |\n|---|---|\n${Array.from({ length: Math.max(ref.o.headings.length, app.o?.headings.length || 0) }, (_, i) => `| ${ref.o.headings[i] || ''} | ${app.o?.headings[i] || ''} |`).join('\n')}\n`;
  fs.writeFileSync(path.join(OUT, `${r.name}.diff.md`), md);
  summary.push(`| ${r.name} | ${r.width} | \`${c.path}\` | ${issues.length ? `${issues.length} issue(s) → \`${r.name}.diff.md\`` : 'no structural difference'} |`);
  console.log(`${r.name} @${r.width}: ${issues.length ? issues.length + ' issue(s)' : 'ok'}`);
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), `# Key-screen comparison — design system v${inv.version}\n\n${new Date().toISOString()} · base ${BASE}\n\n| Screen | Width | Route | Result |\n|---|---|---|---|\n${summary.join('\n')}\n`);
console.log(`\n${path.relative(APP, path.join(OUT, 'SUMMARY.md'))}`);
