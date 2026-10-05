import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { mySavedSearches } from '../../../../src/finder/discovery.ts';
import { filtersToQuery, type SearchFilters } from '../../../../src/finder/discovery-model.ts';
import { DeleteSavedSearchForm } from '../../../../src/finder/discovery-forms.tsx';

export const dynamic = 'force-dynamic';

/** Saved searches — PHASE-4 PROMPT-004. Each runs again, as its owner, when opened. */
export default async function FinderSavedSearchesPage() {
  const guard = await guardRoute('/account/mating-finder/saved-searches');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const searches = await mySavedSearches(db(), guard.actor);
  return (
    <PublicShell
      actor={guard.actor}
      title="جست‌وجوهای ذخیره‌شده"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="جست‌وجوهای ذخیره‌شده"
          back={{ href: '/account/mating-finder' }}
          meta={[
            ...(searches.length > 0 ? [searches.length.toLocaleString('fa-IR') + ' جست‌وجو'] : []),
            'وقتی حیوان تازه‌ای با یکی از این جست‌وجوها جور شود و برای شما قابل‌دیدن باشد، یک بار خبرتان می‌کنیم.',
          ]}
        />
      }
    >
      <div className="space-y-lg">
        {searches.length === 0 ? (
          <EmptyState
            icon="magnifyingGlass"
            title="جست‌وجوی ذخیره‌شده‌ای ندارید"
            description="از صفحه جست‌وجوی جفت، فیلترهای دلخواه را ذخیره کنید."
            action={
              <ButtonLink tone="secondary" href="/mating-finder">
                جست‌وجوی جفت
              </ButtonLink>
            }
          />
        ) : (
          <ul className="hz-cardlist" data-testid="finder-saved-searches">
            {searches.map((search) => (
              <li key={search.id} className="hz-cardlist__item" data-testid={'finder-saved-' + search.id}>
                <div className="hz-cardlist__row">
                  <Link
                    href={'/mating-finder?' + new URLSearchParams(filtersToQuery(search.filters as SearchFilters)).toString()}
                    className="hz-cardlist__title inline-flex min-w-0 items-center gap-xs text-text-primary"
                  >
                    <Icon name="magnifyingGlass" size="sm" className="text-text-brand" />
                    {search.nameFa}
                  </Link>
                  <span className="flex items-center gap-sm">
                    <StatusBadge tone={search.notify ? 'info' : 'neutral'}>{search.notify ? 'با خبر' : 'بدون خبر'}</StatusBadge>
                    <DeleteSavedSearchForm id={search.id} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
