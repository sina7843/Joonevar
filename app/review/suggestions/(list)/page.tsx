import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { suggestionQueue } from '../../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../../src/suggestions/model.ts';
import { APPLICATION_STATUS_FA, type VetApplicationStatus } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type View = 'OPEN' | 'CORRECTION' | 'DECIDED';
type Search = Promise<{ view?: string | string[]; page?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

const VIEWS: ReadonlyArray<{ view: View; label: string; empty: string }> = [
  { view: 'OPEN', label: 'در انتظار بررسی', empty: 'پیشنهادی در انتظار بررسی نیست' },
  { view: 'CORRECTION', label: 'نیازمند اصلاح', empty: 'پیشنهادی منتظر اصلاح نیست' },
  { view: 'DECIDED', label: 'تصمیم‌گرفته و بایگانی', empty: 'هنوز تصمیمی ثبت نشده است' },
];

/** Suggestions from ordinary users — Requirements-Phase-2 §10, §21 (PROMPT-009). */
export default async function ReviewSuggestionsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/review/suggestions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const view = (VIEWS.find((entry) => entry.view === one(search.view))?.view ?? 'OPEN') as View;
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await suggestionQueue(db(), guard.actor, { view, page });
  const href = (target: View, targetPage = 1) =>
    '/review/suggestions' + (target === 'OPEN' && targetPage === 1 ? '' : '?view=' + target + (targetPage > 1 ? '&page=' + targetPage : ''));

  return (
    <OpsShell actor={guard.actor} title="اپراتور بررسی" pathname="/review/suggestions" nav={REVIEW_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">پیشنهادهای کاربران</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            رکورد پیشنهادی تا تأیید منتشر نمی‌شود و پس از تأیید، بدون مالک منتشر می‌شود. نام پیشنهاددهنده در این صف نمی‌آید.
          </p>
          <nav aria-label="نمای پیشنهادها" className="mt-lg flex flex-wrap gap-sm">
            {VIEWS.map((entry) => (
              <Link
                key={entry.view}
                href={href(entry.view)}
                aria-current={entry.view === view ? 'page' : undefined}
                data-testid={'suggestion-view-' + entry.view}
                className={[
                  'rounded-full border px-lg py-xs text-label-md',
                  entry.view === view ? 'border-border-brand bg-bg-brand-subtle text-text-brand' : 'border-border-subtle text-text-secondary',
                ].join(' ')}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        </Card>

        {result.items.length === 0 ? (
          <EmptyState title={VIEWS.find((entry) => entry.view === view)!.empty} description="پیشنهادهای تازه کاربران اینجا نشان داده می‌شوند." />
        ) : (
          <ul className="space-y-sm" data-testid="suggestion-queue">
            {result.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={'/review/suggestions/' + item.id}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'suggestion-item-' + item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-caption text-text-secondary">{SUGGESTION_KIND_FA[item.kind as SuggestionKind]}</p>
                      <p className="text-label-lg text-text-primary">{item.displayNameFa}</p>
                    </div>
                    <StatusBadge tone={item.status === 'SUBMITTED' ? 'warning' : item.status === 'APPROVED' ? 'success' : 'neutral'}>
                      {APPLICATION_STATUS_FA[item.status as VetApplicationStatus]}
                    </StatusBadge>
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    {[item.cityNameFa, 'منبع: ' + item.sourceFa, 'ثبت: ' + formatInstantFa(item.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {result.totalPages > 1 ? (
          <nav aria-label="صفحه‌بندی" className="flex items-center justify-between gap-md">
            {result.page > 1 ? <ButtonLink tone="secondary" href={href(view, result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
            <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
            {result.page < result.totalPages ? <ButtonLink tone="secondary" href={href(view, result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
          </nav>
        ) : null}
      </div>
    </OpsShell>
  );
}
