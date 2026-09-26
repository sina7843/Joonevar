import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { ownerFinderAnimals } from '../../../../src/finder/profiles.ts';
import { finderCapacity } from '../../../../src/finder/subscriptions.ts';
import { PROFILE_STATE_FA, type ProfileState } from '../../../../src/finder/profile-model.ts';

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
    <PublicShell actor={guard.actor} title="پروفایل‌های جفت‌یابی" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">پروفایل‌های جفت‌یابی</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            هیچ حیوانی بدون اقدام شما وارد جفت‌یابی نمی‌شود. برای هر حیوان شرایط ورود، تصویرها و وضعیت را از صفحه همان حیوان
            مدیریت کنید.
          </p>
          <p className="mt-sm text-label-md" data-testid="finder-capacity-usage">
            {'حیوان فعال: ' + fa(active) + ' از ' + (capacity.limit === null ? 'ظرفیتی که هنوز تعیین نشده' : fa(capacity.limit))}
          </p>
          <p className="mt-xs text-caption">
            <Link href="/account/mating-finder" className="text-text-brand underline underline-offset-4">
              اشتراک و ظرفیت
            </Link>
          </p>
        </Card>
        {entries.length === 0 ? (
          <EmptyState title="حیوانی برای جفت‌یابی ندارید" description="فقط حیوان ثبت‌شده از گونه‌ای که جفت‌یابی برایش باز است اینجا می‌آید." />
        ) : (
          <ul className="space-y-md" data-testid="finder-owner-animals">
            {entries.map((entry) => {
              const state = (entry.profile?.state ?? 'INACTIVE') as ProfileState;
              return (
                <li key={entry.animal.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <Link
                        href={'/account/mating-finder/profiles/' + entry.animal.id}
                        className="text-label-lg text-text-brand underline underline-offset-4"
                        data-testid={'finder-owner-animal-' + entry.animal.id}
                      >
                        {entry.animal.name ?? 'بدون نام'}
                      </Link>
                      <StatusBadge tone={state === 'INACTIVE' ? 'neutral' : 'success'}>{PROFILE_STATE_FA[state]}</StatusBadge>
                    </div>
                    <p className="mt-xs text-caption text-text-secondary">
                      {entry.eligibility.problems.length === 0
                        ? 'همه شرایط ورود برقرار است.'
                        : fa(entry.eligibility.problems.length) + ' شرط ورود هنوز برقرار نیست.'}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
