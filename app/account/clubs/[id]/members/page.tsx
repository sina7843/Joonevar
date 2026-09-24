import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { clubMemberQueue } from '../../../../../src/clubs/enrollment.ts';
import { clubManagement } from '../../../../../src/clubs/service.ts';
import {
  CLUB_MEMBERSHIP_STATUS_SHORT_FA,
  CLUB_MEMBERSHIP_TONE,
  type ClubMembershipStatus,
} from '../../../../../src/clubs/membership-model.ts';
import { ClubMemberStandingForm, ClubMembershipDecisionForm } from '../../../../../src/clubs/rules-forms.tsx';
import { formatInstantFa } from '../../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * The club's members and applicants — Phase 2.5 §9 (PROMPT-013).
 *
 * What the club sees is whether its own conditions are met and how many are not.
 * The reasons belong to the applicant and are not shown here (§20).
 */
export default async function ClubMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/account/clubs/' + id + '/members';
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const view = await clubManagement(db(), guard.actor, id);
  if (view === null) {
    return (
      <PublicShell actor={guard.actor} title="اعضای کلاب" pathname="/account/clubs">
        <Alert tone="error" title="این کلاب پیدا نشد یا در آن نقشی ندارید" />
      </PublicShell>
    );
  }

  let entries;
  try {
    entries = await clubMemberQueue(db(), guard.actor, id);
  } catch {
    return (
      <PublicShell actor={guard.actor} title="اعضای کلاب" pathname="/account/clubs">
        <Alert tone="error" title="دیدن فهرست اعضای این کلاب از اختیار نقش شما بیرون است" />
      </PublicShell>
    );
  }

  const waiting = entries.filter((entry) => entry.membership.status === 'PENDING_REVIEW');
  const others = entries.filter((entry) => entry.membership.status !== 'PENDING_REVIEW');

  return (
    <PublicShell actor={guard.actor} title={'اعضای ' + view.club.displayNameFa} pathname="/account/clubs">
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title="اعضا و درخواست‌ها"
            subtitle="کلاب می‌بیند که شرط‌هایش برقرار است یا نه، و چند شرط برقرار نیست؛ دلیل‌ها نزد خود متقاضی می‌ماند."
          />
          <Link href={'/account/clubs/' + id + '/rules'} className="mt-md inline-block text-body-sm text-text-brand" data-testid="club-rules-link">
            نوشتن شرایط عضویت
          </Link>
        </Card>

        <Card>
          <h2 className="text-label-lg">در انتظار تصمیم</h2>
          {waiting.length === 0 ? (
            <div className="mt-md">
              <EmptyState title="درخواستی در انتظار تصمیم نیست" description="درخواست‌هایی که شرط تأیید دستی دارند اینجا می‌آیند." />
            </div>
          ) : (
            <ul className="mt-md space-y-md" data-testid="club-membership-queue">
              {waiting.map((entry) => (
                <li key={entry.membership.id} className="space-y-sm rounded-lg border border-border-subtle p-lg">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <p className="text-label-lg">{entry.nameFa ?? 'کاربر همزیست'}</p>
                    <StatusBadge tone="warning">{'درخواست ' + (entry.membership.appliedAt ? formatInstantFa(entry.membership.appliedAt) : '')}</StatusBadge>
                  </div>
                  <ClubMembershipDecisionForm clubId={id} membershipId={entry.membership.id} version={entry.membership.version} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">همه اعضا</h2>
          {others.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">هنوز کسی در این کلاب عضو نشده است.</p>
          ) : (
            <ul className="mt-md space-y-md" data-testid="club-members-list">
              {others.map((entry) => {
                const status = entry.membership.status as ClubMembershipStatus;
                return (
                  <li key={entry.membership.id} className="space-y-sm rounded-lg border border-border-subtle p-lg">
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <p className="text-label-lg">{entry.nameFa ?? 'کاربر همزیست'}</p>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone={CLUB_MEMBERSHIP_TONE[status]}>{CLUB_MEMBERSHIP_STATUS_SHORT_FA[status]}</StatusBadge>
                        {entry.unmetCount > 0 ? <StatusBadge tone="neutral">{fa(entry.unmetCount) + ' شرط برقرار نیست'}</StatusBadge> : null}
                        {entry.staleRules ? <StatusBadge tone="info">پذیرفته‌شده با نسخه پیشین</StatusBadge> : null}
                      </div>
                    </div>
                    {entry.admittedVersionNumber !== null ? (
                      <p className="text-caption text-text-secondary">{'پذیرش با نسخه ' + fa(entry.admittedVersionNumber)}</p>
                    ) : null}
                    {status === 'ACTIVE' ? (
                      <ClubMemberStandingForm clubId={id} membershipId={entry.membership.id} version={entry.membership.version} to="SUSPENDED" />
                    ) : null}
                    {status === 'SUSPENDED' ? (
                      <ClubMemberStandingForm clubId={id} membershipId={entry.membership.id} version={entry.membership.version} to="ACTIVE" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
