import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../src/domain/ids.ts';
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
import { ownerResult, parentResultCheck } from '../../../src/genetics/service.ts';
import { appealsOfAnimal, APPEAL_STATUS_FA } from '../../../src/genetics/appeals.ts';
import { pedigreeOfAnimal } from '../../../src/documents/pedigree.ts';
import { AppealForm } from '../forms.tsx';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { PageHeader } from '../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/**
 * One animal's Parentage Result — §14.2, §14.3.
 *
 * The result is shown as soon as the centre records it. The issuance payment is
 * a separate branch: not paying it locks the document, never the result.
 */
export default async function AnimalPedigreePage({ params }: { params: Promise<{ animalId: string }> }) {
  const { animalId } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(animalId)) pageNotFound();
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
  const [appeals, pedigree] = await Promise.all([appealsOfAnimal(db(), animalId), pedigreeOfAnimal(db(), animalId)]);

  return (
    <PublicShell
      actor={guard.actor}
      title="نتیجه Parentage"
      pathname={'/pedigree/' + animalId}
      header={<PageHeader title={'نتیجه Parentage'} back={{ href: '/pedigree' }} />}
    >
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <div className="hz-section-header hz-section-header--sm">
                <h2 className="hz-section-header__title">
                  <span className="hz-section-header__bar" aria-hidden="true" />
                  <span>{animal?.name ?? 'بدون نام'}</span>
                </h2>
              </div>
              <p className="mt-2xs text-caption text-text-secondary">
                {animal ? generationLabel(animal.generation) : '—'}
              </p>
            </div>
            {result ? (
              <span data-testid="result-status">
                <StatusBadge status={result.status} />
              </span>
            ) : null}
          </div>

          {result === null ? (
            <p className="mt-lg text-body-sm text-text-secondary" data-testid="no-result-yet">
              نتیجه‌ای برای این حیوان ثبت نشده است. پس از دریافت و پردازش نمونه در مرکز، نتیجه همین‌جا دیده می‌شود.
            </p>
          ) : (
            <dl className="hz-kv mt-lg" data-testid="result-detail">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نسخه نتیجه</dt>
                <dd className="hz-kv__value" data-testid="result-version">
                  {result.resultVersion}
                </dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">زمان پردازش</dt>
                <dd className="hz-kv__value">
                  {result.processedAt ? formatCivilDateFa(result.processedAt.toISOString().slice(0, 10)) : '—'}
                </dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">کد DNA</dt>
                <dd className="hz-kv__value">{result.technicalNoteFa ?? '—'}</dd>
              </div>
            </dl>
          )}
        </Card>

        {result?.status === 'WAITING_PARENT_RESULTS' ? (
          <Alert tone="warning" title="در انتظار تکمیل نتایج والدین">
            <span data-testid="waiting-parents">
              {parents.state === 'WAITING' ? parents.missingFa : 'نتایج والدین در حال تکمیل است.'} نتیجه ناقص به‌عنوان
              نتیجه نهایی ثبت نمی‌شود.
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

        {pedigree ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h3 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>شجره‌نامه صادرشده</span>
              </h3>
            </div>
            <p className="mt-md text-body-sm">
              <Link href={'/documents/pedigree/' + pedigree.id} className="hz-link" data-testid="animal-pedigree-link">
                مشاهده شجره‌نامه {pedigree.pedigreeCode}
              </Link>
            </p>
          </Card>
        ) : result?.status === 'FINAL' ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h3 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>صدور شجره‌نامه</span>
              </h3>
            </div>
            <p className="mt-md text-caption text-text-secondary">
              نتیجه نهایی است؛ برای صدور سند، پرداخت صدور در هم‌زیست لازم است.
            </p>
            <p className="mt-md text-body-sm">
              <Link href="/pedigree/issue" className="hz-link" data-testid="go-to-issuance">
                درخواست صدور شجره‌نامه
              </Link>
            </p>
          </Card>
        ) : null}

        {appeals.length > 0 ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h3 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>اعتراض‌های ثبت‌شده</span>
              </h3>
            </div>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="animal-appeals">
              {appeals.map((appeal) => (
                <li key={appeal.id} className="flex items-center justify-between gap-md">
                  <Link href={'/pedigree/appeals/' + appeal.id} className="hz-link">
                    اعتراض {formatCivilDateFa(appeal.createdAt.toISOString().slice(0, 10))}
                  </Link>
                  <span className="text-text-secondary">{APPEAL_STATUS_FA[appeal.status]}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {result && appeals.every((a) => a.status === 'ANSWERED') ? (
          <AppealForm animalId={animalId} resultId={result.id} />
        ) : null}

        <Card>
          <p className="text-body-sm">
            <Link href={'/animals/' + animalId} className="hz-link" data-testid="back-to-animal">
              بازگشت به پرونده حیوان
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
