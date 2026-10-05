import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { ownerPostalRequest, POSTAL_DOCUMENT_FA } from '../../../../src/documents/postal.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/**
 * The recorded postal request — §14.6, D17.
 *
 * This page confirms that the request was recorded and says plainly that it is
 * not a dispatch. There is no tracking number here because there is no carrier
 * integration in this phase, and inventing one would be a lie on the screen.
 */
export default async function PostalRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/documents/postal/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let request;
  try {
    request = await ownerPostalRequest(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const documentHref =
    request.documentType === 'PEDIGREE'
      ? '/documents/pedigree/' + request.documentId
      : '/documents/' + request.documentId;

  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست ارسال پستی"
      pathname={'/documents/postal/' + id}
      header={<PageHeader title={'درخواست ارسال پستی'} back={{ href: documentHref }} />}
    >
      <div className="space-y-lg">
        <Alert tone="success" title="درخواست ارسال ثبت شد">
          <span data-testid="postal-confirmation">
            ثبت درخواست به معنی ارسال واقعی سند نیست. در این فاز اتصال به شرکت پستی، تعرفه حمل، برچسب، کد رهگیری و وضعیت
            تحویل وجود ندارد.
          </span>
        </Alert>

        <Card>
          <div className="hz-section-header hz-section-header--sm">
            <h2 className="hz-section-header__title">
              <span className="hz-section-header__bar" aria-hidden="true" />
              <span>مشخصات درخواست</span>
            </h2>
          </div>
          <dl className="hz-kv mt-lg" data-testid="postal-detail">
            <div className="hz-kv__row">
              <dt className="hz-kv__key">سند</dt>
              <dd className="hz-kv__value" data-testid="postal-document-type">
                {POSTAL_DOCUMENT_FA[request.documentType]}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">گیرنده</dt>
              <dd className="hz-kv__value" data-testid="postal-recipient-name">
                {request.recipientNameFa}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">تماس گیرنده</dt>
              <dd className="hz-kv__value">{request.recipientPhone}</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">نشانی</dt>
              <dd className="hz-kv__value">
                {[request.provinceFa, request.cityFa].filter(Boolean).join(' · ')}
                {request.provinceFa || request.cityFa ? ' — ' : ''}
                {request.addressFa}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">کد پستی</dt>
              <dd className="hz-kv__value">{request.postalCode ?? '—'}</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">زمان ثبت</dt>
              <dd className="hz-kv__value">{formatCivilDateFa(request.createdAt.toISOString().slice(0, 10))}</dd>
            </div>
          </dl>
          <p className="mt-lg text-body-sm">
            <Link href={documentHref} className="hz-link" data-testid="postal-document-link">
              بازگشت به سند
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
