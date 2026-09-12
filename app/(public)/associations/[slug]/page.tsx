import type { Metadata } from 'next';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { communityPageBySlug } from '../../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { DUPLICATE_NOTICE_FA } from '../../../../src/admin/merge-model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

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
      // A merged duplicate keeps its address but points at the primary (§21).
      state: page.primary ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary ? '/associations/' + page.primary.slug : undefined,
    },
    site(),
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="mt-md space-y-md text-body-md">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/** One association or club — §11, §19 (PROMPT-010). Draft, hidden and unknown addresses are 404. */
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
    <article className="mx-auto max-w-3xl space-y-xl" data-testid="community-page">
      <Breadcrumbs items={crumbs} origin={origin} />

      <header className="space-y-sm">
        <RecordImage priority fileId={page.imageFileId} altFa={page.imageAltFa} className="mb-lg" />
        <h1 className="text-h3 md:text-h1">{page.nameFa}</h1>
        <p className="text-body-md text-text-secondary">{kindFa + ' · حوزه ' + COMMUNITY_SCOPE_FA[page.scope]}</p>
        {/* Each axis is its own badge; a registration does not verify content and a badge never sells (P2-D05). */}
        <div className="flex flex-wrap gap-xs" data-testid="community-badges">
          {page.registration ? (
            <span data-testid="community-registration">
              <StatusBadge tone="info">{page.registration.statusFa + (page.registration.number ? ' · ' + page.registration.number : '')}</StatusBadge>
            </span>
          ) : null}
          {page.placeFa ? <StatusBadge tone="neutral">{page.placeFa}</StatusBadge> : null}
        </div>
      </header>

      {page.primary ? (
        <div data-testid="community-merged">
          <Alert tone="warning" title="این رکورد تکراری بوده است">
            {DUPLICATE_NOTICE_FA}{' '}
            <Link href={'/associations/' + page.primary.slug} className="text-text-brand underline underline-offset-4">
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

      <dl className="grid gap-sm sm:grid-cols-2" data-testid="community-facts">
        {page.contactPhone ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">تلفن</dt>
            <dd className="text-label-md" dir="ltr" data-testid="community-phone">
              <a href={'tel:' + page.contactPhone}>{page.contactPhone}</a>
            </dd>
          </div>
        ) : null}
        {page.websiteUrl ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">وب‌سایت</dt>
            <dd className="truncate text-label-md" dir="ltr">
              <a href={page.websiteUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-text-brand underline underline-offset-4">
                {page.websiteUrl}
              </a>
            </dd>
          </div>
        ) : null}
        {page.speciesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">گونه‌ها</dt>
            <dd className="mt-2xs text-label-md" data-testid="community-species">
              {page.speciesFa.join('، ')}
            </dd>
          </div>
        ) : null}
        {page.breedNamesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">نژادها</dt>
            <dd className="mt-2xs text-label-md" data-testid="community-breeds">
              {page.breedNamesFa.join('، ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {page.aboutFa ? (
        <section aria-labelledby="community-about-title">
          <h2 id="community-about-title" className="text-h4">
            معرفی
          </h2>
          <Prose text={page.aboutFa} />
        </section>
      ) : null}

      <section aria-labelledby="community-membership-title">
        <h2 id="community-membership-title" className="text-h4">
          عضویت
        </h2>
        {page.membershipInfoFa ? <Prose text={page.membershipInfoFa} /> : null}
        {page.membershipUrl ? (
          <p className="mt-md text-body-md">
            <a
              href={page.membershipUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="text-text-brand underline underline-offset-4"
              data-testid="community-membership-link"
            >
              صفحه عضویت {kindFa}
            </a>
          </p>
        ) : null}
        {/* Membership is the community's own register; Hamzist neither takes the request nor confirms it (DEC-0170). */}
        <p className="mt-sm text-caption text-text-secondary" data-testid="community-membership-note">
          عضویت را خودِ {kindFa} ثبت و تأیید می‌کند. همزیست عضویت نمی‌گیرد، عضویت کسی را تأیید نمی‌کند و هزینه‌ای در این باره دریافت نمی‌کند.
        </p>
      </section>

      {page.managers.length > 0 ? (
        <section aria-labelledby="community-managers-title">
          <h2 id="community-managers-title" className="text-h4">
            مدیران
          </h2>
          <ul className="mt-md space-y-sm" data-testid="community-managers">
            {page.managers.map((manager) => (
              <li key={manager.nameFa + (manager.roleFa ?? '')} className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
                <span className="text-label-md">{manager.nameFa}</span>
                {manager.roleFa ? <span className="text-caption text-text-secondary">{' · ' + manager.roleFa}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.events.length > 0 ? (
        <section aria-labelledby="community-events-title">
          <h2 id="community-events-title" className="text-h4">
            رویدادها
          </h2>
          <ul className="mt-md space-y-sm" data-testid="community-events">
            {[...upcoming, ...past].map((event) => (
              <li key={event.id} className="rounded-lg border border-border-subtle bg-bg-surface p-md" data-testid="community-event">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <p className="text-label-lg">{event.titleFa}</p>
                  {event.cancelled ? (
                    <StatusBadge tone="warning">لغو شد</StatusBadge>
                  ) : event.upcoming ? (
                    <StatusBadge tone="success">پیش‌رو</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">برگزارشده</StatusBadge>
                  )}
                </div>
                <p className="mt-2xs flex flex-wrap items-center gap-2xs text-body-sm text-text-secondary">
                  <Icon name="calendarDots" size="xs" />
                  {dateFa(event.startsOn) + (event.endsOn ? ' تا ' + dateFa(event.endsOn) : '')}
                  {event.cityNameFa || event.placeFa ? ' · ' + [event.cityNameFa, event.placeFa].filter(Boolean).join('، ') : ''}
                </p>
                {event.descriptionFa ? <p className="mt-xs text-body-sm">{event.descriptionFa}</p> : null}
                {event.cancelled && event.cancelReasonFa ? (
                  <p className="mt-xs text-body-sm text-text-secondary" data-testid="community-event-cancelled">
                    {'دلیل لغو: ' + event.cancelReasonFa}
                  </p>
                ) : null}
                {!event.cancelled && event.registrationUrl ? (
                  <p className="mt-xs text-body-sm">
                    <a href={event.registrationUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-text-brand underline underline-offset-4">
                      ثبت‌نام رویداد
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-sm text-caption text-text-secondary">
            تاریخ، مکان و ثبت‌نام رویداد را همین {kindFa} اعلام کرده است؛ همزیست برگزاری آن را تضمین نمی‌کند.
          </p>
        </section>
      ) : null}

      {page.posts.length > 0 ? (
        <section aria-labelledby="community-posts-title">
          <h2 id="community-posts-title" className="text-h4">
            نوشته‌ها
          </h2>
          <ul className="mt-md space-y-sm" data-testid="community-posts">
            {page.posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={path + '/posts/' + post.slug}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-md transition-colors hover:border-border-brand"
                  data-testid={'community-post-' + post.slug}
                >
                  <p className="text-label-lg">{post.titleFa}</p>
                  <p className="mt-2xs text-body-sm text-text-secondary">{post.summaryFa}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
