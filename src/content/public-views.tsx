import type { Metadata } from 'next';
import { RichText } from './rich-text.tsx';
import { RelatedColumn } from '../public/related-column.tsx';
import { relatedContent, similarCentres } from '../public/related.ts';
import Link from 'next/link';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { db } from '../db/client.ts';
import { publicContentBySlug, publicContentList } from './service.ts';
import { KIND_FA, KIND_PATH, KIND_PLURAL_FA, TEAM_BYLINE, readMinutes } from './model.ts';
import { EXTERNAL_BODY_NOTICE_FA, isExternalBodyCategory } from './taxonomy.ts';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { buildMetadata } from '../seo/metadata.ts';
import { articleLd } from '../seo/structured-data.ts';
import { JsonLdScript } from '../seo/json-ld.tsx';
import { site } from '../public/request.ts';
import { Breadcrumbs } from '../ui/breadcrumbs.tsx';
import { EmptyState } from '../ui/states.tsx';
import { Alert } from '../ui/alert.tsx';
import { Button, ButtonLink } from '../ui/button.tsx';
import { Icon } from '../ui/icon.tsx';
import { PageHeader } from '../ui/section-header.tsx';
import { RecordImage } from '../ui/record-image.tsx';
import { SearchField } from '../ui/search-field.tsx';
import { FilterChips } from '../ui/filter-bar.tsx';
import { Pagination } from '../ui/pagination.tsx';

/**
 * Public pages of the CMS — Requirements-Phase-2 §12, §19 (PROMPT-004).
 *
 * One list and one detail view serve education, news and announcements; the
 * route files only choose the type. Club posts live under their club (PROMPT-010).
 */
export type PublicKind = 'ARTICLE' | 'NEWS' | 'ANNOUNCEMENT';

const LIST_DESCRIPTION: Record<PublicKind, string> = {
  ARTICLE: 'آموزش‌های همزیست درباره نگهداری، سلامت و پرورش سگ، هرکدام با منبع و تاریخ بازبینی.',
  NEWS: 'خبرهای همزیست و دنیای پرورش و نگهداری سگ.',
  ANNOUNCEMENT: 'اطلاعیه‌های رسمی همزیست.',
};

const EMPTY_TITLE: Record<PublicKind, string> = {
  ARTICLE: 'هنوز آموزشی منتشر نشده است',
  NEWS: 'هنوز خبری منتشر نشده است',
  ANNOUNCEMENT: 'هنوز اطلاعیه‌ای منتشر نشده است',
};

const DATE_FA = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' });
const fa = (value: number): string => value.toLocaleString('fa-IR');
const pathOf = (kind: PublicKind): string => KIND_PATH[kind]!;

type Search = Promise<{ category?: string | string[]; q?: string | string[]; page?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';

/** A Persian slug arrives percent-encoded in the address; every content page decodes it before matching. */
export function decodeSlug(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function contentListMetadata(kind: PublicKind): Metadata {
  // Category and page views share the list's canonical (§19).
  return buildMetadata({ title: KIND_PLURAL_FA[kind], description: LIST_DESCRIPTION[kind], path: pathOf(kind) }, site());
}

export async function ContentList({ kind, searchParams }: { kind: PublicKind; searchParams: Search }) {
  const search = await searchParams;
  const categorySlug = one(search.category).slice(0, 80) || null;
  const term = one(search.q).trim().slice(0, 80);
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await publicContentList(db(), { kind, categorySlug, term, page });
  const { origin } = site();
  const base = pathOf(kind);
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: KIND_PLURAL_FA[kind], path: base },
  ];
  const hrefFor = (target: number, category: string | null = categorySlug) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (term) params.set('q', term);
    if (target > 1) params.set('page', String(target));
    const encoded = params.toString();
    return base + (encoded ? '?' + encoded : '');
  };
  // P01 landing: the newest item leads as the feature card on the unfiltered first page.
  const leadFirst = result.page === 1 && !term && categorySlug === null;

  return (
    <div className="space-y-s48 lg:space-y-s64">
      <div className="space-y-xl">
        <div className="space-y-md">
          <Breadcrumbs items={crumbs} origin={origin} />
          <PageHeader
            title={KIND_PLURAL_FA[kind]}
            meta={[
              LIST_DESCRIPTION[kind],
              ...(result.visibleTotal > 0 ? [fa(result.visibleTotal) + ' مطلب منتشرشده'] : []),
            ]}
          />
        </div>

        <form method="get" action={base} role="search" className="flex gap-sm" data-testid="content-search">
          {categorySlug ? <input type="hidden" name="category" value={categorySlug} /> : null}
          <SearchField
            id="content-q"
            name="q"
            label={'جست‌وجو در ' + KIND_PLURAL_FA[kind]}
            defaultValue={term}
            className="min-w-0 flex-1 md:max-w-[36rem]"
            data-testid="content-search-input"
          />
          <Button type="submit" tone="secondary" data-testid="content-search-submit">
            جست‌وجو
          </Button>
        </form>

        {result.categories.length > 0 ? (
          <FilterChips
            label="دسته‌ها"
            testId="content-categories"
            chips={[{ slug: null as string | null, nameFa: 'همه' }, ...result.categories].map((category) => ({
              key: category.slug ?? 'all',
              href: hrefFor(1, category.slug),
              label: category.nameFa,
              current: category.slug === (result.category?.slug ?? null),
            }))}
          />
        ) : null}

        {categorySlug !== null && result.category === null ? (
          <EmptyState
            title="این دسته پیدا نشد"
            description="ممکن است دسته کنار گذاشته شده باشد."
            action={<ButtonLink tone="secondary" href={base}>{'همه ' + KIND_PLURAL_FA[kind]}</ButtonLink>}
          />
        ) : result.visibleTotal === 0 ? (
          <EmptyState title={EMPTY_TITLE[kind]} description="مطالب پس از انتشار اینجا دیده می‌شوند." />
        ) : result.items.length === 0 ? (
          <EmptyState
            title={term ? 'چیزی با «' + term + '» پیدا نشد' : 'اینجا هنوز مطلبی منتشر نشده است'}
            description={term ? 'واژه دیگری را امتحان کنید یا فیلتر دسته را بردارید.' : 'دسته دیگری را ببینید.'}
            action={<ButtonLink tone="secondary" href={base}>{'همه ' + KIND_PLURAL_FA[kind]}</ButtonLink>}
          />
        ) : (
          <section aria-labelledby="content-results-title" className="space-y-xl">
            <h2 id="content-results-title" className="hz-visually-hidden">
              {fa(result.total) + ' مطلب'}
            </h2>
            <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="content-results">
              {result.items.map((item, index) => {
                const lead = leadFirst && index === 0;
                return (
                  <li key={item.slug} className={lead ? 'md:col-span-2 lg:row-span-2' : undefined}>
                    <Link
                      href={base + '/' + item.slug}
                      className={(lead ? 'hz-article hz-article--feature' : 'hz-article') + ' hz-card--interactive h-full'}
                      title={item.titleFa}
                      data-testid={'content-card-' + item.slug}
                    >
                      <RecordImage variant={lead ? 'banner' : '3x2'} fileId={item.imageFileId} altFa={item.imageAltFa} priority={index === 0} />
                      <div className="hz-article__body">
                        <span className="hz-tag">{item.categoryNameFa ?? KIND_FA[kind]}</span>
                        <h3 className="hz-article__title">{item.titleFa}</h3>
                        <p className="hz-article__summary">{item.summaryFa}</p>
                        <div className="hz-meta">
                          <time className="hz-meta__item" dateTime={item.publishAt.toISOString()}>
                            {DATE_FA.format(item.publishAt)}
                          </time>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              hrefFor={(target) => hrefFor(target)}
              label={'صفحه‌بندی ' + KIND_PLURAL_FA[kind]}
            />
          </section>
        )}
      </div>

      <section className="hz-cta" aria-labelledby="content-cta-title">
        <div className="hz-cta__text">
          <h2 className="hz-cta__title" id="content-cta-title">
            هویت حیوانت را ثبت کن
          </h2>
          <p className="hz-cta__body">ثبت در شش مرحله؛ هر مرحله ذخیره می‌شود و بعداً ادامه می‌دهید.</p>
        </div>
        <div className="hz-cta__actions">
          <ButtonLink href="/animals/new" size="lg" iconStart="plus">
            ثبت حیوان
          </ButtonLink>
          <ButtonLink tone="secondary" size="lg" href="/verify" iconStart="shieldCheck">
            استعلام اصالت سند
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

// Metadata and the page ask for the same item in one request.
const load = cache((kind: PublicKind, slug: string) => publicContentBySlug(db(), kind, slug));

export async function contentDetailMetadata(kind: PublicKind, rawSlug: string): Promise<Metadata> {
  const slug = decodeSlug(rawSlug);
  if (slug === null) return {};
  const page = await load(kind, slug);
  if (page === null || page.kind === 'redirect') return {};
  const { item, state } = page;
  return buildMetadata(
    {
      title: item.seoTitle ?? item.titleFa,
      description: item.seoDescription ?? item.summaryFa,
      path: pathOf(kind) + '/' + item.slug,
      state: state === 'ARCHIVED' ? 'ARCHIVED' : 'PUBLISHED',
      type: 'article',
      image: item.imageFileId ? { path: '/media/' + item.imageFileId, alt: item.imageAltFa ?? item.titleFa } : undefined,
    },
    site(),
  );
}

export async function ContentDetail({ kind, rawSlug }: { kind: PublicKind; rawSlug: string }) {
  const slug = decodeSlug(rawSlug);
  if (slug === null) notFound();
  const page = await load(kind, slug);
  if (page === null) notFound();
  // An address the item used to have answers with the one it has now (§19, §23).
  if (page.kind === 'redirect') permanentRedirect(pathOf(kind) + '/' + encodeURIComponent(page.slug));

  const { item, state, byline, categoryNameFa, categorySlug, breed } = page;
  const { origin } = site();
  // The column beside the article: other reading, and centres to look at.
  const [moreReading, centres] = await Promise.all([
    relatedContent(db(), { excludeId: item.id, limit: 4 }),
    similarCentres(db(), { limit: 3 }),
  ]);
  const path = pathOf(kind) + '/' + item.slug;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: KIND_PLURAL_FA[kind], path: pathOf(kind) },
    { name: item.titleFa, path },
  ];
  const tagLabel = KIND_FA[kind] + (categoryNameFa ? ' · ' + categoryNameFa : '');

  return (
    <div className="hz-reading">
      <article className="hz-reading__main hz-content-detail space-y-xl" aria-labelledby="content-title" data-testid="content-page">
        <JsonLdScript
          data={articleLd(
            {
              type: kind === 'ARTICLE' ? 'Article' : 'NewsArticle',
              headline: item.titleFa,
              description: item.summaryFa,
              path,
              datePublished: item.publishAt!,
              dateModified: item.updatedAt,
              authorName: byline,
              authorIsPerson: byline !== TEAM_BYLINE,
              imagePath: item.imageFileId ? '/media/' + item.imageFileId : null,
            },
            origin,
          )}
        />

        <header className="hz-content-detail__head">
          <Breadcrumbs items={crumbs} origin={origin} />
          {isExternalBodyCategory(categorySlug) ? (
            <Alert tone="info" title="مطلب آموزشی درباره یک سازمان دیگر">
              <span data-testid="content-external-body-notice">{EXTERNAL_BODY_NOTICE_FA}</span>
            </Alert>
          ) : null}
          {state === 'ARCHIVED' ? (
            <Alert tone="warning" title="این مطلب بایگانی شده است">
              <span data-testid="content-archived-notice">مطالب آن دیگر به‌روز نمی‌شود و ممکن است قدیمی باشد.</span>
            </Alert>
          ) : null}
          {categorySlug ? (
            <Link className="hz-tag" href={pathOf(kind) + '?category=' + encodeURIComponent(categorySlug)}>
              {tagLabel}
            </Link>
          ) : (
            <span className="hz-tag">{tagLabel}</span>
          )}
          <h1 className="hz-content-detail__title" id="content-title">
            {item.titleFa}
          </h1>
          <p className="hz-content-detail__lead">{item.summaryFa}</p>
          <div className="hz-content-detail__byline" data-testid="content-meta">
            <span className="hz-content-detail__author">
              <span className="hz-avatar-initials" aria-hidden="true">
                {byline.trim().charAt(0)}
              </span>
              <span>
                {byline}
                <span className="hz-content-detail__author-role">{byline === TEAM_BYLINE ? 'ناشر' : 'نویسنده'}</span>
              </span>
            </span>
            {/* DS ContentDetail meta: «۶ دقیقه مطالعه · ۵ مهر ۱۴۰۵» (ReadTime from the body, KPUB-017). */}
            <div className="hz-meta">
              <span className="hz-meta__item" data-testid="read-time">
                <Icon name="clock" size="xs" />
                {readMinutes(item.bodyFa ?? '').toLocaleString('fa-IR') + ' دقیقه مطالعه'}
              </span>
              <time className="hz-meta__item" dateTime={item.publishAt!.toISOString()}>
                {DATE_FA.format(item.publishAt!)}
              </time>
            </div>
          </div>
        </header>

        {item.imageFileId ? (
          <figure className="hz-figure">
            {/*
              The stored file carries no dimensions, so the space is reserved by
              aspect ratio instead (CLS). It is the largest element above the
              fold, so it is fetched eagerly rather than lazily (PROMPT-018).
            */}
            <div className="hz-media hz-media--16x9">
              <img
                src={'/media/' + item.imageFileId}
                alt={item.imageAltFa ?? ''}
                decoding="async"
                fetchPriority="high"
                width={1200}
                height={675}
                data-testid="content-image"
              />
            </div>
          </figure>
        ) : null}

        <div data-testid="content-body">
          <RichText source={item.bodyFa} />
          {item.sources.length > 0 ? (
            <div className="hz-prose__source mt-s32 border-t border-border-subtle pt-lg" data-testid="content-sources">
              <h2 id="content-sources-title" className="text-label-sm text-text-secondary">
                منابع
              </h2>
              <ol className="mt-xs list-decimal space-y-2xs ps-xl" aria-labelledby="content-sources-title">
                {item.sources.map((source) => (
                  <li key={source.title + (source.url ?? '')}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="nofollow noopener noreferrer" className="hz-link">
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        <footer className="hz-content-detail__foot">
          {item.tags.length > 0 ? (
            <ul aria-label="برچسب‌ها" className="hz-tag-list">
              {item.tags.map((tag) => (
                <li key={tag} className="hz-tag hz-tag--neutral">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
          {item.reviewedOn ? (
            <p className="hz-content-detail__reviewed">{'بازبینی محتوا: ' + formatCivilDateFa(item.reviewedOn)}</p>
          ) : null}
          {breed ? (
            <p className="hz-body-sm" data-testid="content-breed">
              {'نژاد مرتبط: '}
              <Link href={'/breeds/' + breed.slug} className="hz-link">
                {breed.nameFa}
              </Link>
            </p>
          ) : null}
          <p className="hz-body-sm text-text-secondary">
            {'مطلب نادرست یا نامناسبی می‌بینید؟ '}
            <Link href={'/report/content/' + item.id} className="hz-link" data-testid="report-content-link">
              گزارش این مطلب
            </Link>
          </p>
        </footer>
      </article>

      <div className="hz-reading__aside">
        <RelatedColumn
          groups={[
            {
              titleFa: 'مطالب مرتبط',
              items: moreReading,
              noteAsTag: true,
              link: { href: pathOf(kind), label: 'همه ' + KIND_PLURAL_FA[kind] },
            },
            { titleFa: 'مراکز دامپزشکی', items: centres, link: { href: '/centers', label: 'همه مراکز' } },
          ]}
        />
      </div>
    </div>
  );
}
