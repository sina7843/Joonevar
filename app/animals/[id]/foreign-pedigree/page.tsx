import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge, type StatusTone } from '../../../../src/ui/status.tsx';
import { NeedsCorrectionState, WaitingState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { requireOwnedAnimal } from '../../../../src/animals/service.ts';
import {
  findForeignCase,
  FOREIGN_STATUS_FA,
  listIssuers,
  type ForeignPedigreeStatus,
} from '../../../../src/animals/foreign-pedigree.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { ForeignDetailsForm, ForeignSideForm, ForeignSubmitForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<ForeignPedigreeStatus, StatusTone> = {
  DRAFT: 'neutral',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  NEEDS_CORRECTION: 'warning',
  REJECTED: 'error',
};

/**
 * Foreign pedigree, owner side — §9.4.
 *
 * Front and back are uploaded independently and both survive a correction. The
 * association reviews the case; no turnaround is promised, no extra approval
 * step exists and no translation is demanded.
 */
export default async function ForeignPedigreePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/animals/' + id + '/foreign-pedigree');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  let animal;
  try {
    animal = await requireOwnedAnimal(db(), actor, id);
  } catch (error) {
    // Ownership is a record-level rule, not a route rule, so it answers here.
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const record = await findForeignCase(db(), animal.id);
  const issuers = await listIssuers(db(), true);
  const status: ForeignPedigreeStatus = (record?.status as ForeignPedigreeStatus) ?? 'DRAFT';
  const editable = status === 'DRAFT' || status === 'NEEDS_CORRECTION';
  const hasFront = Boolean(record?.frontFileId);
  const hasBack = Boolean(record?.backFileId);

  return (
    <PublicShell actor={actor} title="Export Pedigree" pathname={'/animals/' + id + '/foreign-pedigree'}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div>
              <h2 className="text-label-lg">وضعیت پرونده</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                بررسی با انجمن و بر اساس فهرست صادرکنندگان موردتأیید آن انجام می‌شود. زمان ثابتی برای پایان
                بررسی وعده داده نمی‌شود.
              </p>
            </div>
            <StatusBadge tone={TONE[status]}>{FOREIGN_STATUS_FA[status]}</StatusBadge>
          </div>
        </Card>

        {status === 'UNDER_REVIEW' ? (
          <WaitingState
            title="پرونده شما در صف بررسی انجمن است"
            owner="ASSOCIATION"
            detail="نتیجه در همین صفحه و در اعلان‌ها اعلام می‌شود."
          />
        ) : null}

        {status === 'NEEDS_CORRECTION' && record?.reasonFa ? (
          <NeedsCorrectionState
            reason={record.reasonFa}
            correctionHref={'/animals/' + id + '/foreign-pedigree'}
          />
        ) : null}

        {status === 'REJECTED' && record?.reasonFa ? (
          <Alert tone="error" title="پرونده رد شد">
            {record.reasonFa}
          </Alert>
        ) : null}

        {status === 'APPROVED' ? (
          <Alert tone="success" title="مدرک تأیید شد">
            نسل استخراج‌شده از مدرک بررسی‌شده:{' '}
            <span data-testid="extracted-generation">
              {record?.extractedGeneration !== null && record?.extractedGeneration !== undefined
                ? generationLabel(record.extractedGeneration)
                : '—'}
            </span>
            . این مقدار فقط‌خواندنی است.
          </Alert>
        ) : null}

        {editable ? (
          <>
            <Card>
              <h3 className="text-label-lg">اطلاعات مدرک</h3>
              <div className="mt-lg">
                <ForeignDetailsForm
                  animalId={animal.id}
                  issuers={issuers.map((issuer) => ({ id: issuer.id, name: issuer.name }))}
                  values={{ issuerId: record?.issuerId ?? '', documentCode: record?.documentCode ?? '' }}
                />
              </div>
            </Card>

            <Card>
              <h3 className="text-label-lg">تصویر روی برگه</h3>
              <div className="mt-lg">
                <ForeignSideForm animalId={animal.id} side="FRONT" attached={hasFront} />
              </div>
            </Card>

            <Card>
              <h3 className="text-label-lg">تصویر پشت برگه</h3>
              <div className="mt-lg">
                <ForeignSideForm animalId={animal.id} side="BACK" attached={hasBack} />
              </div>
            </Card>

            <Card>
              <ForeignSubmitForm
                animalId={animal.id}
                disabled={!hasFront || !hasBack || record?.issuerId === null || issuers.length === 0}
              />
              {!hasFront || !hasBack ? (
                <p className="mt-sm text-caption text-text-secondary">
                  برای ارسال، هر دو تصویر روی برگه و پشت برگه لازم است.
                </p>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
    </PublicShell>
  );
}
