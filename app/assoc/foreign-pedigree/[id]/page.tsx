import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { pedigreeIssuers } from '../../../../src/db/schema/core.ts';
import {
  foreignCaseById,
  FOREIGN_STATUS_FA,
  type ForeignPedigreeStatus,
} from '../../../../src/animals/foreign-pedigree.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { ForeignReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Case detail (§21.5): data and permitted documents → history → action.
 *
 * Both sides of the document are fetched through the authorized private-file
 * route, which re-checks this operator's permission; nothing is inlined.
 */
export default async function AssocForeignCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/foreign-pedigree/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const record = await foreignCaseById(db(), id);
  if (!record) {
    return (
      <OpsShell actor={guard.actor} title="پرونده Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
        <Alert tone="error" title="پرونده پیدا نشد" />
      </OpsShell>
    );
  }

  const [animal] = await db().select().from(animals).where(eq(animals.id, record.animalId));
  const [issuer] = record.issuerId
    ? await db().select().from(pedigreeIssuers).where(eq(pedigreeIssuers.id, record.issuerId))
    : [];

  return (
    <OpsShell actor={guard.actor} title="بررسی Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">اطلاعات پرونده</h2>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">حیوان</dt>
            <dd>{animal?.name ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">نسل فعلی</dt>
            <dd>{animal ? generationLabel(animal.generation) : '—'}</dd>
            <dt className="text-text-secondary">صادرکننده</dt>
            <dd data-testid="case-issuer">{issuer?.name ?? '—'}</dd>
            <dt className="text-text-secondary">کد مدرک</dt>
            <dd>{record.documentCode ? <Identifier value={record.documentCode} /> : '—'}</dd>
            <dt className="text-text-secondary">وضعیت</dt>
            <dd data-testid="foreign-case-status">{FOREIGN_STATUS_FA[record.status as ForeignPedigreeStatus]}</dd>
          </dl>
        </Card>

        <Card>
          <h2 className="text-label-lg">مدارک</h2>
          <ul className="mt-md space-y-sm text-body-sm">
            <li>
              {record.frontFileId ? (
                <a
                  href={'/api/files/' + record.frontFileId}
                  className="text-text-brand underline underline-offset-4"
                  target="_blank"
                  rel="noreferrer"
                  data-testid="foreign-front-link"
                >
                  مشاهده تصویر روی برگه
                </a>
              ) : (
                <span className="text-text-disabled">تصویر روی برگه بارگذاری نشده است.</span>
              )}
            </li>
            <li>
              {record.backFileId ? (
                <a
                  href={'/api/files/' + record.backFileId}
                  className="text-text-brand underline underline-offset-4"
                  target="_blank"
                  rel="noreferrer"
                  data-testid="foreign-back-link"
                >
                  مشاهده تصویر پشت برگه
                </a>
              ) : (
                <span className="text-text-disabled">تصویر پشت برگه بارگذاری نشده است.</span>
              )}
            </li>
          </ul>
        </Card>

        {record.status === 'UNDER_REVIEW' ? (
          <Card>
            <h2 className="text-label-lg">ثبت نتیجه</h2>
            <p className="mt-2xs text-caption text-text-secondary">
              مبنای تأیید، فهرست صادرکنندگان موردتأیید انجمن است. زمان ثابتی برای پایان بررسی وعده داده نمی‌شود.
            </p>
            <div className="mt-lg">
              <ForeignReviewForm caseId={record.id} version={record.version} />
            </div>
          </Card>
        ) : (
          <Alert tone="info" title="این پرونده در انتظار بررسی نیست">
            وضعیت فعلی: {FOREIGN_STATUS_FA[record.status as ForeignPedigreeStatus]}
            {record.reasonFa ? ' — ' + record.reasonFa : ''}
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
