import Link from 'next/link';
import type { ReactNode } from 'react';
import { eq, sql } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { SectionHeader, PageHeader } from '../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { ButtonLink, StickyActionBar } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionOwner, Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { findProfile } from '../../../src/identity/account.ts';
import { db } from '../../../src/db/client.ts';
import { referenceBreeds } from '../../../src/db/schema/core.ts';
import { familyOf, requireOwnedAnimal } from '../../../src/animals/service.ts';
import { findForeignCase, FOREIGN_STATUS_FA } from '../../../src/animals/foreign-pedigree.ts';
import { auditTrail } from '../../../src/audit/service.ts';
import { permitsOfAnimal, PERMIT_STATUS_FA } from '../../../src/mating/permits.ts';
import { confirmedDatesOfAnimal } from '../../../src/mating/dates.ts';
import { ownershipHistory } from '../../../src/marketplace/handover.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { animalChipView } from '../../../src/clinical/microchip.ts';
import { SAMPLE_TAKEN_NOTE_FA, sheetOfAnimal } from '../../../src/documents/registration-sheet.ts';
import { pedigreeOfAnimal } from '../../../src/documents/pedigree.ts';
import { DocumentCard } from '../../../src/ui/document-card.tsx';
import { resultOfAnimal, RESULT_STATUS_FA } from '../../../src/genetics/service.ts';
import { READ_METHOD_FA, SAMPLE_STATUS_FA } from '../../../src/domain/microchip.ts';
import { samples } from '../../../src/db/schema/clinical.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { AnimalEditForm } from './edit-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Animal profile and timeline — §10.
 *
 * Every section the source lists is present. Sections whose feature has not
 * been built yet say so plainly instead of showing invented content, and each
 * one keeps its place so the file grows rather than being rearranged later.
 */
const AUDIT_TITLE_FA: Record<string, string> = {
  ANIMAL_DRAFT_STARTED: 'پیش‌نویس پرونده ساخته شد',
  ANIMAL_LINEAGE_RESOLVED: 'بررسی نسب انجام شد',
  ANIMAL_REGISTERED: 'حیوان در هم‌زیست ثبت شد',
  ANIMAL_UPDATED: 'اطلاعات پرونده به‌روزرسانی شد',
  ANIMAL_PHOTO_ATTACHED: 'تصویر حیوان بارگذاری شد',
  ANIMAL_GENERATION_FROM_FOREIGN_PEDIGREE: 'نسل از Export Pedigree ثبت شد',
  ANIMAL_MATING_PERMIT_ISSUED: 'مجوز رسمی جفت‌گیری صادر شد',
  ANIMAL_MATING_PERMIT_REVIEWED: 'پرونده مجوز جفت‌گیری بررسی شد',
  ANIMAL_MATING_DATE_CONFIRMED: 'تاریخ جفت‌گیری دوطرفه تأیید شد',
};

/** Sections that belong to features built in later prompts. */
const PENDING_SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  note: string;
}> = [
  { id: 'pedigree', title: 'شجره‌نامه', note: 'کد شجره‌نامه و وضعیت صدور.' },
  {
    id: 'litter',
    title: 'بارداری، زایمان و Litter',
    note: 'اعلام کاربر و نتیجه مستقل دامپزشک.',
  },
];

export default async function AnimalProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/animals/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  // Resource-level permission: the record must belong to this actor.
  let animal;
  try {
    animal = await requireOwnedAnimal(db(), actor, id);
  } catch (error) {
    // Ownership is a record-level rule, not a route rule, so it answers here.
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const [breed] = animal.breedId
    ? await db().select().from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId))
    : [];
  const family = await familyOf(db(), animal);
  const ownerProfile = await findProfile(db(), animal.ownerAccountId);
  const ownerName = ownerProfile === null ? null : ownerProfile.firstName + ' ' + ownerProfile.lastName;
  const foreign = await findForeignCase(db(), animal.id);
  const trail = await auditTrail(db(), { targetType: 'ANIMAL', targetId: animal.id }, { page: 1, pageSize: 20 });
  const { chip, conflicts } = await animalChipView(db(), animal.id);
  const sheet = await sheetOfAnimal(db(), animal.id);
  const pedigree = await pedigreeOfAnimal(db(), animal.id);
  const parentage = await resultOfAnimal(db(), animal.id);
  const permits = await permitsOfAnimal(db(), animal.id);
  const matingDates = await confirmedDatesOfAnimal(db(), animal.id);
  const ownership = await ownershipHistory(db(), animal.id);
  const sampleRows = await db()
    .select()
    .from(samples)
    .where(eq(samples.animalId, animal.id))
    .orderBy(sql`collected_at desc`);

  const name = animal.name ?? 'بدون نام';
  const sexFa = animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : null;
  const registered = animal.status === 'REGISTERED';
  const dateFa = (value: Date) => formatCivilDateFa(value.toISOString().slice(0, 10));
  const subject = (
    <>
      {name}
      {animal.petId ? (
        <>
          {'، '}
          <bdi className="hz-id" dir="ltr">
            {animal.petId}
          </bdi>
        </>
      ) : null}
    </>
  );

  return (
    <PublicShell
      actor={actor}
      title={name}
      pathname={'/animals/' + id}
      header={
        <div>
          <PageCrumbs
            items={[{ name: 'خانه', href: '/dashboard' }, { name: 'حیوان‌های من', href: '/animals' }, { name }]}
          />
          <PageHeader
            title={name}
            back={{ href: '/animals' }}
            aside={
              <>
                <span className="text-caption text-text-secondary" data-testid="pet-id">
                  {animal.petId ? <Identifier value={animal.petId} /> : 'شناسه رسمی: — تا صدور برگه ثبتی'}
                </span>
                <StatusBadge status={animal.status} />
              </>
            }
            meta={[
              ['سگ', breed?.nameFa, sexFa].filter(Boolean).join(' · '),
              animal.birthDate
                ? 'تولد ' + formatCivilDateFa(animal.birthDate) + (animal.birthDateApproximate ? ' (تقریبی)' : '')
                : 'تاریخ تولد: تعیین‌نشده',
              generationLabel(animal.generation),
            ]}
            actions={
              <ButtonLink tone="secondary" href="#edit" iconStart="pencilSimple">
                ویرایش اطلاعات
              </ButtonLink>
            }
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-8">
          <Card>
            <SectionHeader size="sm" title={'مشخصات ' + name} />
            {/* §10: verified data is not rewritten from this form, and the screen
                says which of the two it is looking at. */}
            <p className="mt-sm text-caption text-text-secondary" data-testid="identity-provenance">
              {animal.identityVerifiedAt === null
                ? 'این مشخصات اظهار شماست. در مراجعه به دامپزشک معتمد، مشخصات رسمی ثبت می‌شود و پس از آن تغییر نمی‌کند.'
                : 'مشخصات رسمی، در ' +
                  dateFa(animal.identityVerifiedAt) +
                  ' توسط دامپزشک معتمد ثبت شده است و از این فرم تغییر نمی‌کند.'}
            </p>
            <div className="mt-md">
              <KeyValueList
                twoCol
                rows={[
                  { key: 'گونه', value: 'سگ' },
                  { key: 'نژاد', value: breed?.nameFa },
                  { key: 'جنس', value: sexFa },
                  {
                    key: 'تاریخ تولد',
                    value: animal.birthDate
                      ? formatCivilDateFa(animal.birthDate) + (animal.birthDateApproximate ? ' (تقریبی)' : '')
                      : null,
                    empty: 'تعیین‌نشده',
                  },
                  {
                    key: 'نسل',
                    value: generationLabel(animal.generation),
                    testId: 'animal-generation',
                  },
                  {
                    key: 'منبع شناسایی',
                    testId: 'animal-origin',
                    value:
                      animal.origin === 'G0'
                        ? 'بدون اسناد هویتی'
                        : animal.origin === 'INTERNAL_G1PLUS'
                          ? 'نسب ثبت‌شده در هم‌زیست'
                          : 'Export Pedigree',
                  },
                  { key: 'رنگ', value: animal.color },
                  { key: 'نشانه‌های ظاهری', value: animal.markings },
                  {
                    key: 'میکروچیپ اعلامی',
                    testId: 'declared-microchip-value',
                    value: animal.declaredMicrochipNumber ? (
                      <Identifier value={animal.declaredMicrochipNumber} />
                    ) : null,
                  },
                  // §23.3: a name identifies a person; an account key identifies a row.
                  {
                    key: 'مالک',
                    value: <span data-testid="animal-owner">{ownerName ?? 'شما'}</span>,
                  },
                  {
                    key: 'پدر',
                    testId: 'family-sire',
                    value: family.sire ? (
                      <Link href={'/animals/' + family.sire.id} className="hz-link">
                        {(family.sire.name ?? 'بدون نام') + ' · ' + generationLabel(family.sire.generation)}
                      </Link>
                    ) : null,
                    empty: 'ثبت نشده',
                  },
                  {
                    key: 'مادر',
                    testId: 'family-dam',
                    value: family.dam ? (
                      <Link href={'/animals/' + family.dam.id} className="hz-link">
                        {(family.dam.name ?? 'بدون نام') + ' · ' + generationLabel(family.dam.generation)}
                      </Link>
                    ) : null,
                    empty: 'ثبت نشده',
                  },
                  {
                    key: 'فرزندان',
                    value:
                      family.offspring.length === 0 ? null : family.offspring.length.toLocaleString('fa-IR') + ' مورد',
                  },
                ]}
              />
            </div>
            <p className="mt-md text-caption text-text-secondary">
              نسل فقط‌خواندنی است. شماره میکروچیپ اعلامی تا اسکن و تأیید دامپزشک معتمد رسمی نیست.
            </p>
          </Card>

          <section aria-labelledby="animal-documents" className="space-y-lg">
            <SectionHeader id="animal-documents" title="اسناد" count={sheet || pedigree ? ((sheet ? 1 : 0) + (pedigree ? 1 : 0)).toLocaleString('fa-IR') + ' سند' : undefined} />
            {sheet || pedigree ? (
              <div className="grid gap-lg md:grid-cols-2">
                {sheet ? (
                  <DocumentCard
                    kind="REGISTRATION_SHEET"
                    number={sheet.sheetNo}
                    subject={subject}
                    issuedFa={sheet.issuedAt ? dateFa(sheet.issuedAt) : null}
                    pdfHref={'/api/documents/registration-sheet/' + sheet.id + '/pdf'}
                    verifyHref={'/verify?code=' + encodeURIComponent(sheet.sheetNo)}
                    viewHref={'/documents/' + sheet.id}
                    viewTestId="animal-sheet-link"
                    note={
                      <span data-testid="animal-parentage-note">
                        {SAMPLE_TAKEN_NOTE_FA} برگه ثبتی به معنی نتیجه ژنتیک یا شجره‌نامه نیست.
                      </span>
                    }
                  />
                ) : null}
                {pedigree ? (
                  <DocumentCard
                    kind="PEDIGREE"
                    number={pedigree.pedigreeCode}
                    subject={subject}
                    issuedFa={dateFa(pedigree.issuedAt)}
                    pdfHref={'/api/documents/pedigree/' + pedigree.id + '/pdf'}
                    verifyHref={'/verify?code=' + encodeURIComponent(pedigree.pedigreeCode)}
                    viewHref={'/documents/pedigree/' + pedigree.id}
                    viewTestId="animal-pedigree-link"
                  />
                ) : null}
              </div>
            ) : (
              <div className="hz-card">
                <p className="text-body-sm text-text-secondary">
                  هنوز سندی صادر نشده است. پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری، می‌توانید{' '}
                  <Link href="/registration/new" className="hz-link">
                    برگه ثبتی این حیوان را درخواست کنید
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>

          <Card>
            <SectionHeader size="sm" title="میکروچیپ و نمونه" />
            <div className="mt-md space-y-md">
              {chip ? (
                <div>
                  <p className="text-body-sm" data-testid="official-microchip">
                    <Identifier label="شماره رسمی:" value={chip.number} />
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    روش خواندن: {READ_METHOD_FA[chip.readMethod]} · هر حیوان در طول عمر فقط یک میکروچیپ دارد؛ تعویض،
                    انتقال یا شماره دوم وجود ندارد.
                  </p>
                </div>
              ) : (
                <p className="text-body-sm text-text-secondary">
                  شماره رسمی پس از اسکن و تأیید دامپزشک معتمد ثبت می‌شود.
                </p>
              )}
              {conflicts.length > 0 ? (
                <Alert tone="error" title="تعارض میکروچیپ">
                  <span data-testid="animal-chip-conflict">تعارض ثبت‌شده: {conflicts[0]!.detailFa}</span>
                </Alert>
              ) : null}
              {sampleRows.length === 0 ? (
                <p className="text-body-sm text-text-secondary">
                  کد رهگیری نمونه پس از انجام واقعی نمونه‌گیری صادر می‌شود.
                </p>
              ) : (
                <dl className="hz-kv" data-testid="animal-samples">
                  {sampleRows.map((sample) => (
                    <div key={sample.id} className="hz-kv__row">
                      <dt className="hz-kv__key">
                        <Identifier value={sample.trackingCode} />
                      </dt>
                      <dd className="hz-kv__value">{SAMPLE_STATUS_FA[sample.status]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader size="sm" title="نسب و شجره‌نامه" />
            <KeyValueList
              rows={[
                {
                  key: 'نتیجه Parentage',
                  value: parentage ? (
                    <span className="flex flex-wrap items-center gap-sm">
                      <span data-testid="animal-result-status">
                        {RESULT_STATUS_FA[parentage.status]} · نسخه {parentage.resultVersion}
                      </span>
                      <Link href={'/pedigree/' + animal.id} className="hz-link" data-testid="animal-result-link">
                        مشاهده نتیجه Parentage
                      </Link>
                    </span>
                  ) : (
                    'نتیجه‌ای ثبت نشده است. پس از دریافت و پردازش نمونه در مرکز ژنتیک، نتیجه در همین پرونده دیده می‌شود.'
                  ),
                },
                {
                  key: 'Export Pedigree',
                  value: foreign ? (
                    <span className="flex flex-wrap items-center gap-sm">
                      <span data-testid="foreign-status">
                        وضعیت: {FOREIGN_STATUS_FA[foreign.status]}
                        {foreign.reasonFa ? ' — ' + foreign.reasonFa : ''}
                      </span>
                      <Link href={'/animals/' + animal.id + '/foreign-pedigree'} className="hz-link">
                        مشاهده و مدیریت مدرک
                      </Link>
                    </span>
                  ) : (
                    <span>
                      اگر این حیوان شجره‌نامه صادرشده خارج از هم‌زیست دارد،{' '}
                      <Link href={'/animals/' + animal.id + '/foreign-pedigree'} className="hz-link">
                        مدرک را برای بررسی انجمن بارگذاری کنید
                      </Link>
                      .
                    </span>
                  ),
                },
              ]}
            />
          </Card>

          {/* §10 and §16: the official cases this animal is part of. */}
          <Card>
            <SectionHeader size="sm" title="مجوزها و جفت‌گیری" />
            <div className="mt-md space-y-lg">
              {permits.length === 0 ? (
                <p className="text-body-sm text-text-secondary">پرونده مجوزی برای این حیوان ثبت نشده است.</p>
              ) : (
                <ul className="divide-y divide-border-subtle" data-testid="animal-permits">
                  {permits.map((permit) => (
                    <li key={permit.id} className="flex items-center justify-between gap-md py-md">
                      <div className="min-w-0">
                        <p className="hz-card__title">
                          {permit.permitNo ? <bdi dir="ltr">{permit.permitNo}</bdi> : 'پرونده مجوز'}
                        </p>
                        <p className="text-caption text-text-secondary">{PERMIT_STATUS_FA[permit.status]}</p>
                      </div>
                      <Link href={'/mating/permits/' + permit.id} className="hz-link hz-link--standalone">
                        مشاهده پرونده
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {/* §17.1: only mutually confirmed dates appear as the official history. */}
              <div>
                <p className="text-label-md">تاریخ‌های جفت‌گیری</p>
                <p className="mt-2xs text-caption text-text-secondary">
                  فقط تاریخ‌های تأییدشده دوطرفه؛ جدیدترین آن‌ها مبنای فاصله زمانی است.
                </p>
                {matingDates.length === 0 ? (
                  <p className="mt-sm text-body-sm text-text-secondary">تاریخ تأییدشده‌ای ثبت نشده است.</p>
                ) : (
                  <ul className="mt-sm space-y-sm" data-testid="animal-mating-dates">
                    {matingDates.map((row) => (
                      <li key={row.permitId + '-' + row.version} className="text-body-sm">
                        <bdi dir="ltr" className="hz-id">
                          {row.matedOn}
                        </bdi>{' '}
                        · {formatCivilDateFa(row.matedOn)} · نسخه {row.version} · مجوز{' '}
                        {row.permitNo ? <bdi dir="ltr">{row.permitNo}</bdi> : '—'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Who owned this animal, as rows rather than as one mutable column
              (PROMPT-007). A previous owner is never removed. */}
          {ownership.length > 0 ? (
            <Card>
              <SectionHeader size="sm" title="تاریخچه مالکیت" />
              <p className="mt-sm text-caption text-text-secondary">
                هر انتقال مالکیت یک ردیف جداست و حذف نمی‌شود؛ مدارک صادرشده در دوره هر مالک هم در پرونده می‌مانند.
              </p>
              <ul className="mt-md divide-y divide-border-subtle" data-testid="ownership-history">
                {ownership.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-sm py-sm text-body-sm">
                    <span>
                      {new Intl.DateTimeFormat('fa-IR', {
                        dateStyle: 'medium',
                      }).format(entry.transferredAt)}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {entry.reason === 'MARKETPLACE_SALE' ? 'فروش در بازار همزیست' : 'اصلاح توسط پشتیبانی'}
                    </span>
                    {entry.priceToman !== null ? (
                      <span className="text-caption text-text-secondary">
                        قیمت ثبت‌شده: {entry.priceToman.toLocaleString('fa-IR')} تومان
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <SectionHeader size="sm" title="تاریخچه پرونده" id="timeline-heading" />
            <div className="mt-lg">
              {trail.items.length === 0 ? (
                <p className="text-body-sm text-text-secondary">هنوز رویدادی ثبت نشده است.</p>
              ) : (
                // P06: oldest at the top, so the eye reads down to the latest.
                <ol className="hz-timeline">
                  {[...trail.items]
                    .sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime())
                    .map((row) => (
                      <li key={row.id} className="hz-timeline__item hz-timeline__item--done">
                        <span className="hz-timeline__marker" aria-hidden="true" />
                        <div className="hz-timeline__content">
                          <div className="hz-timeline__head">
                            <span className="hz-timeline__title">{AUDIT_TITLE_FA[row.action] ?? 'رویداد پرونده'}</span>
                          </div>
                          <div className="hz-timeline__meta">{dateFa(row.occurredAt)}</div>
                          <p className="hz-timeline__body">
                            {row.action === 'ANIMAL_LINEAGE_RESOLVED'
                              ? 'نسل از رکورد والدین بازمحاسبه شد.'
                              : 'رویداد پرونده حیوان.'}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader size="sm" title="بخش‌هایی که در مراحل بعدی پر می‌شوند" />
            <p className="mt-sm text-caption text-text-secondary">
              ساختار پرونده کامل است؛ داده این بخش‌ها با ساخته‌شدن همان فرایندها ثبت می‌شود.
            </p>
            <KeyValueList
              rows={PENDING_SECTIONS.map((section) => ({
                key: section.title,
                value: null,
                empty: '— ' + section.note,
              }))}
            />
          </Card>

          <section id="edit" className="hz-card scroll-mt-s80" aria-labelledby="edit-heading">
            <SectionHeader size="sm" title="ویرایش اطلاعات مجاز" id="edit-heading" />
            <div className="mt-lg">
              <AnimalEditForm
                animalId={animal.id}
                values={{
                  name: animal.name ?? '',
                  color: animal.color ?? '',
                  markings: animal.markings ?? '',
                  birthDateApproximate: animal.birthDateApproximate,
                }}
              />
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-xl max-lg:order-first lg:col-span-4" aria-label="وضعیت و اقدام">
          <AnimalPhoto fileId={animal.photoFileId} name={name} />
          <Card>
            <SectionHeader size="sm" title="وضعیت پرونده" />
            <div className="mt-md space-y-md">
              <ActionOwner
                owner="USER"
                stack
                extra={
                  registered
                    ? sheet
                      ? 'درخواستی برای ' + name + ' در جریان نیست؛ خدمت بعدی را از پیشخوان انتخاب کنید.'
                      : 'برای صدور برگه ثبتی، کاشت یا تأیید میکروچیپ و نمونه‌گیری را درخواست کنید.'
                    : 'ثبت این حیوان هنوز کامل نشده است.'
                }
              />
              <KeyValueList
                rows={[
                  {
                    key: 'برگه ثبتی',
                    value: sheet ? 'صادر شد' : null,
                    empty: 'صادر نشده',
                  },
                  {
                    key: 'مشخصات',
                    value: (
                      // GAPS #4: no dictionary key for the declared/verified identity state
                      <StatusBadge tone={animal.identityVerifiedAt === null ? 'neutral' : 'success'} size="sm">
                        {animal.identityVerifiedAt === null ? 'مشخصات اظهاری' : 'مشخصات رسمی تأییدشده'}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: 'میکروچیپ',
                    value: chip ? (
                      // GAPS #4: no dictionary key for a registered microchip
                      <StatusBadge tone="success" size="sm">
                        میکروچیپ ثبت‌شده
                      </StatusBadge>
                    ) : null,
                    empty: 'هنوز ثبت نشده',
                  },
                  {
                    key: 'نتیجه Parentage',
                    value: parentage ? RESULT_STATUS_FA[parentage.status] : null,
                    empty: 'ثبت نشده',
                  },
                ]}
              />
              {registered ? (
                sheet ? null : (
                  <ButtonLink href="/registration/new" block iconStart="stamp">
                    درخواست برگه ثبتی
                  </ButtonLink>
                )
              ) : (
                <ButtonLink href={'/animals/' + animal.id + '/edit'} block>
                  ادامه ثبت
                </ButtonLink>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* K9 phones: the record's main action stays reachable above the tab bar (DS StickyActionBar). */}
      {registered && sheet ? null : (
        <StickyActionBar label="کنش‌های پرونده" overTabs className="md:hidden" context={name}>
          {registered ? (
            <ButtonLink href="/registration/new" size="lg" iconStart="stamp">
              درخواست برگه ثبتی
            </ButtonLink>
          ) : (
            <ButtonLink href={'/animals/' + animal.id + '/edit'} size="lg">
              ادامه ثبت
            </ButtonLink>
          )}
        </StickyActionBar>
      )}
    </PublicShell>
  );
}

/**
 * The owner's own photo is private: it is read through the authorised file
 * route, never `/media`. Without one, the DS RecordImage placeholder.
 */
function AnimalPhoto({ fileId, name }: { fileId: string | null; name: string }): ReactNode {
  return (
    <div className="hz-media hz-media--4x3">
      {fileId ? (
        <img src={'/api/files/' + fileId} alt={'تصویر ' + name} width={800} height={600} />
      ) : (
        <div className="hz-media__empty" data-testid="record-image-empty">
          <img src="/brand/logo/symbol.svg" alt="" />
          <span className="hz-media__alt">تصویر ثبت نشده</span>
        </div>
      )}
    </div>
  );
}
