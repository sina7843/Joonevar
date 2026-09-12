import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { provinceSummaries } from '../../../../src/geo/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

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
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          هر استان صفحه خودش را دارد و آنچه در آن منتشر شده است را نشان می‌دهد. نشانی دقیق و محل غیرعمومی هیچ‌جا منتشر
          نمی‌شود.
        </p>
      </header>

      {withRecords.length === 0 ? (
        <EmptyState
          title="هنوز در هیچ استانی رکورد منتشرشده‌ای نیست"
          description="با انتشار نخستین دامپزشک، مرکز یا انجمن، صفحه همان استان پر می‌شود."
        />
      ) : null}

      <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="province-list">
        {summaries.map((entry) => (
          <li key={entry.province.code}>
            <Link
              href={entry.path}
              className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
              data-testid={'province-' + entry.province.code}
            >
              <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                <Icon name="mapPin" size="md" />
              </span>
              <span className="min-w-0 space-y-xs">
                <span className="block text-label-lg text-text-primary">{entry.province.nameFa}</span>
                {entry.total === 0 ? (
                  <span className="block text-caption text-text-secondary">هنوز رکورد منتشرشده‌ای ندارد</span>
                ) : (
                  <span className="flex flex-wrap gap-xs pt-2xs">
                    {entry.counts.vets > 0 ? <StatusBadge tone="info">{fa(entry.counts.vets) + ' دامپزشک'}</StatusBadge> : null}
                    {entry.counts.centres > 0 ? <StatusBadge tone="info">{fa(entry.counts.centres) + ' مرکز'}</StatusBadge> : null}
                    {entry.counts.communities > 0 ? (
                      <StatusBadge tone="info">{fa(entry.counts.communities) + ' انجمن و کلاب'}</StatusBadge>
                    ) : null}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
