import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { manageableCommunities, myCommunityInvitations } from '../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, type CommunityKind } from '../../../src/communities/model.ts';
import { CommunityInvitationForm } from '../../../src/communities/forms.tsx';

export const dynamic = 'force-dynamic';

/** The associations and clubs this account manages — §11, P2-D07 (PROMPT-010). P05 list. */
export default async function AccountCommunitiesPage() {
  const guard = await guardRoute('/account/communities');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [rows, invitations] = await Promise.all([
    manageableCommunities(db(), guard.actor),
    myCommunityInvitations(db(), guard.actor),
  ]);

  return (
    <PublicShell
      actor={guard.actor}
      title="انجمن و کلاب من"
      pathname="/account/communities"
      header={
        <PageHeader
          title="انجمن و کلاب من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(rows.length > 0 ? [rows.length.toLocaleString('fa-IR') + ' پرونده'] : []),
            'شماره ثبت و مجوز را بررسی همزیست ثبت می‌کند، نه مدیر پرونده.',
          ]}
        />
      }
    >
      {invitations.length > 0 ? (
        <section className="space-y-md" aria-labelledby="community-invitations-title">
          <SectionHeader id="community-invitations-title" title="دعوت‌های مدیریت" count={invitations.length.toLocaleString('fa-IR')} />
          <ActionOwner owner="USER" />
          <div className="space-y-md" data-testid="community-invitations">
            {invitations.map((invitation) => (
              <CommunityInvitationForm
                key={invitation.id}
                invitation={{
                  id: invitation.id,
                  version: invitation.version,
                  communityNameFa: invitation.communityNameFa,
                  roleFa: invitation.roleFa,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="usersThree"
          title="هنوز پرونده‌ای به شما سپرده نشده است"
          description="اگر مدیر یک انجمن یا کلاب هستید، از پشتیبانی همزیست واگذاری آن را بخواهید."
        />
      ) : (
        <ul className="hz-cardlist" data-testid="my-communities">
          {rows.map((row) => (
            <li key={row.community.id} className="hz-cardlist__item">
              <div className="hz-cardlist__row">
                <Link
                  href={'/account/communities/' + row.community.id}
                  className="hz-cardlist__title min-w-0 hover:underline"
                  data-testid={'my-community-' + row.community.id}
                >
                  {row.community.displayNameFa}
                </Link>
                <span className="flex flex-wrap gap-xs">
                  <StatusBadge status={row.community.publicStatus} />
                  {row.community.canPublishPosts ? <span className="hz-tag hz-tag--neutral">ناشر مجاز</span> : null}
                </span>
              </div>
              <div className="hz-cardlist__row">
                <span className="hz-cardlist__meta">
                  {[COMMUNITY_KIND_FA[row.community.kind as CommunityKind], row.cityNameFa ?? row.provinceNameFa].filter(Boolean).join(' · ')}
                </span>
                <ButtonLink tone="secondary" size="sm" href={'/account/communities/' + row.community.id}>
                  مدیریت پرونده
                  <span className="hz-visually-hidden"> {row.community.displayNameFa}</span>
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
