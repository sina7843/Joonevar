import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { GENETICS_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Desk, DeskHead, Panel, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
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

  const answered = appeal.status === 'ANSWERED';
  return (
    <OpsShell actor={guard.actor} title="بررسی اعتراض" pathname={'/genetics/appeals/' + id} nav={GENETICS_NAV}>
      <DeskHead
        title={'اعتراض به نتیجه · ' + (animal?.name ?? 'بدون نام')}
        status={{ tone: answered ? 'success' : 'info', label: APPEAL_STATUS_FA[appeal.status], testId: 'centre-appeal-status' }}
        meta={[generationLabel(animal?.generation ?? 0), 'ثبت: ' + (whenFa(appeal.createdAt) ?? '—'), 'نسخه ' + appeal.version.toLocaleString('fa-IR')]}
        owner={answered ? null : 'GENETICS_CENTRE'}
      />
      <Desk
        decisionTitle={answered ? 'نتیجه' : 'پاسخ مرکز'}
        decision={
          <>
            {appeal.status === 'SUBMITTED' ? <TakeAppealForm appealId={appeal.id} /> : null}
            {answered ? (
              <Alert tone="info" title="این اعتراض پاسخ داده شده است">
                {appeal.responseFa}
              </Alert>
            ) : (
              <AnswerAppealForm appealId={appeal.id} version={appeal.version} />
            )}
          </>
        }
      >
        <Panel title="متن اعتراض">
          <p className="text-body-md" data-testid="centre-appeal-message">
            {appeal.messageFa}
          </p>
        </Panel>
        <Panel title="نتیجه مورد اعتراض">
          <KeyValueList
            rows={[
              { key: 'نسخه نتیجه', value: disputed ? disputed.resultVersion.toLocaleString('fa-IR') : null },
              { key: 'وضعیت نتیجه', value: disputed ? RESULT_STATUS_FA[disputed.status] : null },
            ]}
          />
          {document ? (
            <p className="text-caption text-text-secondary" data-testid="issued-document-warning">
              برای این حیوان شجره‌نامه <Identifier value={document.pedigreeCode} /> بر اساس نسخه{' '}
              {document.issuedFromResultVersion} صادر شده است. نتیجه اصلاحی، این سند را بازنویسی یا باطل
              نمی‌کند و فقط یادداشت کنار آن ثبت می‌شود.
            </p>
          ) : null}
        </Panel>
      </Desk>
    </OpsShell>
  );
}
