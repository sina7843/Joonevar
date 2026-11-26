import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { KeyValueList } from './key-value.tsx';
import { Identifier } from './status.tsx';

export type IssuedDocumentKind = 'REGISTRATION_SHEET' | 'PEDIGREE' | 'MATING_PERMIT' | 'PUPPY_CARD';

/** One icon per type (DS DocumentCard, approved 11 Mehr 1405). */
const KIND: Record<IssuedDocumentKind, { labelFa: string; icon: IconName }> = {
  REGISTRATION_SHEET: { labelFa: 'برگه ثبتی', icon: 'fileText' },
  PEDIGREE: { labelFa: 'شجره‌نامه', icon: 'treeStructure' },
  MATING_PERMIT: { labelFa: 'مجوز جفت‌گیری', icon: 'handshake' },
  PUPPY_CARD: { labelFa: 'کارت توله', icon: 'pawPrint' },
};

/**
 * DS *DocumentCard*: an issued document with its number, issue date, «دریافت
 * PDF» and «استعلام اصالت». The card is not a link; its actions are. `viewHref`
 * is an extra, quieter link to the on-screen sheet.
 */
export function DocumentCard({
  kind,
  number,
  subject,
  issuedFa,
  pdfHref,
  verifyHref,
  viewHref,
  note,
  testId,
  viewTestId,
}: {
  kind: IssuedDocumentKind;
  number: string;
  subject: ReactNode;
  issuedFa: string | null;
  pdfHref: string;
  verifyHref: string;
  viewHref?: string;
  note?: ReactNode;
  testId?: string;
  viewTestId?: string;
}) {
  const { labelFa, icon } = KIND[kind];
  return (
    <article className="hz-card hz-document" data-testid={testId}>
      <div className="hz-document__head">
        <span className="hz-document__icon">
          <Icon name={icon} size="md" />
        </span>
        <div className="hz-document__titles">
          <h3 className="hz-document__type">{labelFa}</h3>
          <span className="hz-document__subject">{subject}</span>
        </div>
      </div>
      <KeyValueList
        rows={[
          { key: 'شماره سند', value: <Identifier value={number} /> },
          { key: 'تاریخ صدور', value: issuedFa },
        ]}
      />
      {note ? <p className="hz-document__note mt-sm">{note}</p> : null}
      <div className="hz-card__footer">
        <a className="hz-btn hz-btn--secondary hz-btn--sm" href={pdfHref} data-testid={testId ? testId + '-pdf' : undefined}>
          <Icon name="downloadSimple" size="xs" />
          دریافت PDF
        </a>
        <Link className="hz-link hz-link--standalone" href={verifyHref}>
          <Icon name="shieldCheck" size="xs" />
          استعلام اصالت
        </Link>
        {viewHref ? (
          <Link className="hz-link hz-link--standalone" href={viewHref} data-testid={viewTestId}>
            مشاهده سند
          </Link>
        ) : null}
      </div>
    </article>
  );
}
