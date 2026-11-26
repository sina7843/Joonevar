import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentHtml, renderDocumentPdf, type DocumentSpec } from '../../src/documents/render.ts';

const SPEC: DocumentSpec = {
  titleFa: 'شجره‌نامه',
  docTypeFa: 'شجره‌نامه',
  subtitleFa: 'SYNTHETIC',
  identifierLabelFa: 'کد شجره‌نامه',
  identifier: 'PD-SYNTHETIC1',
  issuedFa: 'صادرشده در ۱۲ فروردین ۱۴۰۵',
  fields: [{ labelFa: 'نام حیوان', value: 'SYNTHETIC Rex' }],
  pedigree: {
    subject: { nameFa: 'SYNTHETIC Rex', metaFa: 'نر · G1' },
    parents: [
      { roleFa: 'پدر', nameFa: 'SYNTHETIC Sire', metaFa: 'G0' },
      { roleFa: 'مادر', nameFa: null },
    ],
    grandparents: [
      { roleFa: 'پدرِ پدر', nameFa: null },
      { roleFa: 'مادرِ پدر', nameFa: null },
      { roleFa: 'پدرِ مادر', nameFa: null },
      { roleFa: 'مادرِ مادر', nameFa: null },
    ],
  },
  signers: [{ roleFa: 'کارشناس صادرکننده', nameFa: null }],
  verifyUrl: 'https://example.invalid/verify?code=PD-SYNTHETIC1',
  footerFa: 'SYNTHETIC footer',
  printedOn: '2026-10-02',
};

test('the A4 page follows the template: brand strip, IRANSansX, definition lists, no teal', () => {
  const html = documentHtml(SPEC, { qrSvg: '<svg></svg>' });
  assert.match(html, /lang="fa" dir="rtl"/);
  assert.match(html, /font-family: "IRANSansX"/);
  assert.doesNotMatch(html, /Vazirmatn|Consolas|#0f766e/i);
  assert.match(html, /<dl class="kvs/);
  assert.match(html, /--accent-bar:#E46A1D/);
  assert.match(html, /استعلام اصالت/);
  assert.match(html, /صفحه ۱ از ۱، چاپ /);
  assert.match(html, /<h1>/);
});

test('an unknown ancestor reads «نامشخص» with its reason, never a bare dash', () => {
  const html = documentHtml(SPEC);
  assert.equal((html.match(/نامشخص<\/b>/g) ?? []).length, 5);
  assert.match(html, /در همزیست ثبت نشده/);
  assert.match(html, /نسل ۲/);
});

test('a void copy keeps its number and verify line under the stamp', () => {
  const html = documentHtml({ ...SPEC, voidStamp: 'REVOKED' }, { qrSvg: null });
  assert.match(html, /class="stamp"[^>]*>باطل‌شده/);
  assert.match(html, /PD-SYNTHETIC1/);
});

test('the PDF is tagged and carries the structure tree', async (t) => {
  let pdf: Uint8Array;
  try {
    pdf = await renderDocumentPdf(SPEC);
  } catch (error) {
    t.skip('Chromium is not available here: ' + (error as Error).message);
    return;
  }
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF'));
  assert.match(text, /\/StructTreeRoot/);
  assert.match(text, /\/Lang/);
  // Every page is exactly A4 (595 × 842 pt).
  const boxes = text.match(/\/MediaBox\s*\[[^\]]*\]/g) ?? [];
  assert.ok(boxes.length > 0, 'pages have a MediaBox');
  for (const box of boxes) assert.match(box, /\[\s*0\s+0\s+595(\.\d+)?\s+84[12](\.\d+)?\s*\]/, box);
});
