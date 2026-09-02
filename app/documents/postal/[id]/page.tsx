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
    <PublicShell actor={guard.actor} title="درخواست ارسال پستی" pathname={'/documents/postal/' + id}>
      <div className="space-y-lg">
        <Alert tone="success" title="درخواست ارسال ثبت شد">
          <span data-testid="postal-confirmation">
            ثبت درخواست به معنی ارسال واقعی سند نیست. در این فاز اتصال به شرکت پستی، تعرفه حمل، برچسب، کد رهگیری
            و وضعیت تحویل وجود ندارد.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">مشخصات درخواست</h2>
          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="postal-detail">
            <dt className="text-text-secondary">سند</dt>
            <dd data-testid="postal-document-type">{POSTAL_DOCUMENT_FA[request.documentType]}</dd>
            <dt className="text-text-secondary">گیرنده</dt>
            <dd data-testid="postal-recipient-name">{request.recipientNameFa}</dd>
            <dt className="text-text-secondary">تماس گیرنده</dt>
            <dd>{request.recipientPhone}</dd>
            <dt className="text-text-secondary">نشانی</dt>
            <dd>
              {[request.provinceFa, request.cityFa].filter(Boolean).join(' · ')}
              {request.provinceFa || request.cityFa ? ' — ' : ''}
              {request.addressFa}
            </dd>
            <dt className="text-text-secondary">کد پستی</dt>
            <dd>{request.postalCode ?? '—'}</dd>
            <dt className="text-text-secondary">زمان ثبت</dt>
            <dd>{formatCivilDateFa(request.createdAt.toISOString().slice(0, 10))}</dd>
          </dl>
          <p className="mt-lg text-body-sm">
            <Link href={documentHref} className="text-text-brand underline underline-offset-4" data-testid="postal-document-link">
              بازگشت به سند
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
