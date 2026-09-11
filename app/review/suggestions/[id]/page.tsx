import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { suggestionForReview } from '../../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../../src/suggestions/model.ts';
import { APPLICATION_STATUS_FA, type VetApplicationStatus } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { SuggestionDecisionForm } from '../../../../src/suggestions/forms.tsx';

export const dynamic = 'force-dynamic';

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-md border-b border-border-subtle py-sm last:border-b-0">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-label-md">{value}</dd>
    </div>
  );
}

/** One suggestion and the records that already look like it — §10, §22 (PROMPT-009). */
export default async function ReviewSuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/review/suggestions/' + encodeURIComponent(id));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await suggestionForReview(db(), guard.actor, id);
  if (data === null) notFound();
  const { suggestion, similar } = data;

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/suggestions" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Link href="/review/suggestions" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به پیشنهادها
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <p className="text-caption text-text-secondary">{SUGGESTION_KIND_FA[suggestion.kind as SuggestionKind]}</p>
              <h1 className="text-h4">{suggestion.displayNameFa}</h1>
            </div>
            <span data-testid="suggestion-review-status">
              <StatusBadge tone={suggestion.status === 'SUBMITTED' ? 'warning' : suggestion.status === 'APPROVED' ? 'success' : 'neutral'}>
                {APPLICATION_STATUS_FA[suggestion.status as VetApplicationStatus]}
              </StatusBadge>
            </span>
          </div>
          <dl className="mt-lg">
            <Fact label="شهر" value={[data.provinceNameFa, data.cityNameFa].filter(Boolean).join(' · ') || null} />
            <Fact label="تماس یا نشانی عمومی" value={suggestion.contactFa} />
            <Fact label="منبع اطلاعات" value={suggestion.sourceFa} />
            <Fact label="ثبت" value={formatInstantFa(suggestion.createdAt)} />
          </dl>
          {suggestion.noteFa ? <p className="mt-md whitespace-pre-line text-body-sm">{suggestion.noteFa}</p> : null}
          {suggestion.reviewNoteFa ? (
            <p className="mt-md text-caption text-text-secondary" data-testid="suggestion-last-note">
              {'آخرین تصمیم: ' + suggestion.reviewNoteFa + (suggestion.reviewedAt ? ' · ' + formatInstantFa(suggestion.reviewedAt) : '')}
            </p>
          ) : null}
          {data.createdSlug ? (
            <p className="mt-sm text-body-sm">
              <Link
                href={(suggestion.kind === 'VET' ? '/veterinarians/' : '/centers/') + data.createdSlug}
                className="text-text-brand underline underline-offset-4"
                data-testid="suggestion-created-record"
              >
                رکورد منتشرشده از این پیشنهاد
              </Link>
            </p>
          ) : null}
        </Card>

        {similar.length > 0 ? (
          <div data-testid="suggestion-duplicates">
            <Alert tone="warning" title="رکورد مشابه با همین نام">
              <ul className="list-disc space-y-2xs pr-lg">
                {similar.map((row) => (
                  <li key={row.kind + row.nameFa + (row.slug ?? '')}>
                    {row.nameFa +
                      ' · ' +
                      SUGGESTION_KIND_FA[row.kind] +
                      ' · ' +
                      (row.owned ? 'دارای مالک' : 'بدون مالک') +
                      (row.published ? '' : ' · منتشرنشده')}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        <SuggestionDecisionForm suggestionId={suggestion.id} version={suggestion.version} open={suggestion.status === 'SUBMITTED'} />
      </div>
    </OpsShell>
  );
}
