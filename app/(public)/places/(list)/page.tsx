import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { provinceSummaries } from '../../../../src/geo/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'استان‌ها و شهرها';
const DESCRIPTION = 'دامپزشکان، مراکز دامپزشکی و انجمن‌های منتشرشده در هر استان و شهر ایران.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/places' },
];

const fa = (value: number): string => value.toLocaleString('fa-IR');

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/places' }, site());
}

/** Local pages — Requirements-Phase-2 §2, §19 (PROMPT-015). */
export default async function PlacesPage() {
  const summaries = await provinceSummaries(db());
  const { origin } = site();
  const withRecords = summaries.filter((entry) => entry.total > 0);

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={[
            fa(withRecords.length) + ' استان با رکورد منتشرشده',
            'نشانی دقیق و محل غیرعمومی هیچ‌جا منتشر نمی‌شود.',
          ]}
        />
      </div>

      {withRecords.length === 0 ? (
        <EmptyState
          title="هنوز در هیچ استانی رکورد منتشرشده‌ای نیست"
          description="با انتشار نخستین دامپزشک، مرکز یا انجمن، صفحه همان استان پر می‌شود."
        />
      ) : null}

      <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="province-list">
        {summaries.map((entry) => (
          <li key={entry.province.code}>
            <Link
              href={entry.path}
              className="hz-card hz-card--interactive block h-full text-text-primary no-underline"
              data-testid={'province-' + entry.province.code}
            >
              <span className="hz-entity">
                <span className="hz-avatar shrink-0 text-text-brand" aria-hidden="true">
                  <Icon name="mapPin" size="md" />
                </span>
                <span className="hz-entity__body">
                  <span className="hz-entity__name">{entry.province.nameFa}</span>
                  <span className="hz-entity__meta">
                    {entry.total === 0
                      ? 'هنوز رکورد منتشرشده‌ای ندارد'
                      : [
                          entry.counts.vets > 0 ? fa(entry.counts.vets) + ' دامپزشک' : null,
                          entry.counts.centres > 0 ? fa(entry.counts.centres) + ' مرکز' : null,
                          entry.counts.communities > 0 ? fa(entry.counts.communities) + ' انجمن و کلاب' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
