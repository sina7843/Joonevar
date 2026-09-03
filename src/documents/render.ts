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
import { AppError } from '../domain/errors.ts';

export interface DocumentField {
  readonly labelFa: string;
  readonly value: string;
}

export interface DocumentSpec {
  readonly titleFa: string;
  readonly subtitleFa?: string | null;
  readonly identifierLabelFa: string;
  readonly identifier: string;
  readonly fields: readonly DocumentField[];
  readonly footerFa: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The printable page.
 *
 * Deliberately self-contained: no external stylesheet, no network font and no
 * remote image, so rendering is deterministic and offline.
 */
export function documentHtml(spec: DocumentSpec): string {
  const rows = spec.fields
    .map(
      (field) =>
        '<tr><th>' + escapeHtml(field.labelFa) + '</th><td>' + escapeHtml(field.value) + '</td></tr>',
    )
    .join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>${escapeHtml(spec.titleFa)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Vazirmatn, Tahoma, "Segoe UI", sans-serif; color: #10241f; line-height: 1.9; }
  header { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0; }
  .subtitle { color: #4b5563; font-size: 13px; margin-top: 6px; }
  .identifier { margin: 18px 0; font-size: 15px; }
  .identifier code { direction: ltr; unicode-bidi: embed; font-family: Consolas, monospace; font-size: 17px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #d1d5db; padding: 10px 6px; text-align: right; vertical-align: top; }
  th { width: 34%; color: #4b5563; font-weight: 500; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d1d5db; color: #6b7280; font-size: 12px; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(spec.titleFa)}</h1>
    ${spec.subtitleFa ? '<p class="subtitle">' + escapeHtml(spec.subtitleFa) + '</p>' : ''}
  </header>
  <p class="identifier">${escapeHtml(spec.identifierLabelFa)}: <code>${escapeHtml(spec.identifier)}</code></p>
  <table>${rows}</table>
  <footer>${escapeHtml(spec.footerFa)}</footer>
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
    await page.setContent(documentHtml(spec), { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}
