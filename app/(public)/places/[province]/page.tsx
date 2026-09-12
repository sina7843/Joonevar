import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { provincePage } from '../../../../src/geo/service.ts';
import { placePath } from '../../../../src/geo/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ province: string }> };

const load = cache((code: string) => provincePage(db(), code));
const fa = (value: number): string => value.toLocaleString('fa-IR');

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).province);
  if (page === null) return {};
  return buildMetadata(
    {
      title: 'دامپزشکان و مراکز ' + page.province.nameFa,
      description:
        'دامپزشکان، مراکز دامپزشکی و انجمن‌های منتشرشده در استان ' + page.province.nameFa + ' با شهر و راه ارتباطی اعلام‌شده.',
      path: placePath(page.province.code),
      // §19: a place with nothing published in it is a thin page.
      noindex: !page.indexable,
    },
    site(),
  );
}

/** One province — Requirements-Phase-2 §2, §19 (PROMPT-015). */
export default async function ProvincePage({ params }: Params) {
  const { province: code } = await params;
  const page = await load(code);
  if (page === null) notFound();

  const { origin } = site();
  const citiesWithRecords = page.cities.filter((entry) => entry.total > 0);

  return (
    <div className="space-y-xl" data-testid="province-page">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'استان‌ها و شهرها', path: '/places' },
          { name: page.province.nameFa, path: placePath(page.province.code) },
        ]}
        origin={origin}
      />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{'استان ' + page.province.nameFa}</h1>
        <div className="flex flex-wrap gap-xs" data-testid="province-counts">
          {page.counts.vets > 0 ? <StatusBadge tone="info">{fa(page.counts.vets) + ' دامپزشک'}</StatusBadge> : null}
          {page.counts.centres > 0 ? <StatusBadge tone="info">{fa(page.counts.centres) + ' مرکز'}</StatusBadge> : null}
          {page.counts.communities > 0 ? (
            <StatusBadge tone="info">{fa(page.counts.communities) + ' انجمن و کلاب'}</StatusBadge>
          ) : null}
          {page.indexable ? null : <StatusBadge tone="neutral">هنوز رکوردی منتشر نشده است</StatusBadge>}
        </div>
      </header>

      {page.indexable ? (
        <section aria-labelledby="province-links-title" className="space-y-sm">
          <h2 id="province-links-title" className="text-h4">
            فهرست‌ها با فیلتر این استان
          </h2>
          <div className="flex flex-wrap gap-sm">
            <ButtonLink tone="secondary" href={'/veterinarians?province=' + page.province.code} data-testid="province-vets-link">
              دامپزشکان این استان
            </ButtonLink>
            <ButtonLink tone="secondary" href={'/centers?province=' + page.province.code} data-testid="province-centres-link">
              مراکز این استان
            </ButtonLink>
            <ButtonLink tone="secondary" href={'/associations?province=' + page.province.code}>
              انجمن‌ها و کلاب‌های این استان
            </ButtonLink>
          </div>
        </section>
      ) : (
        <EmptyState
          title="هنوز در این استان رکورد منتشرشده‌ای نیست"
          description="این صفحه به موتورهای جست‌وجو پیشنهاد نمی‌شود تا وقتی چیزی برای نشان‌دادن داشته باشد."
        />
      )}

      <section aria-labelledby="province-cities-title">
        <h2 id="province-cities-title" className="text-h4">
          شهرها
        </h2>
        {page.cities.length === 0 ? (
          <div className="mt-md">
            <EmptyState title="شهری برای این استان ثبت نشده است" description="شهرها را مدیریت همزیست اضافه می‌کند." />
          </div>
        ) : (
          <ul className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="city-list">
            {page.cities.map((entry) => (
              <li key={entry.city.id}>
                <Link
                  href={entry.path}
                  className="flex items-center justify-between gap-sm rounded-lg border border-border-subtle bg-bg-surface px-md py-sm transition-colors hover:border-border-brand"
                  data-testid={'city-' + entry.city.slug}
                >
                  <span className="text-label-md">{entry.city.nameFa}</span>
                  <span className="text-caption text-text-secondary">
                    {entry.total === 0 ? 'بدون رکورد' : fa(entry.total) + ' رکورد'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {citiesWithRecords.length === 0 && page.cities.length > 0 ? (
          <p className="mt-sm text-caption text-text-secondary">هنوز هیچ‌کدام از این شهرها رکورد منتشرشده‌ای ندارند.</p>
        ) : null}
      </section>
    </div>
  );
}
