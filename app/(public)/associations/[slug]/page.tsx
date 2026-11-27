import type { Metadata } from 'next';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { canonicalCommunityPath, communityPageBySlug } from '../../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { DUPLICATE_NOTICE_FA } from '../../../../src/admin/merge-model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { SectionHeader } from '../../../../src/ui/section-header.tsx';

type Params = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => communityPageBySlug(db(), slug));
const dateFa = (value: string): string => formatCivilDateFa(value as never);

function summary(nameFa: string, kindFa: string, about: string | null): string {
  const text = (about ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return kindFa + ' ' + nameFa + ' در همزیست: حوزه فعالیت، راه عضویت و رویدادهای اعلام‌شده.';
  return text.length > 155 ? text.slice(0, 154) + '…' : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (page === null) return {};
  const kindFa = COMMUNITY_KIND_FA[page.kind];
  return buildMetadata(
    {
      title: page.nameFa + ' — ' + kindFa,
      description: summary(page.nameFa, kindFa, page.aboutFa),
      path: '/associations/' + page.slug,
      image: page.imageFileId ? { path: '/media/' + page.imageFileId, alt: page.imageAltFa ?? page.nameFa } : undefined,
      // A club is readable here and at its own /clubs address, which is the one
      // it calls canonical; this copy hands the index over rather than competing
      // with it (PROMPT-014). A merged duplicate points at its primary (§21).
      state: page.primary || page.kind === 'CLUB' ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary
        ? canonicalCommunityPath(page.kind, page.primary.slug)
        : page.kind === 'CLUB'
          ? '/clubs/' + page.slug
          : undefined,
    },
    site(),
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="hz-prose">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/**
 * One association or club — §11, §19 (PROMPT-010), drawn as a DS P01 section
 * landing: the community header with its image, the facts and membership in
 * white cards, events, then its posts as ArticleCards. Draft, hidden and
 * unknown addresses are 404.
 */
export default async function CommunityPage({ params }: Params) {
  const page = await load((await params).slug);
  if (page === null) notFound();

  const { origin } = site();
  const path = '/associations/' + page.slug;
  const kindFa = COMMUNITY_KIND_FA[page.kind];
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'انجمن‌ها و کلاب‌ها', path: '/associations' },
    { name: page.nameFa, path },
  ];
  const upcoming = page.events.filter((event) => event.upcoming);
  const past = page.events.filter((event) => !event.upcoming);

  return (
    <article className="space-y-s48 lg:space-y-s64" data-testid="community-page">
      <div className="space-y-xl">
        <div className="space-y-md">
          <Breadcrumbs items={crumbs} origin={origin} />
          <header className="hz-entity items-center">
            <RecordImage priority variant="avatar" fileId={page.imageFileId} altFa={page.imageAltFa} className="size-[88px]" />
            <div className="hz-entity__body gap-xs">
              <h1 className="hz-h2">{page.nameFa}</h1>
              <p className="hz-body text-text-secondary">{kindFa + '، حوزه ' + COMMUNITY_SCOPE_FA[page.scope]}</p>
              {/* Each axis is its own badge; a registration does not verify content and a badge never sells (P2-D05). */}
              <div className="flex flex-wrap gap-xs" data-testid="community-badges">
                {page.registration ? (
                  <span className="flex flex-wrap items-center gap-xs" data-testid="community-registration">
                    <StatusBadge status={page.registration.status} />
                    {page.registration.number ? <Identifier label="شماره ثبت:" value={page.registration.number} /> : null}
                  </span>
                ) : null}
                {page.placeFa ? <span className="hz-tag hz-tag--neutral">{page.placeFa}</span> : null}
              </div>
            </div>
          </header>
        </div>

        {page.primary ? (
          <div data-testid="community-merged">
            <Alert tone="warning" title="این رکورد تکراری بوده است">
              {DUPLICATE_NOTICE_FA}{' '}
              <Link href={'/associations/' + page.primary.slug} className="hz-link">
                {page.primary.nameFa}
              </Link>
            </Alert>
          </div>
        ) : null}

        {page.owned ? null : (
          <div data-testid="community-unowned">
            <Alert tone="info" title={'این ' + kindFa + ' بدون مالک است'}>
              اطلاعات این صفحه از منبع عمومی ثبت و بررسی شده است و هنوز هیچ مدیری آن را به عهده نگرفته است. برای واگذاری مدیریت با پشتیبانی همزیست تماس بگیرید.
            </Alert>
          </div>
        )}

        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0 space-y-xl">
            {page.aboutFa ? (
              <section aria-labelledby="community-about-title" className="hz-card">
                <SectionHeader size="sm" id="community-about-title" title="معرفی" />
                <Prose text={page.aboutFa} />
              </section>
            ) : null}

            {page.events.length > 0 ? (
              <section aria-labelledby="community-events-title" className="space-y-md">
                <SectionHeader id="community-events-title" title="رویدادها" />
                <ul className="space-y-md" data-testid="community-events">
                  {[...upcoming, ...past].map((event) => (
                    <li key={event.id} className="hz-card space-y-xs" data-testid="community-event">
                      <div className="flex flex-wrap items-start justify-between gap-sm">
                        <h3 className="hz-card__title">{event.titleFa}</h3>
                        {event.cancelled ? (
                          <StatusBadge status="CANCELLED" />
                        ) : event.upcoming ? (
                          <StatusBadge status="SCHEDULED" />
                        ) : (
                          // GAPS #4: no dictionary key for a held (past) event
                          <StatusBadge tone="neutral">برگزارشده</StatusBadge>
                        )}
                      </div>
                      <p className="hz-entity__line hz-body-sm text-text-secondary">
                        <Icon name="calendarDots" size="xs" />
                        {dateFa(event.startsOn) + (event.endsOn ? ' تا ' + dateFa(event.endsOn) : '')}
                        {event.cityNameFa || event.placeFa ? '، ' + [event.cityNameFa, event.placeFa].filter(Boolean).join('، ') : ''}
                      </p>
                      {event.descriptionFa ? <p className="hz-body-sm">{event.descriptionFa}</p> : null}
                      {event.cancelled && event.cancelReasonFa ? (
                        <p className="hz-body-sm text-text-secondary" data-testid="community-event-cancelled">
                          {'دلیل لغو: ' + event.cancelReasonFa}
                        </p>
                      ) : null}
                      {!event.cancelled && event.registrationUrl ? (
                        <p className="hz-body-sm">
                          <a href={event.registrationUrl} target="_blank" rel="nofollow noopener noreferrer" className="hz-link">
                            ثبت‌نام رویداد
                          </a>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="hz-caption">تاریخ، مکان و ثبت‌نام رویداد را همین {kindFa} اعلام کرده است؛ همزیست برگزاری آن را تضمین نمی‌کند.</p>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-xl" aria-label={'درباره ' + kindFa}>
            <section aria-labelledby="community-facts-title" className="hz-card">
              <SectionHeader size="sm" id="community-facts-title" title="مشخصات و تماس" />
              <dl className="hz-kv" data-testid="community-facts">
                {page.contactPhone ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">تلفن</dt>
                    <dd className="hz-kv__value" dir="ltr" data-testid="community-phone">
                      <a href={'tel:' + page.contactPhone} className="hz-link">
                        {page.contactPhone}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {page.websiteUrl ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">وب‌سایت</dt>
                    <dd className="hz-kv__value truncate" dir="ltr">
                      <a href={page.websiteUrl} target="_blank" rel="nofollow noopener noreferrer" className="hz-link">
                        {page.websiteUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">گونه‌ها</dt>
                  {page.speciesFa.length > 0 ? (
                    <dd className="hz-kv__value" data-testid="community-species">
                      {page.speciesFa.join('، ')}
                    </dd>
                  ) : (
                    <dd className="hz-kv__value hz-kv__value--empty">تعیین‌نشده</dd>
                  )}
                </div>
                {page.breedNamesFa.length > 0 ? (
                  <div className="hz-kv__row">
                    <dt className="hz-kv__key">نژادها</dt>
                    <dd className="hz-kv__value" data-testid="community-breeds">
                      {page.breedNamesFa.join('، ')}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section aria-labelledby="community-membership-title" className="hz-card space-y-sm">
              <SectionHeader size="sm" id="community-membership-title" title="عضویت" />
              {page.membershipInfoFa ? <Prose text={page.membershipInfoFa} /> : null}
              {page.membershipUrl ? (
                <a
                  href={page.membershipUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="hz-btn hz-btn--secondary hz-btn--block"
                  data-testid="community-membership-link"
                >
                  <Icon name="arrowSquareOut" size="sm" />
                  صفحه عضویت {kindFa}
                </a>
              ) : null}
              {/* Membership is the community's own register; Hamzist neither takes the request nor confirms it (DEC-0170). */}
              <p className="hz-caption" data-testid="community-membership-note">
                عضویت را خودِ {kindFa} ثبت و تأیید می‌کند. همزیست عضویت نمی‌گیرد، عضویت کسی را تأیید نمی‌کند و هزینه‌ای در این باره دریافت نمی‌کند.
              </p>
            </section>

            {page.managers.length > 0 ? (
              <section aria-labelledby="community-managers-title" className="hz-card">
                <SectionHeader size="sm" id="community-managers-title" title="مدیران" />
                <ul className="divide-y divide-border-subtle" data-testid="community-managers">
                  {page.managers.map((manager) => (
                    <li key={manager.nameFa + (manager.roleFa ?? '')} className="hz-body-sm py-sm">
                      <span className="font-bold">{manager.nameFa}</span>
                      {manager.roleFa ? <span className="text-text-secondary">{'، ' + manager.roleFa}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {page.posts.length > 0 ? (
        <section aria-labelledby="community-posts-title">
          <SectionHeader id="community-posts-title" title="نوشته‌ها" count={page.posts.length.toLocaleString('fa-IR')} />
          <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="community-posts">
            {page.posts.map((post) => (
              <li key={post.slug}>
                <Link href={path + '/posts/' + post.slug} className="hz-card hz-card--feature hz-card--interactive hz-article h-full" data-testid={'community-post-' + post.slug}>
                  <div className="hz-article__body">
                    <span className="hz-tag">نوشته {kindFa}</span>
                    <h3 className="hz-article__title">{post.titleFa}</h3>
                    <p className="hz-article__summary">{post.summaryFa}</p>
                    {post.publishedAt ? (
                      <div className="hz-meta">
                        <time className="hz-meta__item" dateTime={post.publishedAt.toISOString()}>
                          {formatCivilDateFa(post.publishedAt.toISOString().slice(0, 10) as never)}
                        </time>
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
