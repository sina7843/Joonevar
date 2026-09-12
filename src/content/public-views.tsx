import type { Metadata } from 'next';
import { RichText } from './rich-text.tsx';
import { RelatedColumn } from '../public/related-column.tsx';
import { relatedContent, similarCentres } from '../public/related.ts';
import Link from 'next/link';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { db } from '../db/client.ts';
import { publicContentBySlug, publicContentList } from './service.ts';
import { KIND_PATH, KIND_PLURAL_FA, TEAM_BYLINE } from './model.ts';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { buildMetadata } from '../seo/metadata.ts';
import { articleLd } from '../seo/structured-data.ts';
import { JsonLdScript } from '../seo/json-ld.tsx';
import { site } from '../public/request.ts';
import { Breadcrumbs } from '../ui/breadcrumbs.tsx';
import { EmptyState } from '../ui/states.tsx';
import { Alert } from '../ui/alert.tsx';
import { ButtonLink } from '../ui/button.tsx';

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

type Search = Promise<{ category?: string | string[]; page?: string | string[] }>;
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
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await publicContentList(db(), { kind, categorySlug, page });
  const { origin } = site();
  const base = pathOf(kind);
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: KIND_PLURAL_FA[kind], path: base },
  ];
  const hrefFor = (target: number, category: string | null = categorySlug) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (target > 1) params.set('page', String(target));
    const encoded = params.toString();
    return base + (encoded ? '?' + encoded : '');
  };

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={crumbs} origin={origin} />
      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{KIND_PLURAL_FA[kind]}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">{LIST_DESCRIPTION[kind]}</p>
      </header>

      {result.categories.length > 0 ? (
        <nav aria-label="دسته‌ها" className="hz-rail flex gap-sm overflow-x-auto pb-xs" data-testid="content-categories">
          {[{ slug: null as string | null, nameFa: 'همه' }, ...result.categories].map((category) => {
            const current = category.slug === (result.category?.slug ?? null);
            return (
              <Link
                key={category.slug ?? 'all'}
                href={hrefFor(1, category.slug)}
                aria-current={current ? 'page' : undefined}
                className={[
                  'shrink-0 rounded-full border px-lg py-xs text-label-md whitespace-nowrap',
                  current ? 'border-border-brand bg-bg-brand-subtle text-text-brand' : 'border-border-subtle bg-bg-surface text-text-secondary',
                ].join(' ')}
              >
                {category.nameFa}
              </Link>
            );
          })}
        </nav>
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
          title="اینجا هنوز مطلبی منتشر نشده است"
          description="دسته دیگری را ببینید."
          action={<ButtonLink tone="secondary" href={base}>{'همه ' + KIND_PLURAL_FA[kind]}</ButtonLink>}
        />
      ) : (
        <section aria-labelledby="content-results-title">
          <h2 id="content-results-title" className="text-body-sm text-text-secondary">
            {fa(result.total) + ' مطلب'}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="content-results">
            {result.items.map((item) => (
              <li key={item.slug}>
                <Link
                  href={base + '/' + item.slug}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-surface transition-colors hover:border-border-brand"
                  data-testid={'content-card-' + item.slug}
                >
                  {item.imageFileId ? (
                    <img
                      src={'/media/' + item.imageFileId}
                      alt={item.imageAltFa ?? ''}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : null}
                  <span className="flex flex-1 flex-col gap-xs p-lg">
                    {item.categoryNameFa ? <span className="text-caption text-text-brand">{item.categoryNameFa}</span> : null}
                    <span className="text-label-lg text-text-primary">{item.titleFa}</span>
                    <span className="line-clamp-3 text-body-sm text-text-secondary">{item.summaryFa}</span>
                    <span className="mt-auto pt-sm text-caption text-text-secondary">{DATE_FA.format(item.publishAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی" className="mt-lg flex items-center justify-between gap-md">
              {result.page > 1 ? <ButtonLink tone="secondary" href={hrefFor(result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
              <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
              {result.page < result.totalPages ? <ButtonLink tone="secondary" href={hrefFor(result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
            </nav>
          ) : null}
        </section>
      )}
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

  const { item, state, byline, categoryNameFa, breed } = page;
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

  return (
    <div className="mx-auto grid max-w-6xl gap-xl lg:grid-cols-[minmax(0,1fr)_320px]">
    <article className="min-w-0 space-y-xl" data-testid="content-page">
      <Breadcrumbs items={crumbs} origin={origin} />
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

      {state === 'ARCHIVED' ? (
        <Alert tone="warning" title="این مطلب بایگانی شده است">
          <span data-testid="content-archived-notice">مطالب آن دیگر به‌روز نمی‌شود و ممکن است قدیمی باشد.</span>
        </Alert>
      ) : null}

      <header>
        {categoryNameFa ? <p className="text-label-md text-text-brand">{categoryNameFa}</p> : null}
        <h1 className="mt-xs text-h3 md:text-h1">{item.titleFa}</h1>
        <p className="mt-sm text-body-sm text-text-secondary" data-testid="content-meta">
          {['نوشته: ' + byline, 'انتشار: ' + DATE_FA.format(item.publishAt!), item.reviewedOn ? 'بازبینی: ' + formatCivilDateFa(item.reviewedOn) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {item.imageFileId ? (
        <figure>
          {/*
            The stored file carries no dimensions, so the space is reserved by
            aspect ratio instead: without it this image arrives after the text
            and pushes the article down (CLS). It is the largest element above
            the fold, so it is fetched eagerly rather than lazily (PROMPT-018).
          */}
          <img
            src={'/media/' + item.imageFileId}
            alt={item.imageAltFa ?? ''}
            decoding="async"
            fetchPriority="high"
            className="aspect-[16/9] max-h-[480px] w-full rounded-lg object-cover"
            data-testid="content-image"
          />
        </figure>
      ) : null}

      <p className="text-body-md text-text-secondary">{item.summaryFa}</p>
      <div className="text-body-md" data-testid="content-body">
        <RichText source={item.bodyFa} />
      </div>

      {item.tags.length > 0 ? (
        <ul aria-label="برچسب‌ها" className="flex flex-wrap gap-xs">
          {item.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-bg-subtle px-md py-2xs text-caption text-text-secondary">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      {item.sources.length > 0 ? (
        <section aria-labelledby="content-sources-title" data-testid="content-sources">
          <h2 id="content-sources-title" className="text-h4">
            منابع
          </h2>
          <ol className="mt-md list-decimal space-y-xs ps-xl text-body-sm">
            {item.sources.map((source) => (
              <li key={source.title + (source.url ?? '')}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="nofollow noopener noreferrer" className="text-text-brand underline underline-offset-4">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="border-t border-border-subtle pt-lg text-body-sm text-text-secondary">
        {'مطلب نادرست یا نامناسبی می‌بینید؟ '}
        <Link
          href={'/report/content/' + item.id}
          className="text-text-brand underline underline-offset-4"
          data-testid="report-content-link"
        >
          گزارش این مطلب
        </Link>
      </p>

      {breed ? (
        <p className="text-body-sm" data-testid="content-breed">
          {'نژاد مرتبط: '}
          <Link href={'/breeds/' + breed.slug} className="text-text-brand underline underline-offset-4">
            {breed.nameFa}
          </Link>
        </p>
      ) : null}
    </article>

      <RelatedColumn
        groups={[
          { titleFa: 'خواندنی‌های دیگر', items: moreReading },
          { titleFa: 'مراکز دامپزشکی', items: centres },
        ]}
      />
    </div>
  );
}
