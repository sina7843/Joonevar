import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
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
    <PublicShell actor={guard.actor} title="جست‌وجوهای ذخیره‌شده" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">جست‌وجوهای ذخیره‌شده</h1>
          <p className="mt-xs text-caption text-text-secondary">
            وقتی حیوان تازه‌ای با یکی از این جست‌وجوها جور شود و برای شما قابل‌دیدن باشد، یک بار خبرتان می‌کنیم.
          </p>
        </Card>
        {searches.length === 0 ? (
          <EmptyState title="جست‌وجوی ذخیره‌شده‌ای ندارید" description="از صفحه جست‌وجوی جفت، فیلترهای دلخواه را ذخیره کنید." />
        ) : (
          <ul className="space-y-sm" data-testid="finder-saved-searches">
            {searches.map((search) => (
              <li key={search.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm" data-testid={'finder-saved-' + search.id}>
                <Link
                  href={'/mating-finder?' + new URLSearchParams(filtersToQuery(search.filters as SearchFilters)).toString()}
                  className="text-label-md text-text-brand underline underline-offset-4"
                >
                  {search.nameFa}
                </Link>
                <span className="flex items-center gap-sm">
                  <StatusBadge tone={search.notify ? 'info' : 'neutral'}>{search.notify ? 'با خبر' : 'بدون خبر'}</StatusBadge>
                  <DeleteSavedSearchForm id={search.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
