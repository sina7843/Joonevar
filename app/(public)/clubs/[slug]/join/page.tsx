import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { ActionOwner } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { communities } from '../../../../../src/db/schema/communities.ts';
import { clubJoinView } from '../../../../../src/clubs/enrollment.ts';
import {
  CLUB_MEMBERSHIP_STATUS_FA,
  CLUB_MEMBERSHIP_STATUS_SHORT_FA,
  type ClubMembershipStatus,
} from '../../../../../src/clubs/membership-model.ts';
import { ClubApplyForm, ClubFeeForm, ClubLeaveForm } from '../../../../../src/clubs/rules-forms.tsx';
import { formatInstantFa } from '../../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const SLUG = /^club-[0-9a-f]{10}$/;

/**
 * Joining one club — Phase 2.5 §9 (PROMPT-013).
 *
 * The club's questions, which of them this person does not meet, and the next
 * step: accept the terms and apply, pay the fee, or wait for the club. The
 * reasons shown here are the reader's own and are not shown to the club.
 */
export default async function ClubJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const path = '/clubs/' + slug + '/join';
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [club] = await db().select({ id: communities.id }).from(communities).where(eq(communities.publicSlug, slug)).limit(1);
  if (!club) notFound();
  const view = await clubJoinView(db(), guard.actor, club.id);
  if (view === null) notFound();

  const status = (view.membership?.status ?? null) as ClubMembershipStatus | null;
  const unmet = view.evaluation?.unmetFa ?? [];

  return (
    <PublicShell actor={guard.actor} title={'عضویت در ' + view.clubNameFa} pathname="/clubs">
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title={view.clubNameFa}
            subtitle="عضویت در کلاب با خود کلاب است؛ همزیست فقط شرط‌های اعلام‌شده کلاب را روی پرونده شما بررسی می‌کند."
            badge={
              status === null
                ? undefined
                : status === 'INELIGIBLE'
                  ? // GAPS #4: no dictionary key for INELIGIBLE
                    { tone: 'neutral', label: CLUB_MEMBERSHIP_STATUS_SHORT_FA[status] }
                  : status === 'PENDING_REVIEW'
                    ? 'SUBMITTED' // the club decides, not the association (PENDING_REVIEW's label names the association)
                    : status
            }
          />
          <Link href={'/clubs/' + slug} className="hz-link hz-link--standalone mt-md hz-body-sm">
            بازگشت به صفحه کلاب
          </Link>
        </Card>

        {view.rule === null ? (
          <Alert tone="info" title="این کلاب هنوز شرایط عضویت خود را منتشر نکرده است">
            تا انتشار شرایط، درخواستی ثبت نمی‌شود.
          </Alert>
        ) : (
          <>
            <Card>
              <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>این کلاب چه می‌خواهد</span></h2></div>
              <ul className="mt-md flex flex-wrap gap-xs" data-testid="club-asked">
                {view.askedFa.map((asked) => (
                  <li key={asked}>
                    <span className="hz-tag hz-tag--neutral">{asked}</span>
                  </li>
                ))}
              </ul>
              {view.membership?.admittedRuleVersionId && view.membership.admittedRuleVersionId === view.rule.id ? (
                <p className="mt-md text-caption text-text-secondary">
                  {'شما با نسخه ' + view.rule.versionNumber.toLocaleString('fa-IR') + ' شرایط پذیرفته شده‌اید و با همان سنجیده می‌شوید.'}
                </p>
              ) : null}
            </Card>

            <Card>
              <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>وضعیت شما</span></h2></div>
              <p className="mt-sm text-body-md" data-testid="club-join-status">
                {status ? CLUB_MEMBERSHIP_STATUS_FA[status] : 'هنوز درخواستی نداده‌اید.'}
              </p>
              {status === 'PENDING_REVIEW' ? (
                <div className="mt-sm">
                  <ActionOwner owner="COUNTERPARTY" extra="کلاب درخواست را بررسی می‌کند" />
                </div>
              ) : status === 'AWAITING_PAYMENT' ? (
                <div className="mt-sm">
                  <ActionOwner owner="USER" extra="پرداخت حق عضویت" />
                </div>
              ) : null}
              {view.membership?.decisionReasonFa ? (
                <p className="mt-xs text-body-sm text-text-secondary">{'پیام کلاب: ' + view.membership.decisionReasonFa}</p>
              ) : null}
              {view.membership?.endsAt ? (
                <p className="mt-xs text-caption text-text-secondary">{'اعتبار تا ' + formatInstantFa(view.membership.endsAt)}</p>
              ) : null}
              {unmet.length > 0 ? (
                <>
                  <p className="mt-md text-body-sm">آنچه هنوز برقرار نیست:</p>
                  <ul className="mt-xs list-disc space-y-2xs ps-md text-body-sm text-text-secondary" data-testid="club-join-unmet">
                    {unmet.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>

            {status === 'AWAITING_PAYMENT' && view.membership ? (
              <Card>
                <CardHeader title="حق عضویت" subtitle="مبلغ از نسخه منتشرشده همین کلاب خوانده می‌شود." />
                <div className="mt-md">
                  <ClubFeeForm
                    clubId={view.clubId}
                    membershipId={view.membership.id}
                    amountToman={String(view.membership.feeToman ?? view.feeToman ?? 0)}
                  />
                </div>
              </Card>
            ) : null}

            {view.canApply ? (
              <Card>
                <CardHeader title="درخواست عضویت" />
                <div className="mt-md">
                  <ClubApplyForm
                    clubId={view.clubId}
                    termsFa={view.termsFa}
                    termsVersion={view.termsVersion}
                    disabled={false}
                  />
                </div>
              </Card>
            ) : null}

            {view.membership && (status === 'ACTIVE' || status === 'SUSPENDED' || status === 'PENDING_REVIEW') ? (
              <Card>
                <CardHeader title="خروج از کلاب" subtitle="خروج تصمیم خود شماست و تأیید کسی نمی‌خواهد." />
                <div className="mt-md">
                  <ClubLeaveForm clubId={view.clubId} membershipId={view.membership.id} version={view.membership.version} />
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </PublicShell>
  );
}
