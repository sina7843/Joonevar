import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { clubForAuthority } from '../../../../src/clubs/service.ts';
import { CLUB_LIFECYCLE_FA, CLUB_ROLE_FA, type ClubLifecycle } from '../../../../src/clubs/model.ts';
import { COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { ClubStandingForm, ClubVerificationDecisionForm } from '../../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

/** One club as the association decides on it — Phase 2.5 §8 (PROMPT-012). */
export default async function AssocClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/clubs/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const detail = await clubForAuthority(db(), guard.actor, id);

  if (detail === null) {
    return (
      <OpsShell actor={guard.actor} title="کلاب" pathname="/assoc/clubs" nav={ASSOC_NAV}>
        <Alert tone="error" title="کلاب پیدا نشد" />
      </OpsShell>
    );
  }

  const club = detail.club;
  const lifecycle = club.lifecycle as ClubLifecycle;

  return (
    <OpsShell actor={guard.actor} title={club.displayNameFa} pathname="/assoc/clubs" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title={club.displayNameFa}
            subtitle={'حوزه ' + (COMMUNITY_SCOPE_FA[club.scope as never] ?? club.scope)}
            badge={{ tone: lifecycle === 'ACTIVE' ? 'success' : lifecycle === 'SUSPENDED' || lifecycle === 'REJECTED' ? 'error' : 'warning', label: CLUB_LIFECYCLE_FA[lifecycle] }}
          />
          <dl className="mt-lg grid gap-sm text-body-sm sm:grid-cols-2" data-testid="club-facts">
            <div>
              <dt className="text-caption text-text-secondary">مالک</dt>
              <dd>{detail.ownerNameFa ?? (club.ownerAccountId ? 'کاربر همزیست' : 'بدون مالک')}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">راه ارتباطی</dt>
              <dd dir="ltr">{club.contactPhone ?? club.websiteUrl ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">آخرین تغییر</dt>
              <dd>{formatInstantFa(club.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تأیید</dt>
              <dd>{club.verifiedAt ? formatInstantFa(club.verifiedAt) : 'تأیید نشده'}</dd>
            </div>
          </dl>
          {club.aboutFa ? <p className="mt-lg whitespace-pre-line text-body-md">{club.aboutFa}</p> : null}
          {club.lifecycleReasonFa ? <p className="mt-md text-body-sm text-text-secondary">{'آخرین دلیل ثبت‌شده: ' + club.lifecycleReasonFa}</p> : null}
        </Card>

        {detail.members.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">نقش‌های این کلاب</h2>
            <ul className="mt-md space-y-xs text-body-sm" data-testid="club-authority-members">
              {detail.members.map((member) => (
                <li key={member.membershipId}>{(member.nameFa ?? 'کاربر همزیست') + ' — ' + CLUB_ROLE_FA[member.role]}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        {lifecycle === 'PENDING_VERIFICATION' ? (
          <Card>
            <CardHeader title="تصمیم تأیید" subtitle="تأیید، درخواست اصلاح یا رد — با دلیلی که برای مالک کلاب فرستاده می‌شود." />
            <div className="mt-md">
              <ClubVerificationDecisionForm clubId={club.id} version={club.version} />
            </div>
          </Card>
        ) : null}

        {lifecycle === 'ACTIVE' ? (
          <Card>
            <CardHeader title="تعلیق کلاب" subtitle="کلاب از دسترس عمومی خارج می‌شود؛ پرونده و تاریخچه می‌مانند." />
            <div className="mt-md">
              <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="SUSPENDED" />
            </div>
          </Card>
        ) : null}

        {lifecycle === 'SUSPENDED' ? (
          <Card>
            <CardHeader title="برداشتن تعلیق" />
            <div className="mt-md space-y-lg">
              <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ACTIVE" />
              <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ARCHIVED" />
            </div>
          </Card>
        ) : null}

        {lifecycle === 'REJECTED' ? (
          <Card>
            <CardHeader title="بایگانی پرونده" />
            <div className="mt-md">
              <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ARCHIVED" />
            </div>
          </Card>
        ) : null}
      </div>
    </OpsShell>
  );
}
