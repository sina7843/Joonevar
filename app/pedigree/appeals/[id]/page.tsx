import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { parentageResults } from '../../../../src/db/schema/genetics.ts';
import { APPEAL_STATUS_FA, ownerAppeal } from '../../../../src/genetics/appeals.ts';
import { RESULT_STATUS_FA } from '../../../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/**
 * One appeal, from the owner's side — §14.5, D19.
 *
 * The disputed result stays visible beside the answer, and a correction appears
 * as a new version rather than as an edit of what was disputed.
 */
export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/pedigree/appeals/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let appeal;
  try {
    appeal = await ownerAppeal(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [disputed] = await db().select().from(parentageResults).where(eq(parentageResults.id, appeal.resultId));
  const [corrected] = appeal.correctedResultId
    ? await db().select().from(parentageResults).where(eq(parentageResults.id, appeal.correctedResultId))
    : [];

  return (
    <PublicShell
      actor={guard.actor}
      title="اعتراض به نتیجه"
      pathname={'/pedigree/appeals/' + id}
      header={<PageHeader title={'اعتراض به نتیجه'} back={{ href: '/pedigree' }} />}
    >
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>وضعیت اعتراض</span>
              </h2>
            </div>
            <span data-testid="appeal-status">
              {appeal.status === 'ANSWERED' ? (
                // GAPS #4: no dictionary key for ANSWERED
                <StatusBadge tone="success">{APPEAL_STATUS_FA[appeal.status]}</StatusBadge>
              ) : (
                <StatusBadge status={appeal.status} />
              )}
            </span>
          </div>
          <p className="mt-lg text-body-sm" data-testid="appeal-message">
            {appeal.messageFa}
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            ثبت‌شده در {formatCivilDateFa(appeal.createdAt.toISOString().slice(0, 10))}
          </p>
        </Card>

        <Card>
          <div className="hz-section-header hz-section-header--sm">
            <h3 className="hz-section-header__title">
              <span className="hz-section-header__bar" aria-hidden="true" />
              <span>نتیجه مورد اعتراض</span>
            </h3>
          </div>
          <p className="mt-md text-body-sm" data-testid="disputed-result">
            نسخه {disputed?.resultVersion ?? '—'} · {disputed ? RESULT_STATUS_FA[disputed.status] : '—'}
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            این نتیجه پاک نمی‌شود و ثبت اعتراض اجازه ویرایش آن را به کاربر نمی‌دهد.
          </p>
        </Card>

        {appeal.responseFa ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h3 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>پاسخ مرکز ژنتیک</span>
              </h3>
            </div>
            <p className="mt-md text-body-sm" data-testid="appeal-response">
              {appeal.responseFa}
            </p>
            {corrected ? (
              <Alert tone="info" title="نتیجه اصلاحی ثبت شد">
                <span data-testid="corrected-result">
                  نتیجه اصلاحی نسخه {corrected.resultVersion} است و نتیجه قبلی در سابقه باقی می‌ماند.
                </span>
              </Alert>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <p className="text-body-sm">
            <Link href={'/pedigree/' + appeal.animalId} className="hz-link" data-testid="back-to-animal-result">
              بازگشت به نتیجه این حیوان
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
