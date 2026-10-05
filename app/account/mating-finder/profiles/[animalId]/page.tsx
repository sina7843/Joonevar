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
import { PageHeader, SectionHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { Icon } from '../../../../../src/ui/icon.tsx';
import { statusOf } from '../../../../../src/ui/status-dictionary.ts';

const FINDER_KEY: Partial<Record<string, string>> = { READY: 'FINDER_READY', INVITE_ONLY: 'FINDER_INVITE_ONLY', TEMPORARILY_UNAVAILABLE: 'FINDER_UNAVAILABLE' };

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
    <PublicShell
      actor={guard.actor}
      title={'پروفایل جفت‌یابی ' + (animal.name ?? 'بدون نام')}
      pathname="/account/mating-finder"
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'جفت‌یابی', href: '/account/mating-finder' },
              { name: 'پروفایل‌ها', href: '/account/mating-finder/profiles' },
              { name: animal.name ?? 'بدون نام' },
            ]}
          />
          <PageHeader
            title={animal.name ?? 'بدون نام'}
            back={{ href: '/account/mating-finder/profiles' }}
            aside={
              <span data-testid="finder-profile-state">
                <StatusBadge tone={(FINDER_KEY[state] ? statusOf(FINDER_KEY[state]!)?.tone : null) ?? (state === 'INACTIVE' ? 'neutral' : 'info')}>
                  {PROFILE_STATE_FA[state]}
                </StatusBadge>
              </span>
            }
            meta={[
              profile?.deactivationReason && state === 'INACTIVE' ? (
                <span key="reason" data-testid="finder-deactivation-reason">
                  {DEACTIVATION_FA[profile.deactivationReason]}
                </span>
              ) : (
                'پروفایل جفت‌یابی'
              ),
              ...(profile && state !== 'INACTIVE'
                ? [
                    <Link key="public" href={'/mating-finder/' + profile.id} className="hz-link" data-testid="finder-public-link">
                      صفحه عمومی این پروفایل
                    </Link>,
                  ]
                : []),
            ]}
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
      <aside className="min-w-0 space-y-xl lg:sticky lg:top-[calc(var(--header-app)+16px)] lg:order-last lg:col-span-4" aria-label="وضعیت و اقدام">
        <Card className="space-y-sm">
          <SectionHeader title="شرایط ورود" size="sm" />
          {eligibility.problems.length === 0 ? (
            <p className="hz-inline-msg hz-inline-msg--success" data-testid="finder-eligible"><Icon name="checkCircle" size="xs" /><span className="hz-inline-msg__text">همه شرایط ورود برقرار است.</span></p>
          ) : (
            <ul className="space-y-xs" data-testid="finder-problems">
              {eligibility.problems.map((problem) => (
                <li key={problem.code} className="hz-inline-msg hz-inline-msg--warning" data-testid={'finder-problem-' + problem.code}>
                  <Icon name="warning" size="xs" />
                  <span className="hz-inline-msg__text">{problem.fa}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="hz-caption mt-sm">شجره‌نامه شرط ورود نیست و فقط کامل‌بودن پروفایل را بالا می‌برد.</p>
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
        {card ? (
          <Card>
            <SectionHeader title="پیش‌نمایش کارت" size="sm" />
            <div>
              <MatingProfileCardView card={card} />
            </div>
          </Card>
        ) : null}
      </aside>
      <div className="min-w-0 space-y-xl lg:col-span-8">

        <Card>
          <SectionHeader title="وضعیت باروری" size="sm" />
          <p className="hz-caption">این اظهار شماست و در سابقه می‌ماند؛ همزیست آن را تأیید دامپزشکی معرفی نمی‌کند.</p>
          <FertilityForm animalId={animal.id} current={eligibility.fertility} />
        </Card>

        <Card>
          <SectionHeader title="تصویرها و ویدئو" size="sm" />
          <p className="hz-caption">
            یک تصویر تمام‌بدن و یک تصویر صورت لازم است. فایل اصلی خصوصی می‌ماند و فقط نسخه بدون اطلاعات جانبی (مانند موقعیت
            مکانی عکس) عمومی می‌شود. ویدئو فعلاً فقط برای خود شما نمایش داده می‌شود.
          </p>
          {media.length > 0 ? (
            <ul className="mt-md grid gap-sm sm:grid-cols-2" data-testid="finder-media-list">
              {media.map((item) => (
                <li key={item.id} className="hz-cardlist__item" data-testid={'finder-media-' + item.id}>
                  <p className="hz-body-sm">
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
          <SectionHeader title="ترجیحات" size="sm" />
          <PreferencesForm animalId={animal.id} current={profile?.preferencesFa ?? null} />
        </Card>

        <Card>
          <SectionHeader title="رویدادهای زندگی حیوان" size="sm" />
          <p className="hz-caption mb-md">
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
      </div>
      </div>
    </PublicShell>
  );
}
