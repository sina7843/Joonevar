import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { findProfile } from '../../../src/identity/account.ts';
import { Timeline, type TimelineItem } from '../../../src/ui/timeline.tsx';
import { db } from '../../../src/db/client.ts';
import { referenceBreeds } from '../../../src/db/schema/core.ts';
import { familyOf, requireOwnedAnimal } from '../../../src/animals/service.ts';
import { findForeignCase, FOREIGN_STATUS_FA } from '../../../src/animals/foreign-pedigree.ts';
import { auditTrail } from '../../../src/audit/service.ts';
import { permitsOfAnimal, PERMIT_STATUS_FA } from '../../../src/mating/permits.ts';
import { confirmedDatesOfAnimal } from '../../../src/mating/dates.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { animalChipView } from '../../../src/clinical/microchip.ts';
import { SAMPLE_TAKEN_NOTE_FA, sheetOfAnimal } from '../../../src/documents/registration-sheet.ts';
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
  ANIMAL_GENERATION_FROM_FOREIGN_PEDIGREE: 'نسل از شجره‌نامه خارجی ثبت شد',
  ANIMAL_MATING_PERMIT_ISSUED: 'مجوز رسمی جفت‌گیری صادر شد',
  ANIMAL_MATING_PERMIT_REVIEWED: 'پرونده مجوز جفت‌گیری بررسی شد',
  ANIMAL_MATING_DATE_CONFIRMED: 'تاریخ جفت‌گیری دوطرفه تأیید شد',
};

/** Sections that belong to features built in later prompts. */
const PENDING_SECTIONS: ReadonlyArray<{ id: string; title: string; note: string }> = [
  { id: 'pedigree', title: 'شجره‌نامه', note: 'کد شجره‌نامه و وضعیت صدور.' },
  { id: 'litter', title: 'بارداری، زایمان و Litter', note: 'اعلام کاربر و نتیجه مستقل دامپزشک.' },
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
  const ownerName =
    ownerProfile === null ? null : ownerProfile.firstName + ' ' + ownerProfile.lastName;
  const foreign = await findForeignCase(db(), animal.id);
  const trail = await auditTrail(db(), { targetType: 'ANIMAL', targetId: animal.id }, { page: 1, pageSize: 20 });
  const { chip, conflicts } = await animalChipView(db(), animal.id);
  const sheet = await sheetOfAnimal(db(), animal.id);
  const parentage = await resultOfAnimal(db(), animal.id);
  const permits = await permitsOfAnimal(db(), animal.id);
  const matingDates = await confirmedDatesOfAnimal(db(), animal.id);
  const sampleRows = await db()
    .select()
    .from(samples)
    .where(eq(samples.animalId, animal.id))
    .orderBy(sql`collected_at desc`);

  const items: readonly TimelineItem[] = trail.items.map((row) => ({
    id: row.id,
    title: AUDIT_TITLE_FA[row.action] ?? 'رویداد پرونده',
    whenFa: formatCivilDateFa(row.occurredAt.toISOString().slice(0, 10)),
    status: { tone: 'neutral' as const, label: 'ثبت‌شده' },
    owner: 'USER' as const,
    summary: row.action === 'ANIMAL_LINEAGE_RESOLVED' ? 'نسل از رکورد والدین بازمحاسبه شد.' : 'رویداد پرونده حیوان.',
    href: '/animals/' + animal.id,
    ctaLabel: 'مشاهده',
  }));

  return (
    <PublicShell actor={actor} title="پرونده حیوان" pathname={'/animals/' + id}>
      <div className="hz-stagger space-y-lg">
        {/*
          * Prototype PET-009-O: the file opens with who this animal is — a tile,
          * the name, what it is, its identifiers — and the two states that
          * matter as chips above it. The identity is the header of the file, not
          * the first of a stack of equal cards.
          */}
        <section aria-labelledby="animal-identity" className="space-y-md">
          <div className="hz-rail flex gap-sm">
            <StatusBadge tone={animal.status === 'REGISTERED' ? 'info' : 'neutral'}>
              {animal.status === 'REGISTERED' ? 'پرونده اولیه' : 'پیش‌نویس'}
            </StatusBadge>
            <StatusBadge tone={animal.identityVerifiedAt === null ? 'neutral' : 'success'}>
              {animal.identityVerifiedAt === null ? 'مشخصات اظهاری' : 'مشخصات رسمی تأییدشده'}
            </StatusBadge>
            {chip ? <StatusBadge tone="success">میکروچیپ ثبت‌شده</StatusBadge> : null}
          </div>

          <Card>
            <div className="flex items-start gap-md">
              <span
                aria-hidden="true"
                className="flex size-[var(--size-icon-lg)] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand"
              >
                <Icon name="dog" size="md" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="animal-identity" className="truncate text-h4">
                  {animal.name ?? 'بدون نام'}
                </h2>
                <p className="mt-2xs text-caption text-text-secondary">
                  سگ · {breed?.nameFa ?? '—'} ·{' '}
                  {animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : '—'}
                </p>
                {/*
                  * The prototype header carries the identifier a person can use
                  * — the Pet ID — and never the database key, which §23.2 keeps
                  * separate from it and which means nothing to the owner.
                  */}
                <p className="mt-2xs text-caption text-text-secondary" data-testid="pet-id">
                  شناسه رسمی (Pet ID):{' '}
                  {animal.petId ? <Identifier value={animal.petId} /> : '— تا صدور برگه ثبتی'}
                </p>
              </div>
            </div>
          </Card>
        </section>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="shieldCheck" size="sm" className="text-text-brand" />
            هویت
          </h3>
          {/* §10: verified data is not rewritten from this form, and the screen
              says which of the two it is looking at. */}
          <p className="mt-2xs text-caption text-text-secondary" data-testid="identity-provenance">
            {animal.identityVerifiedAt === null
              ? 'این مشخصات اظهار شماست. در مراجعه به دامپزشک معتمد، مشخصات رسمی ثبت می‌شود و پس از آن تغییر نمی‌کند.'
              : 'مشخصات رسمی، در ' +
                formatCivilDateFa(animal.identityVerifiedAt.toISOString().slice(0, 10)) +
                ' توسط دامپزشک معتمد ثبت شده است و از این فرم تغییر نمی‌کند.'}
          </p>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">تاریخ تولد</dt>
            <dd>
              {animal.birthDate ? formatCivilDateFa(animal.birthDate) : '—'}
              {animal.birthDateApproximate ? ' (تقریبی)' : ''}
            </dd>
            <dt className="text-text-secondary">نسل</dt>
            <dd data-testid="animal-generation">{generationLabel(animal.generation)}</dd>
            <dt className="text-text-secondary">منبع شناسایی</dt>
            <dd data-testid="animal-origin">
              {animal.origin === 'G0'
                ? 'بدون اسناد هویتی'
                : animal.origin === 'INTERNAL_G1PLUS'
                  ? 'نسب ثبت‌شده در هم‌زیست'
                  : 'شجره‌نامه خارجی'}
            </dd>
            <dt className="text-text-secondary">رنگ</dt>
            <dd>{animal.color ?? '—'}</dd>
            <dt className="text-text-secondary">نشانه‌های ظاهری</dt>
            <dd>{animal.markings ?? '—'}</dd>
            <dt className="text-text-secondary">میکروچیپ اعلامی</dt>
            <dd data-testid="declared-microchip-value">
              {animal.declaredMicrochipNumber ? (
                <Identifier value={animal.declaredMicrochipNumber} />
              ) : (
                '—'
              )}
            </dd>
          </dl>
          <p className="mt-md text-caption text-text-secondary">
            نسل فقط‌خواندنی است. شماره میکروچیپ اعلامی تا اسکن و تأیید دامپزشک معتمد رسمی نیست.
          </p>
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="user" size="sm" className="text-text-brand" />
            مالکیت
          </h3>
          <p className="mt-md text-body-sm" data-testid="animal-owner">
            {/* §23.3: a name identifies a person; an account key identifies a row. */}
            مالک: {ownerName ?? 'شما'}
          </p>
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="dna" size="sm" className="text-text-brand" />
            خانواده و نسب
          </h3>
          <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm">
            <dt className="text-text-secondary">پدر</dt>
            <dd data-testid="family-sire">
              {family.sire ? (
                <Link href={'/animals/' + family.sire.id} className="text-text-brand underline underline-offset-4">
                  {family.sire.name ?? 'بدون نام'} · {generationLabel(family.sire.generation)}
                </Link>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-text-secondary">مادر</dt>
            <dd data-testid="family-dam">
              {family.dam ? (
                <Link href={'/animals/' + family.dam.id} className="text-text-brand underline underline-offset-4">
                  {family.dam.name ?? 'بدون نام'} · {generationLabel(family.dam.generation)}
                </Link>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-text-secondary">فرزندان</dt>
            <dd>{family.offspring.length === 0 ? '—' : family.offspring.length + ' مورد'}</dd>
          </dl>
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="syringe" size="sm" className="text-text-brand" />
            میکروچیپ
          </h3>
          {chip ? (
            <>
              <p className="mt-md text-body-sm" data-testid="official-microchip">
                <Identifier label="شماره رسمی:" value={chip.number} />
              </p>
              <p className="mt-2xs text-caption text-text-secondary">
                روش خواندن: {READ_METHOD_FA[chip.readMethod]} · هر حیوان در طول عمر فقط یک میکروچیپ دارد؛ تعویض،
                انتقال یا شماره دوم وجود ندارد.
              </p>
            </>
          ) : (
            <p className="mt-md text-body-sm text-text-secondary">
              شماره رسمی پس از اسکن و تأیید دامپزشک معتمد ثبت می‌شود.
            </p>
          )}
          {conflicts.length > 0 ? (
            <p className="mt-md text-caption text-status-error-text" data-testid="animal-chip-conflict">
              تعارض ثبت‌شده: {conflicts[0]!.detailFa}
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="stamp" size="sm" className="text-text-brand" />
            برگه ثبتی
          </h3>
          {sheet ? (
            <>
              <p className="mt-md text-body-sm">
                <Link
                  href={'/documents/' + sheet.id}
                  className="text-text-brand underline underline-offset-4"
                  data-testid="animal-sheet-link"
                >
                  <Identifier label="شماره برگه:" value={sheet.sheetNo} />
                </Link>
              </p>
              <p className="mt-sm text-caption text-text-secondary" data-testid="animal-parentage-note">
                {SAMPLE_TAKEN_NOTE_FA} برگه ثبتی به معنی نتیجه ژنتیک یا شجره‌نامه نیست.
              </p>
            </>
          ) : (
            <p className="mt-md text-body-sm text-text-secondary">
              پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری، می‌توانید{' '}
              <Link href="/registration/new" className="text-text-brand underline underline-offset-4">
                برگه ثبتی این حیوان را درخواست کنید
              </Link>
              .
            </p>
          )}
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="testTube" size="sm" className="text-text-brand" />
            نمونه و Custody
          </h3>
          {sampleRows.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">
              کد رهگیری نمونه پس از انجام واقعی نمونه‌گیری صادر می‌شود.
            </p>
          ) : (
            <ul className="mt-md space-y-sm text-body-sm" data-testid="animal-samples">
              {sampleRows.map((sample) => (
                <li key={sample.id} className="flex items-center justify-between gap-md">
                  <Identifier value={sample.trackingCode} />
                  <span className="text-text-secondary">{SAMPLE_STATUS_FA[sample.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="dna" size="sm" className="text-text-brand" />
            Parentage Result
          </h3>
          {parentage ? (
            <>
              <p className="mt-md text-body-sm" data-testid="animal-result-status">
                {RESULT_STATUS_FA[parentage.status]} · نسخه {parentage.resultVersion}
              </p>
              <p className="mt-sm text-body-sm">
                <Link
                  href={'/pedigree/' + animal.id}
                  className="text-text-brand underline underline-offset-4"
                  data-testid="animal-result-link"
                >
                  مشاهده نتیجه Parentage
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-md text-body-sm text-text-secondary">
              نتیجه‌ای ثبت نشده است. پس از دریافت و پردازش نمونه در مرکز ژنتیک، نتیجه در همین پرونده دیده
              می‌شود.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="certificate" size="sm" className="text-text-brand" />
            شجره‌نامه خارجی
          </h3>
          {foreign ? (
            <>
              <p className="mt-md text-body-sm" data-testid="foreign-status">
                وضعیت: {FOREIGN_STATUS_FA[foreign.status]}
                {foreign.reasonFa ? ' — ' + foreign.reasonFa : ''}
              </p>
              <p className="mt-sm text-caption text-text-secondary">
                <Link
                  href={'/animals/' + animal.id + '/foreign-pedigree'}
                  className="text-text-brand underline underline-offset-4"
                >
                  مشاهده و مدیریت مدرک
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-md text-body-sm text-text-secondary">
              اگر این حیوان شجره‌نامه صادرشده خارج از هم‌زیست دارد، می‌توانید{' '}
              <Link
                href={'/animals/' + animal.id + '/foreign-pedigree'}
                className="text-text-brand underline underline-offset-4"
              >
                مدرک را برای بررسی انجمن بارگذاری کنید
              </Link>
              .
            </p>
          )}
        </Card>

        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="clipboardText" size="sm" className="text-text-brand" />
            ویرایش اطلاعات مجاز
          </h3>
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
        </Card>

        {/* §10 and §16: the official cases this animal is part of. */}
        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="stamp" size="sm" className="text-text-brand" />
            مجوزها
          </h3>
          {permits.length === 0 ? (
            <p className="mt-md text-body-sm text-text-disabled">پرونده مجوزی برای این حیوان ثبت نشده است.</p>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="animal-permits">
              {permits.map((permit) => (
                <li key={permit.id} className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-label-md">{permit.permitNo ?? 'پرونده مجوز'}</p>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {PERMIT_STATUS_FA[permit.status]}
                    </p>
                  </div>
                  <Link
                    href={'/mating/permits/' + permit.id}
                    className="text-label-md text-text-brand underline underline-offset-4"
                  >
                    مشاهده پرونده
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* §17.1: only mutually confirmed dates appear as the official history. */}
        <Card>
          <h3 className="flex items-center gap-sm text-label-lg">
            <Icon name="calendarDots" size="sm" className="text-text-brand" />
            تاریخ‌های جفت‌گیری
          </h3>
          <p className="mt-2xs text-caption text-text-secondary">
            فقط تاریخ‌های تأییدشده دوطرفه؛ جدیدترین آن‌ها مبنای فاصله زمانی است.
          </p>
          {matingDates.length === 0 ? (
            <p className="mt-md text-body-sm text-text-disabled">تاریخ تأییدشده‌ای ثبت نشده است.</p>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="animal-mating-dates">
              {matingDates.map((row) => (
                <li key={row.permitId + '-' + row.version} className="text-body-sm">
                  <span dir="ltr" className="font-mono">
                    {row.matedOn}
                  </span>{' '}
                  · {formatCivilDateFa(row.matedOn)} · نسخه {row.version} · مجوز {row.permitNo ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Alert tone="info" title="بخش‌هایی که در مراحل بعدی پر می‌شوند">
          ساختار پرونده کامل است؛ داده این بخش‌ها با ساخته‌شدن همان فرایندها ثبت می‌شود.
        </Alert>

        {PENDING_SECTIONS.map((section) => (
          <Card key={section.id}>
            <h3 className="text-label-lg">{section.title}</h3>
            <p className="mt-2xs text-caption text-text-secondary">{section.note}</p>
            <p className="mt-md text-body-sm text-text-disabled">اطلاعاتی برای نمایش وجود ندارد.</p>
          </Card>
        ))}

        <section aria-labelledby="timeline-heading" className="space-y-md">
          <h3 id="timeline-heading" className="text-h4">
            تاریخچه
          </h3>
          <Timeline items={items} />
        </section>
      </div>
    </PublicShell>
  );
}
