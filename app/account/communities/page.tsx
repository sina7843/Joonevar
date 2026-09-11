import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { manageableCommunities, myCommunityInvitations } from '../../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, type CommunityKind } from '../../../src/communities/model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from '../../../src/vets/directory-model.ts';
import { CommunityInvitationForm } from '../../../src/communities/forms.tsx';

export const dynamic = 'force-dynamic';

/** The associations and clubs this account manages — §11, P2-D07 (PROMPT-010). */
export default async function AccountCommunitiesPage() {
  const guard = await guardRoute('/account/communities');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [rows, invitations] = await Promise.all([
    manageableCommunities(db(), guard.actor),
    myCommunityInvitations(db(), guard.actor),
  ]);

  return (
    <PublicShell actor={guard.actor} title="انجمن و کلاب من" pathname="/account/communities">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">انجمن‌ها و کلاب‌هایی که مدیریت می‌کنید</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            مدیریت یک پرونده پس از واگذاری به حساب شما سپرده می‌شود. شماره ثبت و مجوز را بررسی همزیست ثبت می‌کند، نه مدیر پرونده.
          </p>
        </Card>

        {invitations.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">دعوت‌های مدیریت</h2>
            <div className="mt-lg space-y-md" data-testid="community-invitations">
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
          </Card>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title="هنوز پرونده‌ای به شما سپرده نشده است"
            description="اگر مدیر یک انجمن یا کلاب هستید، از پشتیبانی همزیست واگذاری آن را بخواهید."
          />
        ) : (
          <ul className="space-y-sm" data-testid="my-communities">
            {rows.map((row) => (
              <li key={row.community.id}>
                <Link
                  href={'/account/communities/' + row.community.id}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'my-community-' + row.community.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{row.community.displayNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[COMMUNITY_KIND_FA[row.community.kind as CommunityKind], row.cityNameFa ?? row.provinceNameFa].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <StatusBadge tone={row.community.publicStatus === 'PUBLISHED' ? 'success' : row.community.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                        {VET_PUBLIC_STATUS_FA[row.community.publicStatus as VetPublicStatus]}
                      </StatusBadge>
                      {row.community.canPublishPosts ? <StatusBadge tone="info">ناشر مجاز</StatusBadge> : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
