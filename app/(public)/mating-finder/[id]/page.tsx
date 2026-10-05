import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site, viewer } from '../../../../src/public/request.ts';
import { publicProfile } from '../../../../src/finder/profiles.ts';
import { MatingProfileCardView } from '../../../../src/finder/profile-card.tsx';
import { BlockPersonForm, FinderReportForm } from '../../../../src/finder/ops-forms.tsx';
import { CreateRequestForm } from '../../../../src/finder/request-forms.tsx';
import { and, eq, ne } from 'drizzle-orm';
import { animals } from '../../../../src/db/schema/animals.ts';
import { matingProfiles } from '../../../../src/db/schema/finder.ts';
import { readInt } from '../../../../src/settings/service.ts';
import { FINDER_SETTING_KEYS } from '../../../../src/finder/model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';

export const dynamic = 'force-dynamic';

/*
 * Whether a profile is shown depends on who is looking (the subscription
 * matrix), so these pages are never indexed and never enter the sitemap.
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: 'پروفایل جفت‌یابی', description: 'پروفایل جفت‌یابی یک حیوان ثبت‌شده در همزیست.', path: '/mating-finder', noindex: true }, site());
}

/**
 * One public mating profile — PHASE-4 PROMPT-003.
 *
 * The same 404 answers a missing profile, a paused one, one whose owner has
 * changed, one whose animal is no longer alive and one this viewer's
 * subscription does not reach.
 */
export default async function PublicMatingProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await viewer();
  const card = await publicProfile(db(), actor?.accountId ?? null, id);
  if (card === null) notFound();
  // The viewer's own animals that are on the finder and could send a request from here.
  const mine = actor
    ? await db()
        .select({ id: animals.id, name: animals.name })
        .from(matingProfiles)
        .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
        .where(and(eq(matingProfiles.ownerAccountId, actor.accountId), eq(animals.ownerAccountId, actor.accountId), ne(matingProfiles.state, 'INACTIVE')))
    : [];
  const ownProfile = mine.some((m) => m.id === card.animalId);
  const maxDays = await readInt(db(), FINDER_SETTING_KEYS.requestExpiryDays).catch(() => 7);
  const today = new Date().toISOString().slice(0, 10);

  const loginHref = '/login?next=' + encodeURIComponent('/mating-finder/' + card.profileId);

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs
          items={[
            { name: 'خانه', path: '/' },
            { name: 'جفت‌یابی', path: '/mating-finder' },
            { name: card.nameFa, path: '/mating-finder/' + card.profileId },
          ]}
          origin={site().origin}
        />
        <PageHeader
          title={<span data-testid="finder-public-title">{'پروفایل جفت‌یابی ' + card.nameFa}</span>}
          meta={[[card.breedFa, card.cityFa].filter(Boolean).join('، ') || 'جفت‌یابی']}
        />
      </div>

      <div className="grid gap-xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-xl">
          <MatingProfileCardView card={card} detail />
          <section className="hz-card" aria-labelledby="finder-report-title">
            <SectionHeader id="finder-report-title" title="گزارش این پروفایل" size="sm" />
            {actor ? (
              <>
                <FinderReportForm target="PROFILE" id={card.profileId} images={card.images.map((image) => ({ value: image.mediaId, label: 'تصویر: ' + image.altFa }))} />
                {!ownProfile ? (
                  <div className="mt-md border-t border-border-subtle pt-md">
                    <BlockPersonForm profileId={card.profileId} />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="hz-body-sm">
                برای گزارش،{' '}
                <Link href={loginHref} className="hz-link">
                  وارد شوید
                </Link>
                .
              </p>
            )}
          </section>
        </div>

        <aside aria-labelledby="finder-request-title" className="min-w-0 lg:sticky lg:top-[calc(var(--header-site)+24px)]">
          <section className="hz-card space-y-md">
            <SectionHeader id="finder-request-title" title="درخواست و گفت‌وگو" size="sm" />
            <p className="hz-body-sm text-text-secondary">
              امتیاز یا اطلاعات این صفحه تضمین سلامت، باروری یا کیفیت توله نیست. ارسال درخواست پس از احراز هویت هر دو مالک ممکن
              می‌شود.
            </p>
            {!actor ? (
              <ButtonLink href={loginHref} block iconStart="signIn">
                ورود برای ارسال درخواست
              </ButtonLink>
            ) : ownProfile ? (
              <p className="hz-body-sm">این پروفایل حیوان خود شماست.</p>
            ) : card.state !== 'READY' ? (
              <p className="hz-mating__note" data-testid="finder-request-closed">
                این پروفایل در حال حاضر درخواست تازه نمی‌پذیرد.
              </p>
            ) : mine.length === 0 ? (
              <div className="space-y-sm">
                <p className="hz-mating__note">برای ارسال درخواست، حیوان شما باید پروفایل فعال جفت‌یابی داشته باشد.</p>
                <ButtonLink tone="secondary" href="/account/mating-finder/profiles">
                  مدیریت پروفایل‌ها
                </ButtonLink>
              </div>
            ) : (
              <CreateRequestForm
                profileId={card.profileId}
                myAnimals={mine.map((m) => ({ value: m.id, label: m.name ?? 'بدون نام' }))}
                maxDays={maxDays}
                defaults={{ route: 'PERSONAL', windowFrom: today, windowTo: today, cityFa: card.cityFa ?? '', placeCategory: 'NEUTRAL', financialCategory: 'NO_PAYMENT', specialConditionsFa: '' }}
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
