import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Identifier } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { referenceBreeds } from '../../../src/db/schema/core.ts';
import { SAMPLE_TAKEN_NOTE_FA, sheetForOwner } from '../../../src/documents/registration-sheet.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';

export const dynamic = 'force-dynamic';

/**
 * The issued registration sheet — §13, D16.
 *
 * No document renderer is configured, so this is the record itself rather than
 * a printed file: the stated values, the issued numbers and the date, readable
 * only by the owner. Nothing here claims an external certification.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/documents/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let sheet;
  try {
    sheet = await sheetForOwner(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [animal] = await db().select().from(animals).where(eq(animals.id, sheet.animalId));
  const [breed] = animal?.breedId
    ? await db().select().from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId))
    : [];

  return (
    <PublicShell actor={guard.actor} title="برگه ثبتی" pathname={'/documents/' + id}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">برگه ثبتی هم‌زیست</h2>
          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="sheet-document">
            <dt className="text-text-secondary">شماره برگه</dt>
            <dd data-testid="sheet-no">
              <Identifier value={sheet.sheetNo} />
            </dd>
            <dt className="text-text-secondary">شناسه رسمی (Pet ID)</dt>
            <dd data-testid="sheet-pet-id">
              <Identifier value={sheet.petId} />
            </dd>
            <dt className="text-text-secondary">نام حیوان</dt>
            <dd>{animal?.name ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">نژاد</dt>
            <dd>{breed?.nameFa ?? '—'}</dd>
            <dt className="text-text-secondary">نسل</dt>
            <dd>{animal ? generationLabel(animal.generation) : '—'}</dd>
            <dt className="text-text-secondary">شماره میکروچیپ</dt>
            <dd>
              <Identifier value={sheet.microchipNumber} />
            </dd>
            <dt className="text-text-secondary">کد رهگیری نمونه</dt>
            <dd>
              <Identifier value={sheet.sampleTrackingCode} />
            </dd>
            <dt className="text-text-secondary">تاریخ صدور</dt>
            <dd>{formatCivilDateFa(sheet.issuedAt.toISOString().slice(0, 10))}</dd>
          </dl>
        </Card>

        <Alert tone="info" title="این برگه نتیجه ژنتیک یا شجره‌نامه نیست">
          <span data-testid="document-parentage-note">{SAMPLE_TAKEN_NOTE_FA}</span>
        </Alert>

        <Card>
          <p className="text-caption text-text-secondary">
            نسخه چاپی رسمی هنوز پیکربندی نشده است؛ آنچه اینجا می‌بینید خود رکورد صادرشده است و فقط برای مالک همین
            حیوان قابل مشاهده است.
          </p>
          <p className="mt-md text-body-sm">
            <Link
              href={'/animals/' + sheet.animalId}
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
