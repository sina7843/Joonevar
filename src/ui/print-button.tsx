'use client';

import { Icon } from './icon.tsx';

/** DS document toolbar «چاپ»: prints the page; the sheet's own print rules hide the chrome. */
export function PrintButton() {
  return (
    <button type="button" className="hz-btn hz-btn--secondary" onClick={() => window.print()} data-testid="print-document">
      <Icon name="printer" size="sm" />
      چاپ
    </button>
  );
}
