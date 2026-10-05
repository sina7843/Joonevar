import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { clubPageBySlug } from '../../../../src/clubs/service.ts';
import { COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { DUPLICATE_NOTICE_FA } from '../../../../src/admin/merge-model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { SectionHeader } from '../../../../src/ui/section-header.tsx';

type Params = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => clubPageBySlug(db(), slug));
const dateFa = (value: string): string => formatCivilDateFa(value as never);

function summary(nameFa: string, about: string | null): string {
  const text = (about ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return 'کلاب ' + nameFa + ' در همزیست: حوزه فعالیت، راه عضویت و رویدادهای اعلام‌شده.';
  return text.length > 155 ? text.slice(0, 154) + '…' : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (page === null) return {};
  return buildMetadata(
    {
      title: page.nameFa + ' — کلاب',
      description: summary(page.nameFa, page.aboutFa),
      path: '/clubs/' + page.slug,
      image: page.imageFileId ? { path: '/media/' + page.imageFileId, alt: page.imageAltFa ?? page.nameFa } : undefined,
      state: page.primary ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary ? '/clubs/' + page.primary.slug : undefined,
    },
    site(),
  );
}

/**
 * One club — Phase 2.5 §8 (PROMPT-012). A club that is not verified and active
 * has no page here at all, whatever its own publication switch says, so a draft,
 * a pending, a suspended and an archived club are all a plain 404.
 */
export default async function ClubPage({ params }: Params) {
  const page = await load((await params).slug);
  if (page === null) notFound();
  const { origin } = site();
  const events = page.events.filter((event) => event.upcoming || !event.cancelled);

  return (
    <div className="space-y-s48 lg:space-y-s64">
      <div className="space-y-xl">
        <div className="space-y-md">
          <Breadcrumbs
            items={[
              { name: 'خانه', path: '/' },
              { name: 'کلاب‌ها', path: '/clubs' },
              { name: page.nameFa, path: '/clubs/' + page.slug },
            ]}
            origin={origin}
          />
          <header className="hz-entity items-center">
            <RecordImage priority variant="avatar" fileId={page.imageFileId} altFa={page.imageAltFa} className="size-[88px]" />
            <div className="hz-entity__body gap-xs">
              <h1 className="hz-h2">{page.nameFa}</h1>
              <p className="hz-body text-text-secondary">
                {'کلاب، حوزه ' + (COMMUNITY_SCOPE_FA[page.scope] ?? page.scope) + (page.placeFa ? '، ' + page.placeFa : '')}
              </p>
              <div className="flex flex-wrap gap-xs">
                <StatusBadge tone="success">تأیید انجمن</StatusBadge>
                {page.owned ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                {page.registration ? <StatusBadge tone="info">{'ثبت: ' + page.registration.statusFa}</StatusBadge> : null}
              </div>
            </div>
          </header>
        </div>

        {page.primary ? (
          <Alert tone="info" title={DUPLICATE_NOTICE_FA}>
            <Link href={'/clubs/' + page.primary.slug} className="hz-link">
              {page.primary.nameFa}
            </Link>
          </Alert>
        ) : null}

        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0 space-y-xl">
            {page.aboutFa ? (
              <section aria-labelledby="club-about-title" className="hz-card">
                <SectionHeader size="sm" id="club-about-title" title="درباره کلاب" />
                <div className="hz-prose">
                  {page.aboutFa.split(/\n{2,}/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {events.length > 0 ? (
              <section aria-labelledby="club-events-title" className="space-y-md">
                <SectionHeader id="club-events-title" title="رویدادها" />
                <ul className="space-y-md" data-testid="club-events">
                  {events.map((event) => (
                    <li key={event.id} className="hz-card space-y-xs">
                      <div className="flex flex-wrap items-start justify-between gap-sm">
                        <h3 className="hz-card__title">{event.titleFa}</h3>
                        {event.cancelled ? <StatusBadge tone="warning">لغو شد</StatusBadge> : null}
                      </div>
                      <p className="hz-entity__line hz-body-sm text-text-secondary">
                        <Icon name="calendarDots" size="xs" />
                        {dateFa(event.startsOn) + (event.endsOn ? ' تا ' + dateFa(event.endsOn) : '') + (event.cityNameFa ? '، ' + event.cityNameFa : '')}
                      </p>
                      {event.descriptionFa ? <p className="hz-body-sm">{event.descriptionFa}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-xl" aria-label="عضویت و ارتباط">
            <section aria-labelledby="club-join-title" className="hz-card space-y-md">
              <SectionHeader size="sm" id="club-join-title" title="عضویت در این کلاب" />
              <p className="hz-body-sm text-text-secondary">شرط‌های اعلام‌شده کلاب روی پرونده شما در همزیست بررسی می‌شود و نتیجه را خودتان می‌بینید.</p>
              <Link href={'/clubs/' + page.slug + '/join'} className="hz-btn hz-btn--secondary hz-btn--block" data-testid="club-join-link">
                دیدن شرایط و درخواست عضویت
              </Link>
            </section>

            <section aria-labelledby="club-contact-title" className="hz-card space-y-sm">
              <SectionHeader size="sm" id="club-contact-title" title="راه ارتباطی و عضویت" />
              {page.membershipInfoFa ? <p className="hz-body">{page.membershipInfoFa}</p> : null}
              <dl className="hz-kv" data-testid="club-contact">
                {page.contactPhone ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">تلفن</dt>
                    <dd className="hz-kv__value" dir="ltr">
                      {page.contactPhone}
                    </dd>
                  </div>
                ) : null}
                {page.websiteUrl ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">وب‌سایت</dt>
                    <dd className="hz-kv__value truncate" dir="ltr">
                      <a href={page.websiteUrl} rel="nofollow noopener" className="hz-link">
                        {page.websiteUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {page.membershipUrl ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">راه عضویت</dt>
                    <dd className="hz-kv__value truncate" dir="ltr">
                      <a href={page.membershipUrl} rel="nofollow noopener" className="hz-link">
                        {page.membershipUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="hz-caption">عضویت در کلاب با خود کلاب است؛ همزیست عضو نمی‌گیرد و هزینه‌ای دریافت نمی‌کند.</p>
            </section>

            <p className="hz-body-sm">
              <Link href={'/report/club/' + page.id} className="hz-link hz-link--standalone" data-testid="club-report-link">
                <Icon name="flag" size="xs" />
                گزارش این کلاب
              </Link>
            </p>
          </aside>
        </div>
      </div>

      {page.posts.length > 0 ? (
        <section aria-labelledby="club-posts-title">
          <SectionHeader id="club-posts-title" title="نوشته‌های کلاب" />
          <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="club-posts">
            {page.posts.map((post) => (
              <li key={post.slug}>
                <Link href={'/associations/' + page.slug + '/posts/' + post.slug} className="hz-card hz-card--feature hz-card--interactive hz-article h-full">
                  <div className="hz-article__body">
                    <span className="hz-tag">نوشته کلاب</span>
                    <h3 className="hz-article__title">{post.titleFa}</h3>
                    <p className="hz-article__summary">{post.summaryFa}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
