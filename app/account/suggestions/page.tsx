import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge, type StatusTone } from '../../../src/ui/status.tsx';
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
    <PublicShell actor={guard.actor} title="پیشنهادهای من" pathname="/account/suggestions">
      <div className="space-y-lg">
        {open.length >= 3 ? (
          <Alert tone="info" title="سه پیشنهاد باز دارید">
            تا تعیین تکلیف آن‌ها، پیشنهاد تازه ثبت نمی‌شود.
          </Alert>
        ) : (
          <SuggestionForm provinces={reference.provinces} cities={reference.cities} />
        )}

        <Card>
          <h2 className="text-label-lg">پیشنهادهای شما</h2>
          {suggestions.length === 0 ? (
            <div className="mt-lg">
              <EmptyState
                title="هنوز پیشنهادی ثبت نکرده‌اید"
                description="اگر دامپزشک یا مرکزی را در همزیست پیدا نکردید، با فرم بالا معرفی‌اش کنید."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="my-suggestions">
              {suggestions.map((row) => (
                <li key={row.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'suggestion-' + row.id}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-caption text-text-secondary">{SUGGESTION_KIND_FA[row.kind as SuggestionKind]}</p>
                      <p className="text-label-lg">{row.displayNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[row.cityNameFa, 'ثبت: ' + formatInstantFa(row.createdAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span data-testid={'suggestion-status-' + row.id}>
                      <StatusBadge tone={TONE[row.status as VetApplicationStatus]}>
                        {APPLICATION_STATUS_FA[row.status as VetApplicationStatus]}
                      </StatusBadge>
                    </span>
                  </div>

                  {row.reviewNoteFa && row.status !== 'SUBMITTED' ? (
                    <div className="mt-md" data-testid={'suggestion-note-' + row.id}>
                      <Alert tone={row.status === 'APPROVED' ? 'success' : 'warning'} title="نتیجه بررسی">
                        {row.reviewNoteFa}
                      </Alert>
                    </div>
                  ) : null}

                  {row.status === 'APPROVED' && row.publicSlug ? (
                    <p className="mt-sm text-body-sm">
                      <Link
                        href={(row.kind === 'VET' ? '/veterinarians/' : '/centers/') + row.publicSlug}
                        className="text-text-brand underline underline-offset-4"
                        data-testid={'suggestion-record-' + row.id}
                      >
                        مشاهده رکورد منتشرشده
                      </Link>
                    </p>
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
        </Card>
      </div>
    </PublicShell>
  );
}
