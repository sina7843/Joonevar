import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { ASSOC_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { profiles } from '../../../../src/db/schema/identity.ts';
import { breedsOfKennel, findKennel, KENNEL_STATUS_FA } from '../../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { KennelReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * One kennel at the association — §15.2, §21.5.
 *
 * The reviewer sees the data the owner submitted and nothing more; no extra
 * breeder document is requested here, because none is required (§15.1).
 */
export default async function AssocKennelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/kennels/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const kennel = await findKennel(db(), id);
  if (!kennel) return <RecordNotFound error={notFoundError('پرونده کنل پیدا نشد.')} />;

  const [breeds, owner] = await Promise.all([
    breedsOfKennel(db(), kennel.id),
    db().select().from(profiles).where(eq(profiles.accountId, kennel.ownerAccountId)).limit(1),
  ]);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname={'/assoc/kennels/' + id} nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{kennel.nameFa ?? 'کنل بدون نام'}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {owner[0] ? owner[0].firstName + ' ' + owner[0].lastName : '—'}
              </p>
            </div>
            <StatusBadge tone="info">
              <span data-testid="assoc-kennel-status">{KENNEL_STATUS_FA[kennel.status]}</span>
            </StatusBadge>
          </div>

          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="assoc-kennel-detail">
            <dt className="text-text-secondary">نام لاتین</dt>
            <dd>{kennel.nameEn ?? '—'}</dd>
            <dt className="text-text-secondary">تلفن</dt>
            <dd>{kennel.phone ?? '—'}</dd>
            <dt className="text-text-secondary">نشانی کنل</dt>
            <dd>
              {[kennel.provinceFa, kennel.cityFa].filter(Boolean).join(' · ')}
              {kennel.addressFa ? ' — ' + kennel.addressFa : ''}
            </dd>
            <dt className="text-text-secondary">زمان ارسال</dt>
            <dd>
              {kennel.submittedAt ? formatCivilDateFa(kennel.submittedAt.toISOString().slice(0, 10)) : '—'}
            </dd>
          </dl>

          <p className="mt-lg text-body-sm" data-testid="assoc-kennel-breeds">
            نژادها ({breeds.length}): {breeds.map((row) => row.nameFa).join('، ') || '—'}
          </p>
        </Card>

        {kennel.status === 'UNDER_REVIEW' ? (
          <Card>
            <h3 className="text-label-lg">تصمیم انجمن</h3>
            <p className="mt-md text-caption text-text-secondary">
              تأیید این پرونده، نقش پرورش‌دهنده همین حساب را فعال می‌کند. هیچ پرداخت جداگانه‌ای برای فعال‌سازی
              نقش وجود ندارد.
            </p>
            <KennelReviewForm kennelId={kennel.id} version={kennel.version} />
          </Card>
        ) : (
          <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
            وضعیت فعلی: {KENNEL_STATUS_FA[kennel.status]}
            {kennel.reasonFa ? ' — ' + kennel.reasonFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
