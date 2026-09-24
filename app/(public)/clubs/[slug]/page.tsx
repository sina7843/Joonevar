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
    <div className="space-y-xl">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'کلاب‌ها', path: '/clubs' },
          { name: page.nameFa, path: '/clubs/' + page.slug },
        ]}
        origin={origin}
      />

      {page.primary ? (
        <Alert tone="info" title={DUPLICATE_NOTICE_FA}>
          <Link href={'/clubs/' + page.primary.slug} className="text-text-brand">
            {page.primary.nameFa}
          </Link>
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-start gap-lg">
        {page.imageFileId !== null ? <RecordImage variant="banner" fileId={page.imageFileId} altFa={page.imageAltFa} /> : null}
        <div className="min-w-0 space-y-sm">
          <h1 className="text-h3 md:text-h1">{page.nameFa}</h1>
          <p className="text-body-sm text-text-secondary">
            {'کلاب · حوزه ' + (COMMUNITY_SCOPE_FA[page.scope] ?? page.scope) + (page.placeFa ? ' · ' + page.placeFa : '')}
          </p>
          <div className="flex flex-wrap gap-xs">
            <StatusBadge tone="success">تأیید انجمن</StatusBadge>
            {page.owned ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
            {page.registration ? <StatusBadge tone="info">{'ثبت: ' + page.registration.statusFa}</StatusBadge> : null}
          </div>
        </div>
      </header>

      {page.aboutFa ? (
        <section aria-labelledby="club-about-title" className="space-y-md">
          <h2 id="club-about-title" className="text-h5">
            درباره کلاب
          </h2>
          <div className="space-y-md text-body-md">
            {page.aboutFa.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="club-contact-title" className="space-y-sm">
        <h2 id="club-contact-title" className="text-h5">
          راه ارتباطی و عضویت
        </h2>
        {page.membershipInfoFa ? <p className="text-body-md">{page.membershipInfoFa}</p> : null}
        <ul className="space-y-xs text-body-sm text-text-secondary" data-testid="club-contact">
          {page.contactPhone ? (
            <li>
              {'تلفن: '}
              <span dir="ltr">{page.contactPhone}</span>
            </li>
          ) : null}
          {page.websiteUrl ? (
            <li>
              {'وب‌سایت: '}
              <a href={page.websiteUrl} rel="nofollow noopener" dir="ltr" className="text-text-brand">
                {page.websiteUrl}
              </a>
            </li>
          ) : null}
          {page.membershipUrl ? (
            <li>
              {'راه عضویت: '}
              <a href={page.membershipUrl} rel="nofollow noopener" dir="ltr" className="text-text-brand">
                {page.membershipUrl}
              </a>
            </li>
          ) : null}
        </ul>
        <p className="text-caption text-text-secondary">عضویت در کلاب با خود کلاب است؛ همزیست عضو نمی‌گیرد و هزینه‌ای دریافت نمی‌کند.</p>
      </section>

      {events.length > 0 ? (
        <section aria-labelledby="club-events-title" className="space-y-md">
          <h2 id="club-events-title" className="text-h5">
            رویدادها
          </h2>
          <ul className="space-y-sm" data-testid="club-events">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
                <p className="text-label-lg">{event.titleFa}</p>
                <p className="mt-2xs text-caption text-text-secondary">
                  {dateFa(event.startsOn) + (event.endsOn ? ' تا ' + dateFa(event.endsOn) : '') + (event.cityNameFa ? ' · ' + event.cityNameFa : '')}
                </p>
                {event.cancelled ? <StatusBadge tone="warning">لغو شد</StatusBadge> : null}
                {event.descriptionFa ? <p className="mt-xs text-body-sm">{event.descriptionFa}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.posts.length > 0 ? (
        <section aria-labelledby="club-posts-title" className="space-y-md">
          <h2 id="club-posts-title" className="text-h5">
            نوشته‌های کلاب
          </h2>
          <ul className="space-y-sm" data-testid="club-posts">
            {page.posts.map((post) => (
              <li key={post.slug}>
                <Link href={'/associations/' + page.slug + '/posts/' + post.slug} className="text-label-lg text-text-brand">
                  {post.titleFa}
                </Link>
                <p className="text-body-sm text-text-secondary">{post.summaryFa}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="club-join-title" className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
        <h2 id="club-join-title" className="text-h5">
          عضویت در این کلاب
        </h2>
        <p className="mt-xs text-body-sm text-text-secondary">
          شرط‌های اعلام‌شده کلاب روی پرونده شما در همزیست بررسی می‌شود و نتیجه را خودتان می‌بینید.
        </p>
        <Link href={'/clubs/' + page.slug + '/join'} className="mt-md inline-block text-body-sm text-text-brand" data-testid="club-join-link">
          دیدن شرایط و درخواست عضویت
        </Link>
      </section>

      <footer className="border-t border-border-subtle pt-lg">
        <Link href={'/report/club/' + page.id} className="text-body-sm text-text-brand" data-testid="club-report-link">
          گزارش این کلاب
        </Link>
      </footer>
    </div>
  );
}
