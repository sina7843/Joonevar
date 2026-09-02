import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { ownerResult, parentResultCheck, RESULT_STATUS_FA } from '../../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';

export const dynamic = 'force-dynamic';

/**
 * One animal's Parentage Result — §14.2, §14.3.
 *
 * The result is shown as soon as the centre records it. The issuance payment is
 * a separate branch: not paying it locks the document, never the result.
 */
export default async function AnimalPedigreePage({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId } = await params;
  const guard = await guardRoute('/pedigree/' + animalId);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let result;
  try {
    result = await ownerResult(db(), guard.actor, animalId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [animal] = await db().select().from(animals).where(eq(animals.id, animalId));
  const parents = await parentResultCheck(db(), animalId);

  return (
    <PublicShell actor={guard.actor} title="نتیجه Parentage" pathname={'/pedigree/' + animalId}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{animal?.name ?? 'بدون نام'}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {animal ? generationLabel(animal.generation) : '—'}
              </p>
            </div>
            {result ? (
              <StatusBadge tone={result.status === 'FINAL' ? 'success' : 'info'}>
                <span data-testid="result-status">{RESULT_STATUS_FA[result.status]}</span>
              </StatusBadge>
            ) : null}
          </div>

          {result === null ? (
            <p className="mt-lg text-body-sm text-text-secondary" data-testid="no-result-yet">
              نتیجه‌ای برای این حیوان ثبت نشده است. پس از دریافت و پردازش نمونه در مرکز، نتیجه همین‌جا دیده
              می‌شود.
            </p>
          ) : (
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="result-detail">
              <dt className="text-text-secondary">نسخه نتیجه</dt>
              <dd data-testid="result-version">{result.resultVersion}</dd>
              <dt className="text-text-secondary">زمان پردازش</dt>
              <dd>
                {result.processedAt ? formatCivilDateFa(result.processedAt.toISOString().slice(0, 10)) : '—'}
              </dd>
              <dt className="text-text-secondary">یادداشت فنی</dt>
              <dd>{result.technicalNoteFa ?? '—'}</dd>
            </dl>
          )}
        </Card>

        {result?.status === 'WAITING_PARENT_RESULTS' ? (
          <Alert tone="warning" title="در انتظار تکمیل نتایج والدین">
            <span data-testid="waiting-parents">
              {parents.state === 'WAITING' ? parents.missingFa : 'نتایج والدین در حال تکمیل است.'} نتیجه ناقص
              به‌عنوان نتیجه نهایی ثبت نمی‌شود.
            </span>
          </Alert>
        ) : null}

        {result?.status === 'FINAL' ? (
          <Alert tone="info" title="صدور سند پرداخت جداگانه دارد">
            <span data-testid="issuance-pending">
              نتیجه آماده است و همین‌جا دیده می‌شود؛ فقط صدور شجره‌نامه در انتظار پرداخت صدور می‌ماند.
            </span>
          </Alert>
        ) : null}

        <Card>
          <p className="text-body-sm">
            <Link
              href={'/animals/' + animalId}
              className="text-text-brand underline underline-offset-4"
              data-testid="back-to-animal"
            >
              بازگشت به پرونده حیوان
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
