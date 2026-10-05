import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge, type StatusTone } from '../../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { db } from '../../../src/db/client.ts';
import { directoryReferenceData } from '../../../src/vets/directory.ts';
import { mySuggestions } from '../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../src/suggestions/model.ts';
import { APPLICATION_STATUS_FA, type VetApplicationStatus } from '../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { SuggestionCorrectionForm, SuggestionForm, WithdrawSuggestionForm } from '../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<VetApplicationStatus, StatusTone> = {
  SUBMITTED: 'info',
  NEEDS_CORRECTION: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
};

/**
 * Suggesting a directory record — Requirements-Phase-2 §10 (PROMPT-009).
 *
 * The suggester never becomes the owner: approval publishes the record without
 * one, and the people it describes claim it afterwards (P2-D06).
 */
export default async function AccountSuggestionsPage() {
  const guard = await guardRoute('/account/suggestions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [suggestions, reference] = await Promise.all([mySuggestions(db(), guard.actor), directoryReferenceData(db())]);
  const provinceOf = (cityId: string | null) => reference.cities.find((city) => city.id === cityId)?.provinceCode ?? null;
  const open = suggestions.filter((row) => row.status === 'SUBMITTED' || row.status === 'NEEDS_CORRECTION');

  return (
    <PublicShell
      actor={guard.actor}
      title="پیشنهادهای من"
      pathname="/account/suggestions"
      header={
        <PageHeader
          title="پیشنهادهای من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(suggestions.length > 0 ? [suggestions.length.toLocaleString('fa-IR') + ' پیشنهاد'] : []),
            ...(open.length > 0 ? [open.length.toLocaleString('fa-IR') + ' باز'] : []),
            'پیشنهاددهنده مالک رکورد نمی‌شود؛ پس از تأیید، خود صاحب رکورد آن را تحویل می‌گیرد.',
          ]}
        />
      }
    >
      <div className="space-y-xl">
        {open.length >= 3 ? (
          <Alert tone="info" title="سه پیشنهاد باز دارید">
            تا تعیین تکلیف آن‌ها، پیشنهاد تازه ثبت نمی‌شود.
          </Alert>
        ) : (
          <SuggestionForm provinces={reference.provinces} cities={reference.cities} />
        )}

        <section className="space-y-md" aria-labelledby="my-suggestions-title">
          <SectionHeader id="my-suggestions-title" title="پیشنهادهای شما" />
          {suggestions.length === 0 ? (
            <div>
              <EmptyState
                icon="userPlus"
                title="هنوز پیشنهادی ثبت نکرده‌اید"
                description="اگر دامپزشک یا مرکزی را در همزیست پیدا نکردید، با فرم بالا معرفی‌اش کنید."
              />
            </div>
          ) : (
            <ul className="hz-cardlist" data-testid="my-suggestions">
              {suggestions.map((row) => (
                <li key={row.id} className="hz-cardlist__item" data-testid={'suggestion-' + row.id}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="hz-caption">{SUGGESTION_KIND_FA[row.kind as SuggestionKind]}</p>
                      <p className="hz-cardlist__title">{row.displayNameFa}</p>
                      <p className="hz-cardlist__meta">
                        {[row.cityNameFa, 'ثبت: ' + formatInstantFa(row.createdAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span data-testid={'suggestion-status-' + row.id}>
                      <StatusBadge tone={TONE[row.status as VetApplicationStatus]}>
                        {APPLICATION_STATUS_FA[row.status as VetApplicationStatus]}
                      </StatusBadge>
                    </span>
                  </div>

                  {row.status === 'NEEDS_CORRECTION' ? <ActionOwner owner="USER" extra="اطلاعات را مطابق نتیجه بررسی اصلاح کنید." /> : null}
                  {row.reviewNoteFa && row.status !== 'SUBMITTED' ? (
                    <div data-testid={'suggestion-note-' + row.id}>
                      <Alert tone={row.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                        {row.reviewNoteFa}
                      </Alert>
                    </div>
                  ) : null}

                  {row.status === 'APPROVED' && row.publicSlug ? (
                    <Link
                      href={(row.kind === 'VET' ? '/veterinarians/' : '/centers/') + row.publicSlug}
                      className="hz-link hz-link--standalone"
                      data-testid={'suggestion-record-' + row.id}
                    >
                      مشاهده رکورد منتشرشده
                      <Icon name="arrowRight" size="xs" mirror />
                    </Link>
                  ) : null}

                  {row.status === 'NEEDS_CORRECTION' ? (
                    <SuggestionCorrectionForm
                      suggestion={{
                        id: row.id,
                        version: row.version,
                        kind: row.kind,
                        displayNameFa: row.displayNameFa,
                        provinceCode: provinceOf(row.cityId),
                        cityId: row.cityId,
                        contactFa: row.contactFa,
                        sourceFa: row.sourceFa,
                        noteFa: row.noteFa,
                      }}
                      provinces={reference.provinces}
                      cities={reference.cities}
                    />
                  ) : null}
                  {row.status === 'SUBMITTED' || row.status === 'NEEDS_CORRECTION' ? (
                    <WithdrawSuggestionForm suggestionId={row.id} version={row.version} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PublicShell>
  );
}
