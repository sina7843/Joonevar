import type React from 'react';
import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../src/domain/ids.ts';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../src/ui/page-crumbs.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { referenceBreeds } from '../../../src/db/schema/core.ts';
import { SAMPLE_TAKEN_NOTE_FA, sheetForOwner } from '../../../src/documents/registration-sheet.ts';
import { postalRequestsForDocument, savedAddress } from '../../../src/documents/postal.ts';
import { PostalRequestForm } from '../../pedigree/forms.tsx';
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
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
  const [address, postal] = await Promise.all([
    savedAddress(db(), guard.actor.accountId),
    postalRequestsForDocument(db(), guard.actor, 'REGISTRATION_SHEET', sheet.id),
  ]);
  const [breed] = animal?.breedId
    ? await db().select().from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId))
    : [];

  const name = animal?.name ?? 'بدون نام';
  const issuedFa = formatCivilDateFa(sheet.issuedAt.toISOString().slice(0, 10));
  const row = (key: string, value: React.ReactNode, testId?: string) => (
    <div className="hz-kv__row">
      <dt className="hz-kv__key">{key}</dt>
      <dd className="hz-kv__value" data-testid={testId}>
        {value}
      </dd>
    </div>
  );

  return (
    <PublicShell
      actor={guard.actor}
      title="برگه ثبتی"
      pathname={'/documents/' + id}
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'خانه', href: '/dashboard' },
              { name: 'حیوان‌های من', href: '/animals' },
              { name: name, href: '/animals/' + sheet.animalId },
              { name: 'برگه ثبتی' },
            ]}
          />
          <PageHeader
            title={'برگه ثبتی ' + name}
            back={{ href: '/animals/' + sheet.animalId }}
            aside={<StatusBadge status="ISSUED" />}
            meta={[<Identifier key="no" value={sheet.sheetNo} />, 'صادرشده در ' + issuedFa]}
            actions={
              <a
                href={'/api/documents/registration-sheet/' + id + '/pdf'}
                className="hz-btn hz-btn--primary"
                data-testid="download-pdf"
              >
                <Icon name="downloadSimple" size="sm" />
                دریافت نسخه PDF این سند
              </a>
            }
          />
        </div>
      }
    >
      {/* DS A4DocumentTemplate: the issued record on its sheet, fluid below A4
          width. The PDF route is the print source and is unchanged. */}
      <article className="hz-a4 mx-auto h-auto w-full max-w-[794px] px-lg pt-s32 pb-xl md:px-s48">
        <header className="hz-a4__head">
          <div className="hz-a4__brand">
            <img src="/brand/logo/lockup-horizontal-fa-light.svg" alt="همزیست" width={160} height={40} />
            <span className="hz-a4__brand-sub">سامانه رسمی ثبت سگ و گربه</span>
          </div>
          <div className="hz-a4__docmeta">
            <span className="hz-a4__doctype">برگه ثبتی</span>
            <span className="hz-a4__docno">
              <bdi dir="ltr">{sheet.sheetNo}</bdi>
            </span>
            <span className="hz-a4__issued">صادرشده در {issuedFa}</span>
          </div>
        </header>
        <div className="hz-a4__titlebar">
          <h2 className="hz-a4__title">برگه ثبتی هم‌زیست</h2>
        </div>
        <section className="hz-a4__section">
          <h3 className="hz-a4__section-title">مشخصات حیوان</h3>
          <div className="hz-a4__record max-md:grid-cols-1">
            <div className="hz-media hz-a4__photo max-md:w-full">
              {animal?.photoFileId ? (
                <img src={'/api/files/' + animal.photoFileId} alt={'تصویر ' + name} width={168} height={224} />
              ) : (
                <div className="hz-media__empty">
                  <img src="/brand/logo/symbol.svg" alt="" />
                </div>
              )}
            </div>
            <dl className="hz-kv hz-a4__kv2 max-md:grid-cols-1" data-testid="sheet-document">
              {row('شماره برگه', <Identifier value={sheet.sheetNo} />, 'sheet-no')}
              {row('شناسه رسمی (Pet ID)', <Identifier value={sheet.petId} />, 'sheet-pet-id')}
              {row('نام حیوان', name)}
              {row('نژاد', breed?.nameFa ?? '—')}
              {row('نسل', animal ? generationLabel(animal.generation) : '—')}
              {row('شماره میکروچیپ', <Identifier value={sheet.microchipNumber} />)}
              {row('کد رهگیری نمونه', <Identifier value={sheet.sampleTrackingCode} />)}
              {row('تاریخ صدور', issuedFa)}
            </dl>
          </div>
        </section>
        <footer className="hz-a4__foot">
          <p className="hz-a4__verify">
            <Icon name="info" size="sm" />
            <span data-testid="document-parentage-note">{SAMPLE_TAKEN_NOTE_FA}</span>
          </p>
        </footer>
      </article>

      <p className="mx-auto max-w-[794px] text-caption text-text-secondary">
        قالب چاپی رسمی انجمن هنوز تحویل نشده است؛ خروجی PDF، چاپ همین داده‌های ثبت‌شده است و آنچه اینجا می‌بینید خود
        رکورد صادرشده است و فقط برای مالک همین حیوان قابل مشاهده است. این برگه نتیجه ژنتیک یا شجره‌نامه نیست.{' '}
        <Link href={'/animals/' + sheet.animalId} className="hz-link" data-testid="back-to-animal">
          بازگشت به پرونده حیوان
        </Link>
      </p>

      <div className="mx-auto w-full max-w-[794px] space-y-xl">
        {postal.length > 0 ? (
          <Card>
            <SectionHeader size="sm" title="درخواست‌های ارسال ثبت‌شده" />
            <ul className="mt-md space-y-sm text-body-sm" data-testid="sheet-postal-list">
              {postal.map((row) => (
                <li key={row.id}>
                  <Link href={'/documents/postal/' + row.id} className="hz-link">
                    درخواست {formatCivilDateFa(row.createdAt.toISOString().slice(0, 10))} — {row.recipientNameFa}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <PostalRequestForm
          documentType="REGISTRATION_SHEET"
          documentId={sheet.id}
          prefill={address ? { provinceFa: address.province, cityFa: address.city, addressFa: address.address } : null}
        />
      </div>
    </PublicShell>
  );
}
