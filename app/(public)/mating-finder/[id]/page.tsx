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

  return (
    <div className="mx-auto max-w-4xl space-y-lg px-lg py-lg">
      <h1 className="text-h3" data-testid="finder-public-title">
        {'پروفایل جفت‌یابی ' + card.nameFa}
      </h1>
      <MatingProfileCardView card={card} detail />
      <section className="rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">درخواست و گفت‌وگو</h2>
        <p className="mt-xs text-body-sm text-text-secondary">
          امتیاز یا اطلاعات این صفحه تضمین سلامت، باروری یا کیفیت توله نیست. ارسال درخواست پس از احراز هویت هر دو مالک ممکن
          می‌شود.
        </p>
        {!actor ? (
          <p className="mt-sm text-body-sm">
            برای ارسال درخواست،{' '}
            <Link href={'/login?next=' + encodeURIComponent('/mating-finder/' + card.profileId)} className="text-text-brand underline underline-offset-4">
              وارد شوید
            </Link>
            .
          </p>
        ) : ownProfile ? null : card.state !== 'READY' ? (
          <p className="mt-sm text-body-sm" data-testid="finder-request-closed">این پروفایل در حال حاضر درخواست تازه نمی‌پذیرد.</p>
        ) : mine.length === 0 ? (
          <p className="mt-sm text-body-sm">
            برای ارسال درخواست، حیوان شما باید پروفایل فعال جفت‌یابی داشته باشد.{' '}
            <Link href="/account/mating-finder/profiles" className="text-text-brand underline underline-offset-4">
              مدیریت پروفایل‌ها
            </Link>
          </p>
        ) : (
          <CreateRequestForm
            profileId={card.profileId}
            myAnimals={mine.map((m) => ({ value: m.id, label: m.name ?? 'بدون نام' }))}
            maxDays={maxDays}
            defaults={{ route: 'PERSONAL', windowFrom: today, windowTo: today, cityFa: card.cityFa ?? '', placeCategory: 'NEUTRAL', financialCategory: 'NO_PAYMENT', specialConditionsFa: '' }}
          />
        )}
      </section>
      <section className="rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">گزارش این پروفایل</h2>
        {actor ? (
          <>
            <FinderReportForm target="PROFILE" id={card.profileId} images={card.images.map((image) => ({ value: image.mediaId, label: 'تصویر: ' + image.altFa }))} />
            {!ownProfile ? (
              <div className="mt-md">
                <BlockPersonForm profileId={card.profileId} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-xs text-body-sm">
            برای گزارش،{' '}
            <Link href={'/login?next=' + encodeURIComponent('/mating-finder/' + card.profileId)} className="text-text-brand underline underline-offset-4">
              وارد شوید
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
