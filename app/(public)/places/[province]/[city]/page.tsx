import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../../src/db/client.ts';
import { cityPage } from '../../../../../src/geo/service.ts';
import { placePath } from '../../../../../src/geo/model.ts';
import { decodeSlug } from '../../../../../src/content/public-views.tsx';
import { buildMetadata } from '../../../../../src/seo/metadata.ts';
import { site } from '../../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { PageHeader, SectionHeader } from '../../../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ province: string; city: string }> };

const load = cache((province: string, city: string) => cityPage(db(), province, city));
const fa = (value: number): string => value.toLocaleString('fa-IR');

/** A city slug is Persian, so the address arrives percent-encoded. */
const loadFrom = async (params: Params['params']) => {
  const { province, city } = await params;
  const slug = decodeSlug(city);
  return slug === null ? null : load(province, slug);
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await loadFrom(params);
  if (page === null) return {};
  return buildMetadata(
    {
      title: 'دامپزشکان و مراکز ' + page.city.nameFa,
      description:
        'دامپزشکان، مراکز دامپزشکی و انجمن‌های منتشرشده در ' + page.city.nameFa + '، استان ' + page.province.nameFa + '.',
      path: placePath(page.province.code, page.city.slug),
      noindex: !page.indexable,
    },
    site(),
  );
}

/** One city — Requirements-Phase-2 §2, §19 (PROMPT-015). */
export default async function CityPage({ params }: Params) {
  const page = await loadFrom(params);
  if (page === null) notFound();

  const { origin } = site();
  const query = '?province=' + page.province.code + '&city=' + encodeURIComponent(page.city.id);

  return (
    <div className="space-y-xl" data-testid="city-page">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'استان‌ها و شهرها', path: '/places' },
          { name: page.province.nameFa, path: placePath(page.province.code) },
          { name: page.city.nameFa, path: placePath(page.province.code, page.city.slug) },
        ]}
        origin={origin}
      />

      <PageHeader
        title={page.city.nameFa}
        meta={[
          'استان ' + page.province.nameFa,
          <span key="counts" data-testid="city-counts">
            {page.indexable
              ? [
                  page.counts.vets > 0 ? fa(page.counts.vets) + ' دامپزشک' : null,
                  page.counts.centres > 0 ? fa(page.counts.centres) + ' مرکز' : null,
                  page.counts.communities > 0 ? fa(page.counts.communities) + ' انجمن و کلاب' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'هنوز رکوردی منتشر نشده است'}
          </span>,
        ]}
      />

      {page.indexable ? (
        <section aria-labelledby="city-links-title" className="hz-card space-y-md">
          <SectionHeader id="city-links-title" title="فهرست‌ها با فیلتر این شهر" size="sm" />
          <div className="flex flex-wrap gap-sm">
            <ButtonLink tone="secondary" href={'/veterinarians' + query} data-testid="city-vets-link">
              دامپزشکان این شهر
            </ButtonLink>
            <ButtonLink tone="secondary" href={'/centers' + query} data-testid="city-centres-link">
              مراکز این شهر
            </ButtonLink>
          </div>
        </section>
      ) : (
        <EmptyState
          title="هنوز در این شهر رکورد منتشرشده‌ای نیست"
          description="این صفحه به موتورهای جست‌وجو پیشنهاد نمی‌شود تا وقتی چیزی برای نشان‌دادن داشته باشد."
        />
      )}

      <p className="hz-caption" data-testid="city-privacy-note">

        این صفحه فقط محل اعلام‌شده رکوردهای منتشرشده را نشان می‌دهد؛ نشانی دقیق و موقعیت غیرعمومی منتشر نمی‌شود.
      </p>
    </div>
  );
}
