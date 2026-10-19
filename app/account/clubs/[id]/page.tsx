import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import type { IconName } from '../../../../src/ui/icon-paths.ts';
import { db } from '../../../../src/db/client.ts';
import { clubManagement } from '../../../../src/clubs/service.ts';
import {
  CLUB_NOT_PUBLIC_FA,
  CLUB_OWNERSHIP_KIND_FA,
  CLUB_OWNERSHIP_STATUS_FA,
  CLUB_ROLE_FA,
  type ClubLifecycle,
  type ClubOwnershipKind,
  type ClubOwnershipStatus,
  type ClubRole,
} from '../../../../src/clubs/model.ts';
import {
  ClubOwnershipCancelForm,
  ClubOwnershipRequestForm,
  ClubPublicationForm,
  ClubRoleForm,
  ClubRoleRemoveForm,
  ClubStandingForm,
  ClubSubmitForm,
} from '../../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The management shell of one club — Phase 2.5 §8 (PROMPT-012). P06 record
 * file: management sections in the main column, status and links at the side.
 *
 * Everything on this page is decided from the role this account holds in *this*
 * club. Somebody with no role here sees nothing, even if they run another club.
 */
export default async function AccountClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/account/clubs/' + id;
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const view = await clubManagement(db(), guard.actor, id);

  if (view === null) {
    return (
      <PublicShell actor={guard.actor} title="کلاب" pathname="/account/clubs">
        <EmptyState
          icon="prohibit"
          title="این کلاب پیدا نشد یا در آن نقشی ندارید"
          description="نقش در یک کلاب هیچ دسترسی‌ای در کلاب دیگر نمی‌دهد."
        />
      </PublicShell>
    );
  }

  const club = view.club;
  const lifecycle = club.lifecycle as ClubLifecycle;
  const can = (capability: string): boolean => view.capabilities.includes(capability as never);
  const canSubmit = can('SUBMIT') && (lifecycle === 'DRAFT' || lifecycle === 'NEEDS_CORRECTION');
  const roleFa = CLUB_ROLE_FA[view.role as ClubRole] ?? 'انجمن';

  const links: { href: string; label: string; icon: IconName; testId?: string }[] = [];
  if (can('RULES')) {
    links.push({ href: '/account/clubs/' + club.id + '/rules', label: 'شرایط عضویت کلاب', icon: 'listChecks', testId: 'club-rules-link' });
    links.push({ href: '/account/clubs/' + club.id + '/members', label: 'اعضا و درخواست‌ها', icon: 'users', testId: 'club-members-link' });
  }
  if (view.role === 'OWNER') {
    links.push({ href: '/account/communities/' + club.id, label: 'ویرایش معرفی، حوزه، نژادها و رویدادها', icon: 'pencilSimple', testId: 'club-profile-link' });
  }
  if (club.publicSlug && club.publicStatus === 'PUBLISHED') {
    links.push({ href: '/clubs/' + club.publicSlug, label: 'دیدن صفحه عمومی', icon: 'arrowSquareOut' });
  }

  return (
    <PublicShell
      actor={guard.actor}
      title={club.displayNameFa}
      pathname="/account/clubs"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/clubs', name: 'کلاب من' }, { name: club.displayNameFa }]} />
          <PageHeader
            title={club.displayNameFa}
            back={{ href: '/account/clubs', label: 'کلاب من' }}
            aside={<StatusBadge status={lifecycle} />}
            meta={['نقش شما در این کلاب: ' + roleFa]}
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="space-y-xl lg:col-span-8">
          {canSubmit ? (
            <Card>
              <CardHeader title="ارسال برای بررسی انجمن" subtitle="انجمن تأیید اولیه کلاب را انجام می‌دهد." />
              <div className="mt-md">
                <ClubSubmitForm clubId={club.id} version={club.version} blockers={view.submissionBlockers} />
              </div>
            </Card>
          ) : null}

          {can('PUBLISH') && lifecycle === 'ACTIVE' ? (
            <Card>
              <CardHeader title="انتشار صفحه عمومی" />
              {club.hiddenByReview ? (
                <div className="mt-md">
                  <Alert tone="warning" title="این کلاب را بررسی همزیست پنهان کرده است" />
                </div>
              ) : null}
              <div className="mt-md">
                <ClubPublicationForm clubId={club.id} version={club.version} published={club.publicStatus === 'PUBLISHED'} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="نقش‌های این کلاب" subtitle="هر نقش فقط در همین کلاب اعتبار دارد." />
            {view.members.length === 0 ? (
              <p className="mt-md text-body-sm text-text-secondary">هنوز کسی جز مالک در این کلاب نقشی ندارد.</p>
            ) : (
              <ul className="hz-cardlist mt-md" data-testid="club-members">
                {view.members.map((member) => (
                  <li key={member.membershipId} className="hz-cardlist__item">
                    <div className="hz-cardlist__row">
                      <span className="text-body-sm">{(member.nameFa ?? 'کاربر همزیست') + ' — ' + CLUB_ROLE_FA[member.role]}</span>
                      {view.assignableRoles.includes(member.role) ? (
                        <ClubRoleRemoveForm clubId={club.id} membershipId={member.membershipId} version={member.version} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-lg">
              <ClubRoleForm clubId={club.id} roles={view.assignableRoles} />
            </div>
          </Card>

          <Card>
            <CardHeader title="مالکیت کلاب" subtitle="تغییر مالکیت با تصمیم انجمن انجام می‌شود." />
            {view.ownershipRequest ? (
              <div className="mt-md space-y-sm" data-testid="club-ownership-pending">
                <p className="text-body-sm">
                  {CLUB_OWNERSHIP_KIND_FA[view.ownershipRequest.kind as ClubOwnershipKind] +
                    ' — ' +
                    CLUB_OWNERSHIP_STATUS_FA[view.ownershipRequest.status as ClubOwnershipStatus]}
                </p>
                {view.ownershipRequest.requestedByAccountId === guard.actor.accountId ? (
                  <ClubOwnershipCancelForm clubId={club.id} requestId={view.ownershipRequest.id} version={view.ownershipRequest.version} />
                ) : null}
              </div>
            ) : club.ownerAccountId === null ? (
              <div className="mt-md">
                <ClubOwnershipRequestForm clubId={club.id} kind="CLAIM" />
              </div>
            ) : can('TRANSFER') ? (
              <div className="mt-md">
                <ClubOwnershipRequestForm clubId={club.id} kind="TRANSFER" />
              </div>
            ) : (
              <p className="mt-md text-body-sm text-text-secondary">واگذاری مالکیت را فقط مالک کنونی آغاز می‌کند.</p>
            )}
          </Card>

          {can('ARCHIVE') && lifecycle !== 'ARCHIVED' ? (
            <Card>
              <CardHeader title="بایگانی کلاب" subtitle="پرونده و تاریخچه می‌مانند؛ کلاب از دسترس عمومی خارج می‌شود." />
              <div className="mt-md">
                <ClubStandingForm clubId={club.id} version={club.version} surface="owner" to="ARCHIVED" />
              </div>
            </Card>
          ) : null}
        </div>

        <aside aria-label="وضعیت و اقدام" className="space-y-lg lg:col-span-4">
          <Card variant="compact">
            <SectionHeader size="sm" title="وضعیت و اقدام" />
            <div className="mt-md space-y-md">
              <div className="flex items-center justify-between gap-sm">
                <span className="text-caption text-text-secondary">وضعیت</span>
                <StatusBadge status={lifecycle} />
              </div>
              {canSubmit ? <ActionOwner owner="USER" /> : lifecycle === 'PENDING_VERIFICATION' ? <ActionOwner owner="ASSOCIATION" /> : null}
              <p className="text-body-sm text-text-secondary" data-testid="club-lifecycle-note">
                {lifecycle === 'ACTIVE'
                  ? club.publicStatus === 'PUBLISHED'
                    ? 'صفحه عمومی این کلاب منتشر است.'
                    : 'این کلاب تأیید شده است؛ تا انتشار، صفحه عمومی آن دیده نمی‌شود.'
                  : CLUB_NOT_PUBLIC_FA[lifecycle]}
              </p>
              {club.lifecycleReasonFa ? (
                <p className="text-body-sm" data-testid="club-lifecycle-reason">
                  {'پیام انجمن: ' + club.lifecycleReasonFa}
                </p>
              ) : null}
            </div>
          </Card>

          {view.openReports > 0 && can('MODERATE') ? (
            <Alert tone="warning" title={'گزارش باز درباره این کلاب: ' + view.openReports.toLocaleString('fa-IR')}>
              بررسی گزارش‌ها با ادمین محتوای همزیست است.
            </Alert>
          ) : null}

          {links.length > 0 ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="بخش‌های کلاب" />
              <ul className="mt-sm">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hz-link hz-link--standalone" data-testid={link.testId}>
                      <Icon name={link.icon} size="sm" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </PublicShell>
  );
}
