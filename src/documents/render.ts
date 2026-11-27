/**
 * PDF rendering for issued documents — §13, §14, §19.4, D16.
 *
 * The engine is the Chromium build this project already carries for its browser
 * tests, driven through Playwright's `page.pdf()`. It was chosen over the
 * JavaScript PDF libraries for one reason that matters here: Persian is a
 * cursive, right-to-left script, and Chromium is the only free option in reach
 * that does real text shaping, bidi and web fonts without hand-built glyph
 * work. It is free, runs entirely on this machine and sends nothing anywhere.
 *
 * What this renders is a faithful print of the data Hamzist holds. It is not
 * the association's official printed template, which has not been delivered;
 * the page says so on its face rather than implying an official artefact.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { AppError } from '../domain/errors.ts';
import { formatCivilDateFa } from '../domain/calendar.ts';

export interface DocumentField {
  readonly labelFa: string;
  readonly value: string;
}

/**
 * A table of lines, for a document that itemises rather than merely states —
 * an invoice, where the fields alone would flatten three purchases into one
 * paragraph (PROMPT-012).
 */
export interface DocumentTable {
  readonly captionFa: string;
  readonly headersFa: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** A titled block of key/value rows (DS A4DocumentTemplate section). */
export interface DocumentSection {
  readonly titleFa: string;
  readonly fields: readonly DocumentField[];
  /** Two-column grid for identifiers; default is one column. */
  readonly twoColumns?: boolean;
}

/** One ancestor in the pedigree tree; a null name renders «نامشخص» with its reason. */
export interface PedigreeNode {
  readonly roleFa: string;
  readonly nameFa: string | null;
  readonly metaFa?: string | null;
  /** Why the node is unknown: «در همزیست ثبت نشده». */
  readonly unknownFa?: string;
}

export interface PedigreeSheet {
  readonly subject: { readonly nameFa: string; readonly metaFa: string };
  /** Generation 1: sire, dam. */
  readonly parents: readonly [PedigreeNode, PedigreeNode];
  /** Generation 2: sire's sire, sire's dam, dam's sire, dam's dam. */
  readonly grandparents: readonly [PedigreeNode, PedigreeNode, PedigreeNode, PedigreeNode];
}

export interface DocumentSigner {
  readonly roleFa: string;
  readonly nameFa: string | null;
}

export interface DocumentSpec {
  readonly titleFa: string;
  readonly subtitleFa?: string | null;
  readonly identifierLabelFa: string;
  readonly identifier: string;
  readonly fields: readonly DocumentField[];
  readonly table?: DocumentTable | null;
  readonly footerFa: string;
  /** «برگه ثبتی» — the small brand-coloured document type in the head. */
  readonly docTypeFa?: string;
  /** «صادرشده در ۱۲ فروردین ۱۴۰۵». */
  readonly issuedFa?: string | null;
  /** More sections after `fields` (which is the first, «مشخصات»). */
  readonly sections?: readonly DocumentSection[];
  readonly pedigree?: PedigreeSheet;
  readonly signers?: readonly DocumentSigner[];
  /** The authenticity URL, encoded in the QR code. */
  readonly verifyUrl?: string | null;
  /** A void copy: the body stays readable under a rotated stamp. */
  readonly voidStamp?: 'REVOKED' | 'SUPERSEDED' | null;
  /** Fixed for tests; defaults to today. ISO date (yyyy-mm-dd). */
  readonly printedOn?: string;
}

const STAMP_FA = { REVOKED: 'باطل‌شده', SUPERSEDED: 'جایگزین‌شده' } as const;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Latin runs (ids, numbers, foreign names) stay left-to-right inside RTL text. */
const bdi = (value: string): string => '<bdi dir="auto">' + escapeHtml(value) + '</bdi>';

/**
 * IRANSansX, the system's only family (Typography), embedded as data URIs so the
 * page stays offline and deterministic. Read once, on first render.
 */
let fontFaces: string | undefined;
function documentFontFaces(): string {
  fontFaces ??= (
    [
      ['Regular', 400],
      ['Medium', 500],
      ['DemiBold', 600],
    ] as const
  )
    .map(([name, weight]) => {
      const data = readFileSync(path.join(process.cwd(), 'public/fonts/IRANSansX-' + name + '.woff2')).toString('base64');
      return "@font-face{font-family:'IRANSansX';src:url(data:font/woff2;base64," + data + ") format('woff2');font-weight:" + weight + ';}';
    })
    .join('');
  return fontFaces;
}

let lockup: string | undefined;
/** The Persian horizontal lockup (light), inlined so the page makes no request. */
function lockupDataUri(): string {
  lockup ??=
    'data:image/svg+xml;base64,' +
    readFileSync(path.join(process.cwd(), 'public/brand/logo/lockup-horizontal-fa-light.svg')).toString('base64');
  return lockup;
}

const kvRows = (fields: readonly DocumentField[]): string =>
  fields.map((field) => '<div class="kv"><dt>' + escapeHtml(field.labelFa) + '</dt><dd>' + bdi(field.value) + '</dd></div>').join('');

function sectionHtml(section: DocumentSection): string {
  return (
    '<section class="section"><h2>' + escapeHtml(section.titleFa) + '</h2><dl class="kvs' + (section.twoColumns ? ' kv2' : '') + '">' + kvRows(section.fields) + '</dl></section>'
  );
}

function nodeHtml(node: PedigreeNode, gen: number): string {
  const known = node.nameFa !== null;
  return (
    '<li class="ped' + (known ? '' : ' ped-unknown') + '" data-gen="' + gen + '"><span class="ped-role">' + escapeHtml(node.roleFa) + '</span><b class="ped-name">' +
    (known ? bdi(node.nameFa as string) : 'نامشخص') + '</b><span class="ped-meta">' +
    escapeHtml(known ? (node.metaFa ?? '') : (node.unknownFa ?? 'در همزیست ثبت نشده')) + '</span></li>'
  );
}

/** Three generations: subject, parents, grandparents — a list a screen reader can read in order. */
function pedigreeHtml(tree: PedigreeSheet): string {
  return (
    '<section class="section"><h2>درخت نیاکان (سه نسل)</h2>' +
    '<div class="ped-subject"><span class="ped-role">حیوان</span><b class="ped-name">' + bdi(tree.subject.nameFa) + '</b><span class="ped-meta">' + escapeHtml(tree.subject.metaFa) + '</span></div>' +
    '<div class="ped-cols"><div><h3>نسل ۱ — والدین</h3><ul>' + tree.parents.map((n) => nodeHtml(n, 1)).join('') + '</ul></div>' +
    '<div><h3>نسل ۲ — پدربزرگ و مادربزرگ</h3><ul>' + tree.grandparents.map((n) => nodeHtml(n, 2)).join('') + '</ul></div></div></section>'
  );
}

/**
 * The printable page — DS *A4DocumentTemplate*: a white sheet with an orange top
 * strip, the Persian lockup and the document number at the head, a title bar
 * with the authenticity QR, sections of definition lists, signature slots and a
 * footer that says how to verify. Light theme always; IRANSansX only.
 *
 * Self-contained: no external stylesheet, no network font and no remote image,
 * so rendering is deterministic and offline.
 */
export function documentHtml(spec: DocumentSpec, extras: { qrSvg?: string | null; pages?: number } = {}): string {
  const sections = [
    spec.fields.length > 0 ? sectionHtml({ titleFa: 'مشخصات', fields: spec.fields }) : '',
    spec.pedigree ? pedigreeHtml(spec.pedigree) : '',
    ...(spec.sections ?? []).map(sectionHtml),
  ].join('');

  const table =
    spec.table && spec.table.rows.length > 0
      ? '<section class="section"><h2>' +
        escapeHtml(spec.table.captionFa) +
        '</h2><table class="lines"><thead><tr>' +
        spec.table.headersFa.map((header) => '<th scope="col">' + escapeHtml(header) + '</th>').join('') +
        '</tr></thead><tbody>' +
        spec.table.rows
          .map((row) => '<tr>' + row.map((cell) => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>')
          .join('') +
        '</tbody></table></section>'
      : '';

  const signers =
    spec.signers && spec.signers.length > 0
      ? '<div class="sign">' +
        spec.signers
          .map(
            (s) =>
              '<div class="sign-slot"><div class="sign-line"></div><span class="sign-role">' + escapeHtml(s.roleFa) + '</span><span class="sign-name">' + (s.nameFa ? escapeHtml(s.nameFa) : '—') + '</span></div>',
          )
          .join('') +
        '<div class="seal">مهر انجمن</div></div>'
      : '';

  const printedFa = formatCivilDateFa(spec.printedOn ?? new Date().toISOString().slice(0, 10));
  const pages = extras.pages ?? 1;
  const verify = spec.verifyUrl
    ? 'برای استعلام اصالت، شماره <b>' + bdi(spec.identifier) + '</b> را در «استعلام اصالت» همزیست وارد کنید' + (extras.qrSvg ? ' یا کد QR را اسکن کنید' : '') + '.'
    : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>${escapeHtml(spec.titleFa)}</title>
<style>
  ${documentFontFaces()}
  :root { --text-primary:#3A3B36; --text-secondary:#685F57; --text-brand:#A83D0B; --accent-bar:#E46A1D; --border-default:#DED5CA; --border-subtle:#F0EAE2; --border-control:#938980; --status-error-text:#B42318; color-scheme: light; }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { font-family: "IRANSansX", Tahoma, system-ui, sans-serif; color: var(--text-primary); font-size: 13px; line-height: 22px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { position: relative; display: flex; flex-direction: column; width: 794px; min-height: 1123px; padding: 48px 56px 40px; }
  .sheet::before { content: ""; position: absolute; inset-block-start: 0; inset-inline: 0; height: 6px; background: var(--accent-bar); }
  bdi { unicode-bidi: isolate; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-block-end: 20px; border-block-end: 1px solid var(--border-default); }
  .brand { display: flex; flex-direction: column; gap: 6px; }
  .brand img { display: block; height: 40px; width: auto; }
  .brand-sub { font-size: 11px; line-height: 18px; color: var(--text-secondary); }
  .docmeta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: end; }
  .doctype { font-size: 12px; line-height: 20px; font-weight: 700; color: var(--text-brand); }
  .docno { direction: ltr; unicode-bidi: isolate; font-size: 18px; line-height: 28px; font-weight: 800; letter-spacing: .04em; }
  .issued { font-size: 12px; line-height: 20px; color: var(--text-secondary); }
  .titlebar { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-block: 28px 24px; }
  h1 { display: flex; align-items: flex-start; gap: 12px; margin: 0; font-size: 26px; line-height: 40px; font-weight: 800; }
  h1::before { content: ""; flex-shrink: 0; width: 5px; height: 28px; margin-block-start: 6px; border-radius: 9999px; background: var(--accent-bar); }
  .lead { margin: 4px 0 0; padding-inline-start: 17px; font-size: 13px; color: var(--text-secondary); max-width: 440px; }
  .qr { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
  .qr svg { width: 104px; height: 104px; display: block; }
  .qr-cap { font-size: 10px; line-height: 16px; color: var(--text-secondary); }
  .section { margin-block-end: 22px; break-inside: avoid; }
  h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 15px; line-height: 22px; font-weight: 700; }
  h2::before { content: ""; width: 3px; height: 14px; border-radius: 9999px; background: var(--accent-bar); }
  h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--text-secondary); }
  dl.kvs { margin: 0; }
  .kv { display: grid; grid-template-columns: minmax(96px, 38%) minmax(0, 1fr); gap: 12px; padding-block: 8px; border-block-end: 1px solid var(--border-subtle); }
  .kv dt { font-size: 12px; line-height: 20px; color: var(--text-secondary); }
  .kv dd { margin: 0; font-size: 14px; line-height: 24px; overflow-wrap: anywhere; }
  .kv2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th, table.lines td { border-block-end: 1px solid var(--border-subtle); padding: 8px 6px; text-align: start; vertical-align: top; }
  table.lines th { font-weight: 700; color: var(--text-secondary); font-size: 12px; }
  .ped-subject { display: flex; flex-direction: column; padding: 10px 14px; margin-block-end: 12px; border: 1px solid var(--border-control); border-radius: 8px; }
  .ped-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .ped-cols ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .ped { display: flex; flex-direction: column; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: 8px; }
  .ped-unknown { border-style: dashed; color: var(--text-secondary); }
  .ped-role { font-size: 11px; line-height: 18px; color: var(--text-secondary); }
  .ped-name { font-size: 14px; line-height: 22px; font-weight: 700; }
  .ped-meta { font-size: 11px; line-height: 18px; color: var(--text-secondary); }
  .sign { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 24px; margin-block-start: auto; padding-block-start: 16px; break-inside: avoid; }
  .sign-slot { display: flex; flex-direction: column; gap: 2px; }
  .sign-line { height: 56px; border-block-end: 1px solid var(--border-control); }
  .sign-role { margin-block-start: 6px; font-size: 11px; line-height: 18px; color: var(--text-secondary); }
  .sign-name { font-size: 13px; line-height: 20px; font-weight: 700; }
  .seal { display: grid; place-items: center; width: 88px; height: 88px; margin-inline: auto; text-align: center; border: 1px dashed var(--border-default); border-radius: 9999px; font-size: 11px; color: var(--text-secondary); }
  footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-block-start: auto; padding-block-start: 12px; border-block-start: 1px solid var(--border-default); font-size: 11px; line-height: 18px; color: var(--text-secondary); break-inside: avoid; }
  .sign + footer { margin-block-start: 20px; }
  footer .verify { max-width: 520px; }
  footer .verify b { color: var(--text-primary); }
  footer .note { display: block; margin-block-start: 4px; }
  footer .page { white-space: nowrap; }
  .stamp { position: absolute; inset-block-start: 46%; inset-inline: 0; margin-inline: auto; width: max-content; padding: 6px 28px; border: 3px solid var(--status-error-text); border-radius: 8px; color: var(--status-error-text); font-size: 34px; line-height: 48px; font-weight: 800; transform: rotate(-12deg); opacity: .85; pointer-events: none; }
</style></head>
<body>
<div class="sheet">
  <header class="head">
    <div class="brand"><img src="${lockupDataUri()}" alt="همزیست"><span class="brand-sub">سامانه رسمی ثبت سگ و گربه</span></div>
    <div class="docmeta">
      <span class="doctype">${escapeHtml(spec.docTypeFa ?? spec.titleFa)}</span>
      <span class="docno" aria-label="${escapeHtml(spec.identifierLabelFa)}">${escapeHtml(spec.identifier)}</span>
      ${spec.issuedFa ? '<span class="issued">' + escapeHtml(spec.issuedFa) + '</span>' : ''}
    </div>
  </header>
  <div class="titlebar">
    <div><h1>${escapeHtml(spec.titleFa)}</h1>${spec.subtitleFa ? '<p class="lead">' + escapeHtml(spec.subtitleFa) + '</p>' : ''}</div>
    ${extras.qrSvg ? '<div class="qr">' + extras.qrSvg + '<span class="qr-cap">استعلام اصالت</span></div>' : ''}
  </div>
  <main>${sections}${table}</main>
  ${signers}
  <footer>
    <div class="verify">${verify}<span class="note">${escapeHtml(spec.footerFa)}</span></div>
    <span class="page">${pages === 1 ? 'صفحه ۱ از ۱' : pages.toLocaleString('fa-IR') + ' صفحه'}، چاپ ${escapeHtml(printedFa)}</span>
  </footer>
  ${spec.voidStamp ? '<div class="stamp" role="img" aria-label="' + STAMP_FA[spec.voidStamp] + '">' + STAMP_FA[spec.voidStamp] + '</div>' : ''}
</div>
</body></html>`;
}

/**
 * Renders the page to PDF bytes with the local Chromium.
 *
 * Playwright is imported lazily so that nothing pays for the browser unless a
 * PDF is actually asked for, and a missing browser fails with a named reason
 * rather than a stack trace.
 */
export async function renderDocumentPdf(spec: DocumentSpec): Promise<Uint8Array> {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new AppError('NOT_CONFIGURED', 'موتور تولید PDF در دسترس نیست.', {
      detail: { adapter: 'document-render' },
    });
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    throw new AppError('NOT_CONFIGURED', 'مرورگر تولید PDF نصب نشده است.', {
      detail: { adapter: 'document-render' },
    });
  }
  try {
    const page = await browser.newPage();
    const qrSvg = spec.verifyUrl ? await QRCode.toString(spec.verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : null;
    await page.setContent(documentHtml(spec, { qrSvg }), { waitUntil: 'load' });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const pages = Math.max(1, Math.ceil((height - 1) / 1123));
    if (pages > 1) await page.setContent(documentHtml(spec, { qrSvg, pages }), { waitUntil: 'load' });
    // Tagged (accessible) PDF with an outline: h1/h2 become structure and dl rows read as pairs.
    // format, not @page: Chromium's CSS A4 comes out 594.96 × 841.92 pt, not A4.
    return await page.pdf({ format: 'A4', printBackground: true, tagged: true, outline: true });
  } finally {
    await browser.close();
  }
}
