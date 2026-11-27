import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { ownerFinderAnimals } from '../../../../src/finder/profiles.ts';
import { finderCapacity } from '../../../../src/finder/subscriptions.ts';
import { PROFILE_STATE_FA, type ProfileState } from '../../../../src/finder/profile-model.ts';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

const SUB_NAV: ReadonlyArray<{ href: string; label: string; testId?: string }> = [
  { href: '/account/mating-finder', label: 'اشتراک و ظرفیت' },
  { href: '/mating-finder', label: 'جست‌وجوی جفت', testId: 'finder-search-link' },
  { href: '/account/mating-finder/favorites', label: 'علاقه‌مندی‌ها' },
  { href: '/account/mating-finder/saved-searches', label: 'جست‌وجوهای ذخیره‌شده' },
  { href: '/account/mating-finder/requests', label: 'درخواست‌ها', testId: 'finder-requests-link' },
  { href: '/account/mating-finder/blocks', label: 'مسدودشده‌ها' },
  { href: '/account/mating-finder/appeals', label: 'تصمیم‌ها و اعتراض' },
];

/** Finder states that have their own dictionary key keep that label and tone. */
const FINDER_KEY: Partial<Record<ProfileState, string>> = { READY: 'FINDER_READY', INVITE_ONLY: 'FINDER_INVITE_ONLY', TEMPORARILY_UNAVAILABLE: 'FINDER_UNAVAILABLE' };

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/** The owner's animals on the finder — PHASE-4 PROMPT-003. */
export default async function FinderProfilesPage() {
  const guard = await guardRoute('/account/mating-finder/profiles');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const now = new Date();
  const [entries, capacity] = await Promise.all([ownerFinderAnimals(db(), guard.actor, now), finderCapacity(db(), guard.actor.accountId, now)]);
  const active = entries.filter((e) => e.profile && e.profile.state !== 'INACTIVE').length;

  return (
    <PublicShell
      actor={guard.actor}
      title="پروفایل‌های جفت‌یابی"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="پروفایل‌های جفت‌یابی"
          back={{ href: '/account/mating-finder' }}
          meta={[
            <span key="usage" data-testid="finder-capacity-usage">
              {'حیوان فعال: ' + fa(active) + ' از ' + (capacity.limit === null ? 'ظرفیتی که هنوز تعیین نشده' : fa(capacity.limit))}
            </span>,
            'هیچ حیوانی بدون اقدام شما وارد جفت‌یابی نمی‌شود. برای هر حیوان شرایط ورود، تصویرها و وضعیت را از صفحه همان حیوان مدیریت کنید.',
          ]}
        />
      }
    >
      <div className="space-y-lg">
        <nav aria-label="بخش‌های جفت‌یابی" className="hz-filterbar hz-filterbar--scroll pb-2xs">
          <ul className="hz-filterbar__chips">
            {SUB_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hz-chip no-underline" data-testid={item.testId}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {entries.length === 0 ? (
          <EmptyState
            icon="pawPrint"
            title="حیوانی برای جفت‌یابی ندارید"
            description="فقط حیوان ثبت‌شده از گونه‌ای که جفت‌یابی برایش باز است اینجا می‌آید."
            action={
              <ButtonLink tone="secondary" href="/animals/new">
                ثبت حیوان
              </ButtonLink>
            }
          />
        ) : (
          <ul className="hz-cardlist" data-testid="finder-owner-animals">
            {entries.map((entry) => {
              const state = (entry.profile?.state ?? 'INACTIVE') as ProfileState;
              return (
                <li key={entry.animal.id} className="hz-cardlist__item">
                  <div className="hz-cardlist__row">
                    <Link
                      href={'/account/mating-finder/profiles/' + entry.animal.id}
                      className="hz-cardlist__title min-w-0 text-text-primary"
                      data-testid={'finder-owner-animal-' + entry.animal.id}
                    >
                      {entry.animal.name ?? 'بدون نام'}
                    </Link>
                    {state === 'COORDINATING' || state === 'MATCH_SELECTED' ? (
                      // GAPS #4: no dictionary key for COORDINATING / MATCH_SELECTED
                      <StatusBadge tone="info">{PROFILE_STATE_FA[state]}</StatusBadge>
                    ) : (
                      <StatusBadge status={FINDER_KEY[state] ?? state} />
                    )}
                  </div>
                  <div className="hz-cardlist__row">
                    <span className={entry.eligibility.problems.length === 0 ? 'hz-inline-msg hz-inline-msg--success' : 'hz-inline-msg hz-inline-msg--warning'}>
                      <Icon name={entry.eligibility.problems.length === 0 ? 'checkCircle' : 'warning'} size="xs" />
                      <span className="hz-inline-msg__text">
                        {entry.eligibility.problems.length === 0
                          ? 'همه شرایط ورود برقرار است.'
                          : fa(entry.eligibility.problems.length) + ' شرط ورود هنوز برقرار نیست.'}
                      </span>
                    </span>
                    <Link href={'/account/mating-finder/profiles/' + entry.animal.id} className="inline-flex items-center gap-xs text-label-sm text-text-brand">
                      مدیریت
                      <Icon name="caretRight" size="sm" mirror />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
