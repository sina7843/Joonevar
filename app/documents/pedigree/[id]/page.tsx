import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { referenceBreeds } from '../../../../src/db/schema/core.ts';
import { pedigreeForOwner } from '../../../../src/documents/pedigree.ts';
import { postalRequestsForDocument, savedAddress } from '../../../../src/documents/postal.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { PostalRequestForm } from '../../../pedigree/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The issued pedigree — §14.1 step 8, §14.5, D16.
 *
 * The document states which Parentage Result version it was issued from. A
 * later corrected result never rewrites it: the notice appears beside it and
 * the original stays exactly as it was issued.
 */
export default async function PedigreeDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/documents/pedigree/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let document;
  try {
    document = await pedigreeForOwner(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [animal] = await db().select().from(animals).where(eq(animals.id, document.animalId));
  const [breed] = animal?.breedId
    ? await db().select().from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId))
    : [];
  const parentIds = [document.sireAnimalId, document.damAnimalId].filter((v): v is string => v !== null);
  const parents = parentIds.length
    ? await db()
        .select({ id: animals.id, name: animals.name, generation: animals.generation })
        .from(animals)
        .where(inArray(animals.id, parentIds))
    : [];

  const [address, postal] = await Promise.all([
    savedAddress(db(), guard.actor.accountId),
    postalRequestsForDocument(db(), guard.actor, 'PEDIGREE', document.id),
  ]);

  return (
    <PublicShell actor={guard.actor} title="شجره‌نامه" pathname={'/documents/pedigree/' + id}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">شجره‌نامه هم‌زیست</h2>
          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="pedigree-document">
            <dt className="text-text-secondary">کد شجره‌نامه</dt>
            <dd data-testid="pedigree-code">
              <Identifier value={document.pedigreeCode} />
            </dd>
            <dt className="text-text-secondary">نام حیوان</dt>
            <dd>{animal?.name ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">نژاد</dt>
            <dd>{breed?.nameFa ?? '—'}</dd>
            <dt className="text-text-secondary">نسل هنگام صدور</dt>
            <dd>{generationLabel(document.generationAtIssue)}</dd>
            <dt className="text-text-secondary">پدر</dt>
            <dd data-testid="pedigree-sire">
              {document.sireAnimalId
                ? (parents.find((p) => p.id === document.sireAnimalId)?.name ?? 'بدون نام')
                : '—'}
            </dd>
            <dt className="text-text-secondary">مادر</dt>
            <dd data-testid="pedigree-dam">
              {document.damAnimalId
                ? (parents.find((p) => p.id === document.damAnimalId)?.name ?? 'بدون نام')
                : '—'}
            </dd>
            <dt className="text-text-secondary">نسخه نتیجه مبنای صدور</dt>
            <dd data-testid="pedigree-result-version">{document.issuedFromResultVersion}</dd>
            <dt className="text-text-secondary">تاریخ صدور</dt>
            <dd>{formatCivilDateFa(document.issuedAt.toISOString().slice(0, 10))}</dd>
          </dl>
        </Card>

        {document.correctionNoticeFa ? (
          <Alert tone="warning" title="نتیجه اصلاحی پس از صدور این سند ثبت شده است">
            <span data-testid="pedigree-correction-notice">{document.correctionNoticeFa}</span>
          </Alert>
        ) : null}

        <Card>
          <p className="text-caption text-text-secondary">
            قالب چاپی رسمی انجمن هنوز تحویل نشده است؛ خروجی PDF زیر، چاپ همین داده‌های ثبت‌شده است و آنچه اینجا می‌بینید خود رکورد صادرشده است و فقط برای مالک
            همین حیوان قابل مشاهده است.
          </p>
          <p className="mt-md text-body-sm">
            <a
              href={'/api/documents/pedigree/' + id + '/pdf'}
              className="text-text-brand underline underline-offset-4"
              data-testid="download-pdf"
            >
              دریافت نسخه PDF این سند
            </a>
          </p>
          <p className="mt-md text-body-sm">
            <Link
              href={'/pedigree/' + document.animalId}
              className="text-text-brand underline underline-offset-4"
              data-testid="back-to-result"
            >
              مشاهده نتیجه Parentage همین حیوان
            </Link>
          </p>
        </Card>

        {postal.length > 0 ? (
          <Card>
            <h3 className="text-label-lg">درخواست‌های ارسال ثبت‌شده</h3>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="pedigree-postal-list">
              {postal.map((row) => (
                <li key={row.id}>
                  <Link
                    href={'/documents/postal/' + row.id}
                    className="text-text-brand underline underline-offset-4"
                  >
                    درخواست {formatCivilDateFa(row.createdAt.toISOString().slice(0, 10))} — {row.recipientNameFa}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <PostalRequestForm
          documentType="PEDIGREE"
          documentId={document.id}
          prefill={
            address
              ? { provinceFa: address.province, cityFa: address.city, addressFa: address.address }
              : null
          }
        />
      </div>
    </PublicShell>
  );
}
