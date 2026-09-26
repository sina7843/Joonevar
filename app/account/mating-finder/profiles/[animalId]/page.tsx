import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { AppError } from '../../../../../src/domain/errors.ts';
import { db } from '../../../../../src/db/client.ts';
import { ownerFinderAnimal } from '../../../../../src/finder/profiles.ts';
import { MatingProfileCardView } from '../../../../../src/finder/profile-card.tsx';
import {
  DEACTIVATION_FA,
  LIFE_EVENT_FA,
  LIFE_EVENT_KINDS,
  lifeEventProblem,
  ownerTargets,
  PROFILE_STATE_FA,
  type ProfileState,
} from '../../../../../src/finder/profile-model.ts';
import {
  ActivateForm,
  AddMediaForm,
  FertilityForm,
  LifeEventForm,
  MediaItemForms,
  PreferencesForm,
  StateForm,
} from '../../../../../src/finder/profile-forms.tsx';

export const dynamic = 'force-dynamic';

const ROLE_FA: Record<string, string> = { FULL_BODY: 'تمام‌بدن', FACE: 'صورت', OTHER: 'تصویر دیگر' };

/**
 * One animal's mating profile — PHASE-4 PROMPT-003. Every condition, the
 * owner's fertility statement, pictures and the clip, availability and the
 * lifecycle events. The server decides everything shown as allowed here.
 */
export default async function FinderProfilePage({ params }: { params: Promise<{ animalId: string }> }) {
  const guard = await guardRoute('/account/mating-finder/profiles');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { animalId } = await params;
  let entry;
  try {
    entry = await ownerFinderAnimal(db(), guard.actor, animalId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const { animal, profile, media, eligibility, card } = entry;
  const state = (profile?.state ?? 'INACTIVE') as ProfileState;
  const lifeOptions = LIFE_EVENT_KINDS.filter((kind) => lifeEventProblem(eligibility.lifeStatus, kind) === null).map((kind) => ({
    value: kind,
    label: LIFE_EVENT_FA[kind],
  }));

  return (
    <PublicShell actor={guard.actor} title="پروفایل جفت‌یابی" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <p className="text-caption">
            <Link href="/account/mating-finder/profiles" className="text-text-brand underline underline-offset-4">
              پروفایل‌های جفت‌یابی
            </Link>
          </p>
          <div className="mt-xs flex flex-wrap items-center justify-between gap-sm">
            <h1 className="text-h4">{animal.name ?? 'بدون نام'}</h1>
            <span data-testid="finder-profile-state">
              <StatusBadge tone={state === 'INACTIVE' ? 'neutral' : 'success'}>{PROFILE_STATE_FA[state]}</StatusBadge>
            </span>
          </div>
          {profile?.deactivationReason && state === 'INACTIVE' ? (
            <p className="mt-xs text-caption text-text-secondary" data-testid="finder-deactivation-reason">
              {DEACTIVATION_FA[profile.deactivationReason]}
            </p>
          ) : null}
          {profile && state !== 'INACTIVE' ? (
            <p className="mt-xs text-caption">
              <Link href={'/mating-finder/' + profile.id} className="text-text-brand underline underline-offset-4" data-testid="finder-public-link">
                صفحه عمومی این پروفایل
              </Link>
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">شرایط ورود</h2>
          {eligibility.problems.length === 0 ? (
            <p className="mt-sm text-body-sm" data-testid="finder-eligible">همه شرایط ورود برقرار است.</p>
          ) : (
            <ul className="mt-sm list-inside list-disc space-y-2xs text-body-sm" data-testid="finder-problems">
              {eligibility.problems.map((problem) => (
                <li key={problem.code} data-testid={'finder-problem-' + problem.code}>
                  {problem.fa}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-sm text-caption text-text-secondary">شجره‌نامه شرط ورود نیست و فقط کامل‌بودن پروفایل را بالا می‌برد.</p>
          {state === 'INACTIVE' ? (
            <ActivateForm animalId={animal.id} disabledReasonFa={eligibility.problems.length > 0 ? 'پیش از فعال‌سازی، شرط‌های بالا را کامل کنید.' : null} />
          ) : profile ? (
            <StateForm
              animalId={animal.id}
              profileId={profile.id}
              version={profile.version}
              targets={ownerTargets(state).map((to) => ({ value: to, label: PROFILE_STATE_FA[to] }))}
            />
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">وضعیت باروری</h2>
          <p className="mt-xs text-caption text-text-secondary">این اظهار شماست و در سابقه می‌ماند؛ همزیست آن را تأیید دامپزشکی معرفی نمی‌کند.</p>
          <FertilityForm animalId={animal.id} current={eligibility.fertility} />
        </Card>

        <Card>
          <h2 className="text-label-lg">تصویرها و ویدئو</h2>
          <p className="mt-xs text-caption text-text-secondary">
            یک تصویر تمام‌بدن و یک تصویر صورت لازم است. فایل اصلی خصوصی می‌ماند و فقط نسخه بدون اطلاعات جانبی (مانند موقعیت
            مکانی عکس) عمومی می‌شود. ویدئو فعلاً فقط برای خود شما نمایش داده می‌شود.
          </p>
          {media.length > 0 ? (
            <ul className="mt-md grid gap-sm sm:grid-cols-2" data-testid="finder-media-list">
              {media.map((item) => (
                <li key={item.id} className="rounded-md border border-border-subtle p-sm" data-testid={'finder-media-' + item.id}>
                  <p className="text-body-sm">
                    {(item.kind === 'VIDEO' ? 'ویدئو' : ROLE_FA[item.role]) + ' · ' + item.altFa}
                    {profile?.primaryMediaId === item.id ? ' · تصویر اصلی' : ''}
                  </p>
                  <MediaItemForms animalId={animal.id} mediaId={item.id} canBePrimary={item.kind === 'IMAGE' && profile?.primaryMediaId !== item.id} />
                </li>
              ))}
            </ul>
          ) : null}
          <AddMediaForm animalId={animal.id} kind="IMAGE" />
          <AddMediaForm animalId={animal.id} kind="VIDEO" />
        </Card>

        <Card>
          <h2 className="text-label-lg">ترجیحات</h2>
          <PreferencesForm animalId={animal.id} current={profile?.preferencesFa ?? null} />
        </Card>

        <Card>
          <h2 className="text-label-lg">رویدادهای زندگی حیوان</h2>
          <p className="mt-xs text-caption text-text-secondary">
            ثبت فوت، مفقودی یا بایگانی حیوان را فوراً از جفت‌یابی خارج می‌کند. هیچ سابقه‌ای حذف نمی‌شود و پس از پیدا شدن یا خروج از
            بایگانی، فعال‌سازی دوباره با خود شماست.
          </p>
          {lifeOptions.length === 0 ? (
            <Alert tone="info" title="فوت این حیوان ثبت شده است">
              رویداد دیگری پذیرفته نمی‌شود.
            </Alert>
          ) : (
            <LifeEventForm animalId={animal.id} options={lifeOptions} />
          )}
        </Card>

        {card ? (
          <Card>
            <h2 className="text-label-lg">پیش‌نمایش کارت</h2>
            <div className="mt-md">
              <MatingProfileCardView card={card} />
            </div>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
