import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { GENETICS_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { parentageResults } from '../../../../src/db/schema/genetics.ts';
import { pedigrees } from '../../../../src/db/schema/pedigree.ts';
import { APPEAL_STATUS_FA, findAppeal } from '../../../../src/genetics/appeals.ts';
import { RESULT_STATUS_FA } from '../../../../src/genetics/service.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { AnswerAppealForm, TakeAppealForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

/** One appeal at the centre — §14.5, D19. */
export default async function GeneticsAppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/genetics/appeals/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const appeal = await findAppeal(db(), id);
  if (!appeal) return <RecordNotFound error={notFoundError('اعتراض پیدا نشد.')} />;

  const [animal] = await db().select().from(animals).where(eq(animals.id, appeal.animalId));
  const [disputed] = await db()
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.id, appeal.resultId));
  const [document] = await db().select().from(pedigrees).where(eq(pedigrees.animalId, appeal.animalId));

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname={'/genetics/appeals/' + id} nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{animal?.name ?? 'بدون نام'}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {generationLabel(animal?.generation ?? 0)}
              </p>
            </div>
            <StatusBadge tone={appeal.status === 'ANSWERED' ? 'success' : 'info'}>
              <span data-testid="centre-appeal-status">{APPEAL_STATUS_FA[appeal.status]}</span>
            </StatusBadge>
          </div>
          <p className="mt-lg text-body-sm" data-testid="centre-appeal-message">
            {appeal.messageFa}
          </p>
        </Card>

        <Card>
          <h3 className="text-label-lg">نتیجه مورد اعتراض</h3>
          <p className="mt-md text-body-sm">
            نسخه {disputed?.resultVersion ?? '—'} · {disputed ? RESULT_STATUS_FA[disputed.status] : '—'}
          </p>
          {document ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="issued-document-warning">
              برای این حیوان شجره‌نامه <Identifier value={document.pedigreeCode} /> بر اساس نسخه{' '}
              {document.issuedFromResultVersion} صادر شده است. نتیجه اصلاحی، این سند را بازنویسی یا باطل
              نمی‌کند و فقط یادداشت کنار آن ثبت می‌شود.
            </p>
          ) : null}
        </Card>

        {appeal.status === 'SUBMITTED' ? (
          <Card>
            <h3 className="text-label-lg">شروع بررسی</h3>
            <TakeAppealForm appealId={appeal.id} />
          </Card>
        ) : null}

        {appeal.status === 'ANSWERED' ? (
          <Alert tone="info" title="این اعتراض پاسخ داده شده است">
            {appeal.responseFa}
          </Alert>
        ) : (
          <Card>
            <h3 className="text-label-lg">پاسخ مرکز</h3>
            <AnswerAppealForm appealId={appeal.id} version={appeal.version} />
          </Card>
        )}
      </div>
    </OpsShell>
  );
}
