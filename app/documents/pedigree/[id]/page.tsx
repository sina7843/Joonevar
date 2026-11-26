import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { referenceBreeds } from '../../../../src/db/schema/core.ts';
import { pedigreeForOwner } from '../../../../src/documents/pedigree.ts';
import { postalRequestsForDocument, savedAddress } from '../../../../src/documents/postal.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { generationLabel } from '../../../../src/domain/lineage.ts';
import { PostalRequestForm } from '../../../pedigree/forms.tsx';
import { pedigreeSheetOf } from '../../../../src/documents/pedigree-tree.ts';
import type { PedigreeNode } from '../../../../src/documents/render.ts';
import { PrintButton } from '../../../../src/ui/print-button.tsx';
import { site } from '../../../../src/public/request.ts';

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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
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
  const tree = await pedigreeSheetOf(db(), {
    animalId: document.animalId,
    sireAnimalId: document.sireAnimalId,
    damAnimalId: document.damAnimalId,
  });
  const verifyUrl = site().origin + '/verify?code=' + encodeURIComponent(document.pedigreeCode);
  const qr = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const qrSrc = 'data:image/svg+xml;utf8,' + encodeURIComponent(qr);

  const [address, postal] = await Promise.all([
    savedAddress(db(), guard.actor.accountId),
    postalRequestsForDocument(db(), guard.actor, 'PEDIGREE', document.id),
  ]);

  const name = animal?.name ?? 'بدون نام';
  const issuedFa = formatCivilDateFa(document.issuedAt.toISOString().slice(0, 10));
  const printedFa = formatCivilDateFa(new Date().toISOString().slice(0, 10));
  const pedNode = (node: PedigreeNode, gen: 1 | 2, row: number, link: 'has-parents' | 'collapsed-parents' | null, testId?: string) => (
    <li className={'hz-ped hz-ped--g' + gen + (link ? ' hz-ped--' + link : '')} style={{ ['--r' as string]: row }}>
      <div className={node.nameFa !== null ? 'hz-ped__node' : 'hz-ped__node hz-ped__node--unknown'}>
        <span className="hz-ped__role">{node.roleFa}</span>
        <span className="hz-ped__name" data-testid={testId}>
          {node.nameFa ?? 'نامشخص'}
        </span>
        <span className="hz-ped__meta">{node.nameFa !== null ? node.metaFa : (node.unknownFa ?? 'در همزیست ثبت نشده')}</span>
      </div>
    </li>
  );
  const [sire, dam] = tree.parents;
  const [sireSire, sireDam, damSire, damDam] = tree.grandparents;
  // A parent with no recorded parents collapses to one «اجداد …» note instead of two empty boxes.
  const branch = (parent: PedigreeNode, side: 'پدری' | 'مادری', row: number, testId: string, pair: readonly [PedigreeNode, PedigreeNode]) => {
    const known = pair[0].nameFa !== null || pair[1].nameFa !== null;
    return (
      <>
        {pedNode(parent, 1, row, known ? 'has-parents' : 'collapsed-parents', testId)}
        {known ? (
          <>
            {pedNode(pair[0], 2, row, null)}
            {pedNode(pair[1], 2, row + 2, null)}
          </>
        ) : (
          <li className="hz-ped hz-ped--rest2" style={{ ['--r' as string]: row }}>
            <div className="hz-ped__node hz-ped__node--unknown">
              <span className="hz-ped__role">{'اجداد ' + side}</span>
              <span className="hz-ped__name">نامشخص</span>
              <span className="hz-ped__meta">
                {parent.nameFa !== null ? 'والدین «' + parent.nameFa + '» در همزیست ثبت نشده‌اند.' : 'والدین ثبت نشده‌اند.'}
              </span>
            </div>
          </li>
        )}
      </>
    );
  };

  return (
    <PublicShell
      actor={guard.actor}
      title="شجره‌نامه"
      pathname={'/documents/pedigree/' + id}
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'خانه', href: '/dashboard' },
              { name: 'حیوان‌های من', href: '/animals' },
              { name: 'شجره‌نامه ' + name },
            ]}
          />
          <PageHeader
            title={'شجره‌نامه ' + name}
            back={{ href: '/pedigree/' + document.animalId }}
            aside={<StatusBadge status="ISSUED" />}
            meta={[<Identifier key="code" value={document.pedigreeCode} />, 'صادرشده در ' + issuedFa]}
            actions={
              <>
                <PrintButton />
                <a
                  href={'/api/documents/pedigree/' + id + '/pdf'}
                  className="hz-btn hz-btn--primary"
                  data-testid="download-pdf"
                >
                  <Icon name="downloadSimple" size="sm" />
                  دریافت نسخه PDF این سند
                </a>
                <Link href={'/verify/' + document.pedigreeCode} className="hz-btn hz-btn--ghost">
                  <Icon name="sealCheck" size="sm" />
                  استعلام اصالت
                </Link>
              </>
            }
          />
        </div>
      }
    >
      {document.correctionNoticeFa ? (
        <Alert tone="warning" title="نتیجه اصلاحی پس از صدور این سند ثبت شده است">
          <span data-testid="pedigree-correction-notice">{document.correctionNoticeFa}</span>
        </Alert>
      ) : null}

      {/* DS A4DocumentTemplate (K18): the issued record on its sheet. Fluid
          below A4 width so a phone never scrolls sideways; the PDF route is the
          print source and is unchanged. */}
      <article
        className="hz-a4 mx-auto h-auto w-full max-w-[794px] px-lg pt-s32 pb-xl md:px-s48"
        data-testid="pedigree-document"
      >
        <header className="hz-a4__head">
          <div className="hz-a4__brand">
            <img src="/brand/logo/lockup-horizontal-fa-light.svg" alt="همزیست" width={160} height={40} />
            <span className="hz-a4__brand-sub">سامانه رسمی ثبت سگ و گربه</span>
          </div>
          <div className="hz-a4__docmeta">
            <span className="hz-a4__doctype">شجره‌نامه</span>
            <span className="hz-a4__docno" data-testid="pedigree-code">
              <Identifier value={document.pedigreeCode} />
            </span>
            <span className="hz-a4__issued">صادرشده در {issuedFa}</span>
          </div>
        </header>

        <div className="hz-a4__titlebar">
          <div>
            <h2 className="hz-a4__title">شجره‌نامه سه‌نسلی</h2>
            <p className="hz-a4__lead">
              این سند اجداد ثبت‌شده «{name}» را تا سه نسل گواهی می‌کند و با شماره بالا قابل استعلام است. اجدادی که ثبت
              نشده‌اند «نامشخص» آمده‌اند.
            </p>
          </div>
          <div className="hz-a4__qr max-md:hidden">
            <img src={qrSrc} alt="" width={104} height={104} />
            <span className="hz-a4__qr-cap">استعلام اصالت</span>
          </div>
        </div>

        <section className="hz-a4__section">
          <h3 className="hz-a4__section-title">حیوان</h3>
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
            <dl className="hz-kv hz-a4__kv2 max-md:grid-cols-1">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نام حیوان</dt>
                <dd className="hz-kv__value">{name}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نژاد</dt>
                <dd className="hz-kv__value">{breed?.nameFa ?? '—'}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نسل هنگام صدور</dt>
                <dd className="hz-kv__value">{generationLabel(document.generationAtIssue)}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نسخه نتیجه مبنای صدور</dt>
                <dd className="hz-kv__value" data-testid="pedigree-result-version">
                  {document.issuedFromResultVersion}
                </dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">تاریخ صدور</dt>
                <dd className="hz-kv__value">{issuedFa}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">شناسه حیوان</dt>
                <dd className="hz-kv__value">{animal?.petId ? <Identifier value={animal.petId} /> : '—'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="hz-a4__section">
          <h3 className="hz-a4__section-title">حیوان و اجداد</h3>
          <figure className="hz-pedigree m-0 max-md:hidden" aria-label={'شجره سه‌نسلی ' + name}>
            <div className="hz-pedigree__cols" aria-hidden="true">
              <span className="hz-pedigree__col">حیوان</span>
              <span className="hz-pedigree__col">والدین</span>
              <span className="hz-pedigree__col">پدربزرگ و مادربزرگ</span>
            </div>
            <ol className="hz-pedigree__grid m-0 list-none p-0">
              <li className="hz-ped hz-ped--g0 hz-ped--has-parents">
                <div className="hz-ped__node hz-ped__node--subject">
                  <span className="hz-ped__role">حیوان</span>
                  <span className="hz-ped__name">{name}</span>
                  <span className="hz-ped__meta">{breed?.nameFa ?? '—'}</span>
                </div>
              </li>
              {branch(sire, 'پدری', 1, 'pedigree-sire', [sireSire, sireDam])}
              {branch(dam, 'مادری', 5, 'pedigree-dam', [damSire, damDam])}
            </ol>
          </figure>
          {/* Below 768 the grid would scroll sideways: the same ancestors as a list (DS: compact on phones). */}
          <ol className="m-0 list-none space-y-sm p-0 md:hidden" aria-label={'اجداد ' + name} data-testid="pedigree-list">
            {[sire, sireSire, sireDam, dam, damSire, damDam].map((node, index) => (
              <li key={node.roleFa + index} className={index % 3 === 0 ? 'hz-ped__node' : 'hz-ped__node ms-lg'}>
                <span className="hz-ped__role">{node.roleFa}</span>{' '}
                <span className={node.nameFa === null ? 'hz-ped__name text-text-secondary' : 'hz-ped__name'}>{node.nameFa ?? 'نامشخص'}</span>
                <span className="hz-ped__meta block">{node.nameFa !== null ? node.metaFa : (node.unknownFa ?? 'در همزیست ثبت نشده')}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="hz-a4__sign max-md:grid-cols-1">
          <div className="hz-a4__sign-slot">
            <span className="hz-a4__sign-line" />
            <span className="hz-a4__sign-role">بررسی و صدور — انجمن</span>
            <span className="hz-a4__sign-name">—</span>
          </div>
          <div className="hz-a4__sign-slot">
            <span className="hz-a4__sign-line" />
            <span className="hz-a4__sign-role">تأیید هویت و میکروچیپ — دامپزشک معتمد</span>
            <span className="hz-a4__sign-name">—</span>
          </div>
          <span className="hz-a4__seal">مهر انجمن</span>
        </div>

        <footer className="hz-a4__foot">
          <p className="hz-a4__verify">
            <Icon name="shieldCheck" size="sm" />
            <span>
              برای استعلام اصالت، شماره{' '}
              <b>
                <bdi dir="ltr">{document.pedigreeCode}</bdi>
              </b>{' '}
              را در «استعلام اصالت» همزیست وارد کنید یا کد QR را اسکن کنید.
            </span>
          </p>
          <span className="whitespace-nowrap">{'صفحه ۱ از ۱، چاپ ' + printedFa}</span>
        </footer>
      </article>

      <p className="mx-auto max-w-[794px] text-caption text-text-secondary">
        قالب چاپی رسمی انجمن هنوز تحویل نشده است؛ خروجی PDF، چاپ همین داده‌های ثبت‌شده است و آنچه اینجا می‌بینید خود
        رکورد صادرشده است و فقط برای مالک همین حیوان قابل مشاهده است.{' '}
        <Link href={'/pedigree/' + document.animalId} className="hz-link" data-testid="back-to-result">
          مشاهده نتیجه Parentage همین حیوان
        </Link>
      </p>

      <div className="mx-auto w-full max-w-[794px] space-y-xl">
        {postal.length > 0 ? (
          <Card>
            <SectionHeader size="sm" title="درخواست‌های ارسال ثبت‌شده" />
            <ul className="mt-md space-y-sm text-body-sm" data-testid="pedigree-postal-list">
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
          documentType="PEDIGREE"
          documentId={document.id}
          prefill={address ? { provinceFa: address.province, cityFa: address.city, addressFa: address.address } : null}
        />
      </div>
    </PublicShell>
  );
}
