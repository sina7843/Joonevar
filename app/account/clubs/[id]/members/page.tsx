import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../../src/ui/page-crumbs.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { clubMemberQueue } from '../../../../../src/clubs/enrollment.ts';
import { clubManagement } from '../../../../../src/clubs/service.ts';
import {
  CLUB_MEMBERSHIP_STATUS_SHORT_FA,
  type ClubMembershipStatus,
} from '../../../../../src/clubs/membership-model.ts';
import { ClubMemberStandingForm, ClubMembershipDecisionForm } from '../../../../../src/clubs/rules-forms.tsx';
import { formatInstantFa } from '../../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * The club's members and applicants — Phase 2.5 §9 (PROMPT-013). P05 list.
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
        <EmptyState icon="prohibit" title="این کلاب پیدا نشد یا در آن نقشی ندارید" description="نقش در یک کلاب هیچ دسترسی‌ای در کلاب دیگر نمی‌دهد." />
      </PublicShell>
    );
  }

  let entries;
  try {
    entries = await clubMemberQueue(db(), guard.actor, id);
  } catch {
    return (
      <PublicShell actor={guard.actor} title="اعضای کلاب" pathname="/account/clubs">
        <EmptyState
          icon="lockSimple"
          title="دیدن فهرست اعضای این کلاب از اختیار نقش شما بیرون است"
          description="فهرست اعضا را مالک یا مدیر همین کلاب می‌بیند."
          action={
            <ButtonLink tone="secondary" href={'/account/clubs/' + id}>
              بازگشت به کلاب
            </ButtonLink>
          }
        />
      </PublicShell>
    );
  }

  const waiting = entries.filter((entry) => entry.membership.status === 'PENDING_REVIEW');
  const others = entries.filter((entry) => entry.membership.status !== 'PENDING_REVIEW');
  const title = 'اعضای ' + view.club.displayNameFa;

  return (
    <PublicShell
      actor={guard.actor}
      title={title}
      pathname="/account/clubs"
      header={
        <div>
          <PageCrumbs
            items={[
              { href: '/dashboard', name: 'خانه' },
              { href: '/account/clubs', name: 'کلاب من' },
              { href: '/account/clubs/' + id, name: view.club.displayNameFa },
              { name: 'اعضا و درخواست‌ها' },
            ]}
          />
          <PageHeader
            title={title}
            back={{ href: '/account/clubs/' + id, label: view.club.displayNameFa }}
            meta={[
              ...(waiting.length > 0 ? [fa(waiting.length) + ' در انتظار تصمیم'] : []),
              ...(others.length > 0 ? [fa(others.length) + ' عضو'] : []),
              'کلاب می‌بیند که شرط‌هایش برقرار است یا نه، و چند شرط برقرار نیست؛ دلیل‌ها نزد خود متقاضی می‌ماند.',
            ]}
            actions={
              <ButtonLink tone="secondary" href={'/account/clubs/' + id + '/rules'} iconStart="listChecks" data-testid="club-rules-link">
                نوشتن شرایط عضویت
              </ButtonLink>
            }
          />
        </div>
      }
    >
      <section className="space-y-md" aria-labelledby="club-waiting-title">
        <SectionHeader id="club-waiting-title" title="در انتظار تصمیم" count={waiting.length > 0 ? fa(waiting.length) : undefined} />
        {waiting.length === 0 ? (
          <EmptyState title="درخواستی در انتظار تصمیم نیست" description="درخواست‌هایی که شرط تأیید دستی دارند اینجا می‌آیند." />
        ) : (
          <ul className="hz-cardlist" data-testid="club-membership-queue">
            {waiting.map((entry) => (
              <li key={entry.membership.id} className="hz-cardlist__item">
                <div className="hz-cardlist__row">
                  <span className="hz-cardlist__title">{entry.nameFa ?? 'کاربر همزیست'}</span>
                  <span className="hz-tag hz-tag--neutral">{'درخواست ' + (entry.membership.appliedAt ? formatInstantFa(entry.membership.appliedAt) : '')}</span>
                </div>
                <ActionOwner owner="USER" />
                <ClubMembershipDecisionForm clubId={id} membershipId={entry.membership.id} version={entry.membership.version} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-md" aria-labelledby="club-all-title">
        <SectionHeader id="club-all-title" title="همه اعضا" count={others.length > 0 ? fa(others.length) : undefined} />
        {others.length === 0 ? (
          <EmptyState title="هنوز کسی در این کلاب عضو نشده است" description="پس از انتشار شرایط عضویت، درخواست‌های پذیرفته‌شده اینجا می‌آیند." />
        ) : (
          <ul className="hz-cardlist" data-testid="club-members-list">
            {others.map((entry) => {
              const status = entry.membership.status as ClubMembershipStatus;
              return (
                <li key={entry.membership.id} className="hz-cardlist__item">
                  <div className="hz-cardlist__row">
                    <span className="hz-cardlist__title">{entry.nameFa ?? 'کاربر همزیست'}</span>
                    <span className="flex flex-wrap gap-xs">
                      {status === 'INELIGIBLE' ? (
                        // GAPS #4: no dictionary key for INELIGIBLE
                        <StatusBadge tone="neutral">{CLUB_MEMBERSHIP_STATUS_SHORT_FA[status]}</StatusBadge>
                      ) : (
                        <StatusBadge status={status} />
                      )}
                      {entry.unmetCount > 0 ? <span className="hz-tag hz-tag--neutral">{fa(entry.unmetCount) + ' شرط برقرار نیست'}</span> : null}
                      {entry.staleRules ? <span className="hz-tag hz-tag--neutral">پذیرفته‌شده با نسخه پیشین</span> : null}
                    </span>
                  </div>
                  {entry.admittedVersionNumber !== null ? (
                    <span className="hz-cardlist__meta">{'پذیرش با نسخه ' + fa(entry.admittedVersionNumber)}</span>
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
      </section>
    </PublicShell>
  );
}
