import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, DeskVersionNote, Panel, deskPosition } from '../../../../src/ui/desk.tsx';
import { auditSteps, historyFromAudit } from '../../audit-history.ts';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { clubAuthorityQueue, clubForAuthority } from '../../../../src/clubs/service.ts';
import { CLUB_ROLE_FA, type ClubLifecycle } from '../../../../src/clubs/model.ts';
import { COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { ClubStandingForm, ClubVerificationDecisionForm } from '../../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

const HISTORY_FA: Record<string, string> = {
  CLUB_CREATED: 'ایجاد کلاب',
  CLUB_LIFECYCLE_CHANGED: 'تغییر وضعیت',
  CLUB_PUBLICATION_CHANGED: 'تغییر انتشار',
  CLUB_OWNERSHIP_CANCELLED: 'لغو درخواست مالکیت',
  CLUB_REPORTS_DECIDED: 'تصمیم درباره گزارش‌ها',
};

/** One club as the association decides on it — Phase 2.5 §8 (PROMPT-012). */
export default async function AssocClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/clubs/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [detail, queue, steps] = await Promise.all([
    clubForAuthority(db(), guard.actor, id),
    clubAuthorityQueue(db(), guard.actor),
    auditSteps('COMMUNITY', id),
  ]);

  if (detail === null) {
    return (
      <OpsShell actor={guard.actor} title="کلاب" pathname="/assoc/clubs" nav={ASSOC_NAV}>
        <Alert tone="error" title="کلاب پیدا نشد" />
      </OpsShell>
    );
  }

  const club = detail.club;
  const lifecycle = club.lifecycle as ClubLifecycle;
  const waiting = lifecycle === 'PENDING_VERIFICATION';
  // Queue order is oldest first; the age counts from the first move into verification.
  const queueIds = queue.waiting.map((row) => row.id).reverse();
  const sentAt = steps.filter((step) => step.action === 'CLUB_LIFECYCLE_CHANGED' && step.status === 'PENDING_VERIFICATION').at(-1)?.at ?? null;

  const decision =
    lifecycle === 'PENDING_VERIFICATION' ? (
      <>
        <p className="text-caption text-text-secondary">تأیید، درخواست اصلاح یا رد — با دلیلی که برای مالک کلاب فرستاده می‌شود.</p>
        <ClubVerificationDecisionForm clubId={club.id} version={club.version} />
        <DeskVersionNote version={club.version} />
      </>
    ) : lifecycle === 'ACTIVE' ? (
      <>
        <p className="text-caption text-text-secondary">تعلیق کلاب: کلاب از دسترس عمومی خارج می‌شود؛ پرونده و تاریخچه می‌مانند.</p>
        <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="SUSPENDED" />
      </>
    ) : lifecycle === 'SUSPENDED' ? (
      <div className="space-y-lg">
        <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ACTIVE" />
        <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ARCHIVED" />
      </div>
    ) : lifecycle === 'REJECTED' ? (
      <ClubStandingForm clubId={club.id} version={club.version} surface="assoc" to="ARCHIVED" />
    ) : null;

  return (
    <OpsShell actor={guard.actor} title={club.displayNameFa} pathname="/assoc/clubs" nav={ASSOC_NAV}>
      <DeskHead
        title={'کلاب · ' + club.displayNameFa}
        status={{ ...keyStatus(lifecycle), testId: 'assoc-club-status' }}
        position={deskPosition(queueIds, club.id, (clubId) => '/assoc/clubs/' + clubId)}
        meta={[
          'حوزه ' + (COMMUNITY_SCOPE_FA[club.scope as never] ?? club.scope),
          'آخرین تغییر: ' + formatInstantFa(club.updatedAt),
          waiting && sentAt ? <CaseAge since={sentAt} /> : null,
          'نسخه ' + club.version.toLocaleString('fa-IR'),
        ]}
        owner={lifecycle === 'PENDING_VERIFICATION' ? 'ASSOCIATION' : null}
      />
      <Desk
        decision={decision}
        decisionTitle={
          lifecycle === 'PENDING_VERIFICATION'
            ? 'تصمیم تأیید'
            : lifecycle === 'ACTIVE'
              ? 'تعلیق کلاب'
              : lifecycle === 'SUSPENDED'
                ? 'برداشتن تعلیق'
                : 'بایگانی پرونده'
        }
      >
        <Panel title="اطلاعات کلاب">
          <div data-testid="club-facts">
            <KeyValueList
              twoCol
              rows={[
                { key: 'مالک', value: detail.ownerNameFa ?? (club.ownerAccountId ? 'کاربر همزیست' : 'بدون مالک') },
                { key: 'راه ارتباطی', value: club.contactPhone ?? club.websiteUrl ? <bdi dir="ltr">{club.contactPhone ?? club.websiteUrl}</bdi> : null },
                { key: 'آخرین تغییر', value: formatInstantFa(club.updatedAt) },
                { key: 'تأیید', value: club.verifiedAt ? formatInstantFa(club.verifiedAt) : 'تأیید نشده' },
              ]}
            />
          </div>
          {club.aboutFa ? <p className="whitespace-pre-line text-body-md">{club.aboutFa}</p> : null}
          {club.lifecycleReasonFa ? <p className="text-body-sm text-text-secondary">{'آخرین دلیل ثبت‌شده: ' + club.lifecycleReasonFa}</p> : null}
        </Panel>

        {detail.members.length > 0 ? (
          <Panel title="نقش‌های این کلاب" count={detail.members.length.toLocaleString('fa-IR')}>
            <ul className="space-y-xs text-body-sm" data-testid="club-authority-members">
              {detail.members.map((member) => (
                <li key={member.membershipId}>{(member.nameFa ?? 'کاربر همزیست') + ' — ' + CLUB_ROLE_FA[member.role]}</li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="سابقه پرونده">
          <CaseHistory entries={historyFromAudit(steps, HISTORY_FA, waiting)} />
        </Panel>
      </Desk>
    </OpsShell>
  );
}
