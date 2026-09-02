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

export const dynamic = 'force-dynamic';

/**
 * One appeal, from the owner's side — §14.5, D19.
 *
 * The disputed result stays visible beside the answer, and a correction appears
 * as a new version rather than as an edit of what was disputed.
 */
export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/pedigree/appeals/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let appeal;
  try {
    appeal = await ownerAppeal(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [disputed] = await db()
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.id, appeal.resultId));
  const [corrected] = appeal.correctedResultId
    ? await db().select().from(parentageResults).where(eq(parentageResults.id, appeal.correctedResultId))
    : [];

  return (
    <PublicShell actor={guard.actor} title="اعتراض به نتیجه" pathname={'/pedigree/appeals/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <h2 className="text-label-lg">وضعیت اعتراض</h2>
            <StatusBadge tone={appeal.status === 'ANSWERED' ? 'success' : 'info'}>
              <span data-testid="appeal-status">{APPEAL_STATUS_FA[appeal.status]}</span>
            </StatusBadge>
          </div>
          <p className="mt-lg text-body-sm" data-testid="appeal-message">
            {appeal.messageFa}
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            ثبت‌شده در {formatCivilDateFa(appeal.createdAt.toISOString().slice(0, 10))}
          </p>
        </Card>

        <Card>
          <h3 className="text-label-lg">نتیجه مورد اعتراض</h3>
          <p className="mt-md text-body-sm" data-testid="disputed-result">
            نسخه {disputed?.resultVersion ?? '—'} · {disputed ? RESULT_STATUS_FA[disputed.status] : '—'}
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            این نتیجه پاک نمی‌شود و ثبت اعتراض اجازه ویرایش آن را به کاربر نمی‌دهد.
          </p>
        </Card>

        {appeal.responseFa ? (
          <Card>
            <h3 className="text-label-lg">پاسخ مرکز ژنتیک</h3>
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
            <Link
              href={'/pedigree/' + appeal.animalId}
              className="text-text-brand underline underline-offset-4"
              data-testid="back-to-animal-result"
            >
              بازگشت به نتیجه این حیوان
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
