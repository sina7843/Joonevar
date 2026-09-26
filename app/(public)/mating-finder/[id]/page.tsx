import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site, viewer } from '../../../../src/public/request.ts';
import { publicProfile } from '../../../../src/finder/profiles.ts';
import { MatingProfileCardView } from '../../../../src/finder/profile-card.tsx';
import { ReportProfileForm } from '../../../../src/finder/profile-forms.tsx';

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
      </section>
      <section className="rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">گزارش این پروفایل</h2>
        {actor ? (
          <ReportProfileForm profileId={card.profileId} images={card.images.map((image) => ({ value: image.mediaId, label: 'تصویر: ' + image.altFa }))} />
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
